import type { INodeProperties } from 'n8n-workflow';

import { inputModeFields } from '../_shared/inputMode';
import { attachQueryOptions, queryOptionsCollection } from '../_shared/queryOptions';
import { simplifyField } from '../_shared/simplify';
import { ascCursorPagination } from '../../transport/pagination';
import { ascSingleRequest } from '../../transport/request';
import {
	attachAppStoreVersionFilters,
	attachLocalizationUpdateBody,
	attachPhasedReleaseBody,
	attachReleaseRequestBody,
	attachReviewSubmissionBody,
	attachSubmissionItemBody,
	attachVersionBody,
} from './appStoreVersion.body';

/**
 * App Store Versions & Release resource — the release pipeline (roadmap Tier 1
 * #4, the largest Tier 1 item). Automates "update What's New", "submit for
 * review", "release the approved version", and phased-rollout control. Reuses
 * the shipped spine — `searchApps` picker, `ascCursorPagination`,
 * `ascSingleRequest`, the shared Query Options and Input Mode groups, and the
 * module-D error mapper.
 *
 * DECISION — single node vs a dedicated node for this domain.
 * Kept inside the single `App Store Connect` node (per the roadmap default:
 * "keep everything in the single node until a resource's field set clearly hurts
 * UX"). Although this is the widest resource (11 operations), the field set does
 * NOT diverge enough to hurt UX: every write reuses the shared Input Mode
 * toggle, every read the shared Query Options collection, and the typed fields
 * are small per-operation collections gated by `displayOptions` so only the
 * active operation's fields render. Splitting would duplicate the app picker,
 * pagination, and error plumbing for no UX gain. The likely first split remains
 * IAP/Subscriptions, not this. Revisit only if in-app-purchase or pricing
 * flows land here and balloon the field set. (Also recorded in the task report.)
 *
 * Operations, grouped:
 *   - Versions: Get Many (`GET /v1/apps/{id}/appStoreVersions`, app-scoped
 *     URL), Get (`GET /v1/appStoreVersions/{id}`), Create
 *     (`POST /v1/appStoreVersions`), Update (`PATCH /v1/appStoreVersions/{id}`).
 *   - Localizations: Get Many
 *     (`GET /v1/appStoreVersions/{id}/appStoreVersionLocalizations`), Update
 *     (`PATCH /v1/appStoreVersionLocalizations/{id}` — What's New / description).
 *   - Submit for Review: Submit for Review (`POST /v1/reviewSubmissions`) +
 *     Add Submission Item (`POST /v1/reviewSubmissionItems`) — the modern
 *     two-step flow (create the submission container, then link the version).
 *   - Release: Release (`POST /v1/appStoreVersionReleaseRequests`).
 *   - Phased Release: Create (`POST /v1/appStoreVersionPhasedReleases`),
 *     Update (`PATCH /v1/appStoreVersionPhasedReleases/{id}`).
 *
 * HITL: Submit for Review and Release are hard-to-reverse, outward-facing
 * production actions — they must be verified deliberately by a human against a
 * non-production (or safely reversible) app state, never fired blind.
 */
