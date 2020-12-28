const Url = require('url');
const Sdk = require('@fusebit/add-on-sdk');
const Mock = require('mock-http');
const Express = require('express');
const { createApp } = require('./app');
const { OAuthConnector } = require('./OAuthConnector');

// See https://github.com/fusebit/samples/blob/master/express/index.js#L6
Object.setPrototypeOf(Object.getPrototypeOf(Express.response), Mock.Response.prototype);
Object.setPrototypeOf(Object.getPrototypeOf(Express.request), Mock.Request.prototype);

exports.OAuthConnector = OAuthConnector;

exports.createOAuthConnector = (vendorConnector) => {
    // Create Express app that exposes:
    // - endpoints to handle Vendor's OAuth authorization,
    // - endpoint to obtain an access token for a given user,
    // - optional, application-specific endpoints defined by vendorConnector
    const app = createApp(vendorConnector);

    // Return a Fusebit handler that creates a mock HTTP request/response and hands the processing over to an Express app
    return async (ctx) => {
        Sdk.debug('HTTP REQUEST', ctx.method, ctx.url, ctx.headers, ctx.body);

        ctx.storage = await Sdk.createStorageClient(
            ctx,
            ctx.fusebit.functionAccessToken,
            `boundary/${ctx.boundaryId}/function/${ctx.functionId}/root`
        );

        let url = ctx.url.split('/');
        url.splice(0, 5);
        url = Url.parse('/' + url.join('/'));
        url.query = ctx.query;
        url = Url.format(url);

        const body = ctx.body ? Buffer.from(JSON.stringify(ctx.body)) : undefined;
        if (body) {
            ctx.headers['content-length'] = body.length;
        }

        let req = new Mock.Request({
            url,
            method: ctx.method,
            headers: ctx.headers,
            buffer: body,
        });
        req.fusebit = ctx;

        return new Promise((resolve, reject) => {
            try {
                let responseFinished;
                let res = new Mock.Response({
                    onEnd: () => {
                        if (responseFinished) return;
                        responseFinished = true;
                        const responseBody = (res._internal.buffer || Buffer.from('')).toString('utf8');
                        Sdk.debug('HTTP RESPONSE', res.statusCode, responseBody);
                        process.nextTick(() => {
                            resolve({
                                body: responseBody,
                                bodyEncoding: 'utf8',
                                headers: res._internal.headers,
                                status: res.statusCode,
                            });
                        });
                    },
                });

                app.handle(req, res);
            } catch (e) {
                reject(e);
            }
        });
    };
};
