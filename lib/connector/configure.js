const Superagent = require('superagent');
const Sdk = require('@fusebit/add-on-sdk');

module.exports = (connector) => ({
    initialState: 'initial',
    states: {
        initial: async (ctx, state, data) => {
            // Initiate authentication

            Sdk.debug('INITIAL', state, data);

            state.configurationState = 'authCallback';
            state.data = data;

            const authorizationUrl = await connector.getAuthorizationUrl(ctx, Sdk.serializeState(state), `${ctx.baseUrl}/callback`);
            const view = await connector.getAuthorizationPageHtml(ctx, authorizationUrl);

            return view
                ? {
                      status: 200,
                      body: view,
                      bodyEncoding: 'utf8',
                      headers: { 'content-type': 'text/html' },
                  }
                : {
                      status: 302,
                      headers: { location: authorizationUrl },
                  };
        },

        authCallback: async (ctx, state) => {
            // Process OAuth callback

            let vendorUserId;
            let userPersisted;
            if (ctx.query.code) {
                try {
                    const vendorToken = await connector.getAccessToken(ctx, ctx.query.code, `${ctx.baseUrl}/callback`);
                    if (!isNaN(vendorToken.expires_in)) {
                        vendorToken.expires_at = Date.now() + +vendorToken.expires_in * 1000;
                    }
                    const userContext = {
                        status: 'authenticated',
                        vendorToken,
                        vendorUserProfile: await connector.getUserProfile(vendorToken),
                        timestamp: Date.now(),
                    };
                    userContext.vendorUserId = vendorUserId = await connector.getUserId(userContext);
                    await connector.saveUser(ctx, userContext);
                    userPersisted = true;
                } catch (e) {
                    Sdk.debug('AUTHORIZATION CODE EXCHANGE ERROR', e);
                    if (userPersisted) {
                        await connector.deleteUser(ctx, vendorUserId);
                    }
                    throw {
                        status: 500,
                        message: `Error exchanging the authorization code for an access token: ${e.message}`,
                        state,
                    };
                }
                let data = {
                    ...state.data,
                    vendor_user_id: vendorUserId,
                    vendor_get_token_url: `${ctx.baseUrl}/user/${encodeURIComponent(vendorUserId)}/token`,
                };
                return Sdk.completeWithSuccess(state, data);
            } else {
                throw {
                    status: 500,
                    message: `Authentication failed: ${ctx.query.error_description || ctx.query.error || 'Unknown error'}`,
                    state,
                };
            }
        },
    },
});
