const { VendorOAuthConnector } = require('./VendorOAuthConnector');
const { createOAuthConnector } = require('@fusebit/oauth-connector');

module.exports = createOAuthConnector(new VendorOAuthConnector());
