import type { IDisplayOptions, INodeProperties } from 'n8n-workflow';

/**
 * The reusable "Target App" resourceLocator (From List → `searchApps`, or ID /
 * expression). Every app-scoped operation renders the same picker; centralising
 * it here keeps those blocks identical and lets new operations (e.g. picker
 * *scoping* fields — narrowing another picker to a chosen app) reuse it in one
 * line.
 *
 * @param displayOptions scope it to the operation(s) it should show on.
 * @param opts.required  whether the app must be chosen (default false).
 * @param opts.description overrides the field help text.
 */
export function targetAppLocator(
	displayOptions: IDisplayOptions,
	opts: { required?: boolean; description?: string } = {},
): INodeProperties {
	return {
		displayName: 'Target App',
		name: 'targetApp',
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		required: opts.required ?? false,
		description: opts.description ?? 'The app to act on',
		displayOptions,
		modes: [
			{
				displayName: 'From List',
				name: 'list',
				type: 'list',
				typeOptions: {
					searchListMethod: 'searchApps',
					searchable: true,
				},
			},
			{
				displayName: 'ID',
				name: 'id',
				type: 'string',
				placeholder: 'e.g. 1234567890',
			},
		],
	};
}
