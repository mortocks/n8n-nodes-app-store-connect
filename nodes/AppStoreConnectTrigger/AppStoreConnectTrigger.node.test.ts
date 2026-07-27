import { createHmac } from 'node:crypto';

import type { IDataObject, IHookFunctions, INode, IWebhookFunctions } from 'n8n-workflow';

import { mergeEventTypes } from '../../utils/eventTypes';
import { ASC_SIGNATURE_HEADER, ASC_SIGNATURE_PREFIX } from '../../utils/verifyWebhookSignature';
import { APP_RESOURCE_TYPE } from '../AppStoreConnect/methods/apps';
import { WEBHOOK_RESOURCE_TYPE } from '../AppStoreConnect/resources/webhook/webhook.constants';
import { AppStoreConnectTrigger } from './AppStoreConnectTrigger.node';

/**
 * Tests for the Trigger's registration lifecycle and runtime, driven by mocked
 * App Store Connect responses.
 *
 * The lifecycle hooks (`checkExists`/`create`/`delete`) are the node's only
 * *outbound* ASC calls: they list an app's webhooks (`GET
 * /v1/apps/{id}/webhooks`), create one (`POST /v1/webhooks`) and delete one
 * (`DELETE /v1/webhooks/{id}`). We mock `httpRequestWithAuthentication` to
 * return Apple-shaped bodies and assert the requests and idempotency behaviour.
 * The runtime `webhook()` verifies an *inbound* ASC delivery's signature.
 */

const FAKE_NODE = {
	id: 'trigger-node',
	name: 'ASC Trigger',
	type: 'n8n-nodes-apple-appstore.appStoreConnectTrigger',
	typeVersion: 1,
	position: [0, 0],
	parameters: {},
} as unknown as INode;

const WEBHOOK_URL = 'https://n8n.example.com/webhook/asc-abc';
const node = new AppStoreConnectTrigger();
const lifecycle = node.webhookMethods.default;

type HttpCall = { credential: string; options: { method?: string; url: string; body?: unknown } };
type HttpImpl = (call: HttpCall) => Promise<unknown>;

function makeHookCtx(opts: {
	params: Record<string, unknown>;
	webhookUrl?: string | undefined;
	staticData?: IDataObject;
	credentials?: IDataObject;
	httpImpl?: HttpImpl;
}) {
	const staticData = opts.staticData ?? {};
	const httpRequestWithAuthentication = jest.fn(function (
		credential: string,
		options: { method?: string; url: string; body?: unknown },
	) {
		return (opts.httpImpl ?? (async () => ({})))({ credential, options });
	});

	const ctx = {
		getNodeParameter: (name: string, fallback?: unknown) =>
			name in opts.params ? opts.params[name] : fallback,
		getNodeWebhookUrl: () => opts.webhookUrl,
		getWorkflowStaticData: () => staticData,
		getCredentials: async () => opts.credentials ?? {},
		getNode: () => FAKE_NODE,
		helpers: { httpRequestWithAuthentication },
	} as unknown as IHookFunctions;

	return { ctx, staticData, httpRequestWithAuthentication };
}

/** Find the single call matching an HTTP method. */
function callWith(mock: jest.Mock, method: string): HttpCall['options'] | undefined {
	const hit = mock.mock.calls.find((c) => (c[1] as { method?: string }).method === method);
	return hit?.[1] as HttpCall['options'] | undefined;
}

