import { getGraphAccessToken, graphPost } from "./sharepoint-client.server";

export interface SharePointSearchHit {
  id: string;
  name: string;
  webUrl: string;
}

interface GraphSearchResource {
  "@odata.type"?: string;
  id?: string;
  name?: string;
  webUrl?: string;
}
interface GraphSearchHit {
  hitId: string;
  resource?: GraphSearchResource;
}
interface GraphSearchHitsContainer {
  hits?: GraphSearchHit[];
  total?: number;
}
interface GraphSearchResponseEntry {
  hitsContainers?: GraphSearchHitsContainer[];
}
interface GraphSearchResponse {
  value?: GraphSearchResponseEntry[];
}

const MAX_RESULTS = 25;
const GRAPH_SEARCH_APP_ONLY_REGION = "EMEA";

export async function searchSharePoint(queryText: string): Promise<SharePointSearchHit[]> {
  const q = queryText.trim();
  if (!q) return [];

  const token = await getGraphAccessToken();
  const body = {
    requests: [
      {
        entityTypes: ["driveItem"],
        query: { queryString: q },
        from: 0,
        size: MAX_RESULTS,
        region: GRAPH_SEARCH_APP_ONLY_REGION,
      },
    ],
  };

  const data = (await graphPost(
    "https://graph.microsoft.com/v1.0/search/query",
    token,
    body,
  )) as GraphSearchResponse;

  const hits = data.value?.[0]?.hitsContainers?.[0]?.hits ?? [];
  const out: SharePointSearchHit[] = [];
  for (const hit of hits) {
    const r = hit.resource;
    if (r?.name && r.webUrl) {
      out.push({ id: hit.hitId, name: r.name, webUrl: r.webUrl });
    }
  }
  return out;
}
