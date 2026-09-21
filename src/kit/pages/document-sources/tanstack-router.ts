import { Link, useNavigate, useRouterState } from "@tanstack/react-router";

import type { DocumentSourcesRouter } from "./router";

/**
 * `DocumentSourcesRouter` on TanStack Router — the behavior `DocumentSourcesPage` had before its
 * router was made injectable. Import from `@/kit/pages/document-sources/tanstack-router`
 * explicitly and pass `router={useTanstackDocumentSourcesRouter()}`; not re-exported from
 * the kit's page index, so a Hub without TanStack Router never resolves this import.
 */
export function useTanstackDocumentSourcesRouter(): DocumentSourcesRouter {
  const navigate = useNavigate();
  return {
    Link,
    useHash: () => useRouterState({ select: (state) => state.location.hash }),
    useFocusParam: () =>
      useRouterState({
        select: (state) => (state.location.search as { focus?: string }).focus,
      }),
    openSource: (sourceId) => void navigate({ to: ".", hash: sourceId }),
    closeSource: () => void navigate({ to: ".", hash: "", replace: true }),
  };
}
