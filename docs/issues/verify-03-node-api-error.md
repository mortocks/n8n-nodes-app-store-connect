# verify-03 — Wrap raw re-throws in NodeApiError

**Type:** AFK · **Labels:** verification, needs-triage
**Parent:** [Build issues — next tiers](README.md) → Verification hardening

Fixes `@n8n/community-nodes/require-node-api-error` (×3): raw `throw error`
re-throws must become `NodeApiError` / `NodeOperationError`.

## What to build

- **`nodes/AppStoreConnect/transport/errors.ts`** — `withAscErrorMapping` maps ASC
  `errors[]` to `NodeApiError`, but falls back to `throw error` for non-ASC
  failures (line ~28). Wrap that fallback: `throw new NodeApiError(context.getNode(), error as JsonObject)`.
- **`nodes/AppStoreConnectTrigger/AppStoreConnectTrigger.node.ts`** — `ascHookRequest`
  has the same raw re-throw fallback (line ~55). Same fix.
- **`nodes/VerifyWebhookSignature/VerifyWebhookSignature.node.ts`** — the raw
  re-throw (line ~154). Wrap in `NodeApiError`/`NodeOperationError` as appropriate.
- Preserve the existing behaviour: recognised ASC `errors[]` still map to the
  readable message; only the *raw* fallback re-throw changes to a wrapped error.

## Acceptance criteria

- [ ] All three raw re-throws wrapped in `NodeApiError`/`NodeOperationError`
- [ ] **Update the unit tests** — `errors.test.ts` asserts a non-ASC error is
      re-thrown; it must now assert a `NodeApiError` (not the raw error). Keep the
      ASC-error-mapping tests green.
- [ ] `require-node-api-error` gone from the scanner
- [ ] Plus the shared [Definition of Done](README.md#definition-of-done--applies-to-every-issue) — **new/updated mocked-response unit tests required here** (this one has real behaviour)

## Blocked by

- verify-02 (trigger/verify files) — do after it merges.
