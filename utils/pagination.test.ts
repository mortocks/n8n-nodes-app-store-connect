import { paginate, type PaginatedPage } from './pagination';

interface Item {
	id: string;
}

/**
 * Build a fake page-fetcher over a fixed set of pages. Records the URLs it was
 * asked for so tests can assert exactly how far pagination walked — no network.
 */
function fakeFetcher(pages: Array<PaginatedPage<Item>>) {
	const requested: Array<string | undefined> = [];
	let pageIndex = 0;
	const fetchPage = async (nextUrl?: string): Promise<PaginatedPage<Item>> => {
		requested.push(nextUrl);
		const page = pages[pageIndex];
		pageIndex += 1;
		if (!page) {
			throw new Error(`fetcher called ${pageIndex} times but only ${pages.length} pages exist`);
		}
		return page;
	};
	return { fetchPage, requested, callCount: () => pageIndex };
}

function items(...ids: string[]): Item[] {
	return ids.map((id) => ({ id }));
}

describe('paginate', () => {
	describe('returnAll', () => {
		it('follows links.next across multiple pages and concatenates items', async () => {
			const { fetchPage, requested } = fakeFetcher([
				{ items: items('a', 'b'), nextUrl: 'https://api/page2' },
				{ items: items('c', 'd'), nextUrl: 'https://api/page3' },
				{ items: items('e'), nextUrl: undefined },
			]);

			const result = await paginate(fetchPage, { returnAll: true });

			expect(result.map((i) => i.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
			// First call has no cursor; subsequent calls follow links.next verbatim.
			expect(requested).toEqual([undefined, 'https://api/page2', 'https://api/page3']);
		});

		it('stops when links.next is null (not just undefined)', async () => {
			const { fetchPage, callCount } = fakeFetcher([
				{ items: items('a'), nextUrl: null },
			]);

			const result = await paginate(fetchPage, { returnAll: true });

			expect(result.map((i) => i.id)).toEqual(['a']);
			expect(callCount()).toBe(1);
		});

		it('returns an empty array when the first page is empty', async () => {
			const { fetchPage, callCount } = fakeFetcher([{ items: [], nextUrl: undefined }]);

			const result = await paginate(fetchPage, { returnAll: true });

			expect(result).toEqual([]);
			expect(callCount()).toBe(1);
		});
	});

	describe('limit', () => {
		it('truncates the final page to the limit and stops fetching', async () => {
			const { fetchPage, callCount } = fakeFetcher([
				{ items: items('a', 'b', 'c'), nextUrl: 'https://api/page2' },
				{ items: items('d', 'e', 'f'), nextUrl: 'https://api/page3' },
			]);

			const result = await paginate(fetchPage, { returnAll: false, limit: 4 });

			expect(result.map((i) => i.id)).toEqual(['a', 'b', 'c', 'd']);
			// Only two pages needed to reach the limit; the third is never fetched.
			expect(callCount()).toBe(2);
		});

		it('stops after the first page when it already satisfies the limit', async () => {
			const { fetchPage, callCount } = fakeFetcher([
				{ items: items('a', 'b', 'c'), nextUrl: 'https://api/page2' },
			]);

			const result = await paginate(fetchPage, { returnAll: false, limit: 2 });

			expect(result.map((i) => i.id)).toEqual(['a', 'b']);
			expect(callCount()).toBe(1);
		});

		it('returns fewer items than the limit when the data runs out', async () => {
			const { fetchPage, callCount } = fakeFetcher([
				{ items: items('a', 'b'), nextUrl: undefined },
			]);

			const result = await paginate(fetchPage, { returnAll: false, limit: 100 });

			expect(result.map((i) => i.id)).toEqual(['a', 'b']);
			expect(callCount()).toBe(1);
		});

		it('throws when returnAll is false and the limit is not positive', async () => {
			const { fetchPage } = fakeFetcher([]);
			await expect(paginate(fetchPage, { returnAll: false, limit: 0 })).rejects.toThrow(
				/positive limit/i,
			);
		});
	});
});
