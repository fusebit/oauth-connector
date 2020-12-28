const Sdk = require('@fusebit/add-on-sdk');
const Superagent = require('superagent');
const authorizeView = require('fs').readFileSync(__dirname + '/authorize.html', {
    encoding: 'utf8',
});

class OAuthConnector {
    constructor() {}

    /**
     * Called when the entire connector is being deleted. Override the logic in this method to remove
     * any artifacts created during the lifetime of this connector (e.g. Fusebit functions, storage).
     * @param {FusebitContext} fusebitContext The Fusebit context
     */
    async onDelete(fusebitContext) {
        // Clean up storage and vendor artifacts
        await fusebitContext.storage.delete(undefined, true);
    }

    /**
     * Creates Express middleware that authorizes the call using Fusebit security. For example, the following will only execute
     * the Express handler if the access token supplied by the caller has the function:execute permission on the function resource.
     *
     * app.get('/myendpoint',
     *   authorize({
     *     action: 'function:execute',
     *     resourceFactory: req => `/account/${req.fusebit.accountId}/subscription/${req.fusebit.subscriptionId}/boundary/${req.fusebit.boundaryId}/function/${req.fusebit.functionId}/myendpoint/`
     *   }),
     *   handler
     * );
     *
     * @param {object} param Object with action and resourceFactory properties
     */
    authorize({ action, resourceFactory }) {
        const actionTokens = action.split(':');
        return async (req, res, next) => {
            const resource = resourceFactory(req);
            try {
                if (!req.fusebit.caller.permissions) {
                    throw new Error('The caller was not authenticated.');
                }
                for (const permission of req.fusebit.caller.permissions.allow) {
                    if (resource.indexOf(permission.resource) !== 0) {
                        continue;
                    }
                    const actualActionTokens = permission.action.split(':');
                    let match = true;
                    for (let i = 0; i < actionTokens.length; i++) {
                        if (actionTokens[i] !== actualActionTokens[i]) {
                            match = actualActionTokens[i] === '*';
                            break;
                        }
                    }
                    if (match) {
                        return next();
                    }
                }
                throw new Error('Caller does not have sufficient permissions.');
            } catch (e) {
                Sdk.debug('FAILED AUTHORIZATION CHECK', e.message, action, resource, req.fusebit.caller.permissions);
                res.status(403).send({ status: 403, statusCode: 403, message: 'Unauthorized' });
                return;
            }
        };
    }

    /**
     * Creates the fully formed web authorization URL to start the authorization flow.
     * @param {FusebitContext} fusebitContext The Fusebit context of the request
     * @param {string} state The value of the OAuth state parameter.
     * @param {string} redirectUri The callback URL to redirect to after the authorization flow.
     */
    async getAuthorizationUrl(fusebitContext, state, redirectUri) {
        return [
            fusebitContext.configuration.vendor_oauth_authorization_url,
            `?response_type=code`,
            `&scope=${encodeURIComponent(fusebitContext.configuration.vendor_oauth_scope)}`,
            `&state=${state}`,
            `&client_id=${fusebitContext.configuration.vendor_oauth_client_id}`,
            `&redirect_uri=${encodeURIComponent(redirectUri)}`,
        ].join('');
    }

    /**
     * Exchanges the OAuth authorization code for the access and refresh tokens.
     * @param {FusebitContext} fusebitContext The Fusebit context of the request
     * @param {string} authorizationCode The authorization_code supplied to the OAuth callback upon successful authorization flow.
     * @param {string} redirectUri The redirect_uri value Fusebit used to start the authorization flow.
     */
    async getAccessToken(fusebitContext, authorizationCode, redirectUri) {
        const response = await Superagent.post(fusebitContext.configuration.vendor_oauth_token_url).type('form').send({
            grant_type: 'authorization_code',
            code: authorizationCode,
            client_id: fusebitContext.configuration.vendor_oauth_client_id,
            client_secret: fusebitContext.configuration.vendor_oauth_client_secret,
            redirect_uri: redirectUri,
        });
        return response.body;
    }

    /**
     * Obtains a new access token using refresh token.
     * @param {FusebitContext} fusebitContext The Fusebit context of the request
     * @param {*} tokenContext An object representing the result of the getAccessToken call. It contains refresh_token.
     */
    async refreshAccessToken(fusebitContext, tokenContext) {
        const response = await Superagent.post(fusebitContext.configuration.vendor_oauth_token_url).query({
            grant_type: 'refresh_token',
            refresh_token: tokenContext.refresh_token,
            client_id: fusebitContext.configuration.vendor_oauth_client_id,
            client_secret: fusebitContext.configuration.vendor_oauth_client_secret,
        });
        return response.body;
    }

