import tseslint from "typescript-eslint";
import obsidianmd from "eslint-plugin-obsidianmd";

/**
 * Runs the SAME ruleset as Obsidian's automated community review
 * (eslint-plugin-obsidianmd) so review failures are caught locally before a release
 * — plus our own type-aware rules on the source. `npm run lint` is a hard gate
 * (`--max-warnings 0`); a warning can still block review.
 */
export default tseslint.config(
	{
		ignores: [
			"main.js",
			"node_modules/**",
			"test/**",
			"scripts/**",
			"esbuild.config.mjs",
			"eslint.config.mjs",
			"src/**/*.mjs",
			"src/**/*.d.mts",
			// Local-only rigs, never shipped and never committed: the marketing-capture page
			// and the perf probe. They are not plugin source, and linting them as if they were
			// fails the gate on rules that do not apply to them.
			"_hero/**",
			"_probe.mjs",
		],
	},
	...obsidianmd.configs.recommended,
	// Re-enable type-aware linting on the source (the obsidianmd recommended set
	// ships with type-checked linting disabled). Scoped to src/**/*.ts so the JS
	// config files above are never parsed with type info.
	{
		files: ["src/**/*.ts"],
		languageOptions: {
			parserOptions: {
				projectService: true,
				tsconfigRootDir: import.meta.dirname,
			},
		},
		rules: {
			// `ui/sentence-case` with enforceCamelCaseLower fires on our product name
			// ("Prose Lens", "Pro", "Flesch") — lowercasing them would be wrong, and the
			// actual review does not flag these strings.
			"obsidianmd/ui/sentence-case": "off",
			// Advises the declarative settings API added in Obsidian 1.13.0; this targets
			// minAppVersion 1.4.0 and uses the classic display() settings tab.
			"obsidianmd/settings-tab/prefer-setting-definitions": "off",
			// Popout-window safety: reach for the editor's own document, not a global.
			"no-restricted-globals": [
				"warn",
				{ name: "document", message: "Use ownerDocument/activeDocument for popout window compatibility." },
				{ name: "globalThis", message: "Use window/activeWindow for popout window compatibility." },
			],
		},
	}
);
