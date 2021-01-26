const Sdk = require('@fusebit/add-on-sdk');
const Superagent = require('superagent');
const authorizeView = require('fs').readFileSync(__dirname + '/authorize.html', {
  encoding: 'utf8',
});

class OAuthConnector {
  constructor() {
    /**
     * Access tokens returned from ensureAccessToken method will expire not earlier
     * than accessTokenExpirationBuffer milliseconds in the future.
     */
    this.accessTokenExpirationBuffer = 30000;

    /**
     * If refreshing an access token fails for refreshErrorLimit of consecutive times, the user is deleted.
     */
    this.refreshErrorLimit = 10;

    /**
     * Maximum number of times the user status will be queried before failing while waiting for the user's
     * access token to be refreshed.
     */
    this.refreshWaitCountLimit = 5;

    /**
     * Intial backoff in milliseconds before querying user status for completion of an access token refresh.
     */
    this.refreshInitialBackoff = 100;

    /**
     * Backoff increment for consecutive attempts to query user status for completion of an access token refresh.
     */
    this.refreshBackoffIncrement = 1.2;
  }

  /**
   * Called during connector initialization to allow the connector to register additional, application-specific
   * routes on the provided Express router.
   * @param {*} Express router
   */
  onCreate(app) {}

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
      fusebitContext.configuration.vendor_oauth_audience
        ? `&audience=${encodeURIComponent(fusebitContext.configuration.vendor_oauth_audience)}`
        : undefined,
      fusebitContext.configuration.vendor_oauth_extra_params
        ? `&${fusebitContext.configuration.vendor_oauth_extra_params}`
        : undefined,
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
   * @param {string} redirectUri The redirect_uri value Fusebit used to start the authorization flow.
   */
  async refreshAccessToken(fusebitContext, tokenContext, redirectUri) {
    const currentRefreshToken = tokenContext.refresh_token;
    const response = await Superagent.post(fusebitContext.configuration.vendor_oauth_token_url)
      .type('form')
      .send({
        grant_type: 'refresh_token',
        refresh_token: tokenContext.refresh_token,
        client_id: fusebitContext.configuration.vendor_oauth_client_id,
        client_secret: fusebitContext.configuration.vendor_oauth_client_secret,
        redirect_uri: redirectUri || `${fusebitContext.baseUrl}/callback`,
      });
    if (!response.body.refresh_token) {
      response.body.refresh_token = currentRefreshToken;
    }
    return response.body;
  }

  /**
   * Obtains the user profile given a freshly completed authorization flow. User profile will be stored along the token
   * context.
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
    throw new Error(
      'Please implement the getUserProfile and getUserId methods in the class deriving from OAuthConnector.'
    );
  }

  /**
   * Called after successful completion of the connector's configuration flow. The 'data' parameter contains
   * configuration properties generated by settings managers that ran prior to this connector, for example a user ID
   * of the user in another system, or a URL to obtain the access token to another system. You can use this extensibility
   * point to modify the 'userContext' with information about the identity of the user in another system, therefore
   * creating an association between the same user in two systems.
   * @param {FusebitContext} fusebitContext The Fusebit context of the request
   * @param {*} userContext The user context representing the vendor's user. Contains vendorToken and vendorUserProfile, representing responses
   * from getAccessToken and getUserProfile, respectively.
   * @param {*} data A property bag containing properties generated by settings managers that have completed prior to the configuration flow of this connector.
   */
  async onConfigurationComplete(fusebitContext, userContext, data) {
    if (data) {
      for (let p in data) {
        const match = p.match(/^(.+)_oauth_user_id$/);
        if (match && typeof data[`${match[1]}_oauth_connector_base_url`] === 'string') {
          userContext.foreignOAuthIdentities = {
            ...(userContext.foreignOAuthIdentities || {}),
            [match[1]]: {
              userId: data[p],
              connectorBaseUrl: data[`${match[1]}_oauth_connector_base_url`],
            },
          };
        }
      }
    }
  }

  /**
   * Called after a new user successfuly completed a configuration flow and was persisted in the system. This extensibility
   * point allows for creation of any artifacts required to serve this new user, for example creation of additional
   * Fusebit functions.
   * @param {FusebitContext} fusebitContext The Fusebit context of the request
   * @param {*} userContext The user context representing the vendor's user. Contains vendorToken and vendorUserProfile, representing responses
   * from getAccessToken and getUserProfile, respectively.
   */
  async onNewUser(fusebitContext, userContext) {}

