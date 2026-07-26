import type { INodeProperties } from 'n8n-workflow';

import { inputModeFields } from '../_shared/inputMode';
import { attachSort, sortField } from '../_shared/listFilters';
import { attachQueryOptions, queryOptionsCollection } from '../_shared/queryOptions';
import { simplifyField } from '../_shared/simplify';
import { ascCursorPagination } from '../../transport/pagination';
import { ascConfirmationRequest, ascSingleRequest } from '../../transport/request';
import { attachUserInvitationBody, attachUserInvitationFilters } from './userInvitation.body';

/**
 * User Invitations resource — operations (roadmap Tier 2 #8, "Users & Access").
 *
 * The "invite a new member" side of onboarding: pending invitations to people
 * not yet on the team. A top-level `userInvitations` collection plus Create and
 * cancel (Delete), all reusing the shipped spine:
 *   - **Get Many** (`GET /v1/userInvitations`) — cursor paging via
 *     `ascCursorPagination` (Return All / Limit).
 *   - **Create** (`POST /v1/userInvitations`) — single write via
 *     `ascSingleRequest`; the typed path collects email/name and a Roles
 *     multi-select (`getUserRoles` loadOptions).
 *   - **Delete** (`DELETE /v1/userInvitations/{id}`) — cancel a pending
 *     invitation via `ascSingleRequest`.
 *
 * Every read mounts the shared Query Options collection; Create mounts the
 * shared Input Mode group so both the typed UI and the raw-JSON escape hatch
 * flow through the same `ascSingleRequest` + module-D error mapper.
 *
 * **HITL:** creating an invitation sends a real email to a real person — verify
 * deliberately with a test address, never by firing at real inboxes from an
 * agent (see `docs/issues/13-users-access.md`).
 */
export const userInvitationOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: {
				resource: ['userInvitation'],
			},
		},
		options: [
			{
				name: 'Get Many',
				value: 'getMany',
				action: 'Get many user invitations',
				description: 'Retrieve the pending user invitations',
				routing: {
					request: {
						method: 'GET',
						url: '/v1/userInvitations',
					},
					send: {
						// Curated filters + sort first, then the generic Query Options;
						// all only add `qs` keys, so they compose. Query Options runs
						// last so an advanced `filter[]`/`sort` there overrides the
						// convenience fields.
						preSend: [attachUserInvitationFilters, attachSort, attachQueryOptions],
					},
					operations: {
						pagination: ascCursorPagination,
					},
				},
			},
			{
				name: 'Create',
				value: 'create',
				action: 'Create a user invitation',
				description: 'Invite a new user to the team',
				routing: {
					request: {
						method: 'POST',
						url: '/v1/userInvitations',
					},
					send: {
						preSend: [attachUserInvitationBody],
					},
					operations: {
						pagination: ascSingleRequest,
					},
				},
			},
			{
				name: 'Delete',
				value: 'delete',
				action: 'Delete a user invitation',
				description: 'Cancel a pending user invitation',
				routing: {
					request: {
						method: 'DELETE',
						url: '=/v1/userInvitations/{{$parameter["invitationId"]}}',
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
 * User Invitations resource — fields.
 */
export const userInvitationFields: INodeProperties[] = [
	// --- Get Many: Return All / Limit ----------------------------------------
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		description: 'Whether to return all results or only up to a given limit',
		displayOptions: {
			show: {
				resource: ['userInvitation'],
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
				resource: ['userInvitation'],
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
		displayName: 'Email',
		name: 'filterEmail',
		type: 'string',
		default: '',
		placeholder: 'e.g. name@email.com',
		description: 'Only return the invitation sent to this exact email (sent as `filter[email]`)',
		displayOptions: {
			show: {
				resource: ['userInvitation'],
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
			'Only return invitations granting any of these roles (sent as `filter[roles]`). Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		displayOptions: {
			show: {
				resource: ['userInvitation'],
				operation: ['getMany'],
			},
		},
	},
	{
		displayName: 'Visible App',
		name: 'visibleApp',
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		description:
			'Only return invitations that grant visibility of this app (sent as `filter[visibleApps]`)',
		displayOptions: {
			show: {
				resource: ['userInvitation'],
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
				resource: ['userInvitation'],
				operation: ['getMany'],
			},
		},
		[
			{ name: 'Email (A→Z)', value: 'email' },
			{ name: 'Email (Z→A)', value: '-email' },
			{ name: 'Last Name (A→Z)', value: 'lastName' },
			{ name: 'Last Name (Z→A)', value: '-lastName' },
		],
	),

	// --- Delete: which invitation --------------------------------------------
	{
		displayName: 'Invitation ID',
		name: 'invitationId',
		type: 'string',
		default: '',
		required: true,
		description: 'The ID of the pending user invitation to cancel',
		displayOptions: {
			show: {
				resource: ['userInvitation'],
				operation: ['delete'],
			},
		},
	},

	// --- Create: Input Mode toggle + raw JSON body ---------------------------
	...inputModeFields({
		show: {
			resource: ['userInvitation'],
			operation: ['create'],
		},
	}),

	// --- Create: typed attributes (hidden in JSON mode) ----------------------
	{
		displayName: 'Email',
		name: 'email',
		type: 'string',
		placeholder: 'e.g. name@email.com',
		default: '',
		required: true,
		description: 'The email address the invitation is sent to',
		displayOptions: {
			show: {
				resource: ['userInvitation'],
				operation: ['create'],
				inputMode: ['fields'],
			},
		},
	},
	{
		displayName: 'First Name',
		name: 'firstName',
		type: 'string',
		default: '',
		required: true,
		description: 'The invited user\'s first name',
		displayOptions: {
			show: {
				resource: ['userInvitation'],
				operation: ['create'],
				inputMode: ['fields'],
			},
		},
	},
	{
		displayName: 'Last Name',
		name: 'lastName',
		type: 'string',
		default: '',
		required: true,
		description: 'The invited user\'s last name',
		displayOptions: {
			show: {
				resource: ['userInvitation'],
				operation: ['create'],
				inputMode: ['fields'],
			},
		},
	},
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
			'The roles to grant the invited user. Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		displayOptions: {
			show: {
				resource: ['userInvitation'],
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
				resource: ['userInvitation'],
				operation: ['create'],
				inputMode: ['fields'],
			},
		},
		options: [
			{
				displayName: 'All Apps Visible',
				name: 'allAppsVisible',
				type: 'boolean',
				default: true,
				description: 'Whether the invited user can see all of the team\'s apps',
			},
			{
				displayName: 'Provisioning Allowed',
				name: 'provisioningAllowed',
				type: 'boolean',
				default: true,
				description: 'Whether the invited user can create provisioning profiles and certificates',
			},
		],
	},

	// --- Reads: shared JSON:API Query Options --------------------------------
	queryOptionsCollection({
		show: {
			resource: ['userInvitation'],
			operation: ['getMany'],
		},
	}),

	// --- Reads: shared Simplify toggle ---------------------------------------
	// Flattens the JSON:API envelope for Get Many (via `ascCursorPagination`).
	simplifyField({
		show: {
			resource: ['userInvitation'],
			operation: ['getMany'],
		},
	}),
];
