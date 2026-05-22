"use strict";
(function configureClient(global) {
    const win = global;
    const runtimeConfig = win.DYSCHAN_CLIENT_CONFIG ?? {};
    const defaultOrigin = global.location?.origin ?? 'http://localhost';
    const doc = global.document;
    const metaApiBaseUrl = doc
        ?.querySelector('meta[name="dyschan-api-base-url"]')
        ?.getAttribute('content')
        ?.trim();
    const resolvedApiBaseUrl = new URL(runtimeConfig['API_BASE_URL'] ?? metaApiBaseUrl ?? `${defaultOrigin}/api`, defaultOrigin).href.replace(/\/+$/, '');
    const makeEndpoint = (path) => new URL(path, `${resolvedApiBaseUrl}/`).href;
    const endpoints = {
        API_BASE_URL: resolvedApiBaseUrl,
        JOIN_ENDPOINT: makeEndpoint('join'),
        THREAD_ENDPOINT: makeEndpoint('thread'),
        POST_ENDPOINT: makeEndpoint('post'),
        BOARD_ENDPOINT: makeEndpoint('board'),
        GET_THREAD_ENDPOINT: makeEndpoint('get-thread'),
    };
    win.DYSCHAN_CLIENT_CONFIG = { ...runtimeConfig, ...endpoints };
})(globalThis);
//# sourceMappingURL=clientConfig.js.map