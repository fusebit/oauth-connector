const { OAuthConnector } = require('@fusebit/oauth-connector');
const Superagent = require('superagent');

class VendorOAuthConnector extends OAuthConnector {
  constructor() {
    super();
  }

  /**
   * Called during connector initialization to allow the connector to register additional, application-specific
   * routes on the provided Express router.
   * @param {*} Express router
   */
  onCreate(app) {
    super.onCreate(app);
    // // Add a route that enables an authorized caller to send a hypothetical notification to a specific user.
    // app.post(
    //     '/notification/:vendorUserId',
    //     this.authorize({
    //         action: 'function:execute',
    //         resourceFactory: (req) =>
    //             `/account/${req.fusebit.accountId}/subscription/${req.fusebit.subscriptionId}/boundary/${
    //                 req.fusebit.boundaryId
    //             }/function/${req.fusebit.functionId}/notification/${encodeURIComponent(req.params.vendorUserId)}/`,
    //     }),
    //     async (req, res, next) => {
    //         // Check if the user with the specifed ID has previously authenticated
    //         const userContext = await this.getUser(req.fusebit, req.params.vendorUserId);
    //         if (!userContext) {
    //             res.status(404);
    //         } else {
    //             // Ensure the access token for the user is current
    //             const tokenContext = await this.ensureAccessToken(req.fusebit, userContext);
    //             console.log(
    //                 `Sending notification to user ${req.params.vendorUserId} using access token ${tokenContext.access_token}`,
    //                 req.body
    //             );
    //             res.status(200);
    //         }
    //         res.end();
    //     }
    // );
  }

  /**
   * Called when the entire connector is being deleted. Override the logic in this method to remove
   * any artifacts created during the lifetime of this connector (e.g. Fusebit functions, storage).
   * @param {FusebitContext} fusebitContext The Fusebit context
   */
  async onDelete(fusebitContext) {
    await super.onDelete(fusebitContext);
  }

  /**
   * Called after a new user successfuly completed a configuration flow and was persisted in the system. This extensibility
   * point allows for creation of any artifacts required to serve this new user, for example creation of additional
   * Fusebit functions.
   * @param {FusebitContext} fusebitContext The Fusebit context of the request
   * @param {*} userContext The user context representing the vendor's user. Contains vendorToken and vendorUserProfile, representing responses
   * from getAccessToken and getUserProfile, respectively.
   */
  async onNewUser(fusebitContext, userContext) {
    await super.onNewUser(fusebitContext, userContext);
  }

  /**
   * Creates the fully formed web authorization URL to start the authorization flow.
   * @param {FusebitContext} fusebitContext The Fusebit context of the request
   * @param {string} state The value of the OAuth state parameter.
   * @param {string} redirectUri The callback URL to redirect to after the authorization flow.
   */
  async getAuthorizationUrl(fusebitContext, state, redirectUri) {
    return super.getAuthorizationUrl(fusebitContext, state, redirectUri);
  }

  /**
   * Exchanges the OAuth authorization code for the access and refresh tokens.
   * @param {FusebitContext} fusebitContext The Fusebit context of the request
   * @param {string} authorizationCode The authorization_code supplied to the OAuth callback upon successful authorization flow.
   * @param {string} redirectUri The redirect_uri value Fusebit used to start the authorization flow.
   */
  async getAccessToken(fusebitContext, authorizationCode, redirectUri) {
    return super.getAccessToken(fusebitContext, authorizationCode, redirectUri);
  }

  /**
   * Obtains a new access token using refresh token.
   * @param {FusebitContext} fusebitContext The Fusebit context of the request
   * @param {*} tokenContext An object representing the result of the getAccessToken call. It contains refresh_token.
   * @param {string} redirectUri The redirect_uri value Fusebit used to start the authorization flow.
   */
  async refreshAccessToken(fusebitContext, tokenContext, redirectUri) {
    return super.refreshAccessToken(fusebitContext, tokenContext, redirectUri);
  }

  /**
   * Obtains the user profile given a freshly completed authorization flow. User profile will be stored along the token
   * context.
   * @param {*} tokenContext An object representing the result of the getAccessToken call. It contains access_token.
   */
  async getUserProfile(tokenContext) {
    // const response = await Superagent.get('https://contoso.auth0.com/userinfo')
    //     .set('Authorization', `Bearer ${tokenContext.access_token}`);
    // return response.body;
    return super.getUserProfile(tokenContext);
  }

  /**
   * Returns a string uniquely identifying the user in vendor's system. Typically this is a property of
   * userContext.vendorUserProfile. Default implementation is opportunistically returning userContext.vendorUserProfile.id
   * if it exists.
   * @param {*} userContext The user context representing the vendor's user. Contains vendorToken and vendorUserProfile, representing responses
   * from getAccessToken and getUserProfile, respectively.
   */
  async getUserId(userContext) {
    // return userContext.vendorUserProfile.sub;
    return super.getUserId(userContext);
  }

  /**
   * Returns the HTML of the web page that initiates the authorization flow to the authorizationUrl. Return
   * undefined if you don't want to present any HTML to the user but instead redirect the user directly to
   * the authorizationUrl.
   * @param {FusebitContext} fusebitContext The Fusebit context of the request
   * @param {string} authorizationUrl The fully formed authorization url to redirect the user to
   */
  async getAuthorizationPageHtml(fusebitContext, authorizationUrl) {
    return super.getAuthorizationPageHtml(fusebitContext, authorizationUrl);
  }

  /**
   * Saves user context in storage for future use. This is also an opportunity to ensure any user-specific arifacts
   * are created, for example a Fusebit function.
   * @param {FusebitContext} fusebitContext The Fusebit context of the request
   * @param {*} userContext The user context representing the vendor's user. Contains vendorToken and vendorUserProfile, representing responses
   * from getAccessToken and getUserProfile, respectively.
   */
  async saveUser(fusebitContext, userContext) {
    await super.saveUser(fusebitContext, userContext);
  }

  /**
   * Deletes all artifacts associated with a vendor user. This is an opportunity to remove any artifacts created in
   * saveUser, for example Fusebit functions.
   * @param {FusebitContext} fusebitContext The Fusebit context
   * @param {string} vendorUserId The vendor user id
   * @param {string} vendorId If specified, vendorUserId represents the identity of the user in another system.
   * The vendorId must correspond to an entry in userContext.foreignOAuthIdentities.
   */
  async deleteUser(fusebitContext, vendorUserId, vendorId) {
    await super.deleteUser(fusebitContext, vendorUserId, vendorId);
  }

  /**
   * Gets the health status of the user
   * @param {FusebitContext} fusebitContext The Fusebit context of the request
   * @param {*} userContext The user context representing the vendor's user. Contains vendorToken and vendorUserProfile, representing responses
   * from getAccessToken and getUserProfile, respectively.
   */
  async getHealth(fusebitContext, userContext) {
    // Perform any application-specific checks in the user represented by userContext and return an object with 'status'
    // and optionally 'body' properties.
    return { status: 200 };
  }
}

module.exports.VendorOAuthConnector = VendorOAuthConnector;
