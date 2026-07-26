# Apple App Store Connect API — implementation notes

Research findings gathered 2026-07-22 to resolve the PRD's two open items and
pin down the ASC webhook API shape. Apple's own doc pages are JS-rendered and
could not be fetched directly; the facts below are corroborated across multiple
community sources (WWDC25 coverage, the `appstore-webhook-proxy` project, and
several integration guides). **Anything marked ⚠️ NEEDS LIVE CONFIRMATION must
be verified against a real ASC account during HITL verification.**

## Authentication — ES256 JWT (module A `ascToken`)

Mint a short-lived ES256 JWT per the ASC API rules.

- **Algorithm:** `ES256`. JWT header: `{ "alg": "ES256", "kid": <Key ID>, "typ": "JWT" }`.
- **Audience:** claim `aud` = `"appstoreconnect-v1"` (both key types).
- **Expiry:** `exp` short-lived. Apple's hard maximum is 20 minutes; the PRD
  specifies ~19 min. Use `iat = now`, `exp = now + 19*60`. n8n caches the token
  and re-mints via `preAuthentication` when it expires.
- **Team keys:** include `iss` = the team Issuer ID (a UUID). Do **not** set `sub`.
- **Individual keys** (PRD open item #2, resolved): **omit `iss`**, and set
  `sub` = `"user"`. Everything else (header, `aud`, `exp`) is identical.
- The `.p8` file is an EC P-256 private key in PKCS#8 PEM. Sign with it.

Sources: fastlane ASC API docs; Apple Developer forums thread 770227
("JWT Fails with Individual Key"); multiple JWT-generation guides.

## Webhook signature verification (module B `verifyWebhookSignature`) — PRD open item #1, resolved

- **Header name:** `x-apple-signature` (lowercase).
- **Header format:** `hmacsha256=<hex>` — the literal prefix `hmacsha256=`
  followed by the lowercase hex digest. Example:
  `x-apple-signature: hmacsha256=cf50020f0bbd3c5274860594f616f1806965c1f9fb765d8d278f512dff5b4c0e`
- **Algorithm:** HMAC-SHA256 over the **raw request body bytes** (not re-serialized
  JSON), keyed by the webhook Secret, output as a lowercase hex string.
- **Comparison:** must be timing-safe (`crypto.timingSafeEqual`), and must guard
  against length-mismatch throwing (compare only when buffer lengths match, else
  fail closed).
- The helper should tolerate the header arriving with or without the
  `hmacsha256=` prefix (strip it if present) and be case-insensitive on the hex.

Sources: ZhgChgLi ASC webhook guide (documents the `x-apple-signature:
hmacsha256=<hex>` header verbatim); `appstore-webhook-proxy` (HMAC-SHA256).

## Webhook event types (module C `eventTypes`)

⚠️ The SAME events have **two spellings** — this bit us twice:

- **Subscription** — the `eventTypes` array sent on Create/Update (and by the
  Trigger's registration): **SCREAMING_SNAKE_CASE**. ✅ CONFIRMED live via
  `POST /v1/webhooks` (an invalid value returns a 409 enumerating the valid set).
  `KNOWN_EVENT_TYPES` holds these — sending camelCase here returns
  `409 ENTITY_ERROR.ATTRIBUTE.TYPE`.
- **Delivery** — the webhook payload's `data.type`: **camelCase** (see below).

The two forms only matter when *subscribing* (SNAKE) vs *reading a delivery*
(camelCase); the Trigger emits deliveries as-is and does not match them against
the subscription list.

| Subscription (`eventTypes`) | Delivery (`data.type`) |
|---|---|
| `APP_STORE_VERSION_APP_VERSION_STATE_UPDATED` | `appStoreVersionAppVersionStateUpdated` |
| `BUILD_UPLOAD_STATE_UPDATED` | `buildUploadStateUpdated` |
| `BUILD_BETA_DETAIL_EXTERNAL_BUILD_STATE_UPDATED` | `buildBetaDetailExternalBuildStateUpdated` |
| `BETA_FEEDBACK_CRASH_SUBMISSION_CREATED` | `betaFeedbackCrashSubmissionCreated` |
| `BETA_FEEDBACK_SCREENSHOT_SUBMISSION_CREATED` | `betaFeedbackScreenshotSubmissionCreated` |
| `BACKGROUND_ASSET_VERSION_STATE_UPDATED` | `backgroundAssetVersionStateUpdated` |
| `BACKGROUND_ASSET_VERSION_INTERNAL_BETA_RELEASE_CREATED` | `backgroundAssetVersionInternalBetaReleaseCreated` |
| `BACKGROUND_ASSET_VERSION_EXTERNAL_BETA_RELEASE_STATE_UPDATED` | `backgroundAssetVersionExternalBetaReleaseStateUpdated` |
| `BACKGROUND_ASSET_VERSION_APP_STORE_RELEASE_STATE_UPDATED` | `backgroundAssetVersionAppStoreReleaseStateUpdated` |
| `ALTERNATIVE_DISTRIBUTION_PACKAGE_VERSION_CREATED` | `alternativeDistributionPackageVersionCreated` |
| `ALTERNATIVE_DISTRIBUTION_PACKAGE_AVAILABLE_UPDATED` | `alternativeDistributionPackageAvailableUpdated` |
| `ALTERNATIVE_DISTRIBUTION_TERRITORY_AVAILABILITY_UPDATED` | `alternativeDistributionTerritoryAvailabilityUpdated` |

There is **no** ping event type: a test ping (`POST /v1/webhookPings`) is
delivered as an ordinary event with `attributes.ping: true`. The **raw
event-type override** field still lets users subscribe to anything Apple adds
later without a node update. Module C merges selected + raw overrides, dedupes.

## Webhook delivery payload (Trigger / module B)

✅ CONFIRMED (developer.apple.com → configuring-webhook-notifications). Each
delivery is a JSON:API-style resource — **the event type is `data.type`** (not an
attribute), the delivery id is `data.id`:

```json
{
  "data": {
    "type": "appStoreVersionAppVersionStateUpdated",
    "id": "7c813492-9516-4c79-903e-224effdd57ac",
    "version": 1,
    "attributes": { "oldValue": "PREPARE_FOR_SUBMISSION", "newValue": "READY_FOR_REVIEW",
                    "timestamp": "2025-04-16T05:00:52.745Z", "ping": false },
    "relationships": { "instance": { "data": { "type": "appStoreVersions", "id": "..." } } }
  }
}
```

- Event type → `data.type`; delivery id → `data.id`; `attributes.ping` marks test pings.
- The affected app is usually **not** in the payload — it is reachable only via
  `relationships.instance` (an appStoreVersions/builds/etc. id). An explicit
  `attributes.appId` appears on some events (alternative-distribution family).
- **Signature:** header `x-apple-signature: hmacsha256=<lowercase-hex>`, value =
  `HMAC-SHA256(rawBody, secret)`. ✅ CONFIRMED (documented example: secret
  `"This is my secret"` + body `"Hello, World!"` →
  `7f062172b01cb00b53ca068614674a3d982a34062a0f5d37687d5e3377e54657`).

## Webhook REST endpoints (declarative routing + transport)

Base URL: `https://api.appstoreconnect.apple.com`

JSON:API resource type for webhooks: `webhooks` (⚠️ NEEDS LIVE CONFIRMATION — a
minority of sources reference `webhookConfigurations`; verify against the live
API and adjust the routing constant if wrong).

- **Create:** `POST /v1/webhooks`
  ```json
  {
    "data": {
      "type": "webhooks",
      "attributes": {
        "name": "My hook",
        "url": "https://example.com/webhook",
        "secret": "shared-secret",
        "enabled": true,
        "eventTypes": ["buildUploadStateUpdated", "..."]
      },
      "relationships": {
        "app": { "data": { "type": "apps", "id": "<appId>" } }
      }
    }
  }
  ```
  → `201 Created` with the created `webhooks` resource.
- **Get one:** `GET /v1/webhooks/{id}` (GET_INSTANCE).
- **Get many:** ⚠️ the top-level `GET /v1/webhooks` collection is **forbidden**
  (403 `FORBIDDEN_ERROR` — "The resource 'webhooks' does not allow
  'GET_COLLECTION'. Allowed operations are: CREATE, DELETE, GET_INSTANCE,
  UPDATE"). Webhooks are listable only **scoped to their app**:
  `GET /v1/apps/{appId}/webhooks` — cursor pagination via `links.next`; page
  size via `limit`. Both the action node's Get Many and the Trigger's
  reconcile/delete lookup use this app-scoped endpoint. ✅ CONFIRMED.
- **Update:** `PATCH /v1/webhooks/{id}` — same `data.type: "webhooks"`, `id`
  required, attributes to change (name, url, secret, enabled, eventTypes).
- **Delete:** `DELETE /v1/webhooks/{id}` → `204 No Content`.
- **Send test ping:** `POST /v1/webhookPings` with
  `{ "data": { "type": "webhookPings", "relationships": { "webhook": { "data":
  { "type": "webhooks", "id": "<id>" } } } } }`. ✅ CONFIRMED (configuring-webhook-notifications).
- **List deliveries:** `GET /v1/webhooks/{id}/deliveries` (resource type
  `webhookDeliveries`), cursor-paginated. ⚠️ NEEDS LIVE CONFIRMATION.
- **Apps (for the picker):** `GET /v1/apps` — attributes include `name` and
  `bundleId`; cursor-paginated. Use for `listSearch`/`loadOptions`.

## Error shape (module D `ascErrorMapper`)

ASC returns JSON:API errors:
```json
{ "errors": [ { "status": "409", "code": "ENTITY_ERROR", "title": "...",
  "detail": "human-readable message", "source": { "pointer": "/data/attributes/url" } } ] }
```
Map to a `NodeApiError` whose message concatenates each error's `title`/`detail`
(and `source.pointer` when present), so users see the actionable message rather
than a bare HTTP status.

## Credential test endpoint

Use a harmless authenticated GET, e.g. `GET /v1/apps?limit=1`, to validate the
credential (a 200 proves the JWT is accepted).
