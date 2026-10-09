import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { existsSync } from "node:fs";

let backendHost: any = null;
let bridgeInstance: any = null;
let verifiedSession: any = null;

function resolveContractsPath(relativePath: string): string {
  const candidates = [
    resolve(process.cwd(), "repo/contracts", relativePath),
    resolve(process.cwd(), "contracts", relativePath),
    resolve(process.cwd(), "../contracts", relativePath),
    resolve(process.cwd(), "../../contracts", relativePath),
    resolve("C:/Users/harsh/Downloads/GIG/repo/contracts", relativePath),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error(`Could not locate contract file for relative path: ${relativePath}`);
}

// Escapes Webpack bundling by evaluating native dynamic ESM import at runtime
const dynamicImport = new Function("url", "return import(url);");

export async function getLocalBackend() {
  if (!backendHost) {
    const processClientPath = resolveContractsPath("integration/process-client.mjs");
    const bridgePath = resolveContractsPath("integration/worker-proof-bridge.mjs");

    const { startLocalBackend } = await dynamicImport(pathToFileURL(processClientPath).href);
    const { createWorkerProofBridge } = await dynamicImport(pathToFileURL(bridgePath).href);

    backendHost = await startLocalBackend({ port: 0 });
    verifiedSession = Object.freeze({ worker: backendHost.bundle.fixture.holder });

    bridgeInstance = createWorkerProofBridge({
      authenticateWorker: async (context: any) => {
        if (context !== verifiedSession) throw new Error("Unauthenticated worker context");
        return context.worker;
      },
      client: {
        getPassport: (passportId: string) => backendHost.call("getPassport", { passportId }),
        generateProof: (request: any) => backendHost.call("generateProof", { request }),
      },
    });
  }

  return {
    host: backendHost,
    bridge: bridgeInstance,
    session: verifiedSession,
    bundle: backendHost.bundle,
  };
}
