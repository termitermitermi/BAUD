"use strict";
let dyschanCryptoModulePromise = null;
function loadDyschanCrypto() {
    dyschanCryptoModulePromise ??= import('../wasm/dyschanCrypto.js');
    return dyschanCryptoModulePromise;
}
async function sha256hex(input) {
    const { sha256HexUtf8 } = await loadDyschanCrypto();
    return sha256HexUtf8(input);
}
async function hiddenTrip(userSecret, boardId) {
    const cryptoModule = await loadDyschanCrypto();
    return cryptoModule.hiddenTrip(userSecret, boardId);
}
async function styleSeed(trip, threadId) {
    const cryptoModule = await loadDyschanCrypto();
    return cryptoModule.hashToStyleSeed(trip, threadId);
}
async function privateBoardId(phrase) {
    const cryptoModule = await loadDyschanCrypto();
    return cryptoModule.privateBoardId(phrase);
}
async function bodyHash(body) {
    const cryptoModule = await loadDyschanCrypto();
    return cryptoModule.bodyHash(body);
}
async function computeThreadId(ts, bh) {
    const cryptoModule = await loadDyschanCrypto();
    return cryptoModule.threadId(ts, bh);
}
async function computePostId(ts, bh, nonce) {
    const cryptoModule = await loadDyschanCrypto();
    return cryptoModule.postId(ts, bh, nonce);
}
//# sourceMappingURL=crypto.js.map