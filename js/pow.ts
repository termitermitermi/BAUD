interface PowInput {
  timestamp: number;
  threadId: string;
  boardId: string;
  bodyHash: string;
  salt: string;
  difficulty: number;
}

interface PowResult {
  nonce: string;
  salt: string;
  difficulty: number;
  hash: string;
}

interface DyschanPowModule {
  powPayload(timestamp: number, threadIdValue: string, boardId: string, bodyHashHex: string, salt: string, nonce: string): string;
  computePowHash(payload: string): string;
  leadingZeroBits(hexHash: string): number;
}

let dyschanPowModulePromise: Promise<DyschanPowModule> | null = null;

function loadDyschanPow(): Promise<DyschanPowModule> {
  dyschanPowModulePromise ??= import('../wasm/dyschanCrypto.js') as Promise<DyschanPowModule>;
  return dyschanPowModulePromise;
}

async function solvePow({ timestamp, threadId, boardId, bodyHash, salt, difficulty }: PowInput): Promise<PowResult> {
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
      await new Promise<void>(resolve => setTimeout(resolve, 0));
    }
  }
}
