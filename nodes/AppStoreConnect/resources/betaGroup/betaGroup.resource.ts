import type { INodeProperties } from 'n8n-workflow';

import { targetAppLocator } from '../_shared/appLocator';
import { inputModeFields } from '../_shared/inputMode';
import { attachSort, sortField, TRISTATE_OPTIONS } from '../_shared/listFilters';
import { attachQueryOptions, queryOptionsCollection } from '../_shared/queryOptions';
import { simplifyField } from '../_shared/simplify';
import { ascCursorPagination } from '../../transport/pagination';
import { ascConfirmationRequest, ascSingleRequest } from '../../transport/request';
import { attachBetaGroupBody, attachBetaGroupFilters } from './betaGroup.body';

/**
 * TestFlight Beta Groups resource — operations (roadmap Tier 1 #3).
 *
 * Manages the groups testers are organised into ("create an internal group",
 * "rename a group", "sync a public link"). Reuses the shipped spine:
 *   - **Get Many** (`GET /v1/betaGroups`) — a *top-level* collection, so the app
 *     is expressed as `filter[app]` via `attachBetaGroupFilters`; cursor paging
 *     via `ascCursorPagination` (Return All / Limit).
 *   - **Get** (`GET /v1/betaGroups/{id}`) — single read via `ascSingleRequest`.
 *   - **Create** (`POST /v1/betaGroups`), **Update**
 *     (`PATCH /v1/betaGroups/{id}`), **Delete** (`DELETE /v1/betaGroups/{id}`) —
 *     single writes via `ascSingleRequest`.
 *
 * Every read mounts the shared Query Options collection; Create/Update mount the
 * shared Input Mode group so both the typed UI and the raw-JSON escape hatch
 * flow through the same `ascSingleRequest` + module-D error mapper. The group
 * for Get/Update/Delete is chosen through the reusable `searchBetaGroups`
 * picker (`methods/betaGroups.ts`), the app through `searchApps`.
 */
