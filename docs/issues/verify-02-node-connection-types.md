# verify-02 — NodeConnectionTypes (no string literals)

**Type:** AFK · **Labels:** verification, needs-triage
**Parent:** [Build issues — next tiers](README.md) → Verification hardening

Fixes `@n8n/community-nodes/node-connection-type-literal` (×5) — the scanner
rejects the string literal `'main'` in `inputs`/`outputs`.

## What to build

- In all three node classes, replace `inputs: ['main']` / `outputs: ['main']`
  (and `inputs: []` on the trigger is fine) with the typed enum from
  `n8n-workflow`. Confirm the exact export in the installed `n8n-workflow`
  (`NodeConnectionType.Main` vs `NodeConnectionTypes.Main`) and import it:
  - `AppStoreConnect.node.ts` — `inputs` + `outputs`
  - `AppStoreConnectTrigger.node.ts` — `outputs` (inputs is `[]`)
  - `VerifyWebhookSignature.node.ts` — `inputs` + `outputs`
- Example: `inputs: [NodeConnectionType.Main]`.

## Acceptance criteria

- [ ] No `'main'` string literals remain in node `inputs`/`outputs`
- [ ] `node-connection-type-literal` gone from the scanner output
- [ ] Plus the shared [Definition of Done](README.md#definition-of-done--applies-to-every-issue)

## Blocked by

- verify-01 (same node files) — do after it merges.
