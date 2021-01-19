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

  const createUserSubresource = (req, subresource) =>
    req.params.vendorId
      ? `/account/${req.fusebit.accountId}/subscription/${req.fusebit.subscriptionId}/boundary/${
          req.fusebit.boundaryId
        }/function/${req.fusebit.functionId}/foreign-user/${encodeURIComponent(
          req.params.vendorId
        )}/${encodeURIComponent(req.params.vendorUserId)}/${(subresource && subresource + '/') || ''}`
      : `/account/${req.fusebit.accountId}/subscription/${req.fusebit.subscriptionId}/boundary/${
          req.fusebit.boundaryId
        }/function/${req.fusebit.functionId}/user/${encodeURIComponent(req.params.vendorUserId)}/${
          (subresource && subresource + '/') || ''
        }`;

  const authorizeUserOperation = (subresource) =>
    connector.authorize({
      action: 'function:execute',
      resourceFactory: (req) => createUserSubresource(req, subresource),
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
      res.sendStatus(204);
    }
  );

  const lookupUser = async (req, res, next) => {
    // req.params.vendorId may be undefined
    req.params.userContext = await connector.getUser(req.fusebit, req.params.vendorUserId, req.params.vendorId);
    if (!req.params.userContext) {
      return httpError(
        res,
        404,
        req.params.vendorId
          ? `User with vendor ID '${req.params.vendorId}' and user ID '${req.params.vendorUserId} not found.`
          : `User with user ID '${req.params.vendorUserId} not found.`
      );
    }
    next();
  };

  // Get user context of the user identified with vendor user ID, or with foreign vendor ID and foreign user ID
  app.get(
    ['/user/:vendorUserId', '/foreign-user/:vendorId/:vendorUserId'],
    authorizeUserOperation(),
    lookupUser,
    async (req, res) => res.json(req.params.userContext)
  );

  // Get health of the user identified with vendor user ID, or with foreign vendor ID and foreign user ID
  app.get(
    ['/user/:vendorUserId/health', '/foreign-user/:vendorId/:vendorUserId/health'],
    authorizeUserOperation('health'),
    lookupUser,
    async (req, res) => {
      let response;
      try {
        response = (await connector.getHealth(req.fusebit, req.params.userContext)) || { status: 200 };
      } catch (e) {
        Sdk.debug(
          'ERROR OBTAINING USER HEALTH',
          req.params.vendorId,
          req.params.vendorUserId,
          e.stack || e.message || e
        );
        return httpError(res, 500, `Error obtaining user health information: ${e.message}`);
      }
      res.status(response.status || 200);
      response.body ? res.json(response.body) : res.end();
    }
  );

  // Get current access token for the user identified with vendor user ID, or with foreign vendor ID and foreign user ID
  app.get(
    ['/user/:vendorUserId/token', '/foreign-user/:vendorId/:vendorUserId/token'],
    authorizeUserOperation('token'),
    lookupUser,
    async (req, res) => {
      let vendorToken;
      try {
        vendorToken = await connector.ensureAccessToken(req.fusebit, req.params.userContext);
      } catch (e) {
        Sdk.debug('ERROR OBTAINING ACCESS TOKEN', req.params.vendorUserId, e.stack || e.message || e);
        return httpError(res, 502, `Unable to obtain access token for user ${req.params.vendorUserId}: ${e.message}`);
      }
      res.json(vendorToken);
    }
  );

  // Delete the user identified with vendor user ID, or with foreign vendor ID and foreign user ID
  app.delete(
    ['/user/:vendorUserId', '/foreign-user/:vendorId/:vendorUserId'],
    authorizeUserOperation(),
    async (req, res) => {
      await connector.deleteUser(req.fusebit, req.params.vendorUserId, req.params.vendorId);
      res.status(204);
      res.end();
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
    response.body ? res.send(response.body) : res.end();
  });

  connector.onCreate(app);

  return app;
};
