import type {
	IDisplayOptions,
	IExecuteSingleFunctions,
	IHttpRequestOptions,
	INodeProperties,
	INodePropertyOptions,
} from 'n8n-workflow';

/**
 * Shared helpers for the curated list-filter pattern.
 *
 * Every Get Many operation exposes the App Store Connect API's *documented*
 * filters and sort keys as first-class typed UI (dropdowns / typed fields), so
 * users get discoverability and validation for the common cases — while the
 * generic "Query Options" collection (`queryOptions.ts`) stays mounted as the
 * escape hatch for any `filter[key]` / `sort` Apple adds later.
 *
 * Two pieces make it repeatable across resources:
 *   - **`sortField`** builds the standard "Sort" dropdown from a resource's
 *     documented sort values; a leading "Default (Unsorted)" option maps to the
 *     empty string so nothing is sent unless the user chooses an order.
 *   - **`attachSort`** is the `preSend` hook that folds that dropdown into
 *     `qs.sort`. Add it to a Get Many's `preSend` chain *before*
 *     `attachQueryOptions`, so an explicit `sort` in Query Options still wins.
 *
 * The per-resource *filter* fields are declared in each resource (their keys and
 * value types differ), and folded into `filter[...]` by that resource's own
 * `attach<Resource>Filters` hook — this module only owns the shared Sort plumbing
 * plus the `TRISTATE_OPTIONS` used by optional boolean filters.
 */

/** The node-parameter name the Sort dropdown lives under. */
const SORT_PARAMETER = 'sort';

/**
 * Options for an optional boolean filter. A boolean field always sends a value
 * (so it would always filter); this three-way "Any / Yes / No" instead leaves
 * the filter off unless the user picks Yes/No. `attach<Resource>Filters` sends
 * the value verbatim (`'true'` / `'false'`) and skips the empty "Any".
 */
export const TRISTATE_OPTIONS: INodePropertyOptions[] = [
	{ name: 'Any', value: '' },
	{ name: 'No', value: 'false' },
	{ name: 'Yes', value: 'true' },
];

/**
 * Build the standard "Sort" dropdown for a Get Many operation.
 *
 * @param displayOptions scope it to the resource's Get Many (as every other
 *   Get Many field is scoped).
 * @param options the resource's documented sort values, e.g.
 *   `[{ name: 'Name (A→Z)', value: 'name' }, { name: 'Name (Z→A)', value: '-name' }]`.
 *   Keep them alphabetical by `name` to satisfy the linter.
 */
export function sortField(
	displayOptions: IDisplayOptions,
	options: INodePropertyOptions[],
): INodeProperties {
	return {
		displayName: 'Sort',
		name: SORT_PARAMETER,
		type: 'options',
		default: '',
		description: 'Order results by this field (the App Store Connect `sort` query parameter)',
		displayOptions,
		options: [{ name: 'Default (Unsorted)', value: '' }, ...options],
	};
}

/**
 * `preSend` hook that folds the curated Sort dropdown into `qs.sort`.
 *
 * Only writes when the user chose an order (the empty "Default" is skipped) and
 * merges onto any existing `qs`. Register it *before* `attachQueryOptions` so a
 * user who sets `sort` in the generic Query Options collection still overrides
 * the convenience dropdown.
 */
export async function attachSort(
	this: IExecuteSingleFunctions,
	requestOptions: IHttpRequestOptions,
): Promise<IHttpRequestOptions> {
	const sort = (this.getNodeParameter(SORT_PARAMETER, '') as string)?.trim();
	if (sort) {
		requestOptions.qs = { ...(requestOptions.qs ?? {}), sort };
	}
	return requestOptions;
}
