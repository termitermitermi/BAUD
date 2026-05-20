interface DyschanCryptoModule {
  sha256HexUtf8(input: string): string;
  hiddenTrip(userSecret: string, boardId: string): string;
  hashToStyleSeed(hiddenTripHex: string, threadId: string): string;
  privateBoardId(sharedPhrase: string): string;
  bodyHash(body: string): string;
  threadId(timestamp: number, bodyHashHex: string): string;
  postId(timestamp: number, bodyHashHex: string, nonce: string): string;
}

let dyschanCryptoModulePromise: Promise<DyschanCryptoModule> | null = null;

function loadDyschanCrypto(): Promise<DyschanCryptoModule> {
  dyschanCryptoModulePromise ??= import('../wasm/dyschanCrypto.js') as Promise<DyschanCryptoModule>;
  return dyschanCryptoModulePromise;
}

async function sha256hex(input: string): Promise<string> {
  const { sha256HexUtf8 } = await loadDyschanCrypto();
  return sha256HexUtf8(input);
}

async function hiddenTrip(userSecret: string, boardId: string): Promise<string> {
  const cryptoModule = await loadDyschanCrypto();
  return cryptoModule.hiddenTrip(userSecret, boardId);
}

async function styleSeed(trip: string, threadId: string): Promise<string> {
  const cryptoModule = await loadDyschanCrypto();
  return cryptoModule.hashToStyleSeed(trip, threadId);
}

async function privateBoardId(phrase: string): Promise<string> {
  const cryptoModule = await loadDyschanCrypto();
  return cryptoModule.privateBoardId(phrase);
}

async function bodyHash(body: string): Promise<string> {
  const cryptoModule = await loadDyschanCrypto();
  return cryptoModule.bodyHash(body);
}

async function computeThreadId(ts: number, bh: string): Promise<string> {
  const cryptoModule = await loadDyschanCrypto();
  return cryptoModule.threadId(ts, bh);
}

async function computePostId(ts: number, bh: string, nonce: string): Promise<string> {
  const cryptoModule = await loadDyschanCrypto();
  return cryptoModule.postId(ts, bh, nonce);
}
