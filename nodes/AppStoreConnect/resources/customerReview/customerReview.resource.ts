import type { INodeProperties } from 'n8n-workflow';

import { inputModeFields } from '../_shared/inputMode';
import { attachSort, sortField } from '../_shared/listFilters';
import { attachQueryOptions, queryOptionsCollection } from '../_shared/queryOptions';
import { simplifyField } from '../_shared/simplify';
import { ascCursorPagination } from '../../transport/pagination';
import { ascConfirmationRequest, ascSingleRequest } from '../../transport/request';
import {
	attachCustomerReviewFilters,
	attachCustomerReviewResponseBody,
} from './customerReview.body';

/**
 * Customer Reviews resource — operations.
 *
 * The first post-webhook resource (roadmap Tier 1 #1). Reads plus a single
 * writable sub-resource (the developer's response), all reusing the shipped
 * spine:
 *   - **Get Many** (`GET /v1/apps/{id}/customerReviews`) — app-scoped, so it
 *     reuses `searchApps` for the app picker and `ascCursorPagination` for
 *     Return All / Limit paging.
 *   - **Get** (`GET /v1/customerReviews/{id}`), **Get Response**
 *     (`GET /v1/customerReviews/{id}/response`) — single reads via
 *     `ascSingleRequest`.
 *   - **Create / Update / Delete Response** (`POST` / `PATCH` / `DELETE
 *     /v1/customerReviewResponses/{id}`) — single writes via `ascSingleRequest`.
 *
 * Every read mounts the shared Query Options collection (`attachQueryOptions`
 * folds sparse fieldsets / include / filter / sort / limit into `qs`). The
 * response write is the node's **first mutation**: it uses the shared Input
 * Mode group so both the typed UI and the raw-JSON escape hatch flow through
 * the same `ascSingleRequest` + module-D error mapper.
 */
export const customerReviewOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: {
				resource: ['customerReview'],
			},
		},
		options: [
			{
				name: 'Get Many',
				value: 'getMany',
				action: 'Get many customer reviews',
				description: "Retrieve an app's customer reviews",
				routing: {
					request: {
						method: 'GET',
						url: '=/v1/apps/{{$parameter["targetApp"]}}/customerReviews',
					},
					send: {
						// Curated filters + sort first, then the generic Query Options;
						// all only add `qs` keys, so they compose. Query Options runs
						// last so an advanced `filter[]`/`sort` there overrides the
						// convenience fields.
						preSend: [attachCustomerReviewFilters, attachSort, attachQueryOptions],
					},
					operations: {
						pagination: ascCursorPagination,
					},
				},
			},
			{
				name: 'Get',
				value: 'get',
				action: 'Get a customer review',
				description: 'Retrieve a single customer review by ID',
				routing: {
					request: {
						method: 'GET',
						url: '=/v1/customerReviews/{{$parameter["reviewId"]}}',
					},
					send: {
						preSend: [attachQueryOptions],
					},
					operations: {
						pagination: ascSingleRequest,
					},
				},
			},
			{
				name: 'Get Response',
				value: 'getResponse',
				action: 'Get a customer review response',
				description: "Retrieve the developer's response to a customer review",
				routing: {
					request: {
						method: 'GET',
						url: '=/v1/customerReviews/{{$parameter["reviewId"]}}/response',
					},
					send: {
						preSend: [attachQueryOptions],
					},
					operations: {
						pagination: ascSingleRequest,
					},
				},
			},
			{
				name: 'Create Response',
				value: 'createResponse',
				action: 'Create a customer review response',
				description: 'Respond to a customer review',
				routing: {
					request: {
						method: 'POST',
						url: '/v1/customerReviewResponses',
					},
					send: {
						preSend: [attachCustomerReviewResponseBody],
					},
					operations: {
						pagination: ascSingleRequest,
					},
				},
			},
			{
				name: 'Update Response',
				value: 'updateResponse',
				action: 'Update a customer review response',
				description: 'Edit an existing developer response',
				routing: {
					request: {
						method: 'PATCH',
						url: '=/v1/customerReviewResponses/{{$parameter["responseId"]}}',
					},
					send: {
						preSend: [attachCustomerReviewResponseBody],
					},
					operations: {
						pagination: ascSingleRequest,
					},
				},
			},
			{
				name: 'Delete Response',
				value: 'deleteResponse',
				action: 'Delete a customer review response',
				description: 'Permanently delete a developer response',
				routing: {
					request: {
						method: 'DELETE',
						url: '=/v1/customerReviewResponses/{{$parameter["responseId"]}}',
					},
					operations: {
						// Delete replies 204 No Content; emit an explicit
						// `{ deleted: true }` confirmation rather than an empty item.
						pagination: ascConfirmationRequest('deleted'),
					},
				},
			},
		],
		default: 'getMany',
	},
];

/**
 * Customer Reviews resource — fields.
 */
