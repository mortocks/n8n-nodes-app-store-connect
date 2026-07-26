import type { ILoadOptionsFunctions, INodePropertyOptions } from 'n8n-workflow';

/**
 * The App Store Connect **user roles** enum, shared by the two typed
 * "Roles" multi-selects: User → Update Roles (`PATCH /v1/users/{id}`) and
 * User Invitation → Create (`POST /v1/userInvitations`). Both send the selected
 * values verbatim as the JSON:API `attributes.roles` array.
 *
 * Each entry pairs the wire value Apple expects (SCREAMING_SNAKE_CASE) with a
 * human label for the dropdown. Ordered to match Apple's own documented enum
 * rather than alphabetically, so the list reads the way the ASC "Users and
 * Access" UI presents roles.
 *
 * ⚠️ NEEDS LIVE 2xx CONFIRMATION (see `docs/apple-api-notes.md` and the
 * roadmap's "verify strings against the live API" guidance): this list is
 * doc-derived. Apple occasionally adds roles (and deprecates others); an
 * unknown value returns `409 ENTITY_ERROR.ATTRIBUTE`. Users can always fall
 * back to the write's JSON Input Mode to send a role not yet in this list, so a
 * stale entry never blocks them. If the live API rejects a value, adjust here.
 */
export const USER_ROLES: ReadonlyArray<{ value: string; name: string }> = [
	{ value: 'ADMIN', name: 'Admin' },
	{ value: 'FINANCE', name: 'Finance' },
	{ value: 'ACCOUNT_HOLDER', name: 'Account Holder' },
	{ value: 'SALES', name: 'Sales' },
	{ value: 'MARKETING', name: 'Marketing' },
	{ value: 'APP_MANAGER', name: 'App Manager' },
	{ value: 'DEVELOPER', name: 'Developer' },
	{ value: 'ACCESS_TO_REPORTS', name: 'Access to Reports' },
	{ value: 'CUSTOMER_SUPPORT', name: 'Customer Support' },
	{ value: 'CREATE_APPS', name: 'Create Apps' },
	{ value: 'CLOUD_MANAGED_DEVELOPER_ID', name: 'Cloud Managed Developer ID' },
	{ value: 'CLOUD_MANAGED_APP_DISTRIBUTION', name: 'Cloud Managed App Distribution' },
	{ value: 'GENERATE_INDIVIDUAL_KEYS', name: 'Generate Individual Keys' },
];

/**
 * `loadOptions` for the "Roles" multi-select on both write paths (User Update
 * Roles and User Invitation Create). Returns the static `USER_ROLES` enum as
 * `{ name, value }` options; registered on the node as
 * `methods.loadOptions.getUserRoles`.
 *
 * Static (no HTTP call) because the role set is a fixed Apple enum, not
 * account-specific data — unlike the `listSearch` app/group pickers. The typed
 * multi-select is a convenience over the JSON escape hatch; the raw JSON Input
 * Mode remains available for any value not yet in this list.
 */
export async function getUserRoles(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	return USER_ROLES.map((role) => ({ name: role.name, value: role.value }));
}
