const Sdk = require('@fusebit/add-on-sdk');
const { createApp } = require('./app');
const { OAuthConnector } = require('./OAuthConnector');

exports.OAuthConnector = OAuthConnector;

exports.createOAuthConnector = (vendorConnector) => {
  // Create Express app that exposes:
  // - endpoints to handle Vendor's OAuth authorization,
  // - endpoint to obtain an access token for a given user,
  // - optional, application-specific endpoints defined by vendorConnector
  const app = createApp(vendorConnector);

  // Create Fusebit function from the Express app
  const handler = Sdk.createFusebitFunctionFromExpress(app);

  return handler;
};
