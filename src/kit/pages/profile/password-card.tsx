import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

import { Button } from "../../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../ui/card";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { readableErrorMessage } from "../../components/feedback/query-states";
import type { ProfileAdapter } from "../../adapters/profile";
import type { ProfileLabels } from "./labels";

/** Current password, new password, and the new one again. */
export function PasswordCard({
  adapter,
  labels,
}: {
  adapter: ProfileAdapter;
  labels: ProfileLabels;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [repeatedPassword, setRepeatedPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const passwordLabels = labels.password;

  const tooShort = nextPassword.length > 0 && nextPassword.length < adapter.passwordMinLength;
  const doesNotMatch = repeatedPassword.length > 0 && repeatedPassword !== nextPassword;
  const sameAsCurrent = nextPassword.length > 0 && nextPassword === currentPassword;
  const canSave =
    currentPassword.length > 0 &&
    nextPassword.length >= adapter.passwordMinLength &&
    repeatedPassword === nextPassword &&
    !sameAsCurrent;

  async function changePassword() {
    setIsSaving(true);
    try {
      await adapter.changePassword?.({ currentPassword, newPassword: nextPassword });
      setCurrentPassword("");
      setNextPassword("");
      setRepeatedPassword("");
      toast.success(passwordLabels.changed);
    } catch (error) {
      toast.error(passwordLabels.failed(readableErrorMessage(error, "")));
    } finally {
      setIsSaving(false);
    }
  }

  const fieldType = showPasswords ? "text" : "password";

  return (
    <Card>
      <CardHeader>
        <CardTitle>{passwordLabels.title}</CardTitle>
        <CardDescription>{passwordLabels.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {adapter.changePassword ? (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="current-password">{passwordLabels.current}</Label>
              <Input
                id="current-password"
                type={fieldType}
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                disabled={isSaving}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="new-password">{passwordLabels.next}</Label>
                <Input
                  id="new-password"
                  type={fieldType}
                  autoComplete="new-password"
                  value={nextPassword}
                  onChange={(event) => setNextPassword(event.target.value)}
                  disabled={isSaving}
                  aria-invalid={tooShort || sameAsCurrent}
                />
                {tooShort && (
                  <p className="text-xs text-warning">
                    {passwordLabels.tooShort(adapter.passwordMinLength)}
                  </p>
                )}
                {sameAsCurrent && (
                  <p className="text-xs text-warning">{passwordLabels.sameAsCurrent}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="repeat-password">{passwordLabels.repeat}</Label>
                <Input
                  id="repeat-password"
                  type={fieldType}
                  autoComplete="new-password"
                  value={repeatedPassword}
                  onChange={(event) => setRepeatedPassword(event.target.value)}
                  disabled={isSaving}
                  aria-invalid={doesNotMatch}
                />
                {doesNotMatch && (
                  <p className="text-xs text-warning">{passwordLabels.doesNotMatch}</p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowPasswords(!showPasswords)}
                className="text-muted-foreground"
              >
                {showPasswords ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                {showPasswords ? passwordLabels.hide : passwordLabels.show}
              </Button>
              <Button onClick={changePassword} disabled={isSaving || !canSave}>
                {isSaving ? passwordLabels.changing : passwordLabels.change}
              </Button>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{passwordLabels.locked}</p>
        )}
      </CardContent>
    </Card>
  );
}
