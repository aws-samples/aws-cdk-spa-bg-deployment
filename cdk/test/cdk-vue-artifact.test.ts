import {expect, haveResource} from '@aws-cdk/assert';
import {App} from '@aws-cdk/core';
import {CdkVueApplicationPipeline} from '../lib/cdk-vue-application-pipeline';

test('Empty Stack', () => {
    const app = new App();
    // WHEN
    const stack = new CdkVueApplicationPipeline(app, 'MyTestStack', {
        env: {
            account: 'test',
            region: 'us-east-1'
        }
    });
    expect(stack).to(haveResource('AWS::CodePipeline::Pipeline'))
});
