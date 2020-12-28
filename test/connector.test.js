const mockConnector = require('..');
// This is to allow the VendorOAuthConnector.js to load @fusebit/oauth-connector:
const connector = mockConnector;
jest.mock('@fusebit/oauth-connector', () => mockConnector, { virtual: true });

const { getCredentials, createCtx, cleanup, testBoundaryId, testFunctionId1, testFunctionId2, getStorage } = require('./common');
const Url = require('url');

const profile = getCredentials();

const configureCtx = createCtx(
    {
        query: {
            returnTo: 'https://contoso.com',
            state: 'abc',
            data: Buffer.from(
                JSON.stringify({
                    baseUrl: profile.baseUrl,
                    accountId: profile.account,
                    subscriptionId: profile.subscription,
                    boundaryId: testBoundaryId,
                    functionId: testFunctionId2,
                    templateName: 'test-template-name',
                })
            ).toString('base64'),
        },
        configuration: {
            vendor_oauth_authorization_url: 'https://idp.com/authorize',
            vendor_oauth_token_url: 'https://idp.com/token',
            vendor_oauth_scope: 'sample-scope',
            vendor_oauth_client_id: '123',
            vendor_oauth_client_secret: '456',
            vendor_name: 'Contoso',
            fusebit_allowed_return_to: '*',
        },
    },
    {
        path: `/configure`,
    }
);

const callbackCtx = (state) =>
    createCtx(
        {
            query: {
                code: 'abc',
                state,
            },
            configuration: {
                vendor_oauth_authorization_url: 'https://idp.com/authorize',
                vendor_oauth_token_url: 'https://idp.com/token',
                vendor_oauth_scope: 'sample-scope',
                vendor_oauth_client_id: '123',
                vendor_oauth_client_secret: '456',
                vendor_name: 'Contoso',
                fusebit_allowed_return_to: '*',
            },
        },
        {
            path: `/callback`,
        }
    );

const getTokenCtx = createCtx(
    {
        configuration: {
            vendor_oauth_authorization_url: 'https://idp.com/authorize',
            vendor_oauth_token_url: 'https://idp.com/token',
            vendor_oauth_scope: 'sample-scope',
            vendor_oauth_client_id: '123',
            vendor_oauth_client_secret: '456',
            vendor_name: 'Contoso',
            fusebit_allowed_return_to: '*',
        },
        caller: {
            permissions: {
                allow: [
                    {
                        action: '*',
                        resource: '/',
                    },
                ],
            },
        },
    },
    {
        path: `/user/789/token`,
    }
);

const getUserCtx = createCtx(
    {
        configuration: {
            vendor_oauth_authorization_url: 'https://idp.com/authorize',
            vendor_oauth_token_url: 'https://idp.com/token',
            vendor_oauth_scope: 'sample-scope',
            vendor_oauth_client_id: '123',
            vendor_oauth_client_secret: '456',
            vendor_name: 'Contoso',
            fusebit_allowed_return_to: '*',
        },
        caller: {
            permissions: {
                allow: [
                    {
                        action: '*',
                        resource: '/',
                    },
                ],
            },
        },
    },
    {
        path: `/user/789`,
    }
);

const deleteUserCtx = createCtx(
    {
        method: 'DELETE',
        configuration: {
            vendor_oauth_authorization_url: 'https://idp.com/authorize',
            vendor_oauth_token_url: 'https://idp.com/token',
            vendor_oauth_scope: 'sample-scope',
            vendor_oauth_client_id: '123',
            vendor_oauth_client_secret: '456',
            vendor_name: 'Contoso',
            fusebit_allowed_return_to: '*',
        },
        caller: {
            permissions: {
                allow: [
                    {
                        action: '*',
                        resource: '/',
                    },
                ],
            },
        },
    },
    {
        path: `/user/789`,
    }
);

