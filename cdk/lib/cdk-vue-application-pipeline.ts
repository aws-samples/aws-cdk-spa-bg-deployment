/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this
 * software and associated documentation files (the "Software"), to deal in the Software
 * without restriction, including without limitation the rights to use, copy, modify,
 * merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
 * PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
 * HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
 * OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
 * SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import {Stack, Construct, StackProps, RemovalPolicy} from '@aws-cdk/core';
import {SecretValue} from '@aws-cdk/core';
import {Bucket} from '@aws-cdk/aws-s3';
import {Artifact} from '@aws-cdk/aws-codepipeline'
import {BuildSpec, LinuxBuildImage, PipelineProject} from '@aws-cdk/aws-codebuild'
import {Topic} from '@aws-cdk/aws-sns'
import {
    CodeBuildAction,
    GitHubSourceAction,
    GitHubTrigger,
    ManualApprovalAction,
    S3DeployAction
} from '@aws-cdk/aws-codepipeline-actions'
import {CdkPipeline, SimpleSynthAction} from '@aws-cdk/pipelines';
import {Distribution, LambdaEdgeEventType, OriginAccessIdentity, ViewerProtocolPolicy} from '@aws-cdk/aws-cloudfront';
import {S3Origin} from '@aws-cdk/aws-cloudfront-origins';
import {EdgeFunction} from "@aws-cdk/aws-cloudfront/lib/experimental";
import {Code, Runtime} from "@aws-cdk/aws-lambda";

