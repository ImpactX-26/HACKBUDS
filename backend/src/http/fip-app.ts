/**
 * GigVault - Mock Bank / FIP HTTP Application
 * 
 * Exposes REST endpoints representing the Mock Financial Information Provider boundary:
 * - GET  /fip/accounts             - List available synthetic bank accounts
 * - POST /fip/consent              - Create a worker-authorized FIP consent record
 * - GET  /fip/consent/:consentId   - Inspect consent status and expiration
 * - POST /fip/consent/:consentId/revoke - Revoke active consent
 * - GET  /fip/data/:consentId      - Server-to-server signed financial data fetch
 * 
 * Strict architectural rule:
 * Mock FIP signs only records from its internal ledger. It NEVER accepts user-provided
 * transactions to sign as authentic financial provenance.
 */

import express, { type Request, type Response, type Express } from 'express';
import type { MockFIPStorage } from '../fip/storage.js';
import type { ConsentService } from '../fip/consent-service.js';
import type { MockFIPService } from '../fip/fip-service.js';
import { PERSONAS } from '../fip/personas/index.js';

export interface FipAppOptions {
  storage: MockFIPStorage;
  consentService: ConsentService;
  fipService: MockFIPService;
}

export function createFipApp(options: FipAppOptions): Express {
  const { storage, consentService, fipService } = options;
  const app = express();

  app.use(express.json());

  // 1. List available synthetic accounts
  app.get('/fip/accounts', (_req: Request, res: Response) => {
    const accounts = Object.values(PERSONAS).map((p) => {
      const binding = storage.getAccountBinding(p.accountId);
      return {
        accountId: p.accountId,
        ownerName: p.name,
        identityNullifierHash: p.identityNullifierHash,
        platformDescription: p.platformDescription,
        verifiedAt: binding?.verifiedAt,
      };
    });
    res.json({ success: true, accounts });
  });

  // 2. Create consent record
  app.post('/fip/consent', (req: Request, res: Response) => {
    try {
      const { accountId, durationSeconds, fromTimestamp, toTimestamp } = req.body;
      if (!accountId || typeof accountId !== 'string') {
        res.status(400).json({ error: 'Missing or invalid accountId' });
        return;
      }

      const consent = consentService.createConsent({
        accountId,
        durationSeconds: durationSeconds ? Number(durationSeconds) : undefined,
        fromTimestamp: fromTimestamp ? Number(fromTimestamp) : undefined,
        toTimestamp: toTimestamp ? Number(toTimestamp) : undefined,
      });

      res.status(201).json({ success: true, consent });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to create consent' });
    }
  });

  // 3. Inspect consent status
  app.get('/fip/consent/:consentId', (req: Request, res: Response) => {
    try {
      const consentId = String(req.params.consentId);
      const currentTs = req.query.currentTimestamp ? Number(req.query.currentTimestamp) : undefined;
      const consent = consentService.getConsent(consentId, currentTs);
      res.json({ success: true, consent });
    } catch (err: any) {
      res.status(404).json({ error: err.message || 'Consent not found' });
    }
  });

  // 4. Revoke consent
  app.post('/fip/consent/:consentId/revoke', (req: Request, res: Response) => {
    try {
      const consentId = String(req.params.consentId);
      const consent = consentService.revokeConsent(consentId);
      res.json({ success: true, consent });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to revoke consent' });
    }
  });

  // 5. Server-to-server signed transaction data fetch by consentId
  app.get('/fip/data/:consentId', (req: Request, res: Response) => {
    try {
      const consentId = String(req.params.consentId);
      const currentTs = req.query.currentTimestamp ? Number(req.query.currentTimestamp) : undefined;

      const envelope = fipService.fetchSignedDataByConsent(consentId, currentTs);
      res.json({ success: true, envelope });
    } catch (err: any) {
      const msg = err.message || 'Failed to fetch FIP data';
      if (msg.includes('expired')) {
        res.status(410).json({ error: 'FIP_CONSENT_EXPIRED', message: msg });
      } else if (msg.includes('revoked')) {
        res.status(403).json({ error: 'FIP_CONSENT_REVOKED', message: msg });
      } else if (msg.includes('not found')) {
        res.status(404).json({ error: 'FIP_CONSENT_NOT_FOUND', message: msg });
      } else {
        res.status(400).json({ error: 'FIP_DATA_FETCH_FAILED', message: msg });
      }
    }
  });

  return app;
}
