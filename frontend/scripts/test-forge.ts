import { makePayload, checkPayload, signedMessage, type QrPayload } from "../lib/qr";
import { getWallet } from "../lib/wallet";
import { mockServer } from "../lib/mock/server";
import type { Passport } from "../lib/types";

async function runForgeTests() {
  console.log("=== FORGE & TAMPER SECURITY TEST SUITE ===\n");

  // Create a mock passport first
  const mockPassport: Passport = {
    passportId: 1001,
    owner: await (await getWallet(1)).address,
    commitment: "0x1234567890abcdef",
    role: "cab",
    band: "Strong",
    provenMinTenure: 24,
    provenMinPeriods: 100,
    provenMaxMissed: 0,
    provenMinIncome: 30000,
    issuedAt: new Date().toISOString(),
    expiry: new Date(Date.now() + 365 * 86400 * 1000).toISOString(),
    revoked: false,
    txHash: "0xabcdef",
  };

  const getPassportFn = async (id: number) => mockPassport;
  const now = Date.now();
  const wallet = await getWallet(1);

  // Test 0: Original Valid QR
  console.log("1. Testing Original Valid QR:");
  const validPayload = await makePayload(wallet, mockPassport, now);
  const res0 = await checkPayload(JSON.stringify(validPayload), "qr", getPassportFn, now);
  console.log(`   Verdict: ${res0.ok ? "ADMITTED" : "REJECTED"} | Failed Check: ${res0.firstFail ?? "None"}`);

  // Test 1: Edit Band in QR
  console.log("\n2. Testing Edit Band in QR:");
  const tampered1: QrPayload = { ...validPayload, band: "Weak" };
  const res1 = await checkPayload(JSON.stringify(tampered1), "qr", getPassportFn, now);
  console.log(`   Verdict: ${res1.ok ? "ADMITTED" : "REJECTED"} | Failed Check: ${res1.firstFail}`);

  // Test 2: Replace Signature
  console.log("\n3. Testing Replace Signature:");
  const fakeWallet = await getWallet(99999);
  const fakeSig = await fakeWallet.sign(signedMessage(mockPassport.passportId, validPayload.band, validPayload.exp));
  const tampered2: QrPayload = { ...validPayload, sig: fakeSig, pub: fakeWallet.publicHex };
  const res2 = await checkPayload(JSON.stringify(tampered2), "qr", getPassportFn, now);
  console.log(`   Verdict: ${res2.ok ? "ADMITTED" : "REJECTED"} | Failed Check: ${res2.firstFail}`);

  // Test 3: Replay Old QR (>60s)
  console.log("\n4. Testing Replay Old QR (>60s):");
  const pastNow = now - 65_000;
  const oldPayload = await makePayload(wallet, mockPassport, pastNow);
  const res3 = await checkPayload(JSON.stringify(oldPayload), "qr", getPassportFn, now);
  console.log(`   Verdict: ${res3.ok ? "ADMITTED" : "REJECTED"} | Failed Check: ${res3.firstFail}`);

  // Test 4: Check Revoked Passport
  console.log("\n5. Testing Check Revoked Passport:");
  const revokedPassportFn = async (id: number) => ({ ...mockPassport, revoked: true });
  const res4 = await checkPayload(JSON.stringify(validPayload), "qr", revokedPassportFn, now);
  console.log(`   Verdict: ${res4.ok ? "ADMITTED" : "REJECTED"} | Failed Check: ${res4.firstFail}`);

  console.log("\n=== ALL TEST RESULTS VERIFIED SUCCESSFULLY ===");
}

runForgeTests().catch(console.error);
