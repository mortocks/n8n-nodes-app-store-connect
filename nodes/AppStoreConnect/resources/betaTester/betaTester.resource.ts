import type { INodeProperties } from 'n8n-workflow';

import { targetAppLocator } from '../_shared/appLocator';
import { betaGroupLocator } from '../_shared/betaGroupLocator';
import { inputModeFields } from '../_shared/inputMode';
import { attachSort, sortField } from '../_shared/listFilters';
import { attachQueryOptions, queryOptionsCollection } from '../_shared/queryOptions';
import { simplifyField } from '../_shared/simplify';
import { ascCursorPagination } from '../../transport/pagination';
import { ascConfirmationRequest, ascSingleRequest } from '../../transport/request';
import {
	attachBetaTesterBody,
	attachBetaTesterFilters,
	attachBetaTesterGroupLinkage,
} from './betaTester.body';

/**
 * TestFlight Beta Testers resource — operations (roadmap Tier 1 #3).
 *
 * Automates beta onboarding/offboarding ("invite a tester on signup", "remove a
 * churned tester", "sync a group from a CRM"). Reuses the shipped spine:
 *   - **Get Many** (`GET /v1/betaTesters`) — a *top-level* collection, so app /
 *     group / email are expressed as `filter[...]` via `attachBetaTesterFilters`;
 *     cursor paging via `ascCursorPagination` (Return All / Limit).
 *   - **Get** (`GET /v1/betaTesters/{id}`) — single read via `ascSingleRequest`.
 *   - **Create** (`POST /v1/betaTesters`), **Delete**
 *     (`DELETE /v1/betaTesters/{id}`) — single writes via `ascSingleRequest`.
 *   - **Add to Group** / **Remove from Group** — JSON:API relationship-linkage
 *     writes: `POST` / `DELETE /v1/betaGroups/{id}/relationships/betaTesters`,
 *     body built by `attachBetaTesterGroupLinkage`.
 *
 * Every read mounts the shared Query Options collection; Create mounts the
 * shared Input Mode group (typed UI or raw-JSON escape hatch). The group is
 * chosen through the reusable `searchBetaGroups` picker
 * (`methods/betaGroups.ts`), the app through `searchApps`.
 */
export const betaTesterOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: {
				resource: ['betaTester'],
			},
		},
		options: [
			{
				name: 'Get Many',
				value: 'getMany',
				action: 'Get many beta testers',
				description: 'Retrieve beta testers, optionally filtered by app, group, or email',
				routing: {
					request: {
						method: 'GET',
						url: '/v1/betaTesters',
					},
					send: {
						// Convenience filters + sort first, then the generic Query
						// Options; all only add `qs` keys, so they compose. Query Options
						// runs last so an advanced `filter[]`/`sort` there overrides the
						// convenience fields.
						preSend: [attachBetaTesterFilters, attachSort, attachQueryOptions],
					},
					operations: {
						pagination: ascCursorPagination,
					},
				},
			},
			{
				name: 'Get',
				value: 'get',
				action: 'Get a beta tester',
				description: 'Retrieve a single beta tester by ID',
				routing: {
					request: {
						method: 'GET',
						url: '=/v1/betaTesters/{{$parameter["betaTesterId"]}}',
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
				action: 'Create a beta tester',
				description: 'Invite a new beta tester into a group',
				routing: {
					request: {
						method: 'POST',
						url: '/v1/betaTesters',
					},
					send: {
						preSend: [attachBetaTesterBody],
					},
					operations: {
						pagination: ascSingleRequest,
					},
				},
			},
			{
				name: 'Delete',
				value: 'delete',
				action: 'Delete a beta tester',
				description: 'Permanently remove a beta tester from all groups and apps',
				routing: {
					request: {
						method: 'DELETE',
						url: '=/v1/betaTesters/{{$parameter["betaTesterId"]}}',
					},
					operations: {
						// Delete replies 204 No Content; emit an explicit
						// `{ deleted: true }` confirmation rather than an empty item.
						pagination: ascConfirmationRequest('deleted'),
					},
				},
			},
			{
				name: 'Add to Group',
				value: 'addToGroup',
				action: 'Add a beta tester to a group',
				description: 'Link an existing beta tester to a beta group',
				routing: {
					request: {
						method: 'POST',
						url: '=/v1/betaGroups/{{$parameter["betaGroup"]}}/relationships/betaTesters',
					},
					send: {
						preSend: [attachBetaTesterGroupLinkage],
					},
					operations: {
						// Relationship write replies 204 No Content; emit an explicit
						// `{ added: true }` confirmation rather than an empty item.
						pagination: ascConfirmationRequest('added'),
					},
				},
			},
			{
				name: 'Remove From Group',
				value: 'removeFromGroup',
				action: 'Remove a beta tester from a group',
				description: 'Unlink a beta tester from a beta group',
				routing: {
					request: {
						method: 'DELETE',
						url: '=/v1/betaGroups/{{$parameter["betaGroup"]}}/relationships/betaTesters',
					},
					send: {
						preSend: [attachBetaTesterGroupLinkage],
					},
					operations: {
						// Relationship write replies 204 No Content; emit an explicit
						// `{ removed: true }` confirmation rather than an empty item.
						pagination: ascConfirmationRequest('removed'),
					},
				},
			},
		],
		default: 'getMany',
	},
];

/**
 * Beta Testers resource — fields.
 */
