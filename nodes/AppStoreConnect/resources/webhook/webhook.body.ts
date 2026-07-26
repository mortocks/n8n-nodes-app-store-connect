import type { IDataObject, IExecuteSingleFunctions, IHttpRequestOptions } from 'n8n-workflow';

import { mergeEventTypes } from '../../../../utils/eventTypes';
import { APP_RESOURCE_TYPE } from '../../methods/apps';
import { WEBHOOK_PING_RESOURCE_TYPE, WEBHOOK_RESOURCE_TYPE } from './webhook.constants';

/**
 * `preSend` hook shared by Create and Update: reads the common webhook fields
 * (name, payload URL, secret, enabled, target app, event triggers) and builds
 * the JSON:API request body from `docs/apple-api-notes.md` → "Webhook REST
 * endpoints". Update additionally includes `data.id` (the webhook being
 * patched), read from the `webhookId` parameter.
 *
 * ASC treats the secret as write-only — it's never returned on Get — so on
 * Update the Secret field is optional: a blank value means "leave the
 * existing secret unchanged" and the `secret` attribute is omitted from the
 * PATCH body entirely (never sent as an empty string). On Create the secret
 * is always required and always sent.
 *
 * The event-type multi-select and the raw-override free-text field are merged
 * by deep module C (`mergeEventTypes`) before being sent — this is the only
 * place that call happens, keeping the merge logic itself pure and
 * independently unit-tested.
 *
 * Framework wiring: validated manually in a live n8n instance, not
 * unit-tested (per the PRD's testing decisions) — module C carries the
 * behavior-asserting tests.
 */
export async function attachWebhookRequestBody(
	this: IExecuteSingleFunctions,
	requestOptions: IHttpRequestOptions,
): Promise<IHttpRequestOptions> {
	const operation = this.getNodeParameter('operation') as string;
	const name = this.getNodeParameter('name') as string;
	const url = this.getNodeParameter('url') as string;
	const secret = this.getNodeParameter('secret') as string;
	const enabled = this.getNodeParameter('enabled') as boolean;
	const selectedEventTypes = this.getNodeParameter('eventTypes', []) as string[];
	const rawEventTypeOverride = this.getNodeParameter('eventTypesRawOverride', '') as string;
	const targetAppId = this.getNodeParameter('targetApp', undefined, {
		extractValue: true,
	}) as string;

	const eventTypes = mergeEventTypes(selectedEventTypes, rawEventTypeOverride);

	const attributes: IDataObject = {
		name,
		url,
		enabled,
		eventTypes,
	};

	// On Update, a blank Secret means "keep the current secret" — ASC never
	// returns it on Get, so omit the attribute rather than send an empty
	// string (which would blank/rotate it). Create always sends it.
	if (operation !== 'update' || secret !== '') {
		attributes.secret = secret;
	}

	const data: IDataObject = {
		type: WEBHOOK_RESOURCE_TYPE,
		attributes,
		relationships: {
			app: {
				data: { type: APP_RESOURCE_TYPE, id: targetAppId },
			},
		},
	};

	if (operation === 'update') {
		data.id = this.getNodeParameter('webhookId') as string;
	}

	requestOptions.body = { data };
	return requestOptions;
}

/**
 * `preSend` hook for Send Test Ping: builds the `POST /v1/webhookPings` body
 * from `docs/apple-api-notes.md` → "Webhook REST endpoints" — a
 * `webhookPings` resource whose only content is a relationship pointing at
 * the webhook to ping, read from the `webhookId` parameter.
 *
 * Framework wiring: validated manually in a live n8n instance, not
 * unit-tested (per the PRD's testing decisions).
 */
export async function attachWebhookPingRequestBody(
	this: IExecuteSingleFunctions,
	requestOptions: IHttpRequestOptions,
): Promise<IHttpRequestOptions> {
	const webhookId = this.getNodeParameter('webhookId') as string;

	requestOptions.body = {
		data: {
			type: WEBHOOK_PING_RESOURCE_TYPE,
			relationships: {
				webhook: {
					data: { type: WEBHOOK_RESOURCE_TYPE, id: webhookId },
				},
			},
		},
	};
	return requestOptions;
}
