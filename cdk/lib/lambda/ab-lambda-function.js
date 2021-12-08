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

'use strict';

exports.handler = (event, context, callback) => {
    // Grab Viewer Request from the event
    const request = event.Records[0].cf.request;
    // Output the request to CloudWatch
    console.log('Lambda@Edge Request: %j', request);
    const headers = request.headers;
    const groupBUri = '/blue/index.html';

    // Name of cookie to check for. Application will be decided randomly when not present.
    const cookieExperimentA = 'X-Experiment-Name=A';
    const cookieExperimentB = 'X-Experiment-Name=B';
    let response = {
        status: '302',
        statusDescription: 'Found'
    };

    // Check for a cookie to determine if experimental group has been previously selected
    let selectedExperiment = cookieExperimentA;
    let cookiePresent = false;
    if (headers.cookie) {
        // Check for the experimental cookie and select the appropriate experiment when present.
        for (let i = 0; i < headers.cookie.length; i++) {
            if (headers.cookie[i].value.indexOf(cookieExperimentA) >= 0) {
                console.log('Experiment A cookie found');
                selectedExperiment = cookieExperimentA;
                cookiePresent = true;
                break;
            } else if (headers.cookie[i].value.indexOf(cookieExperimentB) >= 0) {
                console.log('Experiment B cookie found');
                selectedExperiment = cookieExperimentB;
                cookiePresent = true;
                break;
            }
        }
    }

    // When the cookie is not present then it needs to be set.
    if (!cookiePresent) {
        // When there is no cookie, then randomly decide which app version will be used.
        console.log('Experiment cookie has not been found. Throwing dice...');
        if (Math.random() < 0.75) {
            console.log('Experiment A chosen');
            selectedExperiment = cookieExperimentA;
        } else {
            console.log('Experiment B chosen');
            selectedExperiment = cookieExperimentB;
        }
        // Set header to appropriate experiment.
        response.headers = {
            'location': [{
                key: 'Location',
                value: selectedExperiment === cookieExperimentB ? groupBUri : '/'
            }],
            'set-cookie': [{
                key: 'Set-Cookie',
                value: selectedExperiment
            }]
        };
    } else {
        //Generate HTTP redirect response to experimental group B.
        console.log('Experiment cookie has been found. Experimental group selected: %s', selectedExperiment);
        if (selectedExperiment === cookieExperimentB && request.uri === '/') {
            // Redirect to blue group.
            response.headers = {
                'location': [{
                    key: 'Location',
                    value: groupBUri
                }]
            };
        } else {
            response = request;
        }
    }

    // Display final response in logs
    console.log("Final response: %j", response);
    callback(null, response);
};