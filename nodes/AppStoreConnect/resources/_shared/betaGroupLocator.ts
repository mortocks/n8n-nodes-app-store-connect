import type { IDisplayOptions, INodeProperties } from 'n8n-workflow';

/**
 * The reusable "Beta Group" resourceLocator (From List → `searchBetaGroups`, or
 * ID). Every operation that targets a beta group — Beta Tester's Get Many
 * filter / Add to Group / Remove from Group / Create, and Build's Add to Beta
 * Group / Remove from Group — renders the same picker; centralising it here
 * (mirroring `appLocator.ts`) keeps those blocks identical and lets new
 * operations reuse it in one line.
 *
 * @param displayOptions scope it to the operation(s) it should show on.
 * @param opts.required  whether a group must be chosen (default false).
 * @param opts.description overrides the field help text.
 */
export function betaGroupLocator(
	displayOptions: IDisplayOptions,
	opts: { required?: boolean; description?: string } = {},
): INodeProperties {
	return {
		displayName: 'Beta Group',
		name: 'betaGroup',
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		required: opts.required ?? false,
		description: opts.description ?? 'The beta group to act on',
		displayOptions,
		modes: [
			{
				displayName: 'From List',
				name: 'list',
				type: 'list',
				typeOptions: {
					searchListMethod: 'searchBetaGroups',
					searchable: true,
				},
			},
			{
				displayName: 'ID',
				name: 'id',
				type: 'string',
				placeholder: 'e.g. 12a34b56-...',
			},
		],
	};
}
