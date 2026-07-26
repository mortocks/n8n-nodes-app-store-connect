/**
 * Deep module E — `pagination`.
 *
 * Pure cursor follower over JSON:API `links.next`. It knows nothing about n8n,
 * HTTP, or App Store Connect specifics: it drives an injected page-fetcher and
 * decides when to stop (multi-page follow for "Return All"; truncation once a
 * "Limit" is reached). This keeps it trivially unit-testable and reusable for
 * every ASC list endpoint (webhooks now, deliveries in Task 04).
 */

/** One page returned by the fetcher. */
export interface PaginatedPage<T> {
	/** The resource items on this page (the JSON:API `data` array). */
	items: T[];
	/**
	 * The absolute URL of the next page (`links.next`), or `undefined`/`null`
	 * when this is the last page.
	 */
	nextUrl?: string | null;
}

/**
 * Fetch a page.
 *
 * @param nextUrl the `links.next` URL to fetch, or `undefined` for the first
 *   page (the caller decides the initial request).
 */
export type PageFetcher<T> = (nextUrl?: string) => Promise<PaginatedPage<T>>;

export interface PaginateOptions {
	/** When true, follow `links.next` until it is absent. */
	returnAll: boolean;
	/**
	 * Maximum number of items to return when `returnAll` is false. Ignored when
	 * `returnAll` is true.
	 */
	limit?: number;
}

/**
 * Collect items across pages.
 *
 * - `returnAll: true` — follow every `links.next` and return all items.
 * - `returnAll: false` — stop as soon as `limit` items are collected, fetching
 *   no more pages than necessary and truncating the final page to `limit`.
 */
export async function paginate<T>(
	fetchPage: PageFetcher<T>,
	options: PaginateOptions,
): Promise<T[]> {
	const { returnAll } = options;

	if (!returnAll) {
		const limit = options.limit ?? 0;
		if (limit <= 0) {
			throw new Error('pagination: a positive limit is required when returnAll is false.');
		}
	}

	const collected: T[] = [];
	let nextUrl: string | undefined;

	do {
		const page = await fetchPage(nextUrl);
		collected.push(...page.items);

		if (!returnAll && collected.length >= (options.limit as number)) {
			return collected.slice(0, options.limit);
		}

		nextUrl = page.nextUrl ?? undefined;
	} while (nextUrl !== undefined);

	return collected;
}
