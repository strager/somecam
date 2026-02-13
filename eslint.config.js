import eslint from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import pluginVue from "eslint-plugin-vue";
import tseslint from "typescript-eslint";

export default [
	// Ignore build artifacts and declaration files
	{
		ignores: ["dist/", "*.d.ts", "eslint.config.js"],
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

	// Prettier MUST be last — disables all formatting rules
	eslintConfigPrettier,
];
