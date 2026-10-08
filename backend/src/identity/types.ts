/**
 * GigVault - Worker Identity & Wallet Authentication Types
 * 
 * Defines schemas for:
 * 1. Verified Identity Assertions (from Anon Aadhaar or clearly labeled Mock IDP)
 * 2. Worker Wallet Authorizations (EVM-signed action authorizations)
 * 
 * Note: Clearly labeled as a simulated Mock Identity Provider for the hackathon,
 * without asserting official UIDAI or production Aadhaar integration.
 */

export interface VerifiedIdentityAssertion {
  schemaVersion: 'GIGVAULT_IDENTITY_ASSERTION_V1';
  providerId: 'MOCK_IDP_UIDAI_SIMULATED';
  workerIdentityNullifier: string; // 32-byte hex hash (e.g. 0x1111...)
  workerWalletAddress: string; // 20-byte EVM address bound to this identity
  issuedAt: number; // Unix seconds
  expiresAt: number; // Unix seconds
  signature: string; // secp256k1 hex signature by Identity Provider
  idpPublicKey: string; // IDP public key PEM
}

export type WorkerActionType =
  | 'CREATE_CONSENT'
  | 'FETCH_FINANCIAL_DATA'
  | 'MINT_PASSPORT'
  | 'REFRESH_PASSPORT'
  | 'REISSUE_PASSPORT'
  | 'RECONSTRUCT_EVIDENCE';

export interface WorkerWalletAuthorization {
  action: WorkerActionType;
  workerWalletAddress: string; // EVM address of passport holder
  consentId: string; // Bound to the specific FIP consent
  expectedPassportId: number; // Bound to the expected passport sequence ID
  timestamp: number; // Unix seconds (freshness check)
  signature: string; // EVM personal_sign signature over canonical message
  chainId?: number; // e.g. 80002 for Polygon Amoy
  nonce?: string;
}

