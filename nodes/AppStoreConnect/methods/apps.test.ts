import type { ILoadOptionsFunctions } from 'n8n-workflow';

import { searchApps } from './apps';

/**
 * Tests for the reusable app-picker `listSearch`. These mock
 * `httpRequestWithAuthentication` to return *App Store Connect `GET /v1/apps`
 * responses* and assert the picker formats display names, filters, follows
 * cursor pages, and hands back a `paginationToken` for "load more".
 */

interface AscApp {
	id: string;
	attributes?: { name?: string; bundleId?: string };
}

function app(id: string, name?: string, bundleId?: string): AscApp {
	return { id, attributes: { name, bundleId } };
}

type HttpImpl = (credential: string, options: { url: string; qs?: unknown }) => Promise<unknown>;

function makeCtx(impl: HttpImpl) {
	const httpRequestWithAuthentication = jest.fn(function (
		credential: string,
		options: { url: string; qs?: unknown },
	) {
		return impl(credential, options);
	});

	const ctx = {
		helpers: { httpRequestWithAuthentication },
	} as unknown as ILoadOptionsFunctions;

	return { ctx, httpRequestWithAuthentication };
}

describe('searchApps', () => {
	it('maps apps to "Name (bundleId)" display names and app id values', async () => {
		const { ctx } = makeCtx(async () => ({
			data: [app('1', 'Alpha', 'com.acme.alpha'), app('2', 'Beta', 'com.acme.beta')],
			links: { next: null },
		}));

		const result = await searchApps.call(ctx);

		expect(result.results).toEqual([
			{ name: 'Alpha (com.acme.alpha)', value: '1' },
			{ name: 'Beta (com.acme.beta)', value: '2' },
		]);
		expect(result.paginationToken).toBeUndefined();
	});

	it('authenticates with the ASC API credential and requests the largest page', async () => {
		const { ctx, httpRequestWithAuthentication } = makeCtx(async () => ({
			data: [],
			links: { next: null },
		}));

		await searchApps.call(ctx);

		const [credential, options] = httpRequestWithAuthentication.mock.calls[0];
		expect(credential).toBe('appStoreConnectApi');
		expect(options).toMatchObject({ method: 'GET', url: '/v1/apps', qs: { limit: 200 } });
	});

	it('filters by name and bundle id, case-insensitively', async () => {
		const data = [app('1', 'Alpha', 'com.acme.alpha'), app('2', 'Beta', 'com.acme.beta')];
		const impl: HttpImpl = async () => ({ data, links: { next: null } });

		const byName = await searchApps.call(makeCtx(impl).ctx, 'BETA');
		expect(byName.results).toEqual([{ name: 'Beta (com.acme.beta)', value: '2' }]);

		const byBundle = await searchApps.call(makeCtx(impl).ctx, 'acme.alpha');
		expect(byBundle.results).toEqual([{ name: 'Alpha (com.acme.alpha)', value: '1' }]);
	});

	it('falls back to name-only, then to the id, when metadata is missing', async () => {
		const { ctx } = makeCtx(async () => ({
			data: [app('1', 'NoBundle'), { id: '2' }],
			links: { next: null },
		}));

		const result = await searchApps.call(ctx);

		expect(result.results).toEqual([
			{ name: 'NoBundle', value: '1' },
			{ name: '2', value: '2' }, // no attributes at all → id as label
		]);
	});

	it('starts from the supplied paginationToken URL instead of the default first page', async () => {
		const token = 'https://api.appstoreconnect.apple.com/v1/apps?cursor=deadbeef';
		let seenUrl: string | undefined;
		let seenQs: unknown;
		const { ctx } = makeCtx(async (_cred, options) => {
			seenUrl = options.url;
			seenQs = options.qs;
			return { data: [app('9', 'Nine', 'com.acme.nine')], links: { next: null } };
		});

		const result = await searchApps.call(ctx, undefined, token);

		expect(seenUrl).toBe(token);
		expect(seenQs).toBeUndefined(); // the token URL carries its own cursor + page size
		expect(result.results).toEqual([{ name: 'Nine (com.acme.nine)', value: '9' }]);
	});

	it('follows links.next across pages and concatenates results', async () => {
		const cursor2 = 'https://api.appstoreconnect.apple.com/v1/apps?cursor=2';
		const { ctx, httpRequestWithAuthentication } = makeCtx(async (_cred, options) => {
			if (options.url === '/v1/apps') {
				return { data: [app('1', 'One', 'com.a.one')], links: { next: cursor2 } };
			}
			if (options.url === cursor2) {
				return { data: [app('2', 'Two', 'com.a.two')], links: { next: null } };
			}
			throw new Error(`unexpected url ${options.url}`);
		});

		const result = await searchApps.call(ctx);

		expect(result.results.map((r) => r.value)).toEqual(['1', '2']);
		expect(httpRequestWithAuthentication).toHaveBeenCalledTimes(2);
	});

	it('stops at the internal fetch limit and returns links.next as the paginationToken', async () => {
		// 3 full pages of 200 reach the picker's 600-record fetch budget; the last
		// page's links.next becomes the "load more" token handed back to n8n.
		const cursors = [
			'https://api.appstoreconnect.apple.com/v1/apps?cursor=2',
			'https://api.appstoreconnect.apple.com/v1/apps?cursor=3',
			'https://api.appstoreconnect.apple.com/v1/apps?cursor=4',
		];
		const fullPage = (p: number, next: string) => ({
			data: Array.from({ length: 200 }, (_, i) => app(`${p}-${i}`, `App ${p}-${i}`, `com.x.p${p}n${i}`)),
			links: { next },
		});

		const { ctx, httpRequestWithAuthentication } = makeCtx(async (_cred, options) => {
			if (options.url === '/v1/apps') return fullPage(1, cursors[0]);
			if (options.url === cursors[0]) return fullPage(2, cursors[1]);
			if (options.url === cursors[1]) return fullPage(3, cursors[2]);
			throw new Error(`over-fetched: ${options.url}`);
		});

		const result = await searchApps.call(ctx);

		expect(result.results).toHaveLength(600);
		expect(result.paginationToken).toBe(cursors[2]);
		expect(httpRequestWithAuthentication).toHaveBeenCalledTimes(3);
	});
});
