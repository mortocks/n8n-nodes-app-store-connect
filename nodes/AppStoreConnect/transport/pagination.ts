import type {
	DeclarativeRestApiSettings,
	IDataObject,
	IExecutePaginationFunctions,
	INodeExecutionData,
} from 'n8n-workflow';

import { paginate } from '../../../utils/pagination';
import { simplifyJsonApi } from '../resources/_shared/simplify';
import { withAscErrorMapping } from './errors';

/** App Store Connect's maximum page size. */
const ASC_MAX_PAGE_SIZE = 200;

interface JsonApiListBody {
	data?: IDataObject[];
	links?: { next?: string | null };
}

/**
 * Read the raw JSON:API list body out of whatever `makeRoutingRequest`
 * returned. With no data-extracting `postReceive` on the operation, the routing
 * layer hands back the full response body as a single item's `json`, which is
 * exactly what we need so module E can see `links.next`.
 */
function extractBody(items: INodeExecutionData[]): JsonApiListBody {
	const first = items[0]?.json as JsonApiListBody | undefined;
	if (first && (Array.isArray(first.data) || first.links !== undefined)) {
		return first;
	}
	// Defensive fallback: treat the returned items as the data array itself
	// (a single, unpaginated page).
	return { data: items.map((item) => item.json as IDataObject) };
}

/**
 * Declarative pagination hook for cursor-paginated ASC list endpoints.
 *
 * This is the thin, framework-coupled wiring (validated in a live n8n instance,
 * not unit-tested). All the follow/stop/truncate logic lives in the pure,
 * unit-tested module E (`paginate`); this function only adapts n8n's
 * `makeRoutingRequest` into module E's injected page-fetcher and maps ASC
 * errors through module D.
 *
 * Reused as-is by future list operations (e.g. Task 04's List Deliveries) —
 * only the initial `requestOptions.options.url` differs.
 */
export async function ascCursorPagination(
	this: IExecutePaginationFunctions,
	requestOptions: DeclarativeRestApiSettings.ResultOptions,
): Promise<INodeExecutionData[]> {
	const returnAll = this.getNodeParameter('returnAll', false) as boolean;
	const limit = returnAll ? undefined : (this.getNodeParameter('limit', 100) as number);

	// First-page query params: request the largest useful page size.
	requestOptions.options.qs = {
		...requestOptions.options.qs,
		limit: returnAll
			? ASC_MAX_PAGE_SIZE
			: Math.min(Math.max(limit ?? 1, 1), ASC_MAX_PAGE_SIZE),
	};

	return withAscErrorMapping(this, async () => {
		const items = await paginate<IDataObject>(
			async (nextUrl) => {
				if (nextUrl) {
					// `links.next` is absolute, so it fully overrides the base URL and
					// carries its own cursor + page-size query params.
					requestOptions.options.url = nextUrl;
					requestOptions.options.qs = {};
				}
				const responseItems = await this.makeRoutingRequest(requestOptions);
				const body = extractBody(responseItems);
				return {
					items: body.data ?? [],
					nextUrl: body.links?.next ?? undefined,
				};
			},
			{ returnAll, limit },
		);

		// Flatten each list element's JSON:API envelope when Simplify is on
		// (identical transform to the single-request hook); off by default for
		// operations that don't mount the field.
		const simplify = this.getNodeParameter('simplify', false) as boolean;
		return items.map((json) => ({ json: simplify ? simplifyJsonApi(json) : json }));
	});
}
