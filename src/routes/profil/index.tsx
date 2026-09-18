import { createFileRoute } from "@tanstack/react-router";

import { ProfilePage } from "@hub-kit/core/pages";

import { useProfileAdapter } from "@/hub/adapters/profile";
import { useProfileLabels } from "@/hub/adapters/profile-labels";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/profil/")({
  head: () => ({ meta: [{ title: "Mein Profil · Stäy Hub" }] }),
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
