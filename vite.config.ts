// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "@lovable.dev/vite-tanstack-config";
// During local development the kit is read straight from its own source folder, so editing a file
// in ../hub-kit hot-reloads here without publishing or installing a new version. On any machine
// without that sibling folder (Vercel, a fresh clone) this is skipped and the installed
// @hub-kit/core package from npm is used instead.
const projectRoot = dirname(fileURLToPath(import.meta.url));
const kitSourceRoot = resolve(projectRoot, "../hub-kit/src");
const kitSubpaths = [
  ["ai-search-sql/ui", "components/ai-search-sql"],
  ["ai-search-sql", "lib/ai-search-sql"],
  ["ai-search/ui", "components/ai-search"],
  ["filters", "components/filters"],
  "ui",
  "pages",
  "adapters",
  "i18n",
  "lib",
  ["notifications", "components/notifications"],
  ["invoice-queue", "components/invoice-queue"],
  ["feedback", "components/feedback"],
  ["access", "components/access"],
  ["dashboard", "components/dashboard"],
  ["data-table", "components/data-table"],
  ["checklist", "components/checklist"],
  ["approval-rules", "pages/approval-rules"],
  ["assignment-rules", "pages/assignment-rules"],
  ["shell", "components/shell"],
  ["tour", "components/tour"],
] as const;

function kitSourceAliases(): Record<string, string> {
  if (!existsSync(kitSourceRoot)) {
    return {};
  }
  const aliases: Record<string, string> = {
    // Listed before the broader "pages"/"checklist" entries below: Vite's alias matching treats
    // an object key as a prefix (it also matches "<key>/..."), so these narrower subpaths would
    // otherwise be swallowed by "pages"/"checklist" and resolved to the wrong file.
    "@hub-kit/core/pages/document-sources/tanstack": resolve(
      kitSourceRoot,
      "pages/document-sources/tanstack-router.ts",
    ),
    "@hub-kit/core/pages/document-sources": resolve(
      kitSourceRoot,
      "pages/document-sources/index.ts",
    ),
    "@hub-kit/core/checklist/tanstack": resolve(
      kitSourceRoot,
      "components/checklist/tanstack-link.tsx",
    ),
  };
  for (const entry of kitSubpaths) {
    const [subpath, folder] = typeof entry === "string" ? [entry, entry] : entry;
    aliases[`@hub-kit/core/${subpath}`] = resolve(kitSourceRoot, folder, "index.ts");
  }
  return aliases;
}

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  // Only takes effect outside the lovable.dev hosted sandbox -- inside it, the shared config
  // hard-forces port 8080 regardless of this setting (see its own validatePort()/isSandbox
  // branch in node_modules/@lovable.dev/vite-tanstack-config).
  vite: {
    resolve: {
      alias: kitSourceAliases(),
    // hub-kit is compiled from source during local development, so its bare imports would
    // otherwise resolve against ../hub-kit/node_modules -- a second copy of each Radix package
    // beside this app's. Radix keeps its state in React context, and a component reading the
    // context of a DIFFERENT copy than the provider that set it throws. The shared config
    // already dedupes React and TanStack; mergeConfig appends to that list rather than
    // replacing it.
    dedupe: [
      "@radix-ui/react-tooltip",
      "@radix-ui/react-dialog",
      "@radix-ui/react-alert-dialog",
      "@radix-ui/react-popover",
      "@radix-ui/react-select",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-tabs",
      "@radix-ui/react-collapsible",
      "@radix-ui/react-checkbox",
      "@radix-ui/react-switch",
      "@radix-ui/react-label",
      "@radix-ui/react-separator",
      "@radix-ui/react-scroll-area",
      "@radix-ui/react-slot",
      "cmdk",
      "lucide-react",
    ],
    },
    server: { fs: { allow: [projectRoot, resolve(projectRoot, "../hub-kit")] }, port: 7070 },
    // pdfjs-dist is only ever loaded lazily (PdfPane), so without this the dev server discovers
    // it mid-session, re-optimizes, and the in-flight import rejects -- the preview then shows
    // its error state until a reload. Pre-bundling it makes the first open work.
    optimizeDeps: { include: ["pdfjs-dist"] },
  },
});
