# Fusebit Connector for OAuth

This is the Fusebit OAuth Connector, a simple way to to implement a multi-tenant integration between your application and a third-party API authenticated with OAuth, on top of the [Fusebit](https://fusebit.io) platform.

## Getting started

Assuming you are a subscriber of [Fusebit](https://fusebit.io), you would start by using the `fuse` CLI to deploy a Fusebit OAuth Connector Manager to your subscription:

```
git clone git@github.com:fusebit/oauth-connector.git
cd oauth-connector
fuse function deploy --boundary managers contoso-oauth-manager -d ./fusebit
```

Soon enough you will be writing code of your integration logic. Get in touch at [Fusebit](https://fusebit.io) for further instructions or to learn more.

## Organization

-   `lib/connector` contains the core Fusebit OAuth Connector logic that manages authentication to an API protected with OAuth access tokens in a multi-tenant system.
-   `lib/manager` contains the Fusebit OAuth Connector Manager logic which supports the install/uninstall/configure operations for the connector.
-   `lib/manager/template` contains a template of a Fusebit Function that exposes the Fusebit OAuth Connector interface. As a developer, you will be spending most of your time focusing on adding your integration logic to [VendorOAuthConnector.js](https://github.com/fusebit/oauth-connector/blob/main/lib/manager/template/VendorOAuthConnector.js).
-   `fusebit` contains a template of a Fusebit Function that exposes the Fusebit OAuth Connector Manager interface.

## Release notes

### v1.0.0

-   Initial implementation.