export const customerReviewFields: INodeProperties[] = [
	// --- Get Many: Return All / Limit ----------------------------------------
	// Read at runtime by `ascCursorPagination` to decide how far to follow
	// `links.next`. Identical mechanics to the Webhook resource's Get Many.
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		description: 'Whether to return all results or only up to a given limit',
		displayOptions: {
			show: {
				resource: ['customerReview'],
				operation: ['getMany'],
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
				resource: ['customerReview'],
				operation: ['getMany'],
				returnAll: [false],
			},
		},
	},

	// --- Get Many: which app -------------------------------------------------
	// Reuses `searchApps` verbatim (registered on the node as
	// `methods.listSearch.searchApps`) — every app-scoped resource shares it.
	{
		displayName: 'Target App',
		name: 'targetApp',
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		required: true,
		description: 'The app whose customer reviews to list',
		displayOptions: {
			show: {
				resource: ['customerReview'],
				operation: ['getMany'],
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

	// --- Get Many: curated typed filters (documented ASC `filter[...]` keys).
	//     Each is optional and skipped when blank; the generic Query Options
	//     collection below remains the escape hatch for anything not listed here.
	{
		displayName: 'Rating',
		name: 'filterRating',
		type: 'options',
		default: '',
		description: 'Only return reviews with this star rating (sent as `filter[rating]`)',
		options: [
			{ name: '1 Star', value: '1' },
			{ name: '2 Stars', value: '2' },
			{ name: '3 Stars', value: '3' },
			{ name: '4 Stars', value: '4' },
			{ name: '5 Stars', value: '5' },
			{ name: 'Any', value: '' },
		],
		displayOptions: {
			show: {
				resource: ['customerReview'],
				operation: ['getMany'],
			},
		},
	},
	{
		displayName: 'Territory',
		name: 'filterTerritory',
		type: 'string',
		default: '',
		placeholder: 'e.g. USA',
		description:
			'Only return reviews from this App Store territory, as a 3-letter code (sent as `filter[territory]`)',
		displayOptions: {
			show: {
				resource: ['customerReview'],
				operation: ['getMany'],
			},
		},
	},
	sortField(
		{
			show: {
				resource: ['customerReview'],
				operation: ['getMany'],
			},
		},
		[
			{ name: 'Created Date (Newest First)', value: '-createdDate' },
			{ name: 'Created Date (Oldest First)', value: 'createdDate' },
			{ name: 'Rating (High to Low)', value: '-rating' },
			{ name: 'Rating (Low to High)', value: 'rating' },
		],
	),

	// --- Get / Get Response / Create Response: which review ------------------
	{
		displayName: 'Review ID',
		name: 'reviewId',
		type: 'string',
		default: '',
		required: true,
		description: 'The ID of the customer review',
		displayOptions: {
			show: {
				resource: ['customerReview'],
				operation: ['get', 'getResponse'],
			},
		},
	},
	// Create Response's review is a *typed* field, so it hides when Input Mode
	// is JSON (the JSON body carries its own `review` relationship).
	{
		displayName: 'Review ID',
		name: 'reviewId',
		type: 'string',
		default: '',
		required: true,
		description: 'The ID of the customer review to respond to',
		displayOptions: {
			show: {
				resource: ['customerReview'],
				operation: ['createResponse'],
				inputMode: ['fields'],
			},
		},
	},

	// --- Update / Delete Response: which response ----------------------------
	{
		displayName: 'Response ID',
		name: 'responseId',
		type: 'string',
		default: '',
		required: true,
		description: 'The ID of the customer review response',
		displayOptions: {
			show: {
				resource: ['customerReview'],
				operation: ['updateResponse', 'deleteResponse'],
			},
		},
	},

	// --- Create / Update Response: Input Mode toggle + raw JSON body ---------
	...inputModeFields({
		show: {
			resource: ['customerReview'],
			operation: ['createResponse', 'updateResponse'],
		},
	}),

	// --- Create / Update Response: typed attributes (hidden in JSON mode) ----
	{
		displayName: 'Response Body',
		name: 'responseBody',
		type: 'string',
		typeOptions: {
			rows: 4,
		},
		default: '',
		required: true,
		description: 'The response text shown publicly beneath the review',
		displayOptions: {
			show: {
				resource: ['customerReview'],
				operation: ['createResponse', 'updateResponse'],
				inputMode: ['fields'],
			},
		},
	},

	// --- Reads: shared JSON:API Query Options --------------------------------
	queryOptionsCollection({
		show: {
			resource: ['customerReview'],
			operation: ['getMany', 'get', 'getResponse'],
		},
	}),

	// --- Reads: shared Simplify toggle ---------------------------------------
	// Flattens the JSON:API envelope for every read (Get Many via
	// `ascCursorPagination`, Get / Get Response via `ascSingleRequest`).
	simplifyField({
		show: {
			resource: ['customerReview'],
			operation: ['getMany', 'get', 'getResponse'],
		},
	}),
];