  /**
   * Returns the HTML of the web page that initiates the authorization flow to the authorizationUrl. Return
   * undefined if you don't want to present any HTML to the user but instead redirect the user directly to
   * the authorizationUrl.
   * @param {FusebitContext} fusebitContext The Fusebit context of the request
   * @param {string} authorizationUrl The fully formed authorization url to redirect the user to
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
   * @param {string} foreignVendorId If specified, vendorUserId represents the identity of the user in another system.
   * The foreignVendorId must correspond to an entry in userContext.foreignOAuthIdentities.
   */
  async getUser(fusebitContext, vendorUserId, foreignVendorId) {
    if (foreignVendorId) {
      let data = await fusebitContext.storage.get(this.getStorageIdForVendorUser(vendorUserId, foreignVendorId));
      vendorUserId = data && data.data && data.data.vendorUserId;
      if (!vendorUserId) {
        return undefined;
      }
    }
    const s = await fusebitContext.storage.get(this.getStorageIdForVendorUser(vendorUserId));
    return s ? s.data : undefined;
  }

  /**
   * Saves user context in storage for future use.
   * @param {FusebitContext} fusebitContext The Fusebit context of the request
   * @param {*} userContext The user context representing the vendor's user. Contains vendorToken and vendorUserProfile, representing responses
   * from getAccessToken and getUserProfile, respectively.
   */
  async saveUser(fusebitContext, userContext) {
    if (userContext.foreignOAuthIdentities) {
      for (let foreignVendorId in userContext.foreignOAuthIdentities) {
        await fusebitContext.storage.put(
          { data: { vendorUserId: userContext.vendorUserId } },
          this.getStorageIdForVendorUser(userContext.foreignOAuthIdentities[foreignVendorId].userId, foreignVendorId)
        );
      }
    }
    return fusebitContext.storage.put({ data: userContext }, this.getStorageIdForVendorUser(userContext.vendorUserId));
  }

  /**
   * Deletes user context from storage.
   * @param {FusebitContext} fusebitContext The Fusebit context
   * @param {string} vendorUserId The vendor user id
   * @param {string} vendorId If specified, vendorUserId represents the identity of the user in another system.
   * The vendorId must correspond to an entry in userContext.foreignOAuthIdentities.
   */
  async deleteUser(fusebitContext, vendorUserId, vendorId) {
    const userContext = await this.getUser(fusebitContext, vendorUserId, vendorId);
    if (userContext && userContext.foreignOAuthIdentities) {
      for (let fvId in userContext.foreignOAuthIdentities) {
        await fusebitContext.storage.delete(
          this.getStorageIdForVendorUser(userContext.foreignOAuthIdentities[fvId].userId, fvId)
        );
      }
    }
    return userContext && fusebitContext.storage.delete(this.getStorageIdForVendorUser(userContext.vendorUserId));
  }

  /**
   * Gets the health status of the user
   * @param {FusebitContext} fusebitContext The Fusebit context of the request
   * @param {*} userContext The user context representing the vendor's user. Contains vendorToken and vendorUserProfile, representing responses
   * from getAccessToken and getUserProfile, respectively.
   */
  async getHealth(fusebitContext, userContext) {
    return { status: 200 };
  }

