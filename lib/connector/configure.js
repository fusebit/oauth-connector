const Sdk = require('@fusebit/add-on-sdk');

module.exports = (connector) => {
    const settingsManagers = async (ctx, state, data) => {
        // Run through optional additional settings managers

        Sdk.debug('SETTINGS MANAGERS', state, data);

        if (!data.fusebit_skip_settings_managers) {
            const settingsManagers = [];
            (ctx.configuration.fusebit_settings_managers || '').split(',').forEach((s) => {
                if (s.trim()) {
                    settingsManagers.push(s);
                }
            });
            const stage = state.settingsManagersStage || 0;
            if (settingsManagers.length > stage) {
                // Invoke subsequent settings manager
                state.settingsManagersStage = stage + 1;
                return Sdk.redirect(ctx, state, data, settingsManagers[stage], 'settingsManagers');
            }
        }

        // All settings managers processed (or none defined), or skipped, move to the 'authInit' state
        delete data.fusebit_skip_settings_managers;
        state.configurationState = 'authInit';
        return await authInit(ctx, state, data);
    };

    const authInit = async (ctx, state, data) => {
        // Initiate authentication

        Sdk.debug('AUTH INIT', state, data);

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
    };

    const authCallback = async (ctx, state) => {
        // Process OAuth callback

        let vendorUserId;
        let userPersisted;
        let userContext;
        if (ctx.query.code) {
            try {
                const vendorToken = await connector.getAccessToken(ctx, ctx.query.code, `${ctx.baseUrl}/callback`);
                if (!isNaN(vendorToken.expires_in)) {
                    vendorToken.expires_at = Date.now() + +vendorToken.expires_in * 1000;
                }
                userContext = {
                    status: 'authenticated',
                    vendorToken,
                    vendorUserProfile: await connector.getUserProfile(vendorToken),
                    timestamp: Date.now(),
                };
                userContext.vendorUserId = vendorUserId = await connector.getUserId(userContext);
                await connector.onConfigurationComplete(ctx, userContext, state.data);
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
            let data = { ...state.data };
            data[`${ctx.configuration.vendor_prefix}_oauth_user_id`] = vendorUserId;
            data[`${ctx.configuration.vendor_prefix}_oauth_connector_base_url`] = ctx.baseUrl;
            try {
                await connector.onNewUser(ctx, userContext);
            } catch (e) {
                Sdk.debug('ON NEW USER ERROR', e);
                await connector.deleteUser(ctx, vendorUserId);
                throw {
                    status: 500,
                    message: `Error initializing new user: ${e.message}`,
                    state,
                };
            }
            return Sdk.completeWithSuccess(state, data);
        } else {
            throw {
                status: 500,
                message: `Authentication failed: ${ctx.query.error_description || ctx.query.error || 'Unknown error'}`,
                state,
            };
        }
    };

    return {
        initialState: 'settingsManagers',
        states: { settingsManagers, authInit, authCallback },
    };
};
