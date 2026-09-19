import { createFileRoute } from "@tanstack/react-router";

import { ProfilePage } from "@/kit/pages";

import { useProfileAdapter } from "@/hub/adapters/profile";
import { useProfileLabels } from "@/hub/adapters/profile-labels";
import { useAuth } from "@/lib/auth";
import { pageTitle } from "@/config/brand";

export const Route = createFileRoute("/profil/")({
  head: () => ({ meta: [{ title: pageTitle("Mein Profil") }] }),
  component: ProfilRoute,
});

// No permission gate: this screen only ever shows and changes the signed-in person's own account,
// so everyone who can sign in may open it.
function ProfilRoute() {
  const { ready } = useAuth();
  const adapter = useProfileAdapter();
  const labels = useProfileLabels();
  if (!ready) return null;
  return <ProfilePage adapter={adapter} labels={labels} />;
}
