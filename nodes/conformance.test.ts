import type {
	ICredentialType,
	INodeProperties,
	INodePropertyOptions,
	INodeType,
} from 'n8n-workflow';

import { AppStoreConnectApi } from '../credentials/AppStoreConnectApi.credentials';
import { AppStoreConnectWebhook } from '../credentials/AppStoreConnectWebhook.credentials';
import { AppStoreConnect } from './AppStoreConnect/AppStoreConnect.node';
import { AppStoreConnectTrigger } from './AppStoreConnectTrigger/AppStoreConnectTrigger.node';
import { VerifyWebhookSignature } from './VerifyWebhookSignature/VerifyWebhookSignature.node';

/**
 * Node/credential CONFORMANCE tests.
 *
 * These don't exercise runtime behaviour (that's covered per-resource); they
 * assert the declarative node/credential *descriptions* follow n8n's UX
 * conventions — https://docs.n8n.io/connect/create-nodes/build-your-node/reference/ux-guidelines/.
 * They lock in the guideline fixes (Title-Case labels, "Whether…" boolean copy,
 * "e.g. " placeholders, masked secrets, well-formed operations/pickers) so a
 * future edit that regresses a convention fails `npm test`, not just review.
 *
 * The rules overlap with `eslint-plugin-n8n-nodes-base` on purpose — belt and
 * suspenders — and add structural checks the linter doesn't make (every option
 * has a value, operations carry an `action`, resourceLocators expose a From-List
 * mode, secrets are password-masked, referenced credentials exist).
 *
 * Each check collects offenders into an array and asserts it is empty, so a
 * failure prints exactly which property/option violated which rule.
 */

/**
 * Flatten a property tree into every `INodeProperties` node, descending into
 * `collection` options and `fixedCollection` group `values`. Does NOT descend
 * into `options`/`multiOptions` `options` — those are `INodePropertyOptions`
 * (name/value), a different shape, checked separately.
 */
function walkProps(props: INodeProperties[]): INodeProperties[] {
	const acc: INodeProperties[] = [];
	const recurse = (list: INodeProperties[] | undefined) => {
		for (const p of list ?? []) {
			acc.push(p);
			if (p.type === 'collection' && Array.isArray(p.options)) {
				recurse(p.options as INodeProperties[]);
			} else if (p.type === 'fixedCollection' && Array.isArray(p.options)) {
				for (const group of p.options as Array<{ values?: INodeProperties[] }>) {
					recurse(group.values);
				}
			}
		}
	};
	recurse(props);
	return acc;
}

const NODES: Array<{ label: string; node: INodeType }> = [
	{ label: 'AppStoreConnect', node: new AppStoreConnect() },
	{ label: 'AppStoreConnectTrigger', node: new AppStoreConnectTrigger() },
	{ label: 'VerifyWebhookSignature', node: new VerifyWebhookSignature() },
];

const CREDENTIALS: Array<{ label: string; cred: ICredentialType }> = [
	{ label: 'AppStoreConnectApi', cred: new AppStoreConnectApi() },
	{ label: 'AppStoreConnectWebhook', cred: new AppStoreConnectWebhook() },
];

/** displayName must be Title Case-ish: start with a capital/digit, no snake_case. */
const TITLE_CASE_START = /^[A-Z0-9]/;

