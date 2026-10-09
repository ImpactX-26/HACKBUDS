# Focused dashboard demo correction

Apply against frontend checkpoint `d4f3cd988523944fc0ed50eee93de350647349ef`.
Preserve newer owner changes if the patch check conflicts.

From repository root after fetching this B checkpoint:

```powershell
git apply --check contracts/integration/frontend-dashboard-demo-fix.patch
git apply contracts/integration/frontend-dashboard-demo-fix.patch
cd frontend
npm run typecheck
```

The patch preserves the owner's designed card and workflow. It shows the exact
signed criteria before approval, gates Claim/Borrow on verified enabled PASS
conditions and current business state, and removes the unconditional ZK-verified
stamp. The connected holder uses the seeded worker label, score is explicitly
illustrative, and the displayed evidence version/issuance time comes from chain.
While the chain starts, the existing onboarding fixture can remain visible with
an explicit UI-preview label; real transaction controls await the actual session.

Preview: `http://localhost:3200/passport`. This is an isolated review copy of the
frontend owner's UI. Live A HTTP is not connected. Do not claim simulated
onboarding is a real mint or that the illustrative score came from private chain
data. Original authentication and contract checks remain intact.

Validation: frontend TypeScript check passed; unchanged local wallet auth suite
passed 5/5. The earlier authenticated `/live` proof and transaction report remains
available. No new successful browser transaction run is claimed for this patch.

Separate same-session A HTTP edits remain uncommitted and unverified after the
user prioritized the UI. They must not be enabled for the deadline demo.
