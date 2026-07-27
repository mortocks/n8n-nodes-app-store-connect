# verify-04 — Webhook credential compliance

**Type:** AFK · **Labels:** verification, needs-triage
**Parent:** [Build issues — next tiers](README.md) → Verification hardening

Fixes the scanner errors on `credentials/AppStoreConnectWebhook.credentials.ts`:
`credential-test-required`, `cred-class-field-icon-missing` / `icon-validation`,
and the `-Api` suffix rules (`cred-class-name-unsuffixed`,
`cred-class-field-name-unsuffixed`, `cred-class-field-display-name-missing-api`),
plus `node-class-description-credentials-name-unsuffixed` on the Trigger.

## What to build

The webhook credential holds only the shared signing **Secret** (no API
endpoint), which is why it currently trips these rules. Make it conform:

- **Naming (`-Api` suffix):** the scanner mandates the suffix. Rename to satisfy
  it — class `AppStoreConnectWebhookApi`, `name: 'appStoreConnectWebhookApi'`,
  `displayName: 'App Store Connect Webhook API'`. **Update every reference** (the
  Trigger + Verify nodes' `credentials` arrays and `getCredentials(...)` calls,
  and the node `.node.ts` displayOptions). Remove the existing eslint-disable
  comments for these rules.
- **Icon:** add an `icon` property to the credential (reuse the SVG from verify-01).
- **`credential-test-required`:** a bare secret has no endpoint to test. Satisfy
  the rule the cleanest way the linter accepts — investigate whether a `test`
  block or being referenced via a node's `testedBy` is expected, and implement the
  minimal conforming approach. Document the choice in a code comment.
- ⚠️ Renaming the credential `name` is a breaking change for anyone who saved the
  old credential — acceptable at this early version (0.1.x), but note it in the
  PR / CHANGELOG.

## Acceptance criteria

- [ ] Webhook credential: `-Api`-suffixed class/name/displayName, an `icon`, and a
      passing credential-test (or `testedBy`); all references updated
- [ ] No webhook-credential errors remain in the scanner output
- [ ] Existing trigger/verify unit tests updated for the new credential name and pass
- [ ] Plus the shared [Definition of Done](README.md#definition-of-done--applies-to-every-issue)

## Blocked by

- verify-01 (icon) and verify-03 (verify/trigger files) — do after they merge.