export const appStoreVersionOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: {
				resource: ['appStoreVersion'],
			},
		},
		options: [
			{
				name: 'Get Many',
				value: 'getMany',
				action: 'Get many app store versions',
				description: "Retrieve an app's App Store versions",
				routing: {
					request: {
						method: 'GET',
						url: '=/v1/apps/{{$parameter["targetApp"]}}/appStoreVersions',
					},
					send: {
						// Curated filters first, then the generic Query Options; both
						// only add `qs` keys, so they compose. Query Options runs last so
						// an advanced `filter[]` there overrides the convenience fields.
						// NOTE: no `attachSort` — the ASC spec exposes no `sort` param on
						// this endpoint (see attachAppStoreVersionFilters).
						preSend: [attachAppStoreVersionFilters, attachQueryOptions],
					},
					operations: {
						pagination: ascCursorPagination,
					},
				},
			},
			{
				name: 'Get',
				value: 'get',
				action: 'Get app store version',
				description: 'Retrieve a single App Store version by ID',
				routing: {
					request: {
						method: 'GET',
						url: '=/v1/appStoreVersions/{{$parameter["appStoreVersionId"]}}',
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
				action: 'Create app store version',
				description: 'Create a new App Store version for an app',
				routing: {
					request: {
						method: 'POST',
						url: '/v1/appStoreVersions',
					},
					send: {
						preSend: [attachVersionBody],
					},
					operations: {
						pagination: ascSingleRequest,
					},
				},
			},
			{
				name: 'Update',
				value: 'update',
				action: 'Update app store version',
				description: "Update a version's number, release type, or scheduled date",
				routing: {
					request: {
						method: 'PATCH',
						url: '=/v1/appStoreVersions/{{$parameter["appStoreVersionId"]}}',
					},
					send: {
						preSend: [attachVersionBody],
					},
					operations: {
						pagination: ascSingleRequest,
					},
				},
			},
			{
				name: 'Get Many Localizations',
				value: 'getManyLocalizations',
				action: 'Get many app store version localizations',
				description: "Retrieve a version's per-locale metadata (What's New, description)",
				routing: {
					request: {
						method: 'GET',
						url: '=/v1/appStoreVersions/{{$parameter["appStoreVersionId"]}}/appStoreVersionLocalizations',
					},
					send: {
						preSend: [attachQueryOptions],
					},
					operations: {
						pagination: ascCursorPagination,
					},
				},
			},
			{
				name: 'Update Localization',
				value: 'updateLocalization',
				action: 'Update app store version localization',
				description: "Update a locale's What's New, description, keywords, or URLs",
				routing: {
					request: {
						method: 'PATCH',
						url: '=/v1/appStoreVersionLocalizations/{{$parameter["appStoreVersionLocalizationId"]}}',
					},
					send: {
						preSend: [attachLocalizationUpdateBody],
					},
					operations: {
						pagination: ascSingleRequest,
					},
				},
			},
			{
				name: 'Submit for Review',
				value: 'submitForReview',
				action: 'Submit app for review',
				description:
					'Create a review submission for an app (then add the version with Add Submission Item)',
				routing: {
					request: {
						method: 'POST',
						url: '/v1/reviewSubmissions',
					},
					send: {
						preSend: [attachReviewSubmissionBody],
					},
					operations: {
						pagination: ascSingleRequest,
					},
				},
			},
			{
				name: 'Add Submission Item',
				value: 'addSubmissionItem',
				action: 'Add version to review submission',
				description: 'Link an App Store version into an existing review submission',
				routing: {
					request: {
						method: 'POST',
						url: '/v1/reviewSubmissionItems',
					},
					send: {
						preSend: [attachSubmissionItemBody],
					},
					operations: {
						pagination: ascSingleRequest,
					},
				},
			},
			{
				name: 'Release',
				value: 'release',
				action: 'Release approved app store version',
				description: 'Manually release an approved version that is awaiting release',
				routing: {
					request: {
						method: 'POST',
						url: '/v1/appStoreVersionReleaseRequests',
					},
					send: {
						preSend: [attachReleaseRequestBody],
					},
					operations: {
						pagination: ascSingleRequest,
					},
				},
			},
			{
				name: 'Create Phased Release',
				value: 'createPhasedRelease',
				action: 'Create phased release',
				description: 'Opt an App Store version into a staged (phased) rollout',
				routing: {
					request: {
						method: 'POST',
						url: '/v1/appStoreVersionPhasedReleases',
					},
					send: {
						preSend: [attachPhasedReleaseBody],
					},
					operations: {
						pagination: ascSingleRequest,
					},
				},
			},
			{
				name: 'Update Phased Release',
				value: 'updatePhasedRelease',
				action: 'Update phased release',
				description: 'Pause, resume, or complete a staged (phased) rollout',
				routing: {
					request: {
						method: 'PATCH',
						url: '=/v1/appStoreVersionPhasedReleases/{{$parameter["phasedReleaseId"]}}',
					},
					send: {
						preSend: [attachPhasedReleaseBody],
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
 * App Store Versions & Release resource — fields.
 */
export const appStoreVersionFields: INodeProperties[] = [
	// --- Get Many (versions): Return All / Limit -----------------------------
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		description: 'Whether to return all results or only up to a given limit',
		displayOptions: {
			show: {
				resource: ['appStoreVersion'],
				operation: ['getMany', 'getManyLocalizations'],
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
				resource: ['appStoreVersion'],
				operation: ['getMany', 'getManyLocalizations'],
				returnAll: [false],
			},
		},
	},

	// --- Get Many (versions): the app to scope by (URL segment) --------------
	// Reuses `searchApps` (registered as `methods.listSearch.searchApps`).
	{
		displayName: 'Target App',
		name: 'targetApp',
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		required: true,
		description: 'The app whose App Store versions to retrieve',
		displayOptions: {
			show: {
				resource: ['appStoreVersion'],
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
	//     Verified against the ASC OpenAPI spec (v4.3). Each is optional and
	//     skipped when blank; the generic Query Options collection below remains
	//     the escape hatch for anything not listed here (e.g. the newer
	//     `filter[appVersionState]`). NOTE: the spec exposes no `sort` param on
	//     this endpoint, so there is deliberately no Sort dropdown here.
	{
		displayName: 'Version String',
		name: 'filterVersionString',
		type: 'string',
		default: '',
		placeholder: 'e.g. 1.2.0',
		description: 'Only return versions with this exact version string (sent as `filter[versionString]`)',
		displayOptions: {
			show: {
				resource: ['appStoreVersion'],
				operation: ['getMany'],
			},
		},
	},
	{
		displayName: 'Platform',
		name: 'filterPlatform',
		type: 'options',
		default: '',
		description: 'Only return versions for this platform (sent as `filter[platform]`)',
		options: [
			{ name: 'Any', value: '' },
			{ name: 'iOS', value: 'IOS' },
			{ name: 'macOS', value: 'MAC_OS' },
			{ name: 'tvOS', value: 'TV_OS' },
			{ name: 'visionOS', value: 'VISION_OS' },
		],
		displayOptions: {
			show: {
				resource: ['appStoreVersion'],
				operation: ['getMany'],
			},
		},
	},
	{
		displayName: 'App Store State',
		name: 'filterAppStoreState',
		type: 'options',
		default: '',
		description: 'Only return versions in this App Store state (sent as `filter[appStoreState]`)',
		options: [
			{ name: 'Accepted', value: 'ACCEPTED' },
			{ name: 'Any', value: '' },
			{ name: 'Developer Rejected', value: 'DEVELOPER_REJECTED' },
			{ name: 'Developer Removed From Sale', value: 'DEVELOPER_REMOVED_FROM_SALE' },
			{ name: 'In Review', value: 'IN_REVIEW' },
			{ name: 'Invalid Binary', value: 'INVALID_BINARY' },
			{ name: 'Metadata Rejected', value: 'METADATA_REJECTED' },
			{ name: 'Not Applicable', value: 'NOT_APPLICABLE' },
			{ name: 'Pending Apple Release', value: 'PENDING_APPLE_RELEASE' },
			{ name: 'Pending Contract', value: 'PENDING_CONTRACT' },
			{ name: 'Pending Developer Release', value: 'PENDING_DEVELOPER_RELEASE' },
			{ name: 'Preorder Ready for Sale', value: 'PREORDER_READY_FOR_SALE' },
			{ name: 'Prepare for Submission', value: 'PREPARE_FOR_SUBMISSION' },
			{ name: 'Processing for App Store', value: 'PROCESSING_FOR_APP_STORE' },
			{ name: 'Ready for Review', value: 'READY_FOR_REVIEW' },
			{ name: 'Ready for Sale', value: 'READY_FOR_SALE' },
			{ name: 'Rejected', value: 'REJECTED' },
			{ name: 'Removed From Sale', value: 'REMOVED_FROM_SALE' },
			{ name: 'Replaced With New Version', value: 'REPLACED_WITH_NEW_VERSION' },
			{ name: 'Waiting for Export Compliance', value: 'WAITING_FOR_EXPORT_COMPLIANCE' },
			{ name: 'Waiting for Review', value: 'WAITING_FOR_REVIEW' },
		],
		displayOptions: {
			show: {
				resource: ['appStoreVersion'],
				operation: ['getMany'],
			},
		},
	},

	// --- Create / Submit for Review: the app the write targets (relationship).
	//     Required, shown only in fields mode (JSON mode carries its own
	//     relationships). Reuses `searchApps`.
	{
		displayName: 'Target App',
		name: 'targetApp',
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		required: true,
		description: 'The app this write targets (sent as the `app` relationship)',
		displayOptions: {
			show: {
				resource: ['appStoreVersion'],
				operation: ['create', 'submitForReview'],
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

	// --- Which App Store version -----------------------------------------------
	// Used both in the request URL (Get / Update / Get Many Localizations) and,
	// for the writes that reference a version by relationship (Add Submission
	// Item / Release / Create Phased Release), echoed into the body — so it shows
	// regardless of Input Mode on those. Plain string ID (no version picker
	// method), mirroring the Build resource's `buildId`.
	{
		displayName: 'App Store Version ID',
		name: 'appStoreVersionId',
		type: 'string',
		default: '',
		required: true,
		description: 'The ID of the App Store version',
		displayOptions: {
			show: {
				resource: ['appStoreVersion'],
				operation: [
					'get',
					'update',
					'getManyLocalizations',
					'addSubmissionItem',
					'release',
					'createPhasedRelease',
				],
			},
		},
	},

	// --- Add Submission Item: which review submission ------------------------
	{
		displayName: 'Review Submission ID',
		name: 'reviewSubmissionId',
		type: 'string',
		default: '',
		required: true,
		description: 'The ID of the review submission to add the version to',
		displayOptions: {
			show: {
				resource: ['appStoreVersion'],
				operation: ['addSubmissionItem'],
			},
		},
	},

	// --- Update Localization: which localization -----------------------------
	{
		displayName: 'Localization ID',
		name: 'appStoreVersionLocalizationId',
		type: 'string',
		default: '',
		required: true,
		description: 'The ID of the App Store version localization to update',
		displayOptions: {
			show: {
				resource: ['appStoreVersion'],
				operation: ['updateLocalization'],
			},
		},
	},

	// --- Update Phased Release: which phased release -------------------------
	{
		displayName: 'Phased Release ID',
		name: 'phasedReleaseId',
		type: 'string',
		default: '',
		required: true,
		description: 'The ID of the phased release to update',
		displayOptions: {
			show: {
				resource: ['appStoreVersion'],
				operation: ['updatePhasedRelease'],
			},
		},
	},

	// --- Input Mode toggle + raw JSON body (all writes) ----------------------
	...inputModeFields({
		show: {
			resource: ['appStoreVersion'],
			operation: [
				'create',
				'update',
				'updateLocalization',
				'submitForReview',
				'addSubmissionItem',
				'release',
				'createPhasedRelease',
				'updatePhasedRelease',
			],
		},
	}),

	// --- Create: required versionString + platform (hidden in JSON mode) -----
	{
		displayName: 'Version String',
		name: 'versionString',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. 1.2.0',
		description: 'The version number that appears on the App Store',
		displayOptions: {
			show: {
				resource: ['appStoreVersion'],
				operation: ['create'],
				inputMode: ['fields'],
			},
		},
	},
	{
		displayName: 'Platform',
		name: 'platform',
		type: 'options',
		default: 'IOS',
		required: true,
		description: 'The platform this version / submission targets',
		displayOptions: {
			show: {
				resource: ['appStoreVersion'],
				operation: ['create', 'submitForReview'],
				inputMode: ['fields'],
			},
		},
		options: [
			{ name: 'iOS', value: 'IOS' },
			{ name: 'macOS', value: 'MAC_OS' },
			{ name: 'tvOS', value: 'TV_OS' },
			{ name: 'visionOS', value: 'VISION_OS' },
		],
	},

	// --- Create: optional version attributes ---------------------------------
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: {
			show: {
				resource: ['appStoreVersion'],
				operation: ['create'],
				inputMode: ['fields'],
			},
		},
		options: [
			{
				displayName: 'Copyright',
				name: 'copyright',
				type: 'string',
				default: '',
				placeholder: 'e.g. 2026 Example Company Inc.',
				description: 'The copyright statement shown on the App Store',
			},
			{
				displayName: 'Downloadable',
				name: 'downloadable',
				type: 'boolean',
				default: true,
				description: 'Whether the version is downloadable',
			},
			{
				displayName: 'Earliest Release Date',
				name: 'earliestReleaseDate',
				type: 'dateTime',
				default: '',
				description: 'For a SCHEDULED release, the earliest date/time the version may go live',
			},
			{
				displayName: 'Release Type',
				name: 'releaseType',
				type: 'options',
				default: 'MANUAL',
				description: 'How the version goes live once approved',
				options: [
					{ name: 'After Approval', value: 'AFTER_APPROVAL' },
					{ name: 'Manual', value: 'MANUAL' },
					{ name: 'Scheduled', value: 'SCHEDULED' },
				],
			},
		],
	},

	// --- Update (version): typed attributes (all optional, hidden in JSON) ---
	{
		displayName: 'Update Fields',
		name: 'updateFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: {
			show: {
				resource: ['appStoreVersion'],
				operation: ['update'],
				inputMode: ['fields'],
			},
		},
		options: [
			{
				displayName: 'Copyright',
				name: 'copyright',
				type: 'string',
				default: '',
				placeholder: 'e.g. 2026 Example Company Inc.',
				description: 'The copyright statement shown on the App Store',
			},
			{
				displayName: 'Downloadable',
				name: 'downloadable',
				type: 'boolean',
				default: true,
				description: 'Whether the version is downloadable',
			},
			{
				displayName: 'Earliest Release Date',
				name: 'earliestReleaseDate',
				type: 'dateTime',
				default: '',
				description: 'For a SCHEDULED release, the earliest date/time the version may go live',
			},
			{
				displayName: 'Release Type',
				name: 'releaseType',
				type: 'options',
				default: 'MANUAL',
				description: 'How the version goes live once approved',
				options: [
					{ name: 'After Approval', value: 'AFTER_APPROVAL' },
					{ name: 'Manual', value: 'MANUAL' },
					{ name: 'Scheduled', value: 'SCHEDULED' },
				],
			},
			{
				displayName: 'Version String',
				name: 'versionString',
				type: 'string',
				default: '',
				placeholder: 'e.g. 1.2.0',
				description: 'The version number that appears on the App Store',
			},
		],
	},

	// --- Update Localization: typed metadata (all optional, hidden in JSON) --
	{
		displayName: 'Update Fields',
		name: 'updateFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: {
			show: {
				resource: ['appStoreVersion'],
				operation: ['updateLocalization'],
				inputMode: ['fields'],
			},
		},
		options: [
			{
				displayName: 'Description',
				name: 'description',
				type: 'string',
				typeOptions: { rows: 4 },
				default: '',
				description: "The app's full description for this locale",
			},
			{
				displayName: 'Keywords',
				name: 'keywords',
				type: 'string',
				default: '',
				placeholder: 'e.g. audio,hearing,music',
				description: 'Comma-separated App Store keywords for this locale',
			},
			{
				displayName: 'Marketing URL',
				name: 'marketingUrl',
				type: 'string',
				default: '',
				placeholder: 'e.g. https://example.com',
				description: 'The marketing URL for this locale',
			},
			{
				displayName: 'Promotional Text',
				name: 'promotionalText',
				type: 'string',
				typeOptions: { rows: 2 },
				default: '',
				description: 'Short promotional text that can be updated without a new version',
			},
			{
				displayName: 'Support URL',
				name: 'supportUrl',
				type: 'string',
				default: '',
				placeholder: 'e.g. https://example.com/support',
				description: 'The support URL for this locale',
			},
			{
				displayName: "What's New",
				name: 'whatsNew',
				type: 'string',
				typeOptions: { rows: 4 },
				default: '',
				description: 'The release notes ("What\'s New in This Version") for this locale',
			},
		],
	},

	// --- Create Phased Release: optional initial state -----------------------
	{
		displayName: 'Phased Release State',
		name: 'phasedReleaseState',
		type: 'options',
		default: '',
		description: 'Optional initial state for the phased release (usually left unset)',
		displayOptions: {
			show: {
				resource: ['appStoreVersion'],
				operation: ['createPhasedRelease'],
				inputMode: ['fields'],
			},
		},
		options: [
			{ name: 'Active', value: 'ACTIVE' },
			{ name: 'Complete', value: 'COMPLETE' },
			{ name: 'Default (Unset)', value: '' },
			{ name: 'Inactive', value: 'INACTIVE' },
			{ name: 'Paused', value: 'PAUSED' },
		],
	},

	// --- Update Phased Release: required state --------------------------------
	{
		displayName: 'Phased Release State',
		name: 'phasedReleaseState',
		type: 'options',
		default: 'ACTIVE',
		required: true,
		description: 'The new state — pause, resume, or complete the staged rollout',
		displayOptions: {
			show: {
				resource: ['appStoreVersion'],
				operation: ['updatePhasedRelease'],
				inputMode: ['fields'],
			},
		},
		options: [
			{ name: 'Active', value: 'ACTIVE' },
			{ name: 'Complete', value: 'COMPLETE' },
			{ name: 'Inactive', value: 'INACTIVE' },
			{ name: 'Paused', value: 'PAUSED' },
		],
	},

	// --- Reads: shared JSON:API Query Options --------------------------------
	queryOptionsCollection({
		show: {
			resource: ['appStoreVersion'],
			operation: ['getMany', 'get', 'getManyLocalizations'],
		},
	}),

	// --- Reads: shared Simplify toggle ---------------------------------------
	// Flattens the JSON:API envelope for every read (Get Many / Get Many
	// Localizations via `ascCursorPagination`, Get via `ascSingleRequest`).
	simplifyField({
		show: {
			resource: ['appStoreVersion'],
			operation: ['getMany', 'get', 'getManyLocalizations'],
		},
	}),
];
