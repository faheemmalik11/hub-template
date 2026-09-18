import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // supabase/functions is Deno (remote URL imports, Deno global) — linted by Deno, not ESLint.
  // pipeline_new is a Python project (see its own README) — its .venv contains vendored
  // third-party JS (e.g. urllib3's emscripten worker) that isn't this app's code and must never
  // be linted or reformatted.
  // public/pdfjs is vendored pdfjs-dist output staged by scripts/copy-pdfjs-wasm.mjs (and
  // git-ignored). Its *_nowasm_fallback.js files are hundreds of KB of minified emscripten
  // output, which prettier takes minutes to reformat -- linting them stalls `bun run lint`.
  {
    ignores: [
      "dist",
      ".output",
      ".vinxi",
      "public/pdfjs/**",
      "supabase/functions/**",
      "pipeline_new/**",
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "server-only",
              message:
                "TanStack Start does not use the Next.js `server-only` package. Rename the module to `*.server.ts` or mark it with `@tanstack/react-start/server-only`.",
            },
          ],
        },
      ],
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  eslintPluginPrettier,

  // react-refresh/only-export-components, switched off where a file exporting more than a
  // component is the deliberate convention rather than an oversight:
  //
  //   components/ui/**  the shadcn kit, which ships its `*Variants` cva object beside the
  //                     component by design. Splitting them would fork the kit from upstream and
  //                     rewrite every import site for a dev-server nicety.
  //   context modules   a provider and the hook that reads it belong in one file; separating them
  //                     puts the context object in a third module nobody imports directly.
  //
  // The rule stays ON everywhere else, so a genuine accidental co-export still gets flagged.
  {
    files: [
      "src/components/ui/**/*.tsx",
      "src/lib/auth.tsx",
      "src/lib/i18n/index.tsx",
      "src/lib/ui-scale.tsx",
      "src/components/postfach/folder-tree-picker.tsx",
      "src/components/zuordnung/neue-regel-dialog.tsx",
    ],
    rules: { "react-refresh/only-export-components": "off" },
  },
);
