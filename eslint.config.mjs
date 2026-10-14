import js from "@eslint/js";
import globals from "globals";

export default [
  { ignores: ["app/model/", "data/", "work/"] },
  js.configs.recommended,
  { files: ["app/**/*.js"], languageOptions: { ecmaVersion: 2022, sourceType: "script", globals: { ...globals.browser } } },
  { files: ["tests/**/*.js"], languageOptions: { ecmaVersion: 2022, sourceType: "commonjs", globals: { ...globals.node } } },
  { files: ["tests/test_ui.js"], languageOptions: { globals: { ...globals.node, ...globals.browser } } }, // page.evaluate callbacks run in the page
];
