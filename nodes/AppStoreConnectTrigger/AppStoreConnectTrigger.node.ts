import {
	NodeApiError,
	NodeConnectionTypes,
	type IDataObject,
	type IHookFunctions,
	type IHttpRequestOptions,
	type INodeType,
	type INodeTypeDescription,
	type IWebhookFunctions,
	type IWebhookResponseData,
	type JsonObject,
} from 'n8n-workflow';

import { formatAscErrorMessage } from '../../utils/ascErrorMapper';
import { KNOWN_EVENT_TYPES, mergeEventTypes } from '../../utils/eventTypes';
import { paginate } from '../../utils/pagination';
import { ASC_SIGNATURE_HEADER } from '../../utils/verifyWebhookSignature';
import { APP_RESOURCE_TYPE, searchApps } from '../AppStoreConnect/methods/apps';
import { WEBHOOK_RESOURCE_TYPE } from '../AppStoreConnect/resources/webhook/webhook.constants';
import { processWebhookRequest } from './processWebhookRequest';

const ASC_BASE_URL = 'https://api.appstoreconnect.apple.com';
/** App Store Connect's maximum page size (see `docs/apple-api-notes.md`). */
const ASC_MAX_PAGE_SIZE = 200;

interface AscWebhook {
	id: string;
	attributes?: { url?: string };
}

interface AscWebhookListBody {
	data?: AscWebhook[];
	links?: { next?: string | null };
}

/**
 * Run an ASC-authenticated request from a lifecycle hook, mapping ASC's
 * JSON:API `errors[]` through deep module D so activation/deactivation surface
 * the actionable message rather than a bare HTTP status — the exact same
 * mapping the declarative action node uses (`transport/errors.ts`).
 */
async function ascHookRequest<T>(this: IHookFunctions, options: IHttpRequestOptions): Promise<T> {
	try {
		return (await this.helpers.httpRequestWithAuthentication.call(
			this,
			'appStoreConnectApi',
			options,
		)) as T;
	} catch (error) {
		const responseBody = (error as { cause?: { response?: { data?: unknown } } }).cause?.response
			?.data;
		const readable = formatAscErrorMessage(responseBody);
		if (readable) {
			throw new NodeApiError(this.getNode(), error as JsonObject, { message: readable });
		}
		throw error;
	}
}

/**
 * Find the ASC webhook (if any) whose payload URL matches `targetUrl`, across
 * all pages of the app's webhooks.
 *
 * Apple forbids listing the top-level `webhooks` collection
 * (`GET /v1/webhooks` → 403 "does not allow GET_COLLECTION"); webhooks are only
 * listable scoped to their app, via `GET /v1/apps/{appId}/webhooks`. The
 * n8n-generated URL is unique to this node, so a URL match within the app's
 * webhooks is a reliable "this registration already exists" test — that is what
 * makes reactivation idempotent (`checkExists`) and lets `delete` recover the id
 * if static data was lost. Returns `undefined` when no app id is available.
 */
async function findWebhookByUrl(
	this: IHookFunctions,
	targetUrl: string,
	appId: string | undefined,
): Promise<AscWebhook | undefined> {
	if (!appId) {
		return undefined;
	}

	const matches = await paginate<AscWebhook>(
		async (nextUrl) => {
			const options: IHttpRequestOptions = nextUrl
				? { method: 'GET', url: nextUrl }
				: {
						method: 'GET',
						url: `/v1/apps/${appId}/webhooks`,
						baseURL: ASC_BASE_URL,
						qs: { limit: ASC_MAX_PAGE_SIZE },
					};
			const body = await ascHookRequest.call<
				IHookFunctions,
				[IHttpRequestOptions],
				Promise<AscWebhookListBody>
			>(this, options);
			return { items: body.data ?? [], nextUrl: body.links?.next ?? undefined };
		},
		{ returnAll: true },
	);

	return matches.find((webhook) => webhook.attributes?.url === targetUrl);
}

