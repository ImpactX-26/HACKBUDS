// Stand-in for the worker's embedded wallet. Privy provides the real one later.
// Each demo worker gets a real signing key kept in memory. The address comes from the public key,
// the way a real address does, so a lender can check a signature against the passport owner.
// With a real wallet the QR carries only the signature and the verifier recovers the address from it.

export interface Wallet {
  address: string;
  publicHex: string; // raw public key, hex
  sign: (message: string) => Promise<string>; // signature, hex
}

const hex = (b: ArrayBuffer | Uint8Array): string =>
  Array.from(b instanceof Uint8Array ? b : new Uint8Array(b))
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");

const unhex = (h: string) => {
  if (h.length % 2 !== 0 || /[^0-9a-f]/i.test(h)) throw new Error("bad hex");
  const out = new Uint8Array(new ArrayBuffer(h.length / 2));
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
};

async function sha256Hex(s: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
}

export const addressOfPublic = async (publicHex: string): Promise<string> =>
  "0x" + (await sha256Hex("gigvault:address:" + publicHex)).slice(0, 40);

const ALGO = { name: "ECDSA", namedCurve: "P-256" } as const;
const SIGN = { name: "ECDSA", hash: "SHA-256" } as const;

const wallets = new Map<number, Promise<Wallet>>();

async function createWallet(personaId: number): Promise<Wallet> {
  const STORAGE_KEY = `gigvault_wallet_key_${personaId}`;
  if (typeof window !== "undefined") {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const jwk = JSON.parse(saved);
        const privateKey = await crypto.subtle.importKey("jwk", jwk, ALGO, false, ["sign"]);
        const publicKey = await crypto.subtle.importKey(
          "jwk",
          { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y },
          ALGO,
          true,
          ["verify"]
        );
        const publicHex = hex(await crypto.subtle.exportKey("raw", publicKey));
        return {
          address: await addressOfPublic(publicHex),
          publicHex,
          sign: async (message) => hex(await crypto.subtle.sign(SIGN, privateKey, new TextEncoder().encode(message))),
        };
      }
    } catch {}
  }

  const pair = await crypto.subtle.generateKey(ALGO, true, ["sign", "verify"]);
  const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(jwk));
    } catch {}
  }
  const publicHex = hex(await crypto.subtle.exportKey("raw", pair.publicKey));
  return {
    address: await addressOfPublic(publicHex),
    publicHex,
    sign: async (message) => hex(await crypto.subtle.sign(SIGN, pair.privateKey, new TextEncoder().encode(message))),
  };
}

// Same worker, same wallet, across sessions and reloads.
export function getWallet(personaId: number): Promise<Wallet> {
  let w = wallets.get(personaId);
  if (!w) {
    w = createWallet(personaId);
    wallets.set(personaId, w);
  }
  return w;
}

export const mockWalletAddress = async (personaId: number): Promise<string> => (await getWallet(personaId)).address;

export async function verifySignature(publicHex: string, signatureHex: string, message: string): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey("raw", unhex(publicHex), ALGO, false, ["verify"]);
    return await crypto.subtle.verify(SIGN, key, unhex(signatureHex), new TextEncoder().encode(message));
  } catch {
    return false;
  }
}