describe('AppStoreConnectTrigger — webhookMethods lifecycle', () => {
	describe('passive mode (manageWebhook = false)', () => {
		it('checkExists reports true and makes no ASC calls', async () => {
			const { ctx, httpRequestWithAuthentication } = makeHookCtx({ params: { manageWebhook: false } });
			await expect(lifecycle.checkExists.call(ctx)).resolves.toBe(true);
			expect(httpRequestWithAuthentication).not.toHaveBeenCalled();
		});

		it('create and delete are no-ops with no ASC calls', async () => {
			const create = makeHookCtx({ params: { manageWebhook: false } });
			await expect(lifecycle.create.call(create.ctx)).resolves.toBe(true);
			expect(create.httpRequestWithAuthentication).not.toHaveBeenCalled();

			const del = makeHookCtx({ params: { manageWebhook: false } });
			await expect(lifecycle.delete.call(del.ctx)).resolves.toBe(true);
			expect(del.httpRequestWithAuthentication).not.toHaveBeenCalled();
		});
	});

	describe('checkExists (managed)', () => {
		it('finds a webhook whose url matches this node and caches its id', async () => {
			const { ctx, staticData, httpRequestWithAuthentication } = makeHookCtx({
				params: { manageWebhook: true, targetApp: 'APP123' },
				webhookUrl: WEBHOOK_URL,
				httpImpl: async ({ options }) => {
					expect(options.url).toBe('/v1/apps/APP123/webhooks');
					return {
						data: [
							{ id: 'wh-other', attributes: { url: 'https://elsewhere/webhook' } },
							{ id: 'wh-mine', attributes: { url: WEBHOOK_URL } },
						],
						links: { next: null },
					};
				},
			});

			await expect(lifecycle.checkExists.call(ctx)).resolves.toBe(true);
			expect(staticData.webhookId).toBe('wh-mine');
			expect(httpRequestWithAuthentication).toHaveBeenCalledTimes(1);
		});

		it('returns false when no existing webhook points at this node', async () => {
			const { ctx, staticData } = makeHookCtx({
				params: { manageWebhook: true, targetApp: 'APP123' },
				webhookUrl: WEBHOOK_URL,
				httpImpl: async () => ({
					data: [{ id: 'wh-other', attributes: { url: 'https://elsewhere/webhook' } }],
					links: { next: null },
				}),
			});

			await expect(lifecycle.checkExists.call(ctx)).resolves.toBe(false);
			expect(staticData.webhookId).toBeUndefined();
		});
	});

	describe('create (managed)', () => {
		it('POSTs a correct ASC webhook body and caches the returned id', async () => {
			const { ctx, staticData, httpRequestWithAuthentication } = makeHookCtx({
				params: {
					manageWebhook: true,
					targetApp: 'APP123',
					events: ['BUILD_UPLOAD_STATE_UPDATED'],
					eventsRawOverride: 'SOME_NEW_TYPE',
					secretSource: 'field',
					secret: 's3cr3t',
				},
				webhookUrl: WEBHOOK_URL,
				httpImpl: async ({ options }) => {
					expect(options.method).toBe('POST');
					expect(options.url).toBe('/v1/webhooks');
					return { data: { id: 'wh-new' } };
				},
			});

			await expect(lifecycle.create.call(ctx)).resolves.toBe(true);
			expect(staticData.webhookId).toBe('wh-new');

			const post = callWith(httpRequestWithAuthentication, 'POST');
			const body = post?.body as {
				data: {
					type: string;
					attributes: { url: string; secret: string; enabled: boolean; eventTypes: string[]; name: string };
					relationships: { app: { data: { type: string; id: string } } };
				};
			};
			expect(body.data.type).toBe(WEBHOOK_RESOURCE_TYPE);
			expect(body.data.attributes.url).toBe(WEBHOOK_URL);
			expect(body.data.attributes.secret).toBe('s3cr3t');
			expect(body.data.attributes.enabled).toBe(true);
			// Selected events merged with the raw override (deduped) via module C.
			expect(body.data.attributes.eventTypes).toEqual(
				mergeEventTypes(['BUILD_UPLOAD_STATE_UPDATED'], 'SOME_NEW_TYPE'),
			);
			expect(body.data.relationships.app.data).toEqual({ type: APP_RESOURCE_TYPE, id: 'APP123' });
			expect(body.data.attributes.name).toContain(FAKE_NODE.name);
		});

		it('reads the secret from the webhook credential when secretSource is credential', async () => {
			const { ctx, httpRequestWithAuthentication } = makeHookCtx({
				params: {
					manageWebhook: true,
					targetApp: 'APP123',
					events: ['BUILD_UPLOAD_STATE_UPDATED'],
					secretSource: 'credential',
				},
				webhookUrl: WEBHOOK_URL,
				credentials: { secret: 'from-credential' },
				httpImpl: async () => ({ data: { id: 'wh-new' } }),
			});

			await lifecycle.create.call(ctx);

			const post = callWith(httpRequestWithAuthentication, 'POST');
			expect((post?.body as { data: { attributes: { secret: string } } }).data.attributes.secret).toBe(
				'from-credential',
			);
		});
	});

	describe('delete (managed)', () => {
		it('deletes the cached webhook id and clears static data', async () => {
			const { ctx, staticData, httpRequestWithAuthentication } = makeHookCtx({
				params: { manageWebhook: true },
				staticData: { webhookId: 'wh-9' },
				httpImpl: async ({ options }) => {
					expect(options.method).toBe('DELETE');
					return {};
				},
			});

			await expect(lifecycle.delete.call(ctx)).resolves.toBe(true);
			expect(callWith(httpRequestWithAuthentication, 'DELETE')?.url).toBe('/v1/webhooks/wh-9');
			expect(staticData.webhookId).toBeUndefined();
		});

		it('falls back to a URL lookup when the id was lost, then deletes what it finds', async () => {
			const { ctx, httpRequestWithAuthentication } = makeHookCtx({
				params: { manageWebhook: true, targetApp: 'APP123' },
				webhookUrl: WEBHOOK_URL,
				staticData: {}, // no cached id
				httpImpl: async ({ options }) => {
					if (options.method === 'DELETE') return {};
					// the app-scoped list used to recover the id
					return { data: [{ id: 'wh-found', attributes: { url: WEBHOOK_URL } }], links: { next: null } };
				},
			});

			await expect(lifecycle.delete.call(ctx)).resolves.toBe(true);
			expect(callWith(httpRequestWithAuthentication, 'DELETE')?.url).toBe('/v1/webhooks/wh-found');
		});
	});
});