/**
 * `App Store Connect Trigger` node (programmatic trigger).
 *
 * Makes ASC webhook events a drop-in workflow start. By default the Trigger is a
 * passive listener: you register the ASC webhook yourself (Create operation or
 * the ASC console) pointing at this node's Production URL, and the lifecycle
 * hooks make no ASC API calls. Turning on "Manage Webhook in App Store Connect"
 * restores automatic registration — on activation the `webhookMethods.default`
 * lifecycle registers an ASC webhook (target app + merged event triggers +
 * shared secret) pointing at the n8n-generated URL, `checkExists` makes
 * reactivation idempotent, and deactivation deletes it. Either way, at runtime
 * `webhook()` captures the raw body, verifies the `x-apple-signature` HMAC via
 * the shared deep module B
 * and — secure by default — answers 401 (emitting nothing) on any
 * missing/invalid signature, else emits one item with the parsed payload plus
 * `eventType` / delivery id / `isPing` metadata.
 *
 * It reuses the same deep modules and single-source constants as the Task 03
 * action node and Task 05 Verify node: crypto (module B), event-type merging
 * (module C), error mapping (module D), pagination (module E), the app picker
 * (`methods/apps.ts`) and the JSON:API resource constants — so the trigger's
 * behaviour can never diverge from the rest of the package. The security-
 * critical decision is factored into the pure, unit-tested
 * `processWebhookRequest` helper; the rest is n8n framework wiring validated
 * live (see the README "Manual verification checklist" → Task 06).
 */