describe('connector', () => {
    beforeAll(async () => cleanup());
    afterEach(async () => cleanup());

    test('Connector module has correct exports', async () => {
        expect(typeof connector.createOAuthConnector).toBe('function');
        expect(typeof connector.OAuthConnector).toBe('function');
    });

    test('createOAuthConnector returns an async function for base OAuthConnector', async () => {
        const handler = connector.createOAuthConnector(new connector.OAuthConnector());
        expect(typeof handler).toBe('function');
        expect(handler.constructor.name).toBe('AsyncFunction');
    });

    test('createOAuthConnector returns an async function for derived VendorOAuthConnector', async () => {
        const { VendorOAuthConnector } = require('../lib/manager/template/VendorOAuthConnector');
        const handler = connector.createOAuthConnector(new VendorOAuthConnector());
        expect(typeof handler).toBe('function');
        expect(handler.constructor.name).toBe('AsyncFunction');
    });

    test('The /configure endpoint returns HTML by default', async () => {
        const { VendorOAuthConnector } = require('../lib/manager/template/VendorOAuthConnector');
        const handler = connector.createOAuthConnector(new VendorOAuthConnector());
        const ctx = configureCtx;
        const response = await handler(ctx);
        expect(response.status).toBe(200);
        expect(typeof response.body).toBe('string');
        expect(response.headers['content-type']).toMatch('text/html');
        expect(response.bodyEncoding).toBe('utf8');
    });

    test('The /configure endpoint returns a redirect when no initial HTML is specified', async () => {
        const { VendorOAuthConnector } = require('../lib/manager/template/VendorOAuthConnector');
        class TestOAuthConnector extends VendorOAuthConnector {
            async getAuthorizationPageHtml(fusebitContext, authorizationUrl) {
                return undefined;
            }
        }
        const handler = connector.createOAuthConnector(new TestOAuthConnector());
        const ctx = configureCtx;
        const response = await handler(ctx);
        expect(response.status).toBe(302);
        expect(response.headers).toBeDefined();
        expect(typeof response.headers.location).toBe('string');
        const url = Url.parse(response.headers.location, true);
        expect(url.protocol).toBe('https:');
        expect(url.host).toBe('idp.com');
        expect(url.pathname).toBe('/authorize');
        expect(url.query.client_id).toBe('123');
        expect(url.query.response_type).toBe('code');
        expect(url.query.scope).toBe('sample-scope');
        expect(url.query.state).toBeDefined();
        expect(url.query.redirect_uri).toBe(
            `${profile.baseUrl}/v1/run/${profile.subscription}/${testBoundaryId}/${testFunctionId1}/callback`
        );
    });

    test('The /callback endpoint logs in vendor user and returns a redirect with successful response', async () => {
        const { VendorOAuthConnector } = require('../lib/manager/template/VendorOAuthConnector');
        class TestOAuthConnector extends VendorOAuthConnector {
            async getAuthorizationPageHtml(fusebitContext, authorizationUrl) {
                return undefined;
            }
            async getAccessToken(fusebitContext, authorizationCode, redirectUri) {
                return {
                    access_token: `access-token:${authorizationCode}`,
                    expires_in: 10000,
                };
            }
            async getUserProfile(tokenContext) {
                return { id: '789' };
            }
        }
        const oAuthConnector = new TestOAuthConnector();
        const handler = connector.createOAuthConnector(new TestOAuthConnector());
        let ctx = configureCtx;
        // Initiate the authorization transaction only to extract the 'state' parameter to pass to /callback later
        let response = await handler(ctx);
        expect(response.status).toBe(302);
        expect(response.headers).toBeDefined();
        expect(typeof response.headers.location).toBe('string');
        let url = Url.parse(response.headers.location, true);
        expect(url.query.state).toBeDefined();
        ctx = callbackCtx(url.query.state);
        // Process the /callback and pass the 'state' parameter from the response to /configure
        response = await handler(ctx);
        expect(response.status).toBe(302);
        // Validate the redirect URL query params
        expect(typeof response.headers.location).toBe('string');
        url = Url.parse(response.headers.location, true);
        expect(url.protocol).toBe('https:');
        expect(url.host).toBe('contoso.com');
        expect(url.pathname).toBe('/');
        expect(url.query.state).toBe('abc');
        expect(url.query.data).toBeDefined();
        // Validate the 'data' that would normally be passed back to the add-on handler on installation:
        const data = JSON.parse(Buffer.from(url.query.data, 'base64'));
        expect(data).toMatchObject({
            vendor_user_id: '789',
            vendor_get_token_url: `${profile.baseUrl}/v1/run/${profile.subscription}/${testBoundaryId}/${testFunctionId1}/user/789/token`,
        });
        // Validate storage content for the logged in user
        response = await getStorage(testBoundaryId, testFunctionId1, oAuthConnector._getStorageIdForVendorUser(data.vendor_user_id));
        expect(response.status).toBe(200);
        expect(response.body).toBeDefined();
        expect(response.body.data).toBeDefined();
        expect(response.body.data.status).toBe('authenticated');
        expect(response.body.data.timestamp).toBeDefined();
        expect(response.body.data.vendorToken).toBeDefined();
        expect(response.body.data.vendorToken.access_token).toBe('access-token:abc');
        expect(response.body.data.vendorToken.expires_in).toBe(10000);
        expect(response.body.data.vendorToken.expires_at).toBeDefined();
        expect(response.body.data.vendorUserId).toBe('789');
        expect(response.body.data.vendorUserProfile).toBeDefined();
    });

    test('The /user/:vendorUserId/token endpoint returns access token', async () => {
        const { VendorOAuthConnector } = require('../lib/manager/template/VendorOAuthConnector');
        class TestOAuthConnector extends VendorOAuthConnector {
            async getAuthorizationPageHtml(fusebitContext, authorizationUrl) {
                return undefined;
            }
            async getAccessToken(fusebitContext, authorizationCode, redirectUri) {
                return {
                    access_token: `access-token:${authorizationCode}`,
                    expires_in: 10000,
                };
            }
            async getUserProfile(tokenContext) {
                return { id: '789' };
            }
        }
        const oAuthConnector = new TestOAuthConnector();
        const handler = connector.createOAuthConnector(new TestOAuthConnector());
        let ctx = configureCtx;
        // Initiate the authorization transaction only to extract the 'state' parameter to pass to /callback later
        let response = await handler(ctx);
        expect(response.status).toBe(302);
        expect(response.headers).toBeDefined();
        expect(typeof response.headers.location).toBe('string');
        let url = Url.parse(response.headers.location, true);
        expect(url.query.state).toBeDefined();
        ctx = callbackCtx(url.query.state);
        response = await handler(ctx);
        expect(response.status).toBe(302);
        // Get the current access token for the logged in user
        ctx = getTokenCtx;
        response = await handler(ctx);
        expect(response.status).toBe(200);
        expect(typeof response.body).toBe('string');
        const body = JSON.parse(response.body);
        expect(body.access_token).toBe('access-token:abc');
        expect(body.expires_in).toBe(10000);
        expect(body.expires_at).toBeDefined();
    });

    test('The GET /user/:vendorUserId endpoint returns user data', async () => {
        const { VendorOAuthConnector } = require('../lib/manager/template/VendorOAuthConnector');
        class TestOAuthConnector extends VendorOAuthConnector {
            async getAuthorizationPageHtml(fusebitContext, authorizationUrl) {
                return undefined;
            }
            async getAccessToken(fusebitContext, authorizationCode, redirectUri) {
                return {
                    access_token: `access-token:${authorizationCode}`,
                    expires_in: 10000,
                };
            }
            async getUserProfile(tokenContext) {
                return { id: '789' };
            }
        }
        const oAuthConnector = new TestOAuthConnector();
        const handler = connector.createOAuthConnector(new TestOAuthConnector());
        let ctx = configureCtx;
        // Initiate the authorization transaction only to extract the 'state' parameter to pass to /callback later
        let response = await handler(ctx);
        expect(response.status).toBe(302);
        expect(response.headers).toBeDefined();
        expect(typeof response.headers.location).toBe('string');
        let url = Url.parse(response.headers.location, true);
        expect(url.query.state).toBeDefined();
        ctx = callbackCtx(url.query.state);
        response = await handler(ctx);
        expect(response.status).toBe(302);
        // Get the user
        ctx = getUserCtx;
        response = await handler(ctx);
        expect(response.status).toBe(200);
        expect(typeof response.body).toBe('string');
        const body = JSON.parse(response.body);
        expect(body.status).toBe('authenticated');
        expect(body.vendorUserId).toBe('789');
        expect(body.vendorUserProfile).toMatchObject({ id: '789' });
        expect(body.timestamp).toBeDefined();
        expect(body.vendorToken).toBeDefined();
        expect(body.vendorToken.access_token).toBe('access-token:abc');
        expect(body.vendorToken.expires_in).toBe(10000);
        expect(body.vendorToken.expires_at).toBeDefined();
    });

    test('The DELETE /user/:vendorUserId endpoint deletes the user', async () => {
        const { VendorOAuthConnector } = require('../lib/manager/template/VendorOAuthConnector');
        class TestOAuthConnector extends VendorOAuthConnector {
            async getAuthorizationPageHtml(fusebitContext, authorizationUrl) {
                return undefined;
            }
            async getAccessToken(fusebitContext, authorizationCode, redirectUri) {
                return {
                    access_token: `access-token:${authorizationCode}`,
                    expires_in: 10000,
                };
            }
            async getUserProfile(tokenContext) {
                return { id: '789' };
            }
        }
        const oAuthConnector = new TestOAuthConnector();
        const handler = connector.createOAuthConnector(new TestOAuthConnector());
        let ctx = configureCtx;
        // Initiate the authorization transaction only to extract the 'state' parameter to pass to /callback later
        let response = await handler(ctx);
        expect(response.status).toBe(302);
        expect(response.headers).toBeDefined();
        expect(typeof response.headers.location).toBe('string');
        let url = Url.parse(response.headers.location, true);
        expect(url.query.state).toBeDefined();
        ctx = callbackCtx(url.query.state);
        response = await handler(ctx);
        expect(response.status).toBe(302);
        // Delete the user
        ctx = deleteUserCtx;
        response = await handler(ctx);
        expect(response.status).toBe(204);
        // Validate storage content for the deleted user is deleted
        response = await getStorage(testBoundaryId, testFunctionId1, oAuthConnector._getStorageIdForVendorUser('789'));
        expect(response.status).toBe(404);
        // Validate the GET user returns 404
        ctx = getUserCtx;
        response = await handler(ctx);
        expect(response.status).toBe(404);
    });
});
