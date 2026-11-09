import { createFileRoute } from "@tanstack/react-router";

import { ProfilePage } from "@/kit/pages";

import { useProfileAdapter } from "@/hub/adapters/profile";
import { useProfileLabels } from "@/hub/adapters/profile-labels";
import { useAuth } from "@/lib/auth";
import { useMfaRequirement } from "@/components/auth/use-mfa-gate";
import { TwoFactorPanel } from "@/components/auth/two-factor-dialog";
import { pageTitle } from "@/config/brand";

export const Route = createFileRoute("/profile/")({
  head: () => ({ meta: [{ title: pageTitle("Mein Profil") }] }),
  staticData: { titleKey: "profile" },
  component: ProfileRoute,
});

// No permission gate: this screen only ever shows and changes the signed-in person's own account,
// so everyone who can sign in may open it.
function ProfileRoute() {
  const { ready } = useAuth();
  const adapter = useProfileAdapter();
  const labels = useProfileLabels();
  const mfaRequirement = useMfaRequirement(ready);
  if (!ready) return null;
  return (
    <>
      <ProfilePage adapter={adapter} labels={labels} />
      {mfaRequirement.required && (
        <div className="mx-auto mt-6 max-w-2xl">
          <TwoFactorPanel />
        </div>
      )}
    </>
  );
}
