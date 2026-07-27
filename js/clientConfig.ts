export interface DyschanClientConfig {
  API_BASE_URL?: string;
  JOIN_ENDPOINT?: string;
  THREAD_ENDPOINT?: string;
  POST_ENDPOINT?: string;
  BOARD_ENDPOINT?: string;
  GET_THREAD_ENDPOINT?: string;
  [key: string]: string | undefined;
}

export function configureClient(global: typeof globalThis) {
  const win = global as typeof globalThis & { DYSCHAN_CLIENT_CONFIG?: DyschanClientConfig };
  const runtimeConfig: DyschanClientConfig = win.DYSCHAN_CLIENT_CONFIG ?? {};
  const defaultOrigin = (global as typeof globalThis & { location?: { origin: string } }).location?.origin ?? 'http://localhost';
  const doc = (global as typeof globalThis & { document?: Document }).document;
  const metaApiBaseUrl = doc
    ?.querySelector('meta[name="dyschan-api-base-url"]')
    ?.getAttribute('content')
    ?.trim();

  const resolvedApiBaseUrl = new URL(
    runtimeConfig['API_BASE_URL'] ?? metaApiBaseUrl ?? `${defaultOrigin}/api`,
    defaultOrigin
  ).href.replace(/\/+$/, '');
  const makeEndpoint = (path: string) => new URL(path, `${resolvedApiBaseUrl}/`).href;

  const endpoints: DyschanClientConfig = {
    API_BASE_URL: resolvedApiBaseUrl,
    JOIN_ENDPOINT: makeEndpoint('join'),
    THREAD_ENDPOINT: makeEndpoint('thread'),
    POST_ENDPOINT: makeEndpoint('post'),
    BOARD_ENDPOINT: makeEndpoint('board'),
    GET_THREAD_ENDPOINT: makeEndpoint('get-thread'),
  };

  win.DYSCHAN_CLIENT_CONFIG = { ...runtimeConfig, ...endpoints };
}

export function initializeClientConfig(global: typeof globalThis) {
  configureClient(global);
}

initializeClientConfig(globalThis);