export class CdkVueApplicationPipeline extends Stack {
    constructor(scope: Construct, id: string, props?: StackProps) {
        super(scope, id, props);

        // Retrieve secrets for configuring the GitHub repository webhook and pipeline notifications email.
        const githubRepoOwner = SecretValue.secretsManager('GitHubSecrets', {jsonField: 'repo-owner'});
        const githubRepoName = SecretValue.secretsManager('GitHubSecrets', {jsonField: 'repo-name'});
        const githubRepoBranch = SecretValue.secretsManager('GitHubSecrets', {jsonField: 'repo-branch'});
        const githubRepoToken = SecretValue.secretsManager('GitHubSecrets', {jsonField: 'repo-token'});
        const notificationsEmail = SecretValue.secretsManager('GitHubSecrets', {jsonField: 'notifications-email'});

        // Pipeline artifacts to store repository source and build stage outputs.
        const pipelineArtifact = new Artifact('RepoSource');
        const buildArtifact = new Artifact('BuildOutput');
        const vueBuildArtifact = new Artifact('VueBuildOutput');

        // Create SNS topic for pipeline notifications like approvals.
        const pipelineNotificationTopic = new Topic(this, 'ApprovalSnsTopic', {
            topicName: 'ApprovalSnsTopic'
        });

        // CdkPipeline to auto-mutate this CDK stack and deploy the Vue application.
        const cdkPipeline = new CdkPipeline(this, 'VueComponentCdkPipeline', {
            pipelineName: 'VueComponentPipeline',
            cloudAssemblyArtifact: buildArtifact,
            synthAction: SimpleSynthAction.standardNpmSynth({
                sourceArtifact: pipelineArtifact,
                cloudAssemblyArtifact: buildArtifact,
                actionName: 'BuildCdk',
                subdirectory: 'cdk',
                buildCommand: 'npm run build',
                testCommands: [
                    'npm run test'
                ]
            }),
            sourceAction: new GitHubSourceAction({
                actionName: 'GitHubSource',
                branch: githubRepoBranch.toString(),
                output: pipelineArtifact,
                owner: githubRepoOwner.toString(),
                repo: githubRepoName.toString(),
                oauthToken: githubRepoToken,
                trigger: GitHubTrigger.WEBHOOK,
                runOrder: 1
            })
        });

        // Add build stage for the Vue application.
        const vueApplicationStage = cdkPipeline.addStage('BuildVue');
        vueApplicationStage.addActions(new CodeBuildAction({
            actionName: 'BuildVue',
            input: pipelineArtifact,
            outputs: [
                vueBuildArtifact
            ],
            project: new PipelineProject(this, "BuildVue", {
                buildSpec: BuildSpec.fromObject({
                    version: "0.2",
                    phases: {
                        install: {
                            "runtime-versions": {
                                nodejs: 12
                            }
                        },
                        "pre_build": {
                            commands: [
                                "cd vue-web-component-app",
                                "npm install"
                            ]
                        },
                        build: {
                            commands: [
                                "npm run lint",
                                "npm run test",
                                "npm run build",
                                "cp public/* dist"
                            ]
                        }
                    },
                    artifacts: {
                        files: [
                            "**/*"
                        ],
                        "base-directory": "vue-web-component-app/dist"
                    }
                }),
                environment: {
                    buildImage: LinuxBuildImage.AMAZON_LINUX_2_3
                }
            }),
            runOrder: 1
        }));

        // Creating S3 bucket to deploy the Vue application to.
        const deployBlueBucket = new Bucket(this, 'BlueVueComponentsBucket', {
            versioned: false,
            bucketName: `blue-vue-component-bucket-${this.region}-${this.account}`,
            publicReadAccess: false,
            removalPolicy: RemovalPolicy.DESTROY
        });

        // Creating S3 bucket to deploy the Vue application to.
        const deployGreenBucket = new Bucket(this, 'GreenVueComponentsBucket', {
            versioned: false,
            bucketName: `green-vue-component-bucket-${this.region}-${this.account}`,
            publicReadAccess: false,
            removalPolicy: RemovalPolicy.DESTROY
        });

        // Create CloudFront distribution OAI for the S3 bucket containing the Vue application.
        const oai = new OriginAccessIdentity(this, 'OriginAccessIdentity', {comment: "Origin Access Identity for Origin S3 bucket"});
        deployBlueBucket.grantRead(oai);
        deployGreenBucket.grantRead(oai);

        // Create Lambda@Edge function for A/B testing different application deployments.
        const edgeFunction = new EdgeFunction(this, 'ABEdgeFunction', {
            code: Code.fromAsset("lib/lambda"),
            handler: "ab-lambda-function.handler",
            runtime: Runtime.NODEJS_14_X
        });

        const greenOrigin = new S3Origin(
            deployGreenBucket,
            {
                originAccessIdentity: oai
            }
        );

        // Create CloudFront distribution with Vue deployment bucket as origin and AB Lambda@Edge function.
        const cfDistro = new Distribution(this, 'VueComponentDistribution', {
            defaultBehavior: {
                origin: greenOrigin,
                viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                edgeLambdas: [{
                    eventType: LambdaEdgeEventType.VIEWER_REQUEST,
                    functionVersion: edgeFunction
                }]
            },
            defaultRootObject: 'index.html'
        });

        const blueOrigin = new S3Origin(
            deployBlueBucket,
            {
                originAccessIdentity: oai
            }
        );

        cfDistro.addBehavior('/blue/*',
            blueOrigin,
            {
                viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS
            }
        )

        // Add approval stage before deploying the Vue application
        const approvalBlueStage = cdkPipeline.addStage('ApprovalBlue');
        approvalBlueStage.addActions(new ManualApprovalAction({
            actionName: 'ApproveBlueDeploy',
            notifyEmails: [
                notificationsEmail.toString()
            ],
            additionalInformation: 'Approve Deployment to S3 for the blue deployment group?',
            externalEntityLink: `https://github.com/${githubRepoOwner}/${githubRepoName}`,
            notificationTopic: pipelineNotificationTopic,
            runOrder: 1
        }));

        // Add pipeline stage for deploying the Vue application to the "Blue" S3 target.
        const deployBlueStage = cdkPipeline.addStage('DeployBlue');
        deployBlueStage.addActions(new S3DeployAction({
            actionName: 'DeployVue',
            bucket: deployBlueBucket,
            input: vueBuildArtifact
        }));

        // Add approval stage before deploying the Vue application
        const approvalGreenStage = cdkPipeline.addStage('ApprovalGreen');
        approvalGreenStage.addActions(new ManualApprovalAction({
            actionName: 'ApproveDeploy',
            notifyEmails: [
                notificationsEmail.toString()
            ],
            additionalInformation: 'Approve Deployment to S3 for the green deployment group?',
            externalEntityLink: `https://github.com/${githubRepoOwner}/${githubRepoName}`,
            notificationTopic: pipelineNotificationTopic,
            runOrder: 1
        }));

        // Add pipeline stage for deploying the Vue application to the "Green" S3 target.
        const deployGreenStage = cdkPipeline.addStage('DeployGreen');
        deployGreenStage.addActions(new S3DeployAction({
            actionName: 'DeployVue',
            bucket: deployGreenBucket,
            input: vueBuildArtifact
        }));

    }
}
