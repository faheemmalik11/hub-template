// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
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
      // Radix keeps its state in React context, and a component reading the context of a DIFFERENT
      // copy than the provider that set it throws, so each of these resolves to one copy.
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
    server: { port: 7070 },
    // pdfjs-dist is only ever loaded lazily (PdfPane), so without this the dev server discovers
    // it mid-session, re-optimizes, and the in-flight import rejects -- the preview then shows
    // its error state until a reload. Pre-bundling it makes the first open work.
    optimizeDeps: { include: ["pdfjs-dist"] },
  },
});
