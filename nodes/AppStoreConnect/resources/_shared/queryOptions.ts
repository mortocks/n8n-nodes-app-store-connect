import type {
	IDataObject,
	IDisplayOptions,
	IExecuteSingleFunctions,
	IHttpRequestOptions,
	INodeProperties,
} from 'n8n-workflow';

/**
 * Shared "Query Options" field group — the reusable JSON:API query-parameter
 * collection for every Get / Get Many operation across the node.
 *
 * The App Store Connect API is JSON:API, so every read endpoint accepts the
 * same family of query params:
 *   - `fields[<type>]=a,b`   — sparse fieldsets (trim the response per type)
 *   - `include=rel1,rel2`    — sideload related resources
 *   - `filter[<key>]=value`  — server-side filtering
 *   - `sort=field,-other`    — ordering (prefix `-` = descending)
 *   - `limit=<n>`            — page size
 *
 * Built here once (proven on Customer Reviews) so later resources import
 * `queryOptionsCollection(...)` for the UI and register `attachQueryOptions`
 * as a `preSend` hook to fold whatever the user set into the request `qs` —
 * no per-resource query-string plumbing.
 *
 * On paginated Get Many operations the cursor-pagination hook
 * (`transport/pagination.ts`) owns the effective page size via the top-level
 * Return All / Limit toggle and overrides `qs.limit` after this hook runs, so
 * the collection's own `limit` only takes effect on non-paginated reads.
 */

/** The node-parameter name this group lives under. */
const QUERY_OPTIONS_PARAMETER = 'queryOptions';

/**
 * Build the "Query Options" collection field, scoped to the supplied
 * `displayOptions` (a resource typically shows it on its Get / Get Many
 * operations). The field name is stable (`queryOptions`) so `attachQueryOptions`
 * can read it back regardless of which resource mounted it.
 */
export function queryOptionsCollection(displayOptions: IDisplayOptions): INodeProperties {
	return {
		displayName: 'Query Options',
		name: QUERY_OPTIONS_PARAMETER,
		type: 'collection',
		placeholder: 'Add Query Option',
		default: {},
		description: 'JSON:API query parameters (sparse fieldsets, includes, filters, sort, page size)',
		displayOptions,
		options: [
			{
				displayName: 'Fields (Sparse Fieldsets)',
				name: 'fields',
				type: 'fixedCollection',
				typeOptions: {
					multipleValues: true,
				},
				default: {},
				description:
					'Limit the attributes returned per resource type, sent as `fields[type]=a,b`',
				options: [
					{
						name: 'field',
						displayName: 'Field',
						values: [
							{
								displayName: 'Resource Type',
								name: 'type',
								type: 'string',
								default: '',
								placeholder: 'e.g. customerReviews',
								description: 'The JSON:API resource type to trim (the `type` in `fields[type]`)',
							},
							{
								displayName: 'Fields',
								name: 'fields',
								type: 'string',
								default: '',
								placeholder: 'e.g. rating,title,body',
								description: 'Comma-separated list of attributes to include for this type',
							},
						],
					},
				],
			},
			{
				displayName: 'Filters',
				name: 'filter',
				type: 'fixedCollection',
				typeOptions: {
					multipleValues: true,
				},
				default: {},
				description: 'Server-side filters, each sent as `filter[key]=value`',
				options: [
					{
						name: 'filter',
						displayName: 'Filter',
						values: [
							{
								displayName: 'Key',
								name: 'key',
								type: 'string',
								default: '',
								placeholder: 'e.g. rating',
								description: 'The filter key (the `key` in `filter[key]`)',
							},
							{
								displayName: 'Value',
								name: 'value',
								type: 'string',
								default: '',
								placeholder: 'e.g. 1',
								description: 'The value to filter by (comma-separate for multiple)',
							},
						],
					},
				],
			},
			{
				displayName: 'Include',
				name: 'include',
				type: 'string',
				default: '',
				placeholder: 'e.g. response',
				description: 'Comma-separated relationships to sideload, sent as `include=...`',
			},
			{
				displayName: 'Limit',
				name: 'limit',
				type: 'number',
				typeOptions: {
					minValue: 1,
				},
				default: 50,
				description: 'Max number of results to return',
			},
			{
				displayName: 'Sort',
				name: 'sort',
				type: 'string',
				default: '',
				placeholder: 'e.g. -createdDate',
				description: 'Comma-separated sort keys, sent as `sort` (prefix `-` for descending)',
			},
		],
	};
}

interface SparseFieldEntry {
	type?: string;
	fields?: string;
}

interface FilterEntry {
	key?: string;
	value?: string;
}

function isRecord(value: unknown): value is IDataObject {
	return typeof value === 'object' && value !== null;
}

/**
 * `preSend` hook that folds the "Query Options" collection into the request
 * `qs`. Shared by every Get / Get Many operation that mounts
 * `queryOptionsCollection(...)`.
 *
 * It only writes the params the user actually set (empty values are skipped),
 * so it never pollutes the query string, and it merges onto any existing `qs`
 * so it composes with other hooks. The dynamic `fields[type]` / `filter[key]`
 * keys are why this can't be expressed with static declarative `routing.send`
 * and needs a hook.
 */
export async function attachQueryOptions(
	this: IExecuteSingleFunctions,
	requestOptions: IHttpRequestOptions,
): Promise<IHttpRequestOptions> {
	const options = this.getNodeParameter(QUERY_OPTIONS_PARAMETER, {}) as IDataObject;
	const qs: IDataObject = { ...(requestOptions.qs ?? {}) };

	const include = (options.include as string | undefined)?.trim();
	if (include) {
		qs.include = include;
	}

	const sort = (options.sort as string | undefined)?.trim();
	if (sort) {
		qs.sort = sort;
	}

	if (typeof options.limit === 'number') {
		qs.limit = options.limit;
	}

	// Sparse fieldsets: `{ field: [{ type, fields }] }` → `fields[type]=fields`.
	const sparseFields = isRecord(options.fields)
		? ((options.fields as IDataObject).field as SparseFieldEntry[] | undefined)
		: undefined;
	for (const entry of sparseFields ?? []) {
		const type = entry.type?.trim();
		const value = entry.fields?.trim();
		if (type && value) {
			qs[`fields[${type}]`] = value;
		}
	}

	// Filters: `{ filter: [{ key, value }] }` → `filter[key]=value`.
	const filters = isRecord(options.filter)
		? ((options.filter as IDataObject).filter as FilterEntry[] | undefined)
		: undefined;
	for (const entry of filters ?? []) {
		const key = entry.key?.trim();
		if (key && entry.value !== undefined && entry.value !== '') {
			qs[`filter[${key}]`] = entry.value;
		}
	}

	requestOptions.qs = qs;
	return requestOptions;
}
