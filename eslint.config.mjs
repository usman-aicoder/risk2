import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: [
      "**/dist/",
      "**/coverage/",
      "**/.next/",
      "**/node_modules/",
      "**/next-env.d.ts",
      "**/public/",
      "playwright-report/",
      "test-results/",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ["**/*.{js,mjs,cjs}"],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    // Node build/CLI scripts run outside the browser.
    files: ["**/scripts/**/*.{js,mjs,cjs}"],
    languageOptions: {
      globals: { process: "readonly", console: "readonly" },
    },
  },
  prettier,
);
