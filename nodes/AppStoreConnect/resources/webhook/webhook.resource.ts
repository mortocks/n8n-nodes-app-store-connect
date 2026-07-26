import type { INodeProperties } from 'n8n-workflow';

import { KNOWN_EVENT_TYPES } from '../../../../utils/eventTypes';
import { simplifyField } from '../_shared/simplify';
import { ascCursorPagination } from '../../transport/pagination';
import { ascConfirmationRequest, ascSingleRequest } from '../../transport/request';
import { attachWebhookPingRequestBody, attachWebhookRequestBody } from './webhook.body';

/**
 * Webhook resource — operations.
 *
 * Task 01 shipped "Get Many". Task 03 rounded out the lifecycle with Create,
 * Get, Update, and Delete. Task 04 adds the two remaining PRD operations:
 * Send Test Ping (single-shot, via `ascSingleRequest`) and List Deliveries
 * (cursor-paginated, via `ascCursorPagination` — identical wiring to Get
 * Many, just a different URL and resource).
 *
 * Create/Update share `attachWebhookRequestBody`, and Send Test Ping has its
 * own `attachWebhookPingRequestBody`, as their `preSend` hook (each builds its
 * JSON:API body — see `webhook.body.ts`). All single-shot operations (Create,
 * Get, Update, Delete, Send Test Ping) share `ascSingleRequest` as their
 * `operations.pagination` hook, and both list operations (Get Many, List
 * Deliveries) share `ascCursorPagination`, so every operation maps ASC errors
 * through module D identically (see `transport/`).
 */
export const webhookOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: {
				resource: ['webhook'],
			},
		},
		options: [
			{
				name: 'Get Many',
				value: 'getMany',
				action: 'Get many webhooks',
				description: 'Retrieve the webhooks configured for an app',
				routing: {
					request: {
						method: 'GET',
						// Apple forbids the top-level `GET /v1/webhooks` collection
						// (403 GET_COLLECTION); webhooks are listable only scoped to
						// their app.
						url: '=/v1/apps/{{$parameter["targetApp"]}}/webhooks',
					},
					operations: {
						pagination: ascCursorPagination,
					},
				},
			},
			{
				name: 'Create',
				value: 'create',
				action: 'Create a webhook',
				description: 'Create a new webhook for an app',
				routing: {
					request: {
						method: 'POST',
						url: '/v1/webhooks',
					},
					send: {
						preSend: [attachWebhookRequestBody],
					},
					operations: {
						pagination: ascSingleRequest,
					},
				},
			},
			{
				name: 'Get',
				value: 'get',
				action: 'Get a webhook',
				description: 'Retrieve a single webhook by ID',
				routing: {
					request: {
						method: 'GET',
						url: '=/v1/webhooks/{{$parameter["webhookId"]}}',
					},
					operations: {
						pagination: ascSingleRequest,
					},
				},
			},
			{
				name: 'Update',
				value: 'update',
				action: 'Update a webhook',
				description: 'Update an existing webhook',
				routing: {
					request: {
						method: 'PATCH',
						url: '=/v1/webhooks/{{$parameter["webhookId"]}}',
					},
					send: {
						preSend: [attachWebhookRequestBody],
					},
					operations: {
						pagination: ascSingleRequest,
					},
				},
			},
			{
				name: 'Delete',
				value: 'delete',
				action: 'Delete a webhook',
				description: 'Permanently delete a webhook',
				routing: {
					request: {
						method: 'DELETE',
						url: '=/v1/webhooks/{{$parameter["webhookId"]}}',
					},
					operations: {
						// Delete replies 204 No Content; emit an explicit
						// `{ deleted: true }` confirmation rather than an empty item.
						pagination: ascConfirmationRequest('deleted'),
					},
				},
			},
			{
				name: 'Send Test Ping',
				value: 'sendTestPing',
				action: 'Send a test ping to a webhook',
				description: 'Trigger a test ping delivery for a webhook',
				routing: {
					request: {
						method: 'POST',
						url: '/v1/webhookPings',
					},
					send: {
						preSend: [attachWebhookPingRequestBody],
					},
					operations: {
						pagination: ascSingleRequest,
					},
				},
			},
			{
				name: 'List Deliveries',
				value: 'listDeliveries',
				action: 'List webhook deliveries',
				description: 'Retrieve recent delivery attempts for a webhook',
				routing: {
					request: {
						method: 'GET',
						url: '=/v1/webhooks/{{$parameter["webhookId"]}}/deliveries',
					},
					operations: {
						pagination: ascCursorPagination,
					},
				},
			},
		],
		default: 'getMany',
	},
];

/**
 * Webhook resource — fields.
 */