    /**
     * Obtains the user profile given a freshly completed authorization flow. User profile will be stored along the token
     * context and associated with Microsoft Teams user, and can be later used to customize the conversation with the Microsoft
     * Teams user.
     * @param {*} tokenContext An object representing the result of the getAccessToken call. It contains access_token.
     */
    async getUserProfile(tokenContext) {
        return {};
    }

    /**
     * Returns a string uniquely identifying the user in vendor's system. Typically this is a property of
     * userContext.vendorUserProfile. Default implementation is opportunistically returning userContext.vendorUserProfile.id
     * if it exists.
     * @param {*} userContext The user context representing the vendor's user. Contains vendorToken and vendorUserProfile, representing responses
     * from getAccessToken and getUserProfile, respectively.
     */
    async getUserId(userContext) {
        if (userContext.vendorUserProfile.id) {
            return userContext.vendorUserProfile.id;
        }
        throw new Error('Please implement the getUserProfile and getUserId methods in the class deriving from OAuthConnector.');
    }

    /**
     * Returns the HTML of the web page that initiates the authorization flow to the authorizationUrl. Return
     * undefined if you don't want to present any HTML to the user but instead redirect the user directly to
     * the authorizationUrl.
     * @param {FusebitContext} fusebitContext The Fusebit context of the request
     * @param {string} authorizationUrl The fully formed authorizatio url to redirect the user to
     */
    async getAuthorizationPageHtml(fusebitContext, authorizationUrl) {
        return authorizeView
            .replace(/##vendorName##/g, fusebitContext.configuration.vendor_name)
            .replace(/##authorizationUrl##/g, authorizationUrl)
            .replace(/##returnTo##/, JSON.stringify(fusebitContext.query.returnTo))
            .replace(/##state##/, fusebitContext.query.state ? JSON.stringify(fusebitContext.query.state) : 'null');
    }

    /**
     * Gets the user context representing the user with vendorUserId id. Returned object contains vendorToken and vendorUserProfile properties.
     * @param {FusebitContext} fusebitContext The Fusebit context
     * @param {string} vendorUserId The vendor user id
     */
    async getUser(fusebitContext, vendorUserId) {
        const s = await fusebitContext.storage.get(this._getStorageIdForVendorUser(vendorUserId));
        return s ? s.data : undefined;
    }

    /**
     * Saves user context in storage for future use.
     * @param {FusebitContext} fusebitContext The Fusebit context of the request
     * @param {*} userContext The user context representing the vendor's user. Contains vendorToken and vendorUserProfile, representing responses
     * from getAccessToken and getUserProfile, respectively.
     */
    async saveUser(fusebitContext, userContext) {
        return fusebitContext.storage.put({ data: userContext }, this._getStorageIdForVendorUser(userContext.vendorUserId));
    }

    /**
     * Deletes user context from storage.
     * @param {FusebitContext} fusebitContext The Fusebit context
     * @param {string} vendorUserId The vendor user id
     */
    async deleteUser(fusebitContext, vendorUserId) {
        return fusebitContext.storage.delete(this._getStorageIdForVendorUser(vendorUserId));
    }

    /**
     * Returns a valid access token to the vendor's system representing the vendor's user described by the userContext.
     * If the currently stored access token is expired or nearing expiry, and a refresh token is available, a new access
     * token is obtained, stored for future use, and returned. If a current access token cannot be returned, an exception is thrown.
     * @param {FusebitContext} fusebitContext The Fusebit context of the request
     * @param {*} userContext The vendor user context
     */
    async ensureAccessToken(fusebitContext, userContext) {
        if (userContext.vendorToken.access_token && userContext.vendorToken.expires_at > Date.now() + 30000) {
            Sdk.debug('RETURNING CURRENT ACCESS TOKEN FOR USER', userContext.vendorUserId);
            return userContext.vendorToken;
        }
        if (userContext.vendorToken.refresh_token) {
            Sdk.debug('REFRESHING ACCESS TOKEN FOR USER', userContext.vendorUserId);
            userContext.status = 'refreshing';
            try {
                await this.saveUser(fusebitContext, userContext);
                userContext.vendorToken = await this.refreshAccessToken(fusebitContext, userContext.vendorToken);
                if (!isNaN(userContext.vendorToken.expires_in)) {
                    userContext.vendorToken.expires_at = Date.now() + +userContext.vendorToken.expires_in * 1000;
                }
                userContext.vendorUserProfile = await this.getUserProfile(userContext.vendorToken);
                userContext.status = 'authenticated';
                await this.saveUser(fusebitContext, userContext);
                return userContext.vendorToken;
            } catch (e) {
                await this.deleteUser(fusebitContext, userContext.vendorUserId);
                Sdk.debug('REFRESH TOKEN ERROR', e);
            }
        }
    }

    _getStorageIdForVendorUser(id) {
        return `vendor-user/${encodeURIComponent(id)}`;
    }
}

exports.OAuthConnector = OAuthConnector;
