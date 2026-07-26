import type { INodeProperties } from 'n8n-workflow';

import { inputModeFields } from '../_shared/inputMode';
import { attachSort, sortField } from '../_shared/listFilters';
import { attachQueryOptions, queryOptionsCollection } from '../_shared/queryOptions';
import { simplifyField } from '../_shared/simplify';
import { ascCursorPagination } from '../../transport/pagination';
import { ascSingleRequest } from '../../transport/request';
import { attachAppFilters, attachAppInfoLocalizationUpdateBody } from './app.body';

/**
 * Apps & App Info resource — operations (roadmap Tier 2 #5).
 *
 * Surfaces the caller's apps as first-class metadata reads plus the one
 * writable localization sub-resource, all reusing the shipped spine:
 *   - **Get Many** (`GET /v1/apps`) — a top-level collection, so cursor paging
 *     via `ascCursorPagination` (Return All / Limit) with the shared Query
 *     Options collection for filters / includes / sparse fieldsets.
 *   - **Get** (`GET /v1/apps/{id}`) — a single app read via `ascSingleRequest`,
 *     picked with the shared `searchApps` resourceLocator.
 *   - **Get App Info** (`GET /v1/apps/{id}/appInfos`) — the per-app metadata
 *     container(s); a small app-scoped list returned in one response, so it also
 *     goes through `ascSingleRequest`.
 *   - **Update App Info Localization** (`PATCH /v1/appInfoLocalizations/{id}`) —
 *     edit the per-locale App Store metadata (name, subtitle, privacy policy).
 *
 * Every read mounts the shared Query Options collection (`attachQueryOptions`
 * folds sparse fieldsets / include / filter / sort / limit into `qs`). The
 * localization Update mounts the shared Input Mode group so both the typed UI
 * and the raw-JSON escape hatch flow through the same `ascSingleRequest` +
 * module-D error mapper. The app picker (`searchApps`) already exists, so this
 * resource is cheap — see `docs/apple-api-notes.md` → "Apps (for the picker)".
 */
