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

  // Initiate the connector test
  app.get('/test', (req, res) => {
    const location = [
      `${req.fusebit.baseUrl}/configure`,
      `?state=opaque-state-to-roundtrip-on-callback`,
      `&returnTo=${req.fusebit.baseUrl}/test-callback`,
      `&data=${encodeURIComponent(
        Buffer.from(
          JSON.stringify({
            baseUrl: req.fusebit.fusebit.endpoint,
            accountId: req.fusebit.accountId,
            subscriptionId: req.fusebit.subscriptionId,
            boundaryId: req.fusebit.boundaryId,
            functionId: `${req.fusebit.functionId}-test`,
            templateName: 'test-template-name',
          })
        ).toString('base64')
      )}`,
    ].join('');
    res.redirect(location);
  });

  // Return the HTML page of the connector test callback
  let testCallbackHtml;
  app.get('/test-callback', async (req, res, next) => {
    if (!testCallbackHtml) {
      testCallbackHtml = require('fs').readFileSync(__dirname + '/test-callback.html', {
        encoding: 'utf8',
      });
    }
    const error = (message) => {
      res.send(message);
    };
    const getHtml = (model) => {
      const html = testCallbackHtml
        .replace(/##model##/g, JSON.stringify(model))
        .replace(/##vendor_name##/g, req.fusebit.configuration.vendor_name);
      res.send(html);
    };
    if (
      req.query.state !== 'opaque-state-to-roundtrip-on-callback' ||
      !req.query.status ||
      !req.query.data ||
      ['success', 'error'].indexOf(req.query.status) < 0
    ) {
      return error(
        `The callback does not specify the 'data' or 'status' or 'state' query parameters or the 'status' or 'state' have unexpected value.`
      );
    }
    try {
      req.query.decodedData = JSON.parse(Buffer.from(req.query.data, 'base64').toString());
      if (typeof req.query.decodedData !== 'object') throw new Error('Invalid');
    } catch (e) {
      return error(`The 'data' query parameter has invalid format. It must be a base64 encoded JSON object.`);
    }
    if (req.query.status === 'success') {
      try {
        req.query.user = await connector.getUser(req.fusebit, req.query.decodedData.slack_oauth_user_id);
        if (!req.query.user) throw new Error('Invalid');
      } catch (e) {
        return error(
          `The 'status' query parameter indicates success, but you don't seem to have been authorized: ${e.message}`
        );
      }
    }
    return getHtml(req.query);
  });

  connector.onCreate(app);

  return app;
};
