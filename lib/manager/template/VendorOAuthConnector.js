const { OAuthConnector } = require('@fusebit/oauth-connector');

class VendorOAuthConnector extends OAuthConnector {
    constructor() {
        super();
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
     */
    async refreshAccessToken(fusebitContext, tokenContext) {
        return super.refreshAccessToken(fusebitContext, tokenContext);
    }

    /**
     * Obtains the user profile given a freshly completed authorization flow. User profile will be stored along the token
     * context.
     * @param {*} tokenContext An object representing the result of the getAccessToken call. It contains access_token.
     */
    async getUserProfile(tokenContext) {
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
        return super.getUserId(userContext);
    }

    /**
     * Returns the HTML of the web page that initiates the authorization flow to the authorizationUrl. Return
     * undefined if you don't want to present any HTML to the user but instead redirect the user directly to
     * the authorizationUrl.
     * @param {FusebitContext} fusebitContext The Fusebit context of the request
     * @param {string} authorizationUrl The fully formed authorizatio url to redirect the user to
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
     */
    async deleteUser(fusebitContext, vendorUserId) {
        await super.deleteUser(fusebitContext, vendorUserId);
    }
}

module.exports.VendorOAuthConnector = VendorOAuthConnector;