export const webhookFields: INodeProperties[] = [
	// --- Get Many / List Deliveries ------------------------------------------
	// The Return All / Limit toggle. The pagination hook reads these
	// parameters at runtime to decide how far to follow `links.next`. Shared
	// as-is by List Deliveries (Task 04) — same cursor-pagination mechanics,
	// just a different underlying resource.
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		description: 'Whether to return all results or only up to a given limit',
		displayOptions: {
			show: {
				resource: ['webhook'],
				operation: ['getMany', 'listDeliveries'],
			},
		},
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		default: 50,
		typeOptions: {
			minValue: 1,
		},
		description: 'Max number of results to return',
		displayOptions: {
			show: {
				resource: ['webhook'],
				operation: ['getMany', 'listDeliveries'],
				returnAll: [false],
			},
		},
	},

	// --- Get / Update / Delete / Send Test Ping / List Deliveries: which
	// webhook -----------------------------------------------------------------
	{
		displayName: 'Webhook ID',
		name: 'webhookId',
		type: 'string',
		default: '',
		required: true,
		description: 'The ID of the webhook',
		displayOptions: {
			show: {
				resource: ['webhook'],
				operation: ['get', 'update', 'delete', 'sendTestPing', 'listDeliveries'],
			},
		},
	},

	// --- Create / Update: the webhook's own attributes ----------------------
	{
		displayName: 'Target App',
		name: 'targetApp',
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		required: true,
		description: 'The app the webhook is scoped to',
		displayOptions: {
			show: {
				resource: ['webhook'],
				// Get Many lists an app's webhooks (Apple has no global list), so it
				// needs the app too — not just Create/Update.
				operation: ['getMany', 'create', 'update'],
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
		displayName: 'Name',
		name: 'name',
		type: 'string',
		default: '',
		required: true,
		description: 'A display name for the webhook',
		displayOptions: {
			show: {
				resource: ['webhook'],
				operation: ['create', 'update'],
			},
		},
	},
	{
		displayName: 'Payload URL',
		name: 'url',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. https://example.com/webhook',
		description: 'The HTTPS endpoint App Store Connect delivers webhook events to',
		displayOptions: {
			show: {
				resource: ['webhook'],
				operation: ['create', 'update'],
			},
		},
	},
	{
		displayName: 'Secret',
		name: 'secret',
		type: 'string',
		typeOptions: {
			password: true,
		},
		default: '',
		required: true,
		description: 'The shared secret App Store Connect uses to sign the `x-apple-signature` header',
		displayOptions: {
			show: {
				resource: ['webhook'],
				operation: ['create'],
			},
		},
	},
	{
		displayName: 'Secret',
		name: 'secret',
		type: 'string',
		typeOptions: {
			password: true,
		},
		default: '',
		description:
			'The shared secret App Store Connect uses to sign the `x-apple-signature` header. Leave blank to keep the webhook\'s current secret unchanged; App Store Connect never returns the existing secret, so only fill this in to rotate it.',
		displayOptions: {
			show: {
				resource: ['webhook'],
				operation: ['update'],
			},
		},
	},
	{
		displayName: 'Enabled',
		name: 'enabled',
		type: 'boolean',
		default: true,
		description: 'Whether the webhook is active',
		displayOptions: {
			show: {
				resource: ['webhook'],
				operation: ['create', 'update'],
			},
		},
	},
	{
		displayName: 'Event Types',
		name: 'eventTypes',
		type: 'multiOptions',
		default: [],
		description:
			'The event types to trigger this webhook (Apple\'s SCREAMING_SNAKE_CASE subscription form). Use "Raw Event Type Override" below for identifiers not listed here.',
		options: KNOWN_EVENT_TYPES.map((eventType) => ({
			name: eventType,
			value: eventType,
		})),
		displayOptions: {
			show: {
				resource: ['webhook'],
				operation: ['create', 'update'],
			},
		},
	},
	{
		displayName: 'Raw Event Type Override',
		name: 'eventTypesRawOverride',
		type: 'string',
		default: '',
		placeholder: 'e.g. SOME_NEW_EVENT_TYPE, ANOTHER_NEW_EVENT_TYPE',
		description:
			'Additional event-type identifiers not listed above (e.g. newer types Apple has added), comma- or whitespace-separated. Use Apple\'s SCREAMING_SNAKE_CASE subscription form. Merged with "Event Types" and de-duplicated.',
		displayOptions: {
			show: {
				resource: ['webhook'],
				operation: ['create', 'update'],
			},
		},
	},

	// --- Reads: shared Simplify toggle ---------------------------------------
	// Flattens the JSON:API envelope for the list reads (Get Many and List
	// Deliveries, both via `ascCursorPagination`).
	simplifyField({
		show: {
			resource: ['webhook'],
			operation: ['getMany', 'listDeliveries'],
		},
	}),
];
