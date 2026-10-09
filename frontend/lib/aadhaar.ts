// Test-mode stand-in for the Aadhaar scan. Runs only in the browser, nothing is sent anywhere.
// When Anon Aadhaar is wired in (plan D4), replace the body of scanSampleAadhaar and keep the result shape.
// The screen does not change.

export interface AadhaarResult {
  last4: string;
  nameMatches: boolean; // compared on this device, never uploaded
  nullifier: string; // same every time for the same person, tells nobody who they are
}

export interface SampleCard {
  name: string;
  aadhaarLast4: string;
}

export const normalizeName = (s: string): string => s.trim().replace(/\s+/g, " ").toLowerCase();

async function sha256(s: string): Promise<string> {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(b))
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}

export async function scanSampleAadhaar(card: SampleCard, nameOnBankRecord: string): Promise<AadhaarResult> {
  const name = normalizeName(card.name);
  return {
    last4: card.aadhaarLast4,
    nameMatches: name === normalizeName(nameOnBankRecord),
    nullifier: "0x" + (await sha256(`gigvault:nullifier:${card.aadhaarLast4}:${name}`)),
  };
}
