"use strict";
let dyschanPowModulePromise = null;
function loadDyschanPow() {
    dyschanPowModulePromise ??= import('../wasm/dyschanCrypto.js');
    return dyschanPowModulePromise;
}
async function solvePow({ timestamp, threadId, boardId, bodyHash, salt, difficulty }) {
    const cryptoModule = await loadDyschanPow();
    let nonce = 0;
    while (true) {
        const payload = cryptoModule.powPayload(timestamp, threadId, boardId, bodyHash, salt, String(nonce));
        const hash = cryptoModule.computePowHash(payload);
        if (cryptoModule.leadingZeroBits(hash) >= difficulty) {
            return { nonce: String(nonce), salt, difficulty, hash };
        }
        nonce++;
        if (nonce % 1000 === 0) {
            await new Promise(resolve => setTimeout(resolve, 0));
        }
    }
}
//# sourceMappingURL=pow.js.map