export const betaTesterFields: INodeProperties[] = [
	// --- Get Many: Return All / Limit ----------------------------------------
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		description: 'Whether to return all results or only up to a given limit',
		displayOptions: {
			show: {
				resource: ['betaTester'],
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
				resource: ['betaTester'],
				operation: ['getMany'],
				returnAll: [false],
			},
		},
	},

	// --- Get Many: optional convenience filters ------------------------------
	{
		displayName: 'Target App',
		name: 'targetApp',
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		description: 'Only return testers with access to this app (sent as `filter[apps]`)',
		displayOptions: {
			show: {
				resource: ['betaTester'],
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
	betaGroupLocator(
		{
			show: {
				resource: ['betaTester'],
				operation: ['getMany'],
			},
		},
		{ description: 'Only return testers in this beta group (sent as `filter[betaGroups]`)' },
	),
	{
		displayName: 'Email',
		name: 'filterEmail',
		type: 'string',
		default: '',
		placeholder: 'e.g. tester@example.com',
		description: 'Only return the tester with this email address (sent as `filter[email]`)',
		displayOptions: {
			show: {
				resource: ['betaTester'],
				operation: ['getMany'],
			},
		},
	},
	{
		displayName: 'First Name',
		name: 'filterFirstName',
		type: 'string',
		default: '',
		placeholder: 'e.g. Nathan',
		description: 'Only return testers with this first name (sent as `filter[firstName]`)',
		displayOptions: {
			show: {
				resource: ['betaTester'],
				operation: ['getMany'],
			},
		},
	},
	{
		displayName: 'Last Name',
		name: 'filterLastName',
		type: 'string',
		default: '',
		placeholder: 'e.g. Smith',
		description: 'Only return testers with this last name (sent as `filter[lastName]`)',
		displayOptions: {
			show: {
				resource: ['betaTester'],
				operation: ['getMany'],
			},
		},
	},
	{
		displayName: 'Invite Type',
		name: 'filterInviteType',
		type: 'options',
		default: '',
		description: 'Only return testers invited this way (sent as `filter[inviteType]`)',
		options: [
			{ name: 'Any', value: '' },
			{ name: 'Email', value: 'EMAIL' },
			{ name: 'Public Link', value: 'PUBLIC_LINK' },
		],
		displayOptions: {
			show: {
				resource: ['betaTester'],
				operation: ['getMany'],
			},
		},
	},
	sortField(
		{
			show: {
				resource: ['betaTester'],
				operation: ['getMany'],
			},
		},
		[
			{ name: 'Email (A→Z)', value: 'email' },
			{ name: 'Email (Z→A)', value: '-email' },
			{ name: 'First Name (A→Z)', value: 'firstName' },
			{ name: 'First Name (Z→A)', value: '-firstName' },
			{ name: 'Last Name (A→Z)', value: 'lastName' },
			{ name: 'Last Name (Z→A)', value: '-lastName' },
		],
	),

	// --- Get / Delete / Add to Group / Remove from Group: which tester -------
	{
		displayName: 'Beta Tester ID',
		name: 'betaTesterId',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. 12a34b56-...',
		description: 'The ID of the beta tester',
		displayOptions: {
			show: {
				resource: ['betaTester'],
				operation: ['get', 'delete', 'addToGroup', 'removeFromGroup'],
			},
		},
	},

	// --- Add to Group / Remove from Group: optional app scope + which group ---
	targetAppLocator(
		{
			show: {
				resource: ['betaTester'],
				operation: ['addToGroup', 'removeFromGroup'],
			},
		},
		{
			description:
				'Narrows the "From List" beta-group picker below to a single app',
		},
	),
	betaGroupLocator(
		{
			show: {
				resource: ['betaTester'],
				operation: ['addToGroup', 'removeFromGroup'],
			},
		},
		{ required: true, description: 'The beta group to add the tester to or remove them from' },
	),

	// --- Create: Input Mode toggle + raw JSON body ---------------------------
	...inputModeFields({
		show: {
			resource: ['betaTester'],
			operation: ['create'],
		},
	}),

	// --- Create: optional app scope to narrow the group picker (fields mode) --
	targetAppLocator(
		{
			show: {
				resource: ['betaTester'],
				operation: ['create'],
				inputMode: ['fields'],
			},
		},
		{
			description:
				'Narrows the "From List" beta-group picker below to a single app',
		},
	),
	// --- Create: the group to invite the tester into (hidden in JSON mode) ---
	betaGroupLocator(
		{
			show: {
				resource: ['betaTester'],
				operation: ['create'],
				inputMode: ['fields'],
			},
		},
		{ required: true, description: 'The beta group to invite the new tester into' },
	),

	// --- Create: typed attributes (hidden in JSON mode) ----------------------
	{
		displayName: 'Email',
		name: 'email',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. tester@example.com',
		description: "The tester's email address (where the TestFlight invite is sent)",
		displayOptions: {
			show: {
				resource: ['betaTester'],
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
		placeholder: 'e.g. Nathan',
		description: "The tester's first name",
		displayOptions: {
			show: {
				resource: ['betaTester'],
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
		placeholder: 'e.g. Smith',
		description: "The tester's last name",
		displayOptions: {
			show: {
				resource: ['betaTester'],
				operation: ['create'],
				inputMode: ['fields'],
			},
		},
	},

	// --- Reads: shared JSON:API Query Options --------------------------------
	queryOptionsCollection({
		show: {
			resource: ['betaTester'],
			operation: ['getMany', 'get'],
		},
	}),

	// --- Reads: shared Simplify toggle ---------------------------------------
	// Flattens the JSON:API envelope for every read (Get Many via
	// `ascCursorPagination`, Get via `ascSingleRequest`).
	simplifyField({
		show: {
			resource: ['betaTester'],
			operation: ['getMany', 'get'],
		},
	}),
];
