import { Skeleton } from "../../ui/skeleton";
import { ErrorState } from "../../components/feedback/query-states";
import type { ProfileAdapter } from "../../adapters/profile";
import { AccessCard } from "./access-card";
import { PasswordCard } from "./password-card";
import { ProfileDetailsCard } from "./profile-details-card";
import { ProfilePictureCard } from "./profile-picture-card";
import { englishProfileLabels, type ProfileLabels } from "./labels";

export interface ProfilePageProps {
  adapter: ProfileAdapter;
  labels?: ProfileLabels;
}

/** Everything a person may change about their own account, plus what their account may do. */
export function ProfilePage({ adapter, labels = englishProfileLabels }: ProfilePageProps) {
  const profileQuery = adapter.useProfile();

  return (
    <div>
      <div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
          {labels.title}
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{labels.subtitle}</p>
      </div>

      <div className="mt-6 max-w-3xl space-y-6">
        {profileQuery.isError ? (
          <ErrorState error={profileQuery.error} onRetry={profileQuery.refetch} />
        ) : profileQuery.isLoading || !profileQuery.data ? (
          <Skeleton className="h-96 w-full" />
        ) : (
          <>
            <ProfilePictureCard user={profileQuery.data} adapter={adapter} labels={labels} />
            <ProfileDetailsCard user={profileQuery.data} adapter={adapter} labels={labels} />
            <PasswordCard adapter={adapter} labels={labels} />
            <AccessCard user={profileQuery.data} adapter={adapter} labels={labels} />
          </>
        )}
      </div>
    </div>
  );
}
