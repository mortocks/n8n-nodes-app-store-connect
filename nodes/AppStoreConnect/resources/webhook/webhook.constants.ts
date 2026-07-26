/**
 * JSON:API resource type for webhooks — the single source of truth used in
 * `data.type` on Create/Update request bodies (`webhook.body.ts`) and, from
 * Task 04 onward, in `relationships.webhook.data.type` for Send Test Ping /
 * List Deliveries.
 *
 * ⚠️ NEEDS LIVE CONFIRMATION (see `docs/apple-api-notes.md` → "Webhook REST
 * endpoints"): a minority of sources use `webhookConfigurations` instead. If
 * the live API rejects `webhooks`, this is the only line that needs to change.
 */
export const WEBHOOK_RESOURCE_TYPE = 'webhooks';

/**
 * JSON:API resource type for the "send test ping" action, used as `data.type`
 * on the `POST /v1/webhookPings` request body built in
 * `attachWebhookPingRequestBody` (`webhook.body.ts`).
 *
 * ⚠️ NEEDS LIVE CONFIRMATION (see `docs/apple-api-notes.md` → "Webhook REST
 * endpoints"). If the live API rejects `webhookPings`, this is the only line
 * that needs to change.
 */
export const WEBHOOK_PING_RESOURCE_TYPE = 'webhookPings';