  /**
   * Returns a valid access token to the vendor's system representing the vendor's user described by the userContext,
   * or a valid access token to a foreign system if foreignVendorId is specified.
   * For the vendor's system, if the currently stored access token is expired or nearing expiry, and a refresh token is available, a new access
   * token is obtained, stored for future use, and returned. If a current access token cannot be returned, an exception is thrown.
   * @param {FusebitContext} fusebitContext The Fusebit context of the request
   * @param {*} userContext The vendor user context
   * @param {string} foreignVendorId If specified, gets a valid access token for the OAuth connector identified by the
   * foreignVendorId entry in the userContext.foreignOAuthIdentities rather than a user of this connector.
   */
  async ensureAccessToken(fusebitContext, userContext, foreignVendorId) {
    const ensureForeignAccessToken = async () => {
      const oauthIdentity = (userContext.foreignOAuthIdentities || {})[foreignVendorId];
      Sdk.debug('OBTAINING ACCESS TOKEN FOR FOREIGN USER', foreignVendorId, oauthIdentity);
      if (oauthIdentity) {
        try {
          const response = await Superagent.get(
            `${oauthIdentity.connectorBaseUrl}/user/${encodeURIComponent(oauthIdentity.userId)}/token`
          ).set('Authorization', `Bearer ${fusebitContext.fusebit.functionAccessToken}`);
          return response.body;
        } catch (e) {
          throw new Error(
            `Error obtaining current access token for user '${oauthIdentity.userId}' from the connector for vendor '${foreignVendorId}' at '${oauthIdentity.connectorBaseUrl}: ${e.message}'`
          );
        }
      } else {
        throw new Error(
          `The user ${userContext.vendorUserId} is not associated with an identity in the ${foreignVendorId} OAuth connector.`
        );
      }
    };

    const ensureLocalAccessToken = async () => {
      if (
        userContext.vendorToken.access_token &&
        (userContext.vendorToken.expires_at === undefined ||
          userContext.vendorToken.expires_at > Date.now() + this.accessTokenExpirationBuffer)
      ) {
        Sdk.debug('RETURNING CURRENT ACCESS TOKEN FOR USER', userContext.vendorUserId);
        return userContext.vendorToken;
      }
      if (userContext.vendorToken.refresh_token) {
        Sdk.debug('REFRESHING ACCESS TOKEN FOR USER', userContext.vendorUserId);
        userContext.status = 'refreshing';
        try {
          await this.saveUser(fusebitContext, userContext);
          userContext.vendorToken = await this.refreshAccessToken(
            fusebitContext,
            userContext.vendorToken,
            `${fusebitContext.baseUrl}/callback`
          );
          if (!isNaN(userContext.vendorToken.expires_in)) {
            userContext.vendorToken.expires_at = Date.now() + +userContext.vendorToken.expires_in * 1000;
          }
          userContext.vendorUserProfile = await this.getUserProfile(userContext.vendorToken);
          userContext.status = 'authenticated';
          userContext.refreshErrorCount = 0;
          await this.saveUser(fusebitContext, userContext);
          return userContext.vendorToken;
        } catch (e) {
          if (userContext.refreshErrorCount > this.refreshErrorLimit) {
            Sdk.debug('REFRESH TOKEN ERROR, DELETING USER', e);
            await this.deleteUser(fusebitContext, userContext.vendorUserId);
            throw new Error(
              `Error refreshing access token. Maximum number of attempts exceeded, user has been deleted: ${e.message}`
            );
          } else {
            userContext.refreshErrorCount = (userContext.refreshErrorCount || 0) + 1;
            userContext.status = 'refresh_error';
            await this.saveUser(fusebitContext, userContext);
            throw new Error(
              `Error refreshing access token, attempt ${userContext.refreshErrorCount} out of ${this.refreshErrorLimit}: ${e.message}`
            );
          }
        }
      }
      Sdk.debug('REFRESH TOKEN ERROR: ACCESS TOKEN EXPIRED BUT REFRESH TOKEN ABSENT, DELETING USER');
      await this.deleteUser(fusebitContext, userContext.vendorUserId);
      throw new Error(`Access token is expired and cannot be refreshed because the refresh token is not present.`);
    };

    const waitForRefreshedAccessToken = async (count, backoff) => {
      Sdk.debug('WAITING FOR ACCESS TOKEN TO BE REFRESHED FOR USER', userContext.vendorUserId, 'ATTEMPTS LEFT', count);
      if (!count > 0) {
        throw new Error(
          `Error refreshing access token. Waiting for the access token to be refreshed exceeded the maximum time`
        );
      }
      return new Promise((resolve, reject) => {
        setTimeout(async () => {
          try {
            userContext = await this.getUser(fusebitContext, userContext.vendorUserId);
            if (!userContext || userContext.status === 'refresh_error') {
              throw new Error(`Concurrent access token refresh operation failed`);
            }
          } catch (e) {
            return reject(new Error(`Error waiting for access token refresh: ${e.message}`));
          }
          if (userContext.status === 'authenticated') {
            return resolve(userContext.vendorToken);
          } else {
            let result;
            try {
              result = await waitForRefreshedAccessToken(count - 1, Math.floor(backoff * this.refreshBackoffIncrement));
            } catch (e) {
              return reject(e);
            }
            return resolve(result);
          }
        }, backoff);
      });
    };

    if (foreignVendorId) {
      // Get access token from foreign OAuth connector specified in userContext.foreignOAuthIdentities
      return await ensureForeignAccessToken();
    } else {
      if (userContext.status === 'refreshing') {
        // Wait for the currently ongoing refresh operation to finish
        return await waitForRefreshedAccessToken(this.refreshWaitCountLimit, this.refreshInitialBackoff);
      } else {
        // Get access token for "this" OAuth connector
        return await ensureLocalAccessToken();
      }
    }
  }

  getStorageIdForVendorUser(id, foreignVendorId) {
    return foreignVendorId
      ? `foreign-vendor-user/${encodeURIComponent(foreignVendorId)}/${encodeURIComponent(id)}`
      : `vendor-user/${encodeURIComponent(id)}`;
  }

  _getStorageIdForVendorUser(id, foreignVendorId) {
    return this.getStorageIdForVendorUser(id, foreignVendorId);
  }
}

exports.OAuthConnector = OAuthConnector;
