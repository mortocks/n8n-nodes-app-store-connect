import { NodeConnectionTypes } from 'n8n-workflow';
import type { INodeType, INodeTypeDescription } from 'n8n-workflow';

import { testApiCredential } from '../../utils/apiCredentialTest';
import { searchApps } from './methods/apps';
import { searchBetaGroups } from './methods/betaGroups';
import { getUserRoles } from './methods/roles';
import { appFields, appOperations } from './resources/app/app.resource';
import {
	betaFeedbackFields,
	betaFeedbackOperations,
} from './resources/betaFeedback/betaFeedback.resource';
import { betaGroupFields, betaGroupOperations } from './resources/betaGroup/betaGroup.resource';
import { betaTesterFields, betaTesterOperations } from './resources/betaTester/betaTester.resource';
import {
	appStoreVersionFields,
	appStoreVersionOperations,
} from './resources/appStoreVersion/appStoreVersion.resource';
import { buildFields, buildOperations } from './resources/build/build.resource';
import {
	customerReviewFields,
	customerReviewOperations,
} from './resources/customerReview/customerReview.resource';
import { userFields, userOperations } from './resources/user/user.resource';
import {
	userInvitationFields,
	userInvitationOperations,
} from './resources/userInvitation/userInvitation.resource';
import { webhookFields, webhookOperations } from './resources/webhook/webhook.resource';

/**
 * `App Store Connect` action node (declarative).
 *
 * A single Resource + Operation node over the ASC REST surface. Task 01 wired
 * one vertical slice — Resource: Webhook, Operation: Get Many — proving the
 * whole spine: credential → JWT (module A) → declarative routing → live request
 * → cursor pagination (module E) → readable errors (module D). Task 03 rounds
 * out Webhook with Create/Get/Update/Delete, a reusable app-picker
 * (`methods.listSearch.searchApps`), and event-type merging (module C).
 *
 * Structure: resource property/routing definitions live under
 * `resources/<domain>/`, request/pagination helpers under `transport/`,
 * `listSearch`/`loadOptions` helpers under `methods/`, and the pure deep
 * modules under `utils/`. Later resources plug in by adding options and
 * importing their own `resources/<domain>` module here; app-scoped resources
 * can reuse `methods/apps.ts`'s `searchApps` directly.
 */
export class AppStoreConnect implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'App Store Connect',
		name: 'appStoreConnect',
		icon: { light: 'file:appStore.svg', dark: 'file:appStore.dark.svg' },
		group: ['input'],
		version: 1,
		subtitle: '={{ $parameter["operation"] + ": " + $parameter["resource"] }}',
		description: 'Manage Apple App Store Connect resources',
		defaults: {
			name: 'App Store Connect',
		},
		// eslint-plugin-n8n-nodes-base@1.16.7 predates the `NodeConnectionTypes`
		// rename and only recognises the `'main'` string literal; the n8n
		// community-nodes verification scanner requires the typed enum instead.
		// eslint-disable-next-line n8n-nodes-base/node-class-description-inputs-wrong-regular-node
		inputs: [NodeConnectionTypes.Main],
		// eslint-disable-next-line n8n-nodes-base/node-class-description-outputs-wrong
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		credentials: [
			{
				name: 'appStoreConnectApi',
				required: true,
				// Code-based test (see `methods.credentialTest` below) so a failing
				// key reports Apple's real reason — 401 (bad key/ID) vs 403
				// (authenticated but agreements/role) — instead of a generic
				// "Authorization failed". Every node using this credential must
				// declare `testedBy` for the scanner's `credential-test-required` rule.
				testedBy: 'appStoreConnectApiTest',
			},
		],
		requestDefaults: {
			baseURL: 'https://api.appstoreconnect.apple.com',
			headers: {
				'Content-Type': 'application/json',
			},
		},
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'App',
						value: 'app',
					},
					{
						name: 'App Store Version',
						value: 'appStoreVersion',
					},
					{
						name: 'Beta Feedback',
						value: 'betaFeedback',
					},
					{
						name: 'Beta Group',
						value: 'betaGroup',
					},
					{
						name: 'Beta Tester',
						value: 'betaTester',
					},
					{
						name: 'Build',
						value: 'build',
					},
					{
						name: 'Customer Review',
						value: 'customerReview',
					},
					{
						name: 'User',
						value: 'user',
					},
					{
						name: 'User Invitation',
						value: 'userInvitation',
					},
					{
						name: 'Webhook',
						value: 'webhook',
					},
				],
				default: 'webhook',
			},
			...appOperations,
			...appFields,
			...appStoreVersionOperations,
			...appStoreVersionFields,
			...webhookOperations,
			...webhookFields,
			...customerReviewOperations,
			...customerReviewFields,
			...buildOperations,
			...buildFields,
			...betaGroupOperations,
			...betaGroupFields,
			...betaTesterOperations,
			...betaTesterFields,
			...betaFeedbackOperations,
			...betaFeedbackFields,
			...userOperations,
			...userFields,
			...userInvitationOperations,
			...userInvitationFields,
		],
	};

	// Reusable `listSearch` for the Webhook resource's "Target App"
	// resourceLocator (Task 03); future app-scoped resources import
	// `searchApps` from `methods/apps.ts` and register it here the same way.
	// `loadOptions.getUserRoles` backs the static Roles multi-select on the
	// Users / User Invitations write paths (`methods/roles.ts`).
	methods = {
		listSearch: {
			searchApps,
			searchBetaGroups,
		},
		loadOptions: {
			getUserRoles,
		},
		credentialTest: {
			appStoreConnectApiTest: testApiCredential,
		},
	};
}