describe('AppStoreConnectTrigger — webhook() runtime', () => {
	const DELIVERY = {
		data: {
			type: 'buildUploadStateUpdated',
			id: 'delivery-123',
			attributes: { timestamp: '2025-04-16T05:00:52.745Z', ping: false },
		},
	};
	const RAW_BODY = Buffer.from(JSON.stringify(DELIVERY));
	const SECRET = 'super-secret';

	function sign(secret: string, body: Buffer): string {
		return `${ASC_SIGNATURE_PREFIX}${createHmac('sha256', secret).update(body).digest('hex')}`;
	}

	function makeWebhookCtx(opts: { signature?: string; skip?: boolean }) {
		const status = jest.fn().mockReturnThis();
		const json = jest.fn();
		const ctx = {
			getNodeParameter: (name: string, fallback?: unknown) => {
				if (name === 'skipSignatureValidation') return opts.skip ?? false;
				if (name === 'secretSource') return 'field';
				if (name === 'secret') return SECRET;
				return fallback;
			},
			getRequestObject: () => ({ rawBody: RAW_BODY }),
			getHeaderData: () => (opts.signature ? { [ASC_SIGNATURE_HEADER]: opts.signature } : {}),
			getBodyData: () => DELIVERY,
			getResponseObject: () => ({ status, json }),
			getNode: () => FAKE_NODE,
		} as unknown as IWebhookFunctions;
		return { ctx, status, json };
	}

	it('emits one enriched item for a validly-signed delivery', async () => {
		const { ctx } = makeWebhookCtx({ signature: sign(SECRET, RAW_BODY) });

		const result = await node.webhook.call(ctx);

		const emitted = result.workflowData?.[0]?.[0]?.json as Record<string, unknown>;
		expect(emitted.eventType).toBe('buildUploadStateUpdated');
		expect(emitted.deliveryId).toBe('delivery-123');
		expect(emitted.isPing).toBe(false);
		// Original payload is preserved alongside the metadata.
		expect((emitted.data as { id: string }).id).toBe('delivery-123');
	});

	it('rejects a delivery with an invalid signature: 401 and nothing emitted', async () => {
		const { ctx, status, json } = makeWebhookCtx({ signature: `${ASC_SIGNATURE_PREFIX}deadbeef` });

		const result = await node.webhook.call(ctx);

		expect(status).toHaveBeenCalledWith(401);
		expect(json).toHaveBeenCalled();
		expect(result).toEqual({ noWebhookResponse: true });
	});

	it('rejects a delivery with a missing signature header', async () => {
		const { ctx, status } = makeWebhookCtx({ signature: undefined });

		const result = await node.webhook.call(ctx);

		expect(status).toHaveBeenCalledWith(401);
		expect(result).toEqual({ noWebhookResponse: true });
	});
});
