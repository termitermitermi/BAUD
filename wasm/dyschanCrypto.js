import initWasm, {
  sha256 as wasmSha256,
  validate_pow as wasmValidatePow,
  hash_to_style_seed as wasmHashToStyleSeed,
} from './pkg/dyschan_crypto.js';

const textEncoder = new TextEncoder();
const wasmInput = new URL('./pkg/dyschan_crypto_bg.wasm', import.meta.url);
let wasmReady = false;
try {
  await initWasm({ module_or_path: wasmInput });
  wasmReady = true;
} catch (_) {
  wasmReady = false;
}

function utf8Bytes(input) {
  return textEncoder.encode(input);
}

function bytesToHex(bytes) {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

function sha256HexFallback(input) {
  function rightRotate(value, amount) {
    return (value >>> amount) | (value << (32 - amount));
  }

  let ascii = unescape(encodeURIComponent(input));
  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  const words = [];
  const k = [];
  let result = '';
  let asciiBitLength = ascii.length * 8;
  let hash = [];
  let primeCounter = 0;
  const isComposite = {};

  for (let candidate = 2; primeCounter < 64; candidate += 1) {
    if (!isComposite[candidate]) {
      for (let i = 0; i < 313; i += candidate) {
        isComposite[i] = true;
      }
      hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
      k[primeCounter] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
      primeCounter += 1;
    }
  }

  ascii += '\x80';
  while (ascii.length % 64 - 56) ascii += '\x00';
  for (let i = 0; i < ascii.length; i += 1) {
    const j = ascii.charCodeAt(i);
    words[i >> 2] |= j << ((3 - i) % 4) * 8;
  }
  words[words.length] = ((asciiBitLength / maxWord) | 0);
  words[words.length] = (asciiBitLength);

  for (let j = 0; j < words.length;) {
    const w = words.slice(j, j += 16);
    const oldHash = hash.slice(0);
    hash = hash.slice(0, 8);

    for (let i = 0; i < 64; i += 1) {
      const w15 = w[i - 15];
      const w2 = w[i - 2];
      const a = hash[0];
      const e = hash[4];
      const temp1 = hash[7]
        + (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25))
        + ((e & hash[5]) ^ (~e & hash[6]))
        + k[i]
        + (w[i] = (i < 16)
          ? w[i]
          : (
            w[i - 16]
            + (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3))
            + w[i - 7]
            + (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))
          ) | 0
        );
      const temp2 = (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22))
        + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));

      hash = [(temp1 + temp2) | 0].concat(hash);
      hash[4] = (hash[4] + temp1) | 0;
      hash.pop();
    }

    for (let i = 0; i < 8; i += 1) {
      hash[i] = (hash[i] + oldHash[i]) | 0;
    }
  }

  for (let i = 0; i < 8; i += 1) {
    for (let j = 3; j + 1; j -= 1) {
      const b = (hash[i] >> (j * 8)) & 255;
      result += ((b < 16) ? 0 : '') + b.toString(16);
    }
  }
  return result;
}

export function sha256Bytes(bytes) {
  if (!wasmReady) {
    const hex = sha256HexFallback(new TextDecoder().decode(bytes));
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i += 1) {
      out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
    return out;
  }
  return wasmSha256(bytes);
}

export function sha256HexUtf8(input) {
  return bytesToHex(sha256Bytes(utf8Bytes(input)));
}

export function hiddenTrip(userSecret, boardId) {
  return sha256HexUtf8(userSecret + boardId);
}

export function hashToStyleSeed(hiddenTripHex, threadId) {
  if (!wasmReady) {
    return sha256HexUtf8(hiddenTripHex + threadId);
  }
  return wasmHashToStyleSeed(hiddenTripHex, threadId);
}

export function privateBoardId(sharedPhrase) {
  return sha256HexUtf8('board:' + sharedPhrase);
}

export function bodyHash(body) {
  return sha256HexUtf8(body);
}

export function threadId(timestamp, bodyHashHex) {
  return sha256HexUtf8('thread:' + timestamp + bodyHashHex);
}

export function postId(timestamp, bodyHashHex, nonce) {
  return sha256HexUtf8('post:' + timestamp + bodyHashHex + nonce);
}

export function powPayload(timestamp, threadIdValue, boardId, bodyHashHex, salt, nonce) {
  return `${timestamp}${threadIdValue}${boardId}${bodyHashHex}${salt}${nonce}`;
}

export function computePowHash(payload) {
  return sha256HexUtf8(payload);
}

export function leadingZeroBits(hexHash) {
  let bits = 0;
  for (const c of hexHash) {
    const n = parseInt(c, 16);
    if (n === 0) {
      bits += 4;
      continue;
    }
    bits += Math.clz32(n) - 28;
    break;
  }
  return bits;
}

export function validatePowPayload(payload, difficulty) {
  if (!wasmReady) {
    return leadingZeroBits(computePowHash(payload)) >= difficulty;
  }
  return wasmValidatePow(utf8Bytes(payload), difficulty);
}
