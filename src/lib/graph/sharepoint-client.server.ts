import { getGraphAccessToken } from "./auth.server";

export { getGraphAccessToken };

export async function graphGet(url: string, token: string): Promise<unknown> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Graph API request failed (${res.status}): ${body.slice(0, 300)}`);
  }
  return res.json();
}

export async function graphPost(url: string, token: string, body: unknown): Promise<unknown> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(`Graph API request failed (${res.status}): ${errBody.slice(0, 300)}`);
  }
  return res.json();
}
