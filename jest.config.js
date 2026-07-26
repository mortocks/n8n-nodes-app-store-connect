/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
	preset: 'ts-jest',
	testEnvironment: 'node',
	roots: ['<rootDir>/utils', '<rootDir>/nodes', '<rootDir>/credentials'],
	testMatch: ['**/*.test.ts'],
	clearMocks: true,
	transform: {
		'^.+\\.ts$': [
			'ts-jest',
			{
				// Fast transpilation; type-checking is the job of `tsc`.
				// `isolatedModules` is set in tsconfig.json.
				diagnostics: false,
			},
		],
	},
};
