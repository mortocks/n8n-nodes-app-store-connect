import type { ILoadOptionsFunctions } from 'n8n-workflow';

import { searchBetaGroups } from './betaGroups';

/**
 * Tests for the reusable beta-group picker `listSearch`. These mock
 * `httpRequestWithAuthentication` to return *App Store Connect `GET
 * /v1/betaGroups` responses* and assert the picker formats display names,
 * filters by name, follows cursor pages, and hands back a `paginationToken` for
 * "load more" — mirroring `methods/apps.test.ts`.
 */

interface AscBetaGroup {
	id: string;
	attributes?: { name?: string };
}

function group(id: string, name?: string): AscBetaGroup {
	return { id, attributes: { name } };
}

type HttpImpl = (credential: string, options: { url: string; qs?: unknown }) => Promise<unknown>;

function makeCtx(impl: HttpImpl, params: Record<string, unknown> = {}) {
	const httpRequestWithAuthentication = jest.fn(function (
		credential: string,
		options: { url: string; qs?: unknown },
	) {
		return impl(credential, options);
	});

	const ctx = {
		helpers: { httpRequestWithAuthentication },
		// Optional "Target App" scoping field the picker reads to narrow results.
		getNodeParameter: (name: string, fallback?: unknown) =>
			name in params ? params[name] : fallback,
	} as unknown as ILoadOptionsFunctions;

	return { ctx, httpRequestWithAuthentication };
}

describe('searchBetaGroups', () => {
	it('maps beta groups to name display labels and group id values', async () => {
		const { ctx } = makeCtx(async () => ({
			data: [group('g1', 'Internal QA'), group('g2', 'Public Beta')],
			links: { next: null },
		}));

		const result = await searchBetaGroups.call(ctx);

		expect(result.results).toEqual([
			{ name: 'Internal QA', value: 'g1' },
			{ name: 'Public Beta', value: 'g2' },
		]);
		expect(result.paginationToken).toBeUndefined();
	});

	it('authenticates with the ASC API credential and requests the largest page', async () => {
		const { ctx, httpRequestWithAuthentication } = makeCtx(async () => ({
			data: [],
			links: { next: null },
		}));

		await searchBetaGroups.call(ctx);

		const [credential, options] = httpRequestWithAuthentication.mock.calls[0];
		expect(credential).toBe('appStoreConnectApi');
		expect(options).toMatchObject({ method: 'GET', url: '/v1/betaGroups', qs: { limit: 200 } });
	});

	it('scopes the picker to a chosen Target App via filter[app]', async () => {
		const { ctx, httpRequestWithAuthentication } = makeCtx(
			async () => ({ data: [group('g1', 'QA')], links: { next: null } }),
			{ targetApp: 'app-42' },
		);

		await searchBetaGroups.call(ctx);

		const [, options] = httpRequestWithAuthentication.mock.calls[0];
		expect(options).toMatchObject({
			url: '/v1/betaGroups',
			qs: { limit: 200, 'filter[app]': 'app-42' },
		});
	});

	it('omits filter[app] when no Target App is chosen', async () => {
		const { ctx, httpRequestWithAuthentication } = makeCtx(
			async () => ({ data: [], links: { next: null } }),
			{ targetApp: '' },
		);

		await searchBetaGroups.call(ctx);

		const [, options] = httpRequestWithAuthentication.mock.calls[0];
		expect((options.qs as Record<string, unknown>)['filter[app]']).toBeUndefined();
	});

	it('filters by name, case-insensitively', async () => {
		const data = [group('g1', 'Internal QA'), group('g2', 'Public Beta')];
		const impl: HttpImpl = async () => ({ data, links: { next: null } });

		const result = await searchBetaGroups.call(makeCtx(impl).ctx, 'public');
		expect(result.results).toEqual([{ name: 'Public Beta', value: 'g2' }]);
	});

	it('falls back to the id when the name is missing', async () => {
		const { ctx } = makeCtx(async () => ({
			data: [group('g1', 'Named'), { id: 'G2' }],
			links: { next: null },
		}));

		const result = await searchBetaGroups.call(ctx);

		expect(result.results).toEqual([
			{ name: 'Named', value: 'g1' },
			{ name: 'G2', value: 'G2' }, // no attributes at all → id as label
		]);
	});

	it('starts from the supplied paginationToken URL instead of the default first page', async () => {
		const token = 'https://api.appstoreconnect.apple.com/v1/betaGroups?cursor=deadbeef';
		let seenUrl: string | undefined;
		let seenQs: unknown;
		const { ctx } = makeCtx(async (_cred, options) => {
			seenUrl = options.url;
			seenQs = options.qs;
			return { data: [group('g9', 'Nine')], links: { next: null } };
		});

		const result = await searchBetaGroups.call(ctx, undefined, token);

		expect(seenUrl).toBe(token);
		expect(seenQs).toBeUndefined(); // the token URL carries its own cursor + page size
		expect(result.results).toEqual([{ name: 'Nine', value: 'g9' }]);
	});

	it('follows links.next across pages and concatenates results', async () => {
		const cursor2 = 'https://api.appstoreconnect.apple.com/v1/betaGroups?cursor=2';
		const { ctx, httpRequestWithAuthentication } = makeCtx(async (_cred, options) => {
			if (options.url === '/v1/betaGroups') {
				return { data: [group('g1', 'One')], links: { next: cursor2 } };
			}
			if (options.url === cursor2) {
				return { data: [group('g2', 'Two')], links: { next: null } };
			}
			throw new Error(`unexpected url ${options.url}`);
		});

		const result = await searchBetaGroups.call(ctx);

		expect(result.results.map((r) => r.value)).toEqual(['g1', 'g2']);
		expect(httpRequestWithAuthentication).toHaveBeenCalledTimes(2);
	});

	it('stops at the internal fetch limit and returns links.next as the paginationToken', async () => {
		// 3 full pages of 200 reach the picker's 600-record fetch budget; the last
		// page's links.next becomes the "load more" token handed back to n8n.
		const cursors = [
			'https://api.appstoreconnect.apple.com/v1/betaGroups?cursor=2',
			'https://api.appstoreconnect.apple.com/v1/betaGroups?cursor=3',
			'https://api.appstoreconnect.apple.com/v1/betaGroups?cursor=4',
		];
		const fullPage = (p: number, next: string) => ({
			data: Array.from({ length: 200 }, (_, i) => group(`${p}-${i}`, `Group ${p}-${i}`)),
			links: { next },
		});

		const { ctx, httpRequestWithAuthentication } = makeCtx(async (_cred, options) => {
			if (options.url === '/v1/betaGroups') return fullPage(1, cursors[0]);
			if (options.url === cursors[0]) return fullPage(2, cursors[1]);
			if (options.url === cursors[1]) return fullPage(3, cursors[2]);
			throw new Error(`over-fetched: ${options.url}`);
		});

		const result = await searchBetaGroups.call(ctx);

		expect(result.results).toHaveLength(600);
		expect(result.paginationToken).toBe(cursors[2]);
		expect(httpRequestWithAuthentication).toHaveBeenCalledTimes(3);
	});
});
