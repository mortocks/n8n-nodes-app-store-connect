# verify-05 — Author email, usableAsTool, title-case

**Type:** AFK · **Labels:** verification, needs-triage
**Parent:** [Build issues — next tiers](README.md) → Verification hardening

The remaining small scanner errors: `valid-author`, `node-usable-as-tool`, and
`node-param-display-name-miscased` (×2).

## What to build

- **`package.json` author email** (`valid-author`): add a non-empty email to the
  `author` object. Use the maintainer's GitHub noreply:
  `314196+mortocks@users.noreply.github.com` (keep the existing `name`/`url`).
- **`usableAsTool` on the Trigger** (`node-usable-as-tool`,
  `AppStoreConnectTrigger.node.ts`): add the `usableAsTool` property to the node
  description. The rule says "when in doubt set it to true" — set it
  appropriately for a trigger (add the property so the rule is satisfied).
- **Title case** (`node-param-display-name-miscased`): the Beta Tester operation
  `Remove from Group` must be `Remove From Group`. Update:
  - `resources/betaTester/betaTester.resource.ts` (operation `name`) — and remove
    the `// eslint-disable-next-line n8n-nodes-base/node-param-display-name-miscased`
    comment we added.
  - the tests that assert the old string (`betaTester.test.ts`,
    `methods/betaGroups.test.ts` line ~116).

## Acceptance criteria

- [ ] `package.json` author has a valid email; `usableAsTool` present on the Trigger; operation is `Remove From Group`
- [ ] `valid-author`, `node-usable-as-tool`, `node-param-display-name-miscased` gone from the scanner
- [ ] Tests updated + green; conformance green
- [ ] Plus the shared [Definition of Done](README.md#definition-of-done--applies-to-every-issue)

## Blocked by

- verify-04 (trigger file) — do after it merges. This is the last verification slice.
