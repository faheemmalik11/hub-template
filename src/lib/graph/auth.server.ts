// App-only Microsoft Graph auth (client-credentials grant), shared by every Graph caller in this
// app: the Postfach mailbox-folder picker (mail-folders.server.ts) and the DATEV handover send
// (send-mail.server.ts).
//
// The credentials come from the mailbox source the admin panel configured, and only from there
// (lib/postfach/channel-credentials.server.ts). They used to come from .env, which meant rotating
// the secret in the panel left this authenticating with a stale one.
//
// .server.ts suffix: Vite excludes this from the client bundle, so the client secret can never
// end up in a browser response even by accident.

import { channelCredential } from "@/lib/inbox/channel-credentials.server";

export async function getGraphAccessToken(): Promise<string> {
  const [tenant, clientId, clientSecret] = await Promise.all([
    channelCredential("mailbox", "GRAPH_TENANT_ID"),
    channelCredential("mailbox", "GRAPH_CLIENT_ID"),
    channelCredential("mailbox", "GRAPH_CLIENT_SECRET"),
  ]);

  const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      scope: "https://graph.microsoft.com/.default",
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Graph token exchange failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) {
    throw new Error("Graph token exchange succeeded but returned no access_token.");
  }
  return data.access_token;
}