export const betaGroupOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: {
				resource: ['betaGroup'],
			},
		},
		options: [
			{
				name: 'Get Many',
				value: 'getMany',
				action: 'Get many beta groups',
				description: 'Retrieve beta groups, optionally filtered by app',
				routing: {
					request: {
						method: 'GET',
						url: '/v1/betaGroups',
					},
					send: {
						// Curated filters + sort first, then the generic Query Options;
						// all only add `qs` keys, so they compose. Query Options runs
						// last so an advanced `filter[]`/`sort` there overrides the
						// convenience fields.
						preSend: [attachBetaGroupFilters, attachSort, attachQueryOptions],
					},
					operations: {
						pagination: ascCursorPagination,
					},
				},
			},
			{
				name: 'Get',
				value: 'get',
				action: 'Get a beta group',
				description: 'Retrieve a single beta group by ID',
				routing: {
					request: {
						method: 'GET',
						url: '=/v1/betaGroups/{{$parameter["betaGroup"]}}',
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
				name: 'Create',
				value: 'create',
				action: 'Create a beta group',
				description: 'Create a new beta group for an app',
				routing: {
					request: {
						method: 'POST',
						url: '/v1/betaGroups',
					},
					send: {
						preSend: [attachBetaGroupBody],
					},
					operations: {
						pagination: ascSingleRequest,
					},
				},
			},
			{
				name: 'Update',
				value: 'update',
				action: 'Update a beta group',
				description: "Update a beta group's name or public-link settings",
				routing: {
					request: {
						method: 'PATCH',
						url: '=/v1/betaGroups/{{$parameter["betaGroup"]}}',
					},
					send: {
						preSend: [attachBetaGroupBody],
					},
					operations: {
						pagination: ascSingleRequest,
					},
				},
			},
			{
				name: 'Delete',
				value: 'delete',
				action: 'Delete a beta group',
				description: 'Permanently delete a beta group',
				routing: {
					request: {
						method: 'DELETE',
						url: '=/v1/betaGroups/{{$parameter["betaGroup"]}}',
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

/** Reusable "Beta Group" resourceLocator (From List → `searchBetaGroups`, or ID). */
const betaGroupLocator = (operations: string[]): INodeProperties => ({
	displayName: 'Beta Group',
	name: 'betaGroup',
	type: 'resourceLocator',
	default: { mode: 'list', value: '' },
	required: true,
	description: 'The beta group to act on',
	displayOptions: {
		show: {
			resource: ['betaGroup'],
			operation: operations,
		},
	},
	modes: [
		{
			displayName: 'From List',
			name: 'list',
			type: 'list',
			typeOptions: {
				searchListMethod: 'searchBetaGroups',
				searchable: true,
			},
		},
		{
			displayName: 'ID',
			name: 'id',
			type: 'string',
			placeholder: 'e.g. 12a34b56-...',
		},
	],
});

/**
 * Beta Groups resource — fields.
 */
export const betaGroupFields: INodeProperties[] = [
	// --- Get Many: Return All / Limit ----------------------------------------
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		description: 'Whether to return all results or only up to a given limit',
		displayOptions: {
			show: {
				resource: ['betaGroup'],
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
				resource: ['betaGroup'],
				operation: ['getMany'],
				returnAll: [false],
			},
		},
	},

	// --- Get / Update / Delete: optional app scope to narrow the group picker,
	//     then which group. The Target App only filters the "From List" dropdown
	//     (via `searchBetaGroups` → `filter[app]`); the request itself is still a
	//     single Get/Update/Delete keyed off the chosen Beta Group id.
	targetAppLocator(
		{
			show: {
				resource: ['betaGroup'],
				operation: ['get', 'update', 'delete'],
			},
		},
		{
			description:
				'Narrows the "From List" beta-group picker below to a single app; does not change which group is acted on',
		},
	),
	betaGroupLocator(['get', 'update', 'delete']),

	// --- Get Many: optional app filter, and Create: the app the group belongs
	//     to. Both reuse `searchApps` (registered as
	//     `methods.listSearch.searchApps`). Required on Create, optional on Get
	//     Many, so two locators with different `required`/description.
	{
		displayName: 'Target App',
		name: 'targetApp',
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		description: 'Only return groups belonging to this app (sent as `filter[app]`)',
		displayOptions: {
			show: {
				resource: ['betaGroup'],
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
		displayName: 'Name',
		name: 'filterName',
		type: 'string',
		default: '',
		description: 'Only return groups with this exact name (sent as `filter[name]`)',
		displayOptions: {
			show: {
				resource: ['betaGroup'],
				operation: ['getMany'],
			},
		},
	},
	{
		displayName: 'Is Internal Group',
		name: 'filterIsInternalGroup',
		type: 'options',
		default: '',
		description: 'Whether to return only internal or only external groups (sent as `filter[isInternalGroup]`)',
		options: TRISTATE_OPTIONS,
		displayOptions: {
			show: {
				resource: ['betaGroup'],
				operation: ['getMany'],
			},
		},
	},
	{
		displayName: 'Public Link Enabled',
		name: 'filterPublicLinkEnabled',
		type: 'options',
		default: '',
		description: 'Whether to return only groups with a public link enabled or disabled (sent as `filter[publicLinkEnabled]`)',
		options: TRISTATE_OPTIONS,
		displayOptions: {
			show: {
				resource: ['betaGroup'],
				operation: ['getMany'],
			},
		},
	},
	sortField(
		{
			show: {
				resource: ['betaGroup'],
				operation: ['getMany'],
			},
		},
		[
			{ name: 'Name (A→Z)', value: 'name' },
			{ name: 'Name (Z→A)', value: '-name' },
			{ name: 'Public Link Limit (Ascending)', value: 'publicLinkLimit' },
			{ name: 'Public Link Limit (Descending)', value: '-publicLinkLimit' },
		],
	),
	{
		displayName: 'Target App',
		name: 'targetApp',
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		required: true,
		description: 'The app this beta group belongs to',
		displayOptions: {
			show: {
				resource: ['betaGroup'],
				operation: ['create'],
				inputMode: ['fields'],
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

	// --- Create / Update: Input Mode toggle + raw JSON body ------------------
	...inputModeFields({
		show: {
			resource: ['betaGroup'],
			operation: ['create', 'update'],
		},
	}),

	// --- Create: required name (hidden in JSON mode) -------------------------
	{
		displayName: 'Name',
		name: 'name',
		type: 'string',
		default: '',
		required: true,
		description: 'A display name for the beta group',
		displayOptions: {
			show: {
				resource: ['betaGroup'],
				operation: ['create'],
				inputMode: ['fields'],
			},
		},
	},

	// --- Create: optional attributes -----------------------------------------
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: {
			show: {
				resource: ['betaGroup'],
				operation: ['create'],
				inputMode: ['fields'],
			},
		},
		options: [
			{
				displayName: 'Feedback Enabled',
				name: 'feedbackEnabled',
				type: 'boolean',
				default: true,
				description: 'Whether testers in this group can submit TestFlight feedback',
			},
			{
				displayName: 'Public Link Enabled',
				name: 'publicLinkEnabled',
				type: 'boolean',
				default: false,
				description: 'Whether to enable a public TestFlight invite link for the group',
			},
			{
				displayName: 'Public Link Limit',
				name: 'publicLinkLimit',
				type: 'number',
				default: 10000,
				typeOptions: {
					minValue: 1,
				},
				description: 'Maximum number of testers who can join via the public link',
			},
			{
				displayName: 'Public Link Limit Enabled',
				name: 'publicLinkLimitEnabled',
				type: 'boolean',
				default: false,
				description: 'Whether to cap how many testers can join via the public link',
			},
		],
	},

	// --- Update: typed attributes (all optional, hidden in JSON mode) --------
	{
		displayName: 'Update Fields',
		name: 'updateFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: {
			show: {
				resource: ['betaGroup'],
				operation: ['update'],
				inputMode: ['fields'],
			},
		},
		options: [
			{
				displayName: 'Feedback Enabled',
				name: 'feedbackEnabled',
				type: 'boolean',
				default: true,
				description: 'Whether testers in this group can submit TestFlight feedback',
			},
			{
				displayName: 'Name',
				name: 'name',
				type: 'string',
				default: '',
				description: 'A display name for the beta group',
			},
			{
				displayName: 'Public Link Enabled',
				name: 'publicLinkEnabled',
				type: 'boolean',
				default: false,
				description: 'Whether to enable a public TestFlight invite link for the group',
			},
			{
				displayName: 'Public Link Limit',
				name: 'publicLinkLimit',
				type: 'number',
				default: 10000,
				typeOptions: {
					minValue: 1,
				},
				description: 'Maximum number of testers who can join via the public link',
			},
			{
				displayName: 'Public Link Limit Enabled',
				name: 'publicLinkLimitEnabled',
				type: 'boolean',
				default: false,
				description: 'Whether to cap how many testers can join via the public link',
			},
		],
	},

	// --- Reads: shared JSON:API Query Options --------------------------------
	queryOptionsCollection({
		show: {
			resource: ['betaGroup'],
			operation: ['getMany', 'get'],
		},
	}),

	// --- Reads: shared Simplify toggle ---------------------------------------
	// Flattens the JSON:API envelope for every read (Get Many via
	// `ascCursorPagination`, Get via `ascSingleRequest`).
	simplifyField({
		show: {
			resource: ['betaGroup'],
			operation: ['getMany', 'get'],
		},
	}),
];
