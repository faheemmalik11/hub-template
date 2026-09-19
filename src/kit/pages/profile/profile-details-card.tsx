import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "../../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../ui/card";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { readableErrorMessage } from "../../components/feedback/query-states";
import type { ProfileAdapter, ProfileUser } from "../../adapters/profile";
import type { ProfileLabels } from "./labels";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Name and email in one form, saved together so one Save button covers both. */
export function ProfileDetailsCard({
  user,
  adapter,
  labels,
}: {
  user: ProfileUser;
  adapter: ProfileAdapter;
  labels: ProfileLabels;
}) {
  const [name, setName] = useState(user.name ?? "");
  const [email, setEmail] = useState(user.email);
  const [isSaving, setIsSaving] = useState(false);
  const detailLabels = labels.details;
  const canChangeEmail = !!adapter.updateEmail;

  // Pick up a change made elsewhere, for example by an administrator.
  useEffect(() => {
    setName(user.name ?? "");
    setEmail(user.email);
  }, [user]);

  const trimmedName = name.trim();
  const trimmedEmail = email.trim();
  const emailInvalid = trimmedEmail.length > 0 && !EMAIL_PATTERN.test(trimmedEmail);
  const nameChanged = trimmedName !== (user.name ?? "").trim();
  const emailChanged = trimmedEmail.toLowerCase() !== user.email.toLowerCase();
  const hasChanges = nameChanged || emailChanged;

  async function save() {
    if (!trimmedName) {
      toast.error(detailLabels.nameRequired);
      return;
    }
    if (!trimmedEmail) {
      toast.error(detailLabels.emailRequired);
      return;
    }
    if (emailInvalid) {
      toast.error(detailLabels.emailInvalid);
      return;
    }

    setIsSaving(true);
    try {
      if (nameChanged) await adapter.updateName({ name: trimmedName });
      if (emailChanged) await adapter.updateEmail?.({ email: trimmedEmail });
      toast.success(detailLabels.saved);
    } catch (error) {
      toast.error(detailLabels.failed(readableErrorMessage(error, "")));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{detailLabels.title}</CardTitle>
        <CardDescription>{detailLabels.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="profile-name">{detailLabels.name}</Label>
            <Input
              id="profile-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={isSaving}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="profile-email">{detailLabels.email}</Label>
            <Input
              id="profile-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={isSaving || !canChangeEmail}
              aria-invalid={emailInvalid}
            />
            {emailInvalid && <p className="text-xs text-warning">{detailLabels.emailInvalid}</p>}
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          {canChangeEmail ? detailLabels.emailHint : detailLabels.emailLocked}
        </p>

        <div className="flex justify-end">
          <Button onClick={save} disabled={isSaving || !hasChanges || emailInvalid}>
            {isSaving ? detailLabels.saving : detailLabels.save}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
