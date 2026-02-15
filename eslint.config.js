import eslint from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import pluginVue from "eslint-plugin-vue";
import tseslint from "typescript-eslint";

export default [
	// Ignore build artifacts and declaration files
	{
		ignores: ["**/dist/", "*.d.ts", "eslint.config.js"],
	},

	// Base JS recommended
	eslint.configs.recommended,

	// TypeScript strict + stylistic (type-checked) — most aggressive presets
	...tseslint.configs.strictTypeChecked,
	...tseslint.configs.stylisticTypeChecked,

	// Vue recommended (essential + strongly-recommended + recommended)
	...pluginVue.configs["flat/recommended"],

	// Enable type-checked linting via TypeScript project service
	{
		languageOptions: {
			parserOptions: {
				projectService: true,
			},
		},
	},

	// Vue SFCs: use typescript-eslint parser for <script> blocks
	{
		files: ["**/*.vue"],
		languageOptions: {
			parserOptions: {
				parser: tseslint.parser,
				extraFileExtensions: [".vue"],
				projectService: true,
			},
		},
	},

	// Rule overrides
	{
		rules: {
			// TypeScript already catches undefined variables; disable the
			// base ESLint rule so browser globals like localStorage don't
			// need manual declarations.
			"no-undef": "off",

			// Disallow type assertions (`as`, angle-bracket).
			"@typescript-eslint/consistent-type-assertions": ["warn", { assertionStyle: "never" }],

			// Require explicit boolean expressions — no implicit coercion
			// from strings, numbers, or nullables.
			"@typescript-eslint/strict-boolean-expressions": [
				"error",
				{
					allowString: false,
					allowNumber: false,
					allowNullableObject: false,
					allowNullableBoolean: true,
					allowNullableString: false,
					allowNullableNumber: false,
					allowNullableEnum: false,
					allowAny: false,
				},
			],

			// Allow _-prefixed unused args
			"@typescript-eslint/no-unused-vars": [
				"error",
				{
					argsIgnorePattern: "^_",
					varsIgnorePattern: "^_",
				},
			],
		},
	},

	// Relax strict `any` rules in tests — JSON.parse() results etc. don't
	// need narrowing boilerplate in test assertions.
	{
		files: ["**/*.test.ts"],
		rules: {
			"@typescript-eslint/no-unsafe-assignment": "off",
			"@typescript-eslint/no-unsafe-member-access": "off",
			"@typescript-eslint/no-unsafe-argument": "off",
			"@typescript-eslint/no-unsafe-call": "off",
			"@typescript-eslint/no-unsafe-return": "off",
			"@typescript-eslint/no-explicit-any": "off",
			"@typescript-eslint/no-non-null-assertion": "off",
		},
	},

	// Prettier MUST be last — disables all formatting rules
	eslintConfigPrettier,
];