export class AppStoreConnectTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'App Store Connect Trigger',
		name: 'appStoreConnectTrigger',
		icon: { light: 'file:appStore.svg', dark: 'file:appStore.dark.svg' },
		group: ['trigger'],
		version: 1,
		subtitle:
			'={{ $parameter["manageWebhook"] ? ($parameter["events"] || []).join(", ") : "Passive listener" }}',
		description: 'Starts the workflow when App Store Connect delivers a webhook event',
		defaults: {
			name: 'App Store Connect Trigger',
		},
		inputs: [],
		// eslint-plugin-n8n-nodes-base@1.16.7 predates the `NodeConnectionTypes`
		// rename and only recognises the `'main'` string literal; the n8n
		// community-nodes verification scanner requires the typed enum instead.
		// eslint-disable-next-line n8n-nodes-base/node-class-description-outputs-wrong
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'appStoreConnectApi',
				// Only needed when the Trigger manages the ASC registration itself;
				// a passive listener makes no ASC API calls.
				required: true,
				displayOptions: {
					show: {
						manageWebhook: [true],
					},
				},
			},
			{
				// The webhook credential holds only the signing Secret — it is not an
				// ASC API credential, so the `-Api` suffix convention does not apply
				// (matches the credential class's own name; see
				// `credentials/AppStoreConnectWebhook.credentials.ts`).
				// eslint-disable-next-line n8n-nodes-base/node-class-description-credentials-name-unsuffixed
				name: 'appStoreConnectWebhook',
				required: false,
				// Only used when the Secret is sourced from a credential (the default).
				displayOptions: {
					show: {
						secretSource: ['credential'],
					},
				},
			},
		],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: 'webhook',
				// Capture the exact bytes ASC sent: n8n parses JSON by default, and
				// re-serializing would reorder keys / change whitespace and break the
				// HMAC. Module B verifies over these raw bytes.
				rawBody: true,
			},
		],
		properties: [
			{
				displayName: 'Manage Webhook in App Store Connect',
				name: 'manageWebhook',
				type: 'boolean',
				default: false,
				description:
					'Whether to automatically register the webhook in App Store Connect on activation (and delete it on deactivation), using the Target App, Events and API credential below. Leave OFF (default) to run as a passive listener: register the webhook yourself — via the App Store Connect node\'s Create operation or the ASC console, pointing at this node\'s Production URL — and the Trigger only verifies signatures and emits events. Passive mode needs no API credential and makes no ASC API calls, which is simpler and avoids issues when testing locally (where n8n\'s URL is not reachable by Apple).',
			},
			{
				displayName: 'Target App',
				name: 'targetApp',
				type: 'resourceLocator',
				default: { mode: 'list', value: '' },
				required: true,
				description: 'The app to register the webhook for',
				// Registration-only: shown when the Trigger manages the ASC webhook.
				displayOptions: {
					show: {
						manageWebhook: [true],
					},
				},
				modes: [
					{
						displayName: 'From List',
						name: 'list',
						type: 'list',
						typeOptions: {
							searchListMethod: 'searchApps',
							searchable: true,
						},
					},
					{
						displayName: 'ID',
						name: 'id',
						type: 'string',
						placeholder: 'e.g. 1234567890',
					},
				],
			},
			{
				displayName: 'Events',
				name: 'events',
				type: 'multiOptions',
				default: [],
				description:
					'The event types to register this webhook for (Apple\'s SCREAMING_SNAKE_CASE form). Use "Raw Event Type Override" for identifiers not listed here.',
				options: KNOWN_EVENT_TYPES.map((eventType) => ({
					name: eventType,
					value: eventType,
				})),
				displayOptions: {
					show: {
						manageWebhook: [true],
					},
				},
			},
			{
				displayName: 'Raw Event Type Override',
				name: 'eventsRawOverride',
				type: 'string',
				default: '',
				placeholder: 'e.g. SOME_NEW_EVENT_TYPE, ANOTHER_NEW_EVENT_TYPE',
				description:
					'Additional event-type identifiers not listed above (e.g. newer types Apple has added), comma- or whitespace-separated. Use Apple\'s SCREAMING_SNAKE_CASE subscription form (e.g. BUILD_UPLOAD_STATE_UPDATED). Merged with "Events" and de-duplicated.',
				displayOptions: {
					show: {
						manageWebhook: [true],
					},
				},
			},
			{
				displayName: 'Secret Source',
				name: 'secretSource',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Credential',
						value: 'credential',
						description: 'Use the Secret from an App Store Connect Webhook credential',
					},
					{
						name: 'Field',
						value: 'field',
						description: 'Provide the Secret directly in this node (fixed value or expression)',
					},
				],
				default: 'credential',
				description:
					'Where to read the shared webhook secret from (used to verify signatures, and — when managing the webhook — to register it)',
			},
			{
				displayName: 'Secret',
				name: 'secret',
				type: 'string',
				typeOptions: {
					password: true,
				},
				default: '',
				description: 'The shared webhook secret. Supports expressions (e.g. `{{ $env.ASC_WEBHOOK_SECRET }}`).',
				displayOptions: {
					show: {
						secretSource: ['field'],
					},
				},
			},
			{
				displayName: 'Skip Signature Validation',
				name: 'skipSignatureValidation',
				type: 'boolean',
				default: false,
				description:
					'Whether to skip verifying the x-apple-signature HMAC on incoming deliveries. UNSAFE — leave off in production. When on, ANY caller can start this workflow with a forged payload; enable only for local debugging.',
			},
		],
	};

	// Reuses the Task 03 app picker so the Trigger's "Target App" resourceLocator
	// behaves identically to the action node's (see `methods/apps.ts`).
	methods = {
		listSearch: {
			searchApps,
		},
	};

	webhookMethods = {
		default: {
			/**
			 * Idempotent reactivation: true when an ASC webhook already points at
			 * this node's n8n URL (its id is cached in static data for `delete`).
			 */
			async checkExists(this: IHookFunctions): Promise<boolean> {
				// Passive mode: the webhook is registered outside n8n, so report it as
				// already existing (n8n skips `create` and just activates the local
				// endpoint) — no ASC API calls.
				if (!(this.getNodeParameter('manageWebhook', false) as boolean)) {
					return true;
				}

				const webhookUrl = this.getNodeWebhookUrl('default');
				if (!webhookUrl) {
					return false;
				}

				const appId = this.getNodeParameter('targetApp', undefined, {
					extractValue: true,
				}) as string;
				const existing = await findWebhookByUrl.call(this, webhookUrl, appId);
				if (!existing) {
					return false;
				}

				this.getWorkflowStaticData('node').webhookId = existing.id;
				return true;
			},

			/**
			 * Register the ASC webhook, mirroring the Task 03 Create body shape
			 * (single-source resource/app constants + module C event merge), and
			 * cache the returned id in static data so `delete` can find it.
			 */
			async create(this: IHookFunctions): Promise<boolean> {
				// Passive mode: nothing to register with ASC.
				if (!(this.getNodeParameter('manageWebhook', false) as boolean)) {
					return true;
				}

				const webhookUrl = this.getNodeWebhookUrl('default');
				if (!webhookUrl) {
					throw new NodeApiError(this.getNode(), {} as JsonObject, {
						message: 'Could not determine the n8n webhook URL to register with App Store Connect',
					});
				}

				const targetAppId = this.getNodeParameter('targetApp', undefined, {
					extractValue: true,
				}) as string;
				const selectedEvents = this.getNodeParameter('events', []) as string[];
				const rawEventOverride = this.getNodeParameter('eventsRawOverride', '') as string;
				const eventTypes = mergeEventTypes(selectedEvents, rawEventOverride);

				const secretSource = this.getNodeParameter('secretSource', 'credential') as string;
				let secret = '';
				if (secretSource === 'credential') {
					const credentials = await this.getCredentials('appStoreConnectWebhook');
					secret = (credentials.secret as string) ?? '';
				} else {
					secret = this.getNodeParameter('secret', '') as string;
				}

				const body = {
					data: {
						type: WEBHOOK_RESOURCE_TYPE,
						attributes: {
							name: `n8n (${this.getNode().name})`,
							url: webhookUrl,
							secret,
							enabled: true,
							eventTypes,
						},
						relationships: {
							app: {
								data: { type: APP_RESOURCE_TYPE, id: targetAppId },
							},
						},
					},
				};

				const response = await ascHookRequest.call<
					IHookFunctions,
					[IHttpRequestOptions],
					Promise<{ data?: { id?: string } }>
				>(this, {
					method: 'POST',
					url: '/v1/webhooks',
					baseURL: ASC_BASE_URL,
					headers: { 'Content-Type': 'application/json' },
					body,
				});

				const createdId = response.data?.id;
				if (createdId) {
					this.getWorkflowStaticData('node').webhookId = createdId;
				}
				return true;
			},

			/**
			 * Deactivation: delete the ASC registration. Uses the cached id, and
			 * falls back to a URL lookup if static data was lost, so the ASC side is
			 * never left with an orphaned webhook. Clears static data afterwards.
			 */
			async delete(this: IHookFunctions): Promise<boolean> {
				// Passive mode: the registration is managed outside n8n — leave it be.
				if (!(this.getNodeParameter('manageWebhook', false) as boolean)) {
					return true;
				}

				const staticData = this.getWorkflowStaticData('node');
				let webhookId = staticData.webhookId as string | undefined;

				if (!webhookId) {
					const webhookUrl = this.getNodeWebhookUrl('default');
					const appId = this.getNodeParameter('targetApp', undefined, {
						extractValue: true,
					}) as string;
					if (webhookUrl && appId) {
						const existing = await findWebhookByUrl.call(this, webhookUrl, appId);
						webhookId = existing?.id;
					}
				}

				if (webhookId) {
					await ascHookRequest.call<IHookFunctions, [IHttpRequestOptions], Promise<IDataObject>>(
						this,
						{
							method: 'DELETE',
							url: `/v1/webhooks/${webhookId}`,
							baseURL: ASC_BASE_URL,
						},
					);
				}

				delete staticData.webhookId;
				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const skipValidation = this.getNodeParameter('skipSignatureValidation', false) as boolean;

		// The exact bytes n8n received (webhook description sets `rawBody: true`).
		// Default to an empty buffer rather than `undefined` so module B never
		// throws — an empty body simply fails the HMAC check and is rejected.
		const request = this.getRequestObject() as unknown as { rawBody?: Buffer };
		const rawBody: Buffer = request.rawBody ?? Buffer.alloc(0);

		const headers = this.getHeaderData();
		const signatureHeader = headers[ASC_SIGNATURE_HEADER];
		const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;

		const secretSource = this.getNodeParameter('secretSource', 'credential') as string;
		let secret = '';
		if (secretSource === 'credential') {
			const credentials = await this.getCredentials('appStoreConnectWebhook');
			secret = (credentials?.secret as string | undefined) ?? '';
		} else {
			secret = this.getNodeParameter('secret', '') as string;
		}

		const payload = this.getBodyData() as Record<string, unknown>;

		const result = processWebhookRequest({
			rawBody,
			payload,
			signature,
			secret,
			skipValidation,
		});

		if (result.action === 'reject') {
			// Secure by default: forged/missing signature → 401, emit nothing.
			const response = this.getResponseObject();
			response.status(401).json({ message: 'Invalid or missing signature' });
			return { noWebhookResponse: true };
		}

		const { event } = result;
		return {
			workflowData: [
				[
					{
						json: {
							...event.payload,
							eventType: event.eventType,
							deliveryId: event.deliveryId,
							isPing: event.isPing,
						},
					},
				],
			],
		};
	}
}
