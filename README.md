# Fusebit OAuth Connector

This is the Fusebit OAuth Connector, a simple way to to implement a multi-tenant integration between your application and a third-party API authenticated with OAuth, on top of the [Fusebit](https://fusebit.io) platform.

## Getting started

Assuming you are a subscriber of [Fusebit](https://fusebit.io), you would start by using the `fuse` CLI to deploy a Fusebit OAuth Connector Manager to your subscription:

```
git clone git@github.com:fusebit/oauth-connector.git
cd oauth-connector
fuse function deploy --boundary managers oauth-connector-manager -d ./fusebit
```

Soon enough you will be writing code of your integration logic. Get in touch at [Fusebit](https://fusebit.io) for further instructions or to learn more.

## Organization

- `lib/connector` contains the core Fusebit OAuth Connector logic that manages authentication to an API protected with OAuth access tokens in a multi-tenant system.
- `lib/manager` contains the Fusebit OAuth Connector Manager logic which supports the install/uninstall/configure operations for the connector.
- `lib/manager/template` contains a template of a Fusebit Function that exposes the Fusebit OAuth Connector interface. As a developer, you will be spending most of your time focusing on adding your integration logic to [VendorOAuthConnector.js](https://github.com/fusebit/oauth-connector/blob/main/lib/manager/template/VendorOAuthConnector.js).
- `fusebit` contains a template of a Fusebit Function that exposes the Fusebit OAuth Connector Manager interface.

## Running tests

Here are a few things you need to know before running tests:

- You must have access to a [Fusebit](https://fusebit.io) subscription.
- You must have the [Fusebit CLI](https://fusebit.io/docs/reference/fusebit-cli/) installed.
- You must have a Fusebit CLI profile configured with an account ID and subscription ID, and sufficient permissions to manage all functions and all storage on that subscription.
- The test will create and remove functions in randomly named boundary in the subscription.
- The test will create and remove storage objects in randomly named storage ID in the subscription.

To run the tests, set the `FUSE_PROFILE` environment variable to the Fusebit CLI profile name to use:

```
FUSE_PROFILE={profile-name} npm test
```

In case of a failure, you can get useful, verbose diagnostic information with:

```
debug=1 FUSE_PROFILE={profile-name} npm test
```

## Release notes

### v1.2.4

- Fix bug to refresh access tokens using HTTP POST with form encoded body payload

### v1.2.3

- Fix bug to pass redirectUri to refreshAccessToken, and add it as query parameter to the token request

### v1.2.2

- Fix another error in callback page of the /test endpoint

### v1.2.1

- Fix error in callback page of the /test endpoint

### v1.2.0

- Support for the test web page at /test

### v1.1.1

- Fix bug to delete connector's storage when the connector is deleted.

### v1.1.0

- Support for composing multiple OAuth connectors to create complex integrations involving several systems.
- Support for health check
- Update @fusebit/add-on-sdk dependency to 3.1.0, refactor creation of Express router.

### v1.0.0

- Initial implementation.