export const appOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: {
				resource: ['app'],
			},
		},
		options: [
			{
				name: 'Get Many',
				value: 'getMany',
				action: 'Get many apps',
				description: 'Retrieve the apps in your App Store Connect account',
				routing: {
					request: {
						method: 'GET',
						url: '/v1/apps',
					},
					send: {
						// Curated filters + sort first, then the generic Query Options;
						// all only add `qs` keys, so they compose. Query Options runs
						// last so an advanced `filter[]`/`sort` there overrides the
						// convenience fields.
						preSend: [attachAppFilters, attachSort, attachQueryOptions],
					},
					operations: {
						pagination: ascCursorPagination,
					},
				},
			},
			{
				name: 'Get',
				value: 'get',
				action: 'Get app',
				description: 'Retrieve a single app by ID',
				routing: {
					request: {
						method: 'GET',
						url: '=/v1/apps/{{$parameter["targetApp"]}}',
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
				name: 'Get App Info',
				value: 'getAppInfo',
				action: 'Get app info',
				description: "Retrieve an app's App Info records (metadata, localizations, categories)",
				routing: {
					request: {
						method: 'GET',
						url: '=/v1/apps/{{$parameter["targetApp"]}}/appInfos',
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
				name: 'Update App Info Localization',
				value: 'updateAppInfoLocalization',
				action: 'Update app info localization',
				description: 'Edit the per-locale App Store metadata (name, subtitle, privacy policy)',
				routing: {
					request: {
						method: 'PATCH',
						url: '=/v1/appInfoLocalizations/{{$parameter["localizationId"]}}',
					},
					send: {
						preSend: [attachAppInfoLocalizationUpdateBody],
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
 * Apps & App Info resource — fields.
 */
export const appFields: INodeProperties[] = [
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
				resource: ['app'],
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
				resource: ['app'],
				operation: ['getMany'],
				returnAll: [false],
			},
		},
	},

	// --- Get Many: curated typed filters (documented ASC `filter[...]` keys).
	//     Verified against the ASC OpenAPI spec (v4.3). Each is optional and
	//     skipped when blank; the generic Query Options collection below remains
	//     the escape hatch for anything not listed here.
	{
		displayName: 'Bundle ID',
		name: 'filterBundleId',
		type: 'string',
		default: '',
		placeholder: 'e.g. com.example.app',
		description: 'Only return the app with this exact bundle ID (sent as `filter[bundleId]`)',
		displayOptions: {
			show: {
				resource: ['app'],
				operation: ['getMany'],
			},
		},
	},
	{
		displayName: 'Name',
		name: 'filterName',
		type: 'string',
		default: '',
		description: 'Only return apps whose name matches (sent as `filter[name]`)',
		displayOptions: {
			show: {
				resource: ['app'],
				operation: ['getMany'],
			},
		},
	},
	{
		displayName: 'SKU',
		name: 'filterSku',
		type: 'string',
		default: '',
		description: 'Only return the app with this exact SKU (sent as `filter[sku]`)',
		displayOptions: {
			show: {
				resource: ['app'],
				operation: ['getMany'],
			},
		},
	},
	sortField(
		{
			show: {
				resource: ['app'],
				operation: ['getMany'],
			},
		},
		[
			{ name: 'Bundle ID (A→Z)', value: 'bundleId' },
			{ name: 'Bundle ID (Z→A)', value: '-bundleId' },
			{ name: 'Name (A→Z)', value: 'name' },
			{ name: 'Name (Z→A)', value: '-name' },
			{ name: 'SKU (A→Z)', value: 'sku' },
			{ name: 'SKU (Z→A)', value: '-sku' },
		],
	),

	// --- Get / Get App Info: which app ---------------------------------------
	// Reuses `searchApps` verbatim (registered on the node as
	// `methods.listSearch.searchApps`) — every app-scoped resource shares it.
	{
		displayName: 'App',
		name: 'targetApp',
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		required: true,
		description: 'The app to read',
		displayOptions: {
			show: {
				resource: ['app'],
				operation: ['get', 'getAppInfo'],
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

	// --- Update App Info Localization: which localization --------------------
	// Used both in the request URL and echoed into `data.id`, so it shows
	// regardless of Input Mode.
	{
		displayName: 'Localization ID',
		name: 'localizationId',
		type: 'string',
		default: '',
		required: true,
		description: 'The ID of the app info localization to update',
		displayOptions: {
			show: {
				resource: ['app'],
				operation: ['updateAppInfoLocalization'],
			},
		},
	},

	// --- Update App Info Localization: Input Mode toggle + raw JSON body ------
	...inputModeFields({
		show: {
			resource: ['app'],
			operation: ['updateAppInfoLocalization'],
		},
	}),

	// --- Update App Info Localization: typed attributes (hidden in JSON mode) -
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
				resource: ['app'],
				operation: ['updateAppInfoLocalization'],
				inputMode: ['fields'],
			},
		},
		options: [
			{
				displayName: 'Name',
				name: 'name',
				type: 'string',
				default: '',
				description: 'The app name shown on the App Store for this locale',
			},
			{
				displayName: 'Privacy Choices URL',
				name: 'privacyChoicesUrl',
				type: 'string',
				default: '',
				description: 'Link to the privacy choices page for this locale',
			},
			{
				displayName: 'Privacy Policy Text',
				name: 'privacyPolicyText',
				type: 'string',
				typeOptions: {
					rows: 4,
				},
				default: '',
				description: 'Privacy policy text (used by Apple TV apps) for this locale',
			},
			{
				displayName: 'Privacy Policy URL',
				name: 'privacyPolicyUrl',
				type: 'string',
				default: '',
				description: 'Link to the privacy policy for this locale',
			},
			{
				displayName: 'Subtitle',
				name: 'subtitle',
				type: 'string',
				default: '',
				description: 'The app subtitle shown beneath the name for this locale',
			},
		],
	},

	// --- Reads: shared JSON:API Query Options --------------------------------
	queryOptionsCollection({
		show: {
			resource: ['app'],
			operation: ['getMany', 'get', 'getAppInfo'],
		},
	}),

	// --- Reads: shared Simplify toggle ---------------------------------------
	// Flattens the JSON:API envelope for every read (Get Many via
	// `ascCursorPagination`, Get / Get App Info via `ascSingleRequest`).
	simplifyField({
		show: {
			resource: ['app'],
			operation: ['getMany', 'get', 'getAppInfo'],
		},
	}),
];
