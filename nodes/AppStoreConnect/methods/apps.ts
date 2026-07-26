import type { IHttpRequestOptions, ILoadOptionsFunctions, INodeListSearchResult } from 'n8n-workflow';

import { paginate } from '../../../utils/pagination';

/** App Store Connect's maximum page size (see `docs/apple-api-notes.md`). */
const ASC_MAX_PAGE_SIZE = 200;

/**
 * How many raw `apps` records to look at (across as many pages as it takes)
 * before handing results back to the dropdown. A few pages gives a filtered
 * search a real chance of finding matches beyond the first page without the
 * picker needing to fetch the caller's entire app catalogue up front.
 */
const SEARCH_FETCH_LIMIT = 3 * ASC_MAX_PAGE_SIZE;

/** JSON:API resource type for apps, used in `relationships.app.data.type`. */
export const APP_RESOURCE_TYPE = 'apps';

interface AscApp {
	id: string;
	attributes?: {
		name?: string;
		bundleId?: string;
	};
}

interface AscAppListBody {
	data?: AscApp[];
	links?: { next?: string | null };
}

function appDisplayName(app: AscApp): string {
	const name = app.attributes?.name?.trim() || app.id;
	const bundleId = app.attributes?.bundleId?.trim();
	return bundleId ? `${name} (${bundleId})` : name;
}

function matchesFilter(app: AscApp, normalizedFilter: string | undefined): boolean {
	if (!normalizedFilter) {
		return true;
	}
	const name = app.attributes?.name?.toLowerCase() ?? '';
	const bundleId = app.attributes?.bundleId?.toLowerCase() ?? '';
	return name.includes(normalizedFilter) || bundleId.includes(normalizedFilter);
}

/**
 * Fetch up to `SEARCH_FETCH_LIMIT` apps, starting from `startUrl` (a prior
 * `links.next`, or `undefined` for a fresh first page). Reuses deep module E
 * (`paginate`) to advance across pages and stop once enough raw records have
 * been collected; the last page's `links.next` (captured via the closure
 * below) becomes the n8n `paginationToken` for a later "load more" call.
 */
async function fetchApps(
	this: ILoadOptionsFunctions,
	startUrl: string | undefined,
): Promise<{ items: AscApp[]; nextUrl?: string }> {
	let lastNextUrl: string | undefined;

	const items = await paginate<AscApp>(
		async (nextUrl) => {
			const requestOptions: IHttpRequestOptions = nextUrl
				? { method: 'GET', url: nextUrl }
				: {
						method: 'GET',
						url: '/v1/apps',
						baseURL: 'https://api.appstoreconnect.apple.com',
						qs: { limit: ASC_MAX_PAGE_SIZE },
					};

			// `startUrl`, when present, replaces the first request entirely (it is
			// itself an absolute `links.next` URL from a previous call).
			if (!nextUrl && startUrl) {
				requestOptions.url = startUrl;
				delete requestOptions.qs;
			}

			const body = (await this.helpers.httpRequestWithAuthentication.call(
				this,
				'appStoreConnectApi',
				requestOptions,
			)) as AscAppListBody;

			lastNextUrl = body.links?.next ?? undefined;
			return { items: body.data ?? [], nextUrl: lastNextUrl };
		},
		{ returnAll: false, limit: SEARCH_FETCH_LIMIT },
	);

	return { items, nextUrl: lastNextUrl };
}

/**
 * `listSearch` for the "Target App" resourceLocator's "From List" mode
 * (`GET /v1/apps`), showing each app's name and bundle ID. Exposed via
 * `methods.listSearch.searchApps` on the node so any future app-scoped
 * resource can reuse it directly — see `docs/apple-api-notes.md` → "Apps (for
 * the picker)".
 *
 * Framework wiring: validated manually in a live n8n instance, not
 * unit-tested (per the PRD's testing decisions).
 */
export async function searchApps(
	this: ILoadOptionsFunctions,
	filter?: string,
	paginationToken?: string,
): Promise<INodeListSearchResult> {
	const normalizedFilter = filter?.trim().toLowerCase() || undefined;

	const { items, nextUrl } = await fetchApps.call(this, paginationToken);

	const results = items.filter((app) => matchesFilter(app, normalizedFilter)).map((app) => ({
		name: appDisplayName(app),
		value: app.id,
	}));

	return {
		results,
		paginationToken: nextUrl,
	};
}
