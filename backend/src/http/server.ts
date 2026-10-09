/**
 * GigVault - Local HTTP Services Server Launcher
 * 
 * Boots Mock FIP and Attestation HTTP services for local development and frontend integration.
 */

import { createUnifiedApp } from './unified-app.js';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 4000;

const app = createUnifiedApp();

app.listen(PORT, () => {
  console.log(`[GigVault Backend A] HTTP service listening on port ${PORT}`);
  console.log(`- Mock FIP endpoints:        http://localhost:${PORT}/fip/*`);
  console.log(`- Attestation endpoints:     http://localhost:${PORT}/attestation/*`);
  console.log(`- Attestation health check:  http://localhost:${PORT}/attestation/health`);
});
