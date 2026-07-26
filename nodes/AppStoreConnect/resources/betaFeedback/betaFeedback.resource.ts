import type { INodeProperties } from 'n8n-workflow';

import { attachSort, sortField } from '../_shared/listFilters';
import { attachQueryOptions, queryOptionsCollection } from '../_shared/queryOptions';
import { simplifyField } from '../_shared/simplify';
import { ascCursorPagination } from '../../transport/pagination';
import { ascConfirmationRequest, ascSingleRequest } from '../../transport/request';
import { attachBetaFeedbackFilters } from './betaFeedback.body';
import {
	BETA_FEEDBACK_CRASH_RESOURCE_TYPE,
	BETA_FEEDBACK_SCREENSHOT_RESOURCE_TYPE,
} from './betaFeedback.constants';

/**
 * Beta Feedback resource — operations (roadmap Tier 2 #6).
 *
 * The **read side** of TestFlight beta feedback, closing the loop with the
 * already-shipped Trigger events `betaFeedbackCrashSubmissionCreated` /
 * `betaFeedbackScreenshotSubmissionCreated`: the webhook fires → this resource
 * fetches the submission detail (including the crash log / screenshot asset
 * references) → file a ticket.
 *
 * Feedback comes in two kinds — **crash** and **screenshot** — which live at
 * parallel endpoints (`betaFeedbackCrashSubmissions` vs
 * `betaFeedbackScreenshotSubmissions`). Rather than doubling every operation, a
 * single **Feedback Type** selector supplies the path segment (its option value
 * *is* the JSON:API resource-type / URL segment string), so one set of
 * operations serves both kinds and the chosen type flows straight into the
 * declarative URL expression.
 *
 * Read-dominant; reuses the shipped spine wholesale:
 *   - **Get Many** (`GET /v1/apps/{id}/betaFeedback{Crash,Screenshot}Submissions`)
 *     — app-scoped, so it reuses `searchApps` for the app picker and
 *     `ascCursorPagination` for Return All / Limit paging.
 *   - **Get** (`GET /v1/betaFeedback{...}Submissions/{id}`) — single read via
 *     `ascSingleRequest`.
 *   - **Delete** (`DELETE /v1/betaFeedback{...}Submissions/{id}`) — single
 *     request via `ascSingleRequest`. No body, so no Input Mode is needed.
 *
 * Every read mounts the shared Query Options collection (`attachQueryOptions`
 * folds sparse fieldsets / include / filter / sort / limit into `qs`) — e.g.
 * `fields[...]` to trim the response or `include`/sort to shape it. The crash
 * log (`attributes.crashLog`) and screenshot assets (`attributes.screenshots`)
 * ride along in each item's `attributes` untouched, so downstream nodes can read
 * the asset URLs directly.
 */
