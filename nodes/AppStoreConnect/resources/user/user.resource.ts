import type { INodeProperties } from 'n8n-workflow';

import { inputModeFields } from '../_shared/inputMode';
import { attachSort, sortField } from '../_shared/listFilters';
import { attachQueryOptions, queryOptionsCollection } from '../_shared/queryOptions';
import { simplifyField } from '../_shared/simplify';
import { ascCursorPagination } from '../../transport/pagination';
import { ascConfirmationRequest, ascSingleRequest } from '../../transport/request';
import { attachUserBody, attachUserFilters } from './user.body';

/**
 * Users resource — operations (roadmap Tier 2 #8, "Users & Access").
 *
 * Team onboarding/offboarding automation over the account's members. Users are
 * **not** app-scoped, so there is no app picker — a `users` collection at the
 * top level plus per-user reads and writes, all reusing the shipped spine:
 *   - **Get Many** (`GET /v1/users`) — cursor paging via `ascCursorPagination`
 *     (Return All / Limit).
 *   - **Get** (`GET /v1/users/{id}`) — single read via `ascSingleRequest`.
 *   - **Update Roles** (`PATCH /v1/users/{id}`) — single write via
 *     `ascSingleRequest`; the typed path offers a Roles multi-select
 *     (`getUserRoles` loadOptions).
 *   - **Remove** (`DELETE /v1/users/{id}`) — single write via `ascSingleRequest`.
 *
 * Every read mounts the shared Query Options collection; Update Roles mounts the
 * shared Input Mode group so both the typed UI and the raw-JSON escape hatch
 * flow through the same `ascSingleRequest` + module-D error mapper.
 *
 * **HITL:** removing a user and changing roles are outward-facing production
 * actions affecting real people — verify deliberately, never by firing at real
 * accounts from an agent (see `docs/issues/13-users-access.md`).
 */
export const userOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: {
				resource: ['user'],
			},
		},
		options: [
			{
				name: 'Get Many',
				value: 'getMany',
				action: 'Get many users',
				description: 'Retrieve the users on the App Store Connect team',
				routing: {
					request: {
						method: 'GET',
						url: '/v1/users',
					},
					send: {
						// Curated filters + sort first, then the generic Query Options;
						// all only add `qs` keys, so they compose. Query Options runs
						// last so an advanced `filter[]`/`sort` there overrides the
						// convenience fields.
						preSend: [attachUserFilters, attachSort, attachQueryOptions],
					},
					operations: {
						pagination: ascCursorPagination,
					},
				},
			},
			{
				name: 'Get',
				value: 'get',
				action: 'Get a user',
				description: 'Retrieve a single user by ID',
				routing: {
					request: {
						method: 'GET',
						url: '=/v1/users/{{$parameter["userId"]}}',
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
				name: 'Update Roles',
				value: 'updateRoles',
				action: 'Update user roles',
				description: "Change a user's roles and visibility",
				routing: {
					request: {
						method: 'PATCH',
						url: '=/v1/users/{{$parameter["userId"]}}',
					},
					send: {
						preSend: [attachUserBody],
					},
					operations: {
						pagination: ascSingleRequest,
					},
				},
			},
			{
				name: 'Remove',
				value: 'remove',
				action: 'Remove a user',
				description: 'Permanently remove a user from the team',
				routing: {
					request: {
						method: 'DELETE',
						url: '=/v1/users/{{$parameter["userId"]}}',
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
 * Users resource — fields.
 */
export const userFields: INodeProperties[] = [
	// --- Get Many: Return All / Limit ----------------------------------------
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		description: 'Whether to return all results or only up to a given limit',
		displayOptions: {
			show: {
				resource: ['user'],
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
				resource: ['user'],
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
		displayName: 'Username',
		name: 'filterUsername',
		type: 'string',
		default: '',
		placeholder: 'e.g. jane@example.com',
		description: 'Only return the user with this exact username (sent as `filter[username]`)',
		displayOptions: {
			show: {
				resource: ['user'],
				operation: ['getMany'],
			},
		},
	},
	{
		displayName: 'Role Names or IDs',
		name: 'filterRoles',
		type: 'multiOptions',
		typeOptions: {
			loadOptionsMethod: 'getUserRoles',
		},
		default: [],
		description:
			'Only return users with any of these roles (sent as `filter[roles]`). Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		displayOptions: {
			show: {
				resource: ['user'],
				operation: ['getMany'],
			},
		},
	},
	{
		displayName: 'Visible App',
		name: 'visibleApp',
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		description: 'Only return users who can see this app (sent as `filter[visibleApps]`)',
		displayOptions: {
			show: {
				resource: ['user'],
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
	sortField(
		{
			show: {
				resource: ['user'],
				operation: ['getMany'],
			},
		},
		[
			{ name: 'Last Name (A→Z)', value: 'lastName' },
			{ name: 'Last Name (Z→A)', value: '-lastName' },
			{ name: 'Username (A→Z)', value: 'username' },
			{ name: 'Username (Z→A)', value: '-username' },
		],
	),

	// --- Get / Update Roles / Remove: which user -----------------------------
	{
		displayName: 'User ID',
		name: 'userId',
		type: 'string',
		default: '',
		required: true,
		description: 'The ID of the user (an opaque UUID from Get Many)',
		displayOptions: {
			show: {
				resource: ['user'],
				operation: ['get', 'updateRoles', 'remove'],
			},
		},
	},

	// --- Update Roles: Input Mode toggle + raw JSON body ---------------------
	...inputModeFields({
		show: {
			resource: ['user'],
			operation: ['updateRoles'],
		},
	}),

	// --- Update Roles: typed Roles multi-select (hidden in JSON mode) --------
	{
		displayName: 'Role Names or IDs',
		name: 'roles',
		type: 'multiOptions',
		typeOptions: {
			loadOptionsMethod: 'getUserRoles',
		},
		default: [],
		required: true,
		description:
			'The complete set of roles to assign, replacing the user\'s current roles. Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		displayOptions: {
			show: {
				resource: ['user'],
				operation: ['updateRoles'],
				inputMode: ['fields'],
			},
		},
	},

	// --- Update Roles: optional attributes -----------------------------------
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: {
			show: {
				resource: ['user'],
				operation: ['updateRoles'],
				inputMode: ['fields'],
			},
		},
		options: [
			{
				displayName: 'All Apps Visible',
				name: 'allAppsVisible',
				type: 'boolean',
				default: true,
				description: 'Whether the user can see all of the team\'s apps',
			},
			{
				displayName: 'Provisioning Allowed',
				name: 'provisioningAllowed',
				type: 'boolean',
				default: true,
				description: 'Whether the user can create provisioning profiles and certificates',
			},
		],
	},

	// --- Reads: shared JSON:API Query Options --------------------------------
	queryOptionsCollection({
		show: {
			resource: ['user'],
			operation: ['getMany', 'get'],
		},
	}),

	// --- Reads: shared Simplify toggle ---------------------------------------
	// Flattens the JSON:API envelope for every read (Get Many via
	// `ascCursorPagination`, Get via `ascSingleRequest`).
	simplifyField({
		show: {
			resource: ['user'],
			operation: ['getMany', 'get'],
		},
	}),
];