describe.each(NODES)('node conformance: $label', ({ node }) => {
	const description = node.description;
	const allProps = walkProps(description.properties);

	it('has the required top-level description fields', () => {
		expect(typeof description.displayName).toBe('string');
		expect(description.displayName).toMatch(TITLE_CASE_START);
		expect(description.name).toMatch(/^[a-z][a-zA-Z0-9]*$/); // camelCase
		expect(description.version).toBeDefined();
		expect(typeof description.description).toBe('string');
		expect(description.description.length).toBeGreaterThan(0);
		expect(description.description).toMatch(/^[A-Z]/); // sentence case
		expect(description.defaults?.name).toBeTruthy();
		expect(description.inputs).toBeDefined();
		expect(description.outputs).toBeDefined();
		expect(description.icon).toBeTruthy();
		expect(Array.isArray(description.properties)).toBe(true);
	});

	it('every property has a name, a Title-Case displayName, and a default', () => {
		const missingName = allProps.filter((p) => !p.name).map((p) => p.displayName);
		const missingDisplayName = allProps.filter((p) => !p.displayName).map((p) => p.name);
		const badCasing = allProps
			.filter((p) => p.displayName && (!TITLE_CASE_START.test(p.displayName) || p.displayName.includes('_')))
			.map((p) => p.displayName);
		const missingDefault = allProps
			.filter((p) => p.type !== 'notice' && p.default === undefined)
			.map((p) => p.name);

		expect({ missingName, missingDisplayName, badCasing, missingDefault }).toEqual({
			missingName: [],
			missingDisplayName: [],
			badCasing: [],
			missingDefault: [],
		});
	});

	it('boolean parameter descriptions start with "Whether"', () => {
		const offenders = allProps
			.filter((p) => p.type === 'boolean' && !(p.description ?? '').startsWith('Whether'))
			.map((p) => ({ name: p.name, description: p.description }));
		expect(offenders).toEqual([]);
	});

	it('string/number placeholders begin with "e.g. "', () => {
		const offenders = allProps
			.filter(
				(p) =>
					(p.type === 'string' || p.type === 'number') &&
					typeof p.placeholder === 'string' &&
					!p.placeholder.startsWith('e.g. '),
			)
			.map((p) => ({ name: p.name, placeholder: p.placeholder }));
		expect(offenders).toEqual([]);
	});

	it('options/multiOptions entries all have a non-empty name and a defined value', () => {
		const offenders: unknown[] = [];
		for (const p of allProps.filter((x) => x.type === 'options' || x.type === 'multiOptions')) {
			// Fields backed by a dynamic `loadOptionsMethod` (e.g. the Roles
			// multi-select) legitimately carry no static `options` array.
			if (p.typeOptions?.loadOptionsMethod || p.typeOptions?.loadOptions) continue;
			const options = (p.options ?? []) as INodePropertyOptions[];
			if (options.length === 0) offenders.push({ param: p.name, issue: 'no options' });
			for (const o of options) {
				if (typeof o.name !== 'string' || o.name.length === 0)
					offenders.push({ param: p.name, issue: 'empty name', value: o.value });
				if (o.value === undefined)
					offenders.push({ param: p.name, issue: 'missing value', name: o.name });
			}
		}
		expect(offenders).toEqual([]);
	});

	it('every operation option carries an action', () => {
		const offenders: unknown[] = [];
		for (const p of allProps.filter((x) => x.name === 'operation' && x.type === 'options')) {
			for (const o of (p.options ?? []) as INodePropertyOptions[]) {
				if (typeof o.action !== 'string' || o.action.length === 0)
					offenders.push({ operation: o.value });
			}
		}
		expect(offenders).toEqual([]);
	});

	it('resourceLocators expose a From-List mode with a search method and an ID mode', () => {
		const offenders: unknown[] = [];
		for (const p of allProps.filter((x) => x.type === 'resourceLocator')) {
			const modes = (p.modes ?? []) as Array<{
				type?: string;
				typeOptions?: { searchListMethod?: string };
			}>;
			const list = modes.find((m) => m.type === 'list');
			if (!list) offenders.push({ name: p.name, issue: 'no From-List mode' });
			else if (typeof list.typeOptions?.searchListMethod !== 'string')
				offenders.push({ name: p.name, issue: 'From-List missing searchListMethod' });
			if (!modes.some((m) => m.type === 'string'))
				offenders.push({ name: p.name, issue: 'no ID mode' });
			if (p.default === undefined) offenders.push({ name: p.name, issue: 'no default' });
		}
		expect(offenders).toEqual([]);
	});
});

describe('AppStoreConnect resource dropdown', () => {
	const resourceProp = walkProps(new AppStoreConnect().description.properties).find(
		(p) => p.name === 'resource',
	);

	it('exists and every resource option has a Title-Case name + string value', () => {
		expect(resourceProp).toBeDefined();
		const options = (resourceProp?.options ?? []) as INodePropertyOptions[];
		expect(options.length).toBeGreaterThan(1);
		const offenders = options.filter(
			(o) => !TITLE_CASE_START.test(o.name) || typeof o.value !== 'string',
		);
		expect(offenders).toEqual([]);
	});

	it('lists resources alphabetically by display name', () => {
		const names = ((resourceProp?.options ?? []) as INodePropertyOptions[]).map((o) => o.name);
		const sorted = [...names].sort((a, b) => a.localeCompare(b));
		expect(names).toEqual(sorted);
	});
});

describe.each(CREDENTIALS)('credential conformance: $label', ({ cred }) => {
	it('has a camelCase name, Title-Case displayName, and properties', () => {
		expect(cred.name).toMatch(/^[a-z][a-zA-Z0-9]*$/);
		expect(cred.displayName).toMatch(TITLE_CASE_START);
		expect(Array.isArray(cred.properties)).toBe(true);
	});
});

describe('credential secret masking', () => {
	it('masks the App Store Connect API private key', () => {
		const pk = new AppStoreConnectApi().properties.find((p) => p.name === 'privateKey');
		expect(pk).toBeDefined();
		expect(pk?.typeOptions?.password).toBe(true);
	});

	it('masks the webhook Secret', () => {
		const secret = new AppStoreConnectWebhook().properties.find((p) => p.name === 'secret');
		expect(secret).toBeDefined();
		expect(secret?.typeOptions?.password).toBe(true);
	});
});

describe('node → credential references resolve', () => {
	const credNames = new Set(CREDENTIALS.map(({ cred }) => cred.name));

	it('every credential a node references is one this package defines', () => {
		const offenders: string[] = [];
		for (const { node } of NODES) {
			for (const ref of node.description.credentials ?? []) {
				if (!credNames.has(ref.name)) offenders.push(ref.name);
			}
		}
		expect(offenders).toEqual([]);
	});
});