export const betaFeedbackOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: {
				resource: ['betaFeedback'],
			},
		},
		options: [
			{
				name: 'Get Many',
				value: 'getMany',
				action: 'Get many beta feedback submissions',
				description: "Retrieve an app's TestFlight beta crash or screenshot feedback",
				routing: {
					request: {
						method: 'GET',
						url: '=/v1/apps/{{$parameter["targetApp"]}}/{{$parameter["feedbackType"]}}',
					},
					send: {
						// Curated filters + sort first, then the generic Query Options;
						// all only add `qs` keys, so they compose. Query Options runs
						// last so an advanced `filter[]`/`sort` there overrides the
						// convenience fields.
						preSend: [attachBetaFeedbackFilters, attachSort, attachQueryOptions],
					},
					operations: {
						pagination: ascCursorPagination,
					},
				},
			},
			{
				name: 'Get',
				value: 'get',
				action: 'Get beta feedback submission',
				description: 'Retrieve a single beta feedback submission by ID',
				routing: {
					request: {
						method: 'GET',
						url: '=/v1/{{$parameter["feedbackType"]}}/{{$parameter["feedbackId"]}}',
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
				name: 'Delete',
				value: 'delete',
				action: 'Delete beta feedback submission',
				description: 'Permanently delete a beta feedback submission',
				routing: {
					request: {
						method: 'DELETE',
						url: '=/v1/{{$parameter["feedbackType"]}}/{{$parameter["feedbackId"]}}',
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
 * Beta Feedback resource — fields.
 */
export const betaFeedbackFields: INodeProperties[] = [
	// --- Feedback Type: crash vs screenshot ----------------------------------
	// Shown for every operation. Its value is the JSON:API resource type / URL
	// path segment, so the declarative URL expressions above interpolate it
	// directly to hit the matching endpoint.
	{
		displayName: 'Feedback Type',
		name: 'feedbackType',
		type: 'options',
		noDataExpression: true,
		default: BETA_FEEDBACK_CRASH_RESOURCE_TYPE,
		description: 'Which kind of TestFlight beta feedback to operate on',
		displayOptions: {
			show: {
				resource: ['betaFeedback'],
			},
		},
		options: [
			{
				name: 'Crash',
				value: BETA_FEEDBACK_CRASH_RESOURCE_TYPE,
				description: 'Crash submissions (pairs with the betaFeedbackCrashSubmissionCreated webhook)',
			},
			{
				name: 'Screenshot',
				value: BETA_FEEDBACK_SCREENSHOT_RESOURCE_TYPE,
				description:
					'Screenshot submissions (pairs with the betaFeedbackScreenshotSubmissionCreated webhook)',
			},
		],
	},

	// --- Get Many: Return All / Limit ----------------------------------------
	// Read at runtime by `ascCursorPagination` to decide how far to follow
	// `links.next`. Identical mechanics to the other resources' Get Many.
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		description: 'Whether to return all results or only up to a given limit',
		displayOptions: {
			show: {
				resource: ['betaFeedback'],
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
				resource: ['betaFeedback'],
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
		description: 'The app whose beta feedback to list',
		displayOptions: {
			show: {
				resource: ['betaFeedback'],
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
	//     Verified against the ASC OpenAPI spec (v4.3): the crash and screenshot
	//     collections share the same filter set. Each is optional and skipped when
	//     blank; the generic Query Options collection below remains the escape
	//     hatch for anything not listed here.
	{
		displayName: 'Device Platform',
		name: 'filterDevicePlatform',
		type: 'options',
		default: '',
		description:
			'Only return feedback from this device platform (sent as `filter[devicePlatform]`)',
		options: [
			{ name: 'Any', value: '' },
			{ name: 'iOS', value: 'IOS' },
			{ name: 'macOS', value: 'MAC_OS' },
			{ name: 'tvOS', value: 'TV_OS' },
			{ name: 'visionOS', value: 'VISION_OS' },
		],
		displayOptions: {
			show: {
				resource: ['betaFeedback'],
				operation: ['getMany'],
			},
		},
	},
	{
		displayName: 'App Platform',
		name: 'filterAppPlatform',
		type: 'options',
		default: '',
		description: 'Only return feedback for this app platform (sent as `filter[appPlatform]`)',
		options: [
			{ name: 'Any', value: '' },
			{ name: 'iOS', value: 'IOS' },
			{ name: 'macOS', value: 'MAC_OS' },
			{ name: 'tvOS', value: 'TV_OS' },
			{ name: 'visionOS', value: 'VISION_OS' },
		],
		displayOptions: {
			show: {
				resource: ['betaFeedback'],
				operation: ['getMany'],
			},
		},
	},
	{
		displayName: 'Device Model',
		name: 'filterDeviceModel',
		type: 'string',
		default: '',
		placeholder: 'e.g. iPhone14,3',
		description: 'Only return feedback from this device model (sent as `filter[deviceModel]`)',
		displayOptions: {
			show: {
				resource: ['betaFeedback'],
				operation: ['getMany'],
			},
		},
	},
	{
		displayName: 'OS Version',
		name: 'filterOsVersion',
		type: 'string',
		default: '',
		placeholder: 'e.g. 17.5.1',
		description: 'Only return feedback from this OS version (sent as `filter[osVersion]`)',
		displayOptions: {
			show: {
				resource: ['betaFeedback'],
				operation: ['getMany'],
			},
		},
	},
	{
		displayName: 'Build ID',
		name: 'filterBuild',
		type: 'string',
		default: '',
		placeholder: 'e.g. 1234567890',
		description: 'Only return feedback for this build, by build ID (sent as `filter[build]`)',
		displayOptions: {
			show: {
				resource: ['betaFeedback'],
				operation: ['getMany'],
			},
		},
	},
	sortField(
		{
			show: {
				resource: ['betaFeedback'],
				operation: ['getMany'],
			},
		},
		[
			{ name: 'Created Date (Newest First)', value: '-createdDate' },
			{ name: 'Created Date (Oldest First)', value: 'createdDate' },
		],
	),

	// --- Get / Delete: which submission --------------------------------------
	{
		displayName: 'Feedback ID',
		name: 'feedbackId',
		type: 'string',
		default: '',
		required: true,
		description: 'The ID of the beta feedback submission',
		displayOptions: {
			show: {
				resource: ['betaFeedback'],
				operation: ['get', 'delete'],
			},
		},
	},

	// --- Reads: shared JSON:API Query Options --------------------------------
	queryOptionsCollection({
		show: {
			resource: ['betaFeedback'],
			operation: ['getMany', 'get'],
		},
	}),

	// --- Reads: shared Simplify toggle ---------------------------------------
	// Flattens the JSON:API envelope for every read (Get Many via
	// `ascCursorPagination`, Get via `ascSingleRequest`).
	simplifyField({
		show: {
			resource: ['betaFeedback'],
			operation: ['getMany', 'get'],
		},
	}),
];
