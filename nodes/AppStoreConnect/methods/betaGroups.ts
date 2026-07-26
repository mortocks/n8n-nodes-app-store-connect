import type { IHttpRequestOptions, ILoadOptionsFunctions, INodeListSearchResult } from 'n8n-workflow';

import { paginate } from '../../../utils/pagination';

/** App Store Connect's maximum page size (see `docs/apple-api-notes.md`). */
const ASC_MAX_PAGE_SIZE = 200;

/**
 * How many raw `betaGroups` records to look at (across as many pages as it
 * takes) before handing results back to the dropdown. A few pages gives a
 * filtered search a real chance of finding matches beyond the first page without
 * fetching every group up front.
 */
const SEARCH_FETCH_LIMIT = 3 * ASC_MAX_PAGE_SIZE;

interface AscBetaGroup {
	id: string;
	attributes?: {
		name?: string;
	};
}

interface AscBetaGroupListBody {
	data?: AscBetaGroup[];
	links?: { next?: string | null };
}

function betaGroupDisplayName(group: AscBetaGroup): string {
	return group.attributes?.name?.trim() || group.id;
}

/**
 * Read the optional "Target App" scoping field (`targetApp`) from the current
 * node parameters, returning its extracted app id or `undefined`.
 *
 * The Beta Group picker is reused on operations that also expose an optional
 * Target App field (Beta Group Get/Update/Delete, Beta Tester
 * Add/Remove/Create/Get Many). When the user picks an app, we narrow the picker
 * to that app via `filter[app]`; otherwise it lists all groups. Robust to the
 * value arriving already-extracted (a string) or as the raw resourceLocator
 * object, and to the field being absent on some operations (returns undefined).
 */
function readTargetAppId(this: ILoadOptionsFunctions): string | undefined {
	let raw: unknown;
	try {
		raw = this.getNodeParameter('targetApp', '', { extractValue: true });
	} catch {
		return undefined;
	}
	if (raw && typeof raw === 'object' && 'value' in raw) {
		raw = (raw as { value?: unknown }).value;
	}
	const id = typeof raw === 'string' ? raw.trim() : '';
	return id || undefined;
}

function matchesFilter(group: AscBetaGroup, normalizedFilter: string | undefined): boolean {
	if (!normalizedFilter) {
		return true;
	}
	const name = group.attributes?.name?.toLowerCase() ?? '';
	return name.includes(normalizedFilter);
}

/**
 * Fetch up to `SEARCH_FETCH_LIMIT` beta groups, starting from `startUrl` (a
 * prior `links.next`, or `undefined` for a fresh first page). Reuses deep module
 * E (`paginate`) to advance across pages; the last page's `links.next` (captured
 * via the closure below) becomes the n8n `paginationToken` for a later "load
 * more" call — identical mechanics to `methods/apps.ts`.
 */
async function fetchBetaGroups(
	this: ILoadOptionsFunctions,
	startUrl: string | undefined,
	appId: string | undefined,
): Promise<{ items: AscBetaGroup[]; nextUrl?: string }> {
	let lastNextUrl: string | undefined;

	const items = await paginate<AscBetaGroup>(
		async (nextUrl) => {
			const requestOptions: IHttpRequestOptions = nextUrl
				? { method: 'GET', url: nextUrl }
				: {
						method: 'GET',
						url: '/v1/betaGroups',
						baseURL: 'https://api.appstoreconnect.apple.com',
						// When a Target App is chosen, narrow the picker to that app.
						// Only set on the fresh first page — `links.next` already carries
						// the filter forward on subsequent pages.
						qs: {
							limit: ASC_MAX_PAGE_SIZE,
							...(appId ? { 'filter[app]': appId } : {}),
						},
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
			)) as AscBetaGroupListBody;

			lastNextUrl = body.links?.next ?? undefined;
			return { items: body.data ?? [], nextUrl: lastNextUrl };
		},
		{ returnAll: false, limit: SEARCH_FETCH_LIMIT },
	);

	return { items, nextUrl: lastNextUrl };
}

/**
 * `listSearch` for the "Beta Group" resourceLocator's "From List" mode
 * (`GET /v1/betaGroups`), showing each group's name. Exposed via
 * `methods.listSearch.searchBetaGroups` on the node so the Beta Tester
 * Add/Remove-to-Group operations and the Beta Group resource's own
 * Get/Update/Delete locator can reuse it — mirrors `methods/apps.ts`'s
 * `searchApps`.
 *
 * Framework wiring: validated manually in a live n8n instance, not
 * unit-tested (per the PRD's testing decisions) — the picker's list-formatting
 * and pagination-token behaviour are covered by the colocated unit test.
 */
export async function searchBetaGroups(
	this: ILoadOptionsFunctions,
	filter?: string,
	paginationToken?: string,
): Promise<INodeListSearchResult> {
	const normalizedFilter = filter?.trim().toLowerCase() || undefined;
	const appId = readTargetAppId.call(this);

	const { items, nextUrl } = await fetchBetaGroups.call(this, paginationToken, appId);

	const results = items
		.filter((group) => matchesFilter(group, normalizedFilter))
		.map((group) => ({
			name: betaGroupDisplayName(group),
			value: group.id,
		}));

	return {
		results,
		paginationToken: nextUrl,
	};
}
