import type { ILoadOptionsFunctions } from 'n8n-workflow';

import { USER_ROLES, getUserRoles } from './roles';

/**
 * Tests for the shared `getUserRoles` loadOptions helper backing the Roles
 * multi-select on the Users (Update Roles) and User Invitations (Create) write
 * paths. Static enum — no HTTP — so the ctx is a bare stub.
 */

describe('getUserRoles', () => {
	const ctx = {} as unknown as ILoadOptionsFunctions;

	it('returns every known ASC role as an { name, value } option', async () => {
		const options = await getUserRoles.call(ctx);

		expect(options).toHaveLength(USER_ROLES.length);
		expect(options.map((o) => o.value)).toEqual([
			'ADMIN',
			'FINANCE',
			'ACCOUNT_HOLDER',
			'SALES',
			'MARKETING',
			'APP_MANAGER',
			'DEVELOPER',
			'ACCESS_TO_REPORTS',
			'CUSTOMER_SUPPORT',
			'CREATE_APPS',
			'CLOUD_MANAGED_DEVELOPER_ID',
			'CLOUD_MANAGED_APP_DISTRIBUTION',
			'GENERATE_INDIVIDUAL_KEYS',
		]);
	});

	it('pairs each wire value with a human-readable label', async () => {
		const options = await getUserRoles.call(ctx);

		expect(options).toContainEqual({ name: 'Account Holder', value: 'ACCOUNT_HOLDER' });
		expect(options).toContainEqual({ name: 'Admin', value: 'ADMIN' });
		expect(options.every((o) => typeof o.name === 'string' && o.name.length > 0)).toBe(true);
	});
});
