## What & why

<!-- What does this PR change, and why? Link any issue: "Closes #123". -->

## Type of change

- [ ] New resource / operation
- [ ] Bug fix
- [ ] Refactor / internal
- [ ] Docs / CI / tooling

## Checklist

- [ ] `npm run lint` passes
- [ ] `npm run build` passes (this is also the type-check)
- [ ] `npm test` passes, including the node **conformance** suite
- [ ] New ASC-facing code (routing hooks, pickers, trigger lifecycle) has **unit tests that mock App Store Connect responses**
- [ ] No new dead code / duplication introduced (`npx fallow dead-code` / `dupes` — ignore the known n8n `dist/` entry-point false-positive)
- [ ] Doc-derived JSON:API type strings / filter keys are marked `⚠️` until confirmed against a live 2xx
- [ ] Verified in a local n8n instance where relevant (`npm run docker:refresh`)

## Notes for reviewers

<!-- Anything needing live-ASC (HITL) verification, follow-ups, or context. -->
