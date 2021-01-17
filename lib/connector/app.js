const Sdk = require('@fusebit/add-on-sdk');
const createConfigure = require('./configure');

const httpError = (res, status, message) => {
    res.status(status);
    res.send({
        status,
        statusCode: status,
        message,
    });
};

exports.createApp = (connector) => {
    const app = require('express')();
    const settingsManager = Sdk.createSettingsManager(createConfigure(connector));
    const authorizeVendorUserOperation = connector.authorize({
        action: 'function:execute',
        resourceFactory: (req) =>
            `/account/${req.fusebit.accountId}/subscription/${req.fusebit.subscriptionId}/boundary/${req.fusebit.boundaryId}/function/${
                req.fusebit.functionId
            }/user/${encodeURIComponent(req.params.vendorUserId)}/`,
    });
    const authorizeForeignVendorUserOperation = connector.authorize({
        action: 'function:execute',
        resourceFactory: (req) =>
            `/account/${req.fusebit.accountId}/subscription/${req.fusebit.subscriptionId}/boundary/${req.fusebit.boundaryId}/function/${req.fusebit.functionId}/foreign-user/`,
    });

    // Called from the connector manager to clean up all subordinate artifacts of this connector
    app.delete(
        '/',
        connector.authorize({
            action: 'function:delete',
            resourceFactory: (req) =>
                `/account/${req.fusebit.accountId}/subscription/${req.fusebit.subscriptionId}/boundary/${req.fusebit.boundaryId}/function/${req.fusebit.functionId}/`,
        }),
        async (req, res) => {
            await connector.onDelete(req.fusebit);
            res.send(204);
        }
    );

    // /configure - initiate a new authorization transaction in the browser
    // /callback - process OAuth callback.
    app.get(['/configure', '/callback'], async (req, res) => {
        const response = await settingsManager(req.fusebit);
        res.status(response.status);
        if (response.headers) {
            for (let h in response.headers) {
                res.set(h, response.headers[h]);
            }
        }
        if (response.body) {
            res.send(response.body);
        } else {
            res.end();
        }
    });

    app.get('/user/:vendorUserId/token', authorizeVendorUserOperation, async (req, res) => {
        const userContext = await connector.getUser(req.fusebit, req.params.vendorUserId);
        if (!userContext) {
            return httpError(res, 404, `User ${req.params.vendorUserId} not found`);
        }
        let vendorToken;
        try {
            vendorToken = await connector.ensureAccessToken(req.fusebit, userContext);
        } catch (e) {
            Sdk.debug('ERROR OBTAINING ACCESS TOKEN', req.params.vendorUserId, e.stack || e.message || e);
            return httpError(res, 502, `Unable to obtain access token for user ${req.params.vendorUserId}: ${e.message}`);
        }
        res.json(vendorToken);
    });

    app.get('/user/:vendorUserId', authorizeVendorUserOperation, async (req, res) => {
        const userContext = await connector.getUser(req.fusebit, req.params.vendorUserId);
        if (!userContext) {
            return httpError(res, 404, `User ${req.params.vendorUserId} not found`);
        } else {
            return res.json(userContext);
        }
    });

    app.get('/foreign-user/:vendorId/:vendorUserId', authorizeForeignVendorUserOperation, async (req, res) => {
        const userContext = await connector.getUser(req.fusebit, req.params.vendorUserId, req.params.vendorId);
        if (!userContext) {
            return httpError(res, 404, `User ${req.params.vendorUserId} of OAuth provider ${req.params.vendorId} not found`);
        } else {
            return res.json(userContext);
        }
    });

    app.delete('/user/:vendorUserId', authorizeVendorUserOperation, async (req, res) => {
        await connector.deleteUser(req.fusebit, req.params.vendorUserId);
        res.status(204);
        res.end();
    });

    connector.onCreate(app);

    return app;
};
