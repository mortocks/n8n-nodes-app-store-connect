import type { INodeProperties } from 'n8n-workflow';

import { inputModeFields } from '../_shared/inputMode';
import { attachSort, sortField, TRISTATE_OPTIONS } from '../_shared/listFilters';
import { attachQueryOptions, queryOptionsCollection } from '../_shared/queryOptions';
import { simplifyField } from '../_shared/simplify';
import { ascCursorPagination } from '../../transport/pagination';
import { ascSingleRequest } from '../../transport/request';
import { attachBuildFilters, attachBuildUpdateBody } from './build.body';

/**
 * Builds resource — operations (roadmap Tier 1 #2).
 *
 * The foundation for CI/CD and TestFlight automation ("wait until a build
 * finishes processing", "get the latest build number", "expire old builds"). It
 * reuses the shipped spine:
 *   - **Get Many** (`GET /v1/builds`) — a *top-level* collection (not
 *     app-scoped), so app/version/processingState/preReleaseVersion are
 *     expressed as `filter[...]` params via `attachBuildFilters`; cursor paging
 *     via `ascCursorPagination` (Return All / Limit).
 *   - **Get** (`GET /v1/builds/{id}`) and **Get Beta Detail**
 *     (`GET /v1/builds/{id}/buildBetaDetail`) — single reads via
 *     `ascSingleRequest`.
 *   - **Update** (`PATCH /v1/builds/{id}`) — expire a build /
 *     set `usesNonExemptEncryption`, via `attachBuildUpdateBody`.
 *
 * Every read mounts the shared Query Options collection (`attachQueryOptions`
 * folds sparse fieldsets / include / filter / sort / limit into `qs`). The
 * Update mounts the shared Input Mode group so both the typed UI and the
 * raw-JSON escape hatch flow through the same `ascSingleRequest` + module-D
 * error mapper.
 */
export const buildOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: {
				resource: ['build'],
			},
		},
		options: [
			{
				name: 'Get Many',
				value: 'getMany',
				action: 'Get many builds',
				description: 'Retrieve builds, optionally filtered by app, version, or processing state',
				routing: {
					request: {
						method: 'GET',
						url: '/v1/builds',
					},
					send: {
						// Convenience filters + sort first, then the generic Query
						// Options; all only add `qs` keys, so they compose. Query Options
						// runs last so an advanced `filter[]`/`sort` there overrides the
						// convenience fields.
						preSend: [attachBuildFilters, attachSort, attachQueryOptions],
					},
					operations: {
						pagination: ascCursorPagination,
					},
				},
			},
			{
				name: 'Get',
				value: 'get',
				action: 'Get a build',
				description: 'Retrieve a single build by ID',
				routing: {
					request: {
						method: 'GET',
						url: '=/v1/builds/{{$parameter["buildId"]}}',
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
				name: 'Get Beta Detail',
				value: 'getBetaDetail',
				action: 'Get a build beta detail',
				description: "Retrieve a build's TestFlight beta detail (external build state)",
				routing: {
					request: {
						method: 'GET',
						url: '=/v1/builds/{{$parameter["buildId"]}}/buildBetaDetail',
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
				name: 'Update',
				value: 'update',
				action: 'Update a build',
				description: 'Expire a build or set its non-exempt encryption declaration',
				routing: {
					request: {
						method: 'PATCH',
						url: '=/v1/builds/{{$parameter["buildId"]}}',
					},
					send: {
						preSend: [attachBuildUpdateBody],
					},
					operations: {
						pagination: ascSingleRequest,
					},
				},
			},
		],
		default: 'getMany',
	},
];

/**
 * Builds resource — fields.
 */
export const buildFields: INodeProperties[] = [
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
				resource: ['build'],
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
				resource: ['build'],
				operation: ['getMany'],
				returnAll: [false],
			},
		},
	},

	// --- Get Many: curated convenience filters -------------------------------
	// Each folds into a JSON:API `filter[...]` param via `attachBuildFilters`.
	// All optional: an unset filter is simply omitted from the query string.
	// The app picker reuses `searchApps` (registered as
	// `methods.listSearch.searchApps`), shared with every app-scoped resource.
	{
		displayName: 'Target App',
		name: 'targetApp',
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		description: 'Only return builds belonging to this app (sent as `filter[app]`)',
		displayOptions: {
			show: {
				resource: ['build'],
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
	{
		displayName: 'Version',
		name: 'filterVersion',
		type: 'string',
		default: '',
		placeholder: 'e.g. 1024',
		description: 'Only return builds with this build number (sent as `filter[version]`)',
		displayOptions: {
			show: {
				resource: ['build'],
				operation: ['getMany'],
			},
		},
	},
	{
		displayName: 'Processing State',
		name: 'filterProcessingState',
		type: 'options',
		default: '',
		description: 'Only return builds in this processing state (sent as `filter[processingState]`)',
		displayOptions: {
			show: {
				resource: ['build'],
				operation: ['getMany'],
			},
		},
		options: [
			{ name: 'Any', value: '' },
			{ name: 'Failed', value: 'FAILED' },
			{ name: 'Invalid', value: 'INVALID' },
			{ name: 'Processing', value: 'PROCESSING' },
			{ name: 'Valid', value: 'VALID' },
		],
	},
	{
		displayName: 'Pre-Release Version ID',
		name: 'filterPreReleaseVersion',
		type: 'string',
		default: '',
		placeholder: 'e.g. 12a34b56-...',
		description:
			'Only return builds belonging to this pre-release version (sent as `filter[preReleaseVersion]`)',
		displayOptions: {
			show: {
				resource: ['build'],
				operation: ['getMany'],
			},
		},
	},
	{
		displayName: 'Expired',
		name: 'filterExpired',
		type: 'options',
		default: '',
		description:
			'Whether to return only expired or only non-expired builds (sent as `filter[expired]`)',
		options: TRISTATE_OPTIONS,
		displayOptions: {
			show: {
				resource: ['build'],
				operation: ['getMany'],
			},
		},
	},
	sortField(
		{
			show: {
				resource: ['build'],
				operation: ['getMany'],
			},
		},
		[
			{ name: 'Pre-Release Version (A→Z)', value: 'preReleaseVersion' },
			{ name: 'Pre-Release Version (Z→A)', value: '-preReleaseVersion' },
			{ name: 'Uploaded Date (Newest First)', value: '-uploadedDate' },
			{ name: 'Uploaded Date (Oldest First)', value: 'uploadedDate' },
			{ name: 'Version (Ascending)', value: 'version' },
			{ name: 'Version (Descending)', value: '-version' },
		],
	),

	// --- Get / Get Beta Detail / Update: which build -------------------------
	// Used both in the request URL and (for Update) echoed into `data.id`, so it
	// shows regardless of Input Mode.
	{
		displayName: 'Build ID',
		name: 'buildId',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. 12a34b56-...',
		description: 'The ID of the build',
		displayOptions: {
			show: {
				resource: ['build'],
				operation: ['get', 'getBetaDetail', 'update'],
			},
		},
	},

	// --- Update: Input Mode toggle + raw JSON body ---------------------------
	...inputModeFields({
		show: {
			resource: ['build'],
			operation: ['update'],
		},
	}),

	// --- Update: typed attributes (hidden in JSON mode) ----------------------
	// A collection so each attribute is optional and independently settable — a
	// PATCH only carries the attributes the user actually added.
	{
		displayName: 'Update Fields',
		name: 'updateFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: {
			show: {
				resource: ['build'],
				operation: ['update'],
				inputMode: ['fields'],
			},
		},
		options: [
			{
				displayName: 'Expired',
				name: 'expired',
				type: 'boolean',
				default: false,
				description: 'Whether to mark the build as expired (expire an old build)',
			},
			{
				displayName: 'Uses Non-Exempt Encryption',
				name: 'usesNonExemptEncryption',
				type: 'boolean',
				default: false,
				description:
					'Whether to declare that the build uses non-exempt encryption (export-compliance)',
			},
		],
	},

	// --- Reads: shared JSON:API Query Options --------------------------------
	queryOptionsCollection({
		show: {
			resource: ['build'],
			operation: ['getMany', 'get', 'getBetaDetail'],
		},
	}),

	// --- Reads: shared Simplify toggle ---------------------------------------
	// Flattens the JSON:API envelope for every read (Get Many via
	// `ascCursorPagination`, Get / Get Beta Detail via `ascSingleRequest`).
	simplifyField({
		show: {
			resource: ['build'],
			operation: ['getMany', 'get', 'getBetaDetail'],
		},
	}),
];
