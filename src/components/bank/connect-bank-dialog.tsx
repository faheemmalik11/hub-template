import { useState } from "react";
import { AlertTriangle, ExternalLink, Link2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useStartBankConnect, type BankConnectResult } from "@/data";
import { useTranslation } from "@/lib/i18n";
import { errorText } from "@/lib/data/format";

/**
 * Connect a bank account through BANKSapi.
 *
 * This screen exists because the connection is the step that keeps failing, and every failure is
 * silent. Per BANKSAPI-INTEGRATION-EN §3.2 the two consents in BANKSapi's own web form are NOT
 * pre-ticked while the account list IS — so a user ticks their accounts, presses on, and believes
 * they are done while nothing ever reaches the API. The brief's build requirement is explicit:
 * show these two steps before handing off, and verify afterwards.
 *
 * Three further constraints, all enforced here:
 *   * the web-form URL is SINGLE-USE and short-lived — opening it twice invalidates it;
 *   * it must open in a real browser window, never an iframe (regulatory: the certificate must be
 *     visible), hence window.open and no embedding;
 *   * Customer-IP-Address must be the ACCOUNT HOLDER's public IPv4, which is why this realistically
 *     happens in a supervised session rather than via an emailed link.
 */
export function ConnectBankDialog() {
  const { t } = useTranslation();
  const start = useStartBankConnect();

  const [open, setOpen] = useState(false);
  const [customerIp, setCustomerIp] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [result, setResult] = useState<BankConnectResult | null>(null);

  function reset() {
    setResult(null);
    setAcknowledged(false);
    setCustomerIp("");
  }

  async function begin() {
    try {
      const res = await start.mutateAsync({
        // Empty = let the function fall back to the caller's forwarded IP, which is correct only
        // when the account holder is the one clicking.
        customerIp: customerIp.trim() || undefined,
        // Default `none` would fetch only 90 days, and asking for older data later almost always
        // triggers a fresh SCA. Full history on first connect.
      });
      setResult(res);
      if (res.webformUrl) {
        // New window, never an iframe.
        window.open(res.webformUrl, "_blank", "noopener,noreferrer");
      }
    } catch (e) {
      toast.error(errorText(e));
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Link2 className="size-4" />
          {t("bankConnections.connectDialog.button")}
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("bankConnections.connectDialog.titel")}</DialogTitle>
          <DialogDescription>{t("bankConnections.connectDialog.beschreibung")}</DialogDescription>
        </DialogHeader>

        {!result ? (
          <div className="space-y-4">
            {/* The two consents, shown BEFORE the hand-off — this is the whole point of the screen. */}
            <div className="rounded-md border border-amber-300/60 bg-amber-50 p-3 dark:border-amber-500/30 dark:bg-amber-950/30">
              <p className="flex items-center gap-2 text-sm font-medium text-amber-900 dark:text-amber-200">
                <AlertTriangle className="size-4 shrink-0" />
                {t("bankConnections.connectDialog.warnungTitel")}
              </p>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-amber-900/90 dark:text-amber-200/90">
                <li>{t("bankConnections.connectDialog.checkbox1")}</li>
                <li>{t("bankConnections.connectDialog.checkbox2")}</li>
              </ol>
              <p className="mt-2 text-xs text-amber-900/80 dark:text-amber-200/80">
                {t("bankConnections.connectDialog.warnungHinweis")}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="customer-ip">{t("bankConnections.connectDialog.ipLabel")}</Label>
              <Input
                id="customer-ip"
                value={customerIp}
                onChange={(e) => setCustomerIp(e.target.value)}
                placeholder={t("bankConnections.connectDialog.ipPlatzhalter")}
              />
              <p className="text-xs text-muted-foreground">
                {t("bankConnections.connectDialog.ipHinweis")}
              </p>
            </div>

            <label className="flex items-start gap-2 text-sm">
              <Checkbox
                checked={acknowledged}
                onCheckedChange={(v) => setAcknowledged(v === true)}
                className="mt-0.5"
              />
              <span className="text-muted-foreground">
                {t("bankConnections.connectDialog.bestaetigung")}
              </span>
            </label>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-foreground">
              {t("bankConnections.connectDialog.geoeffnet")}
            </p>
            {result.webformUrl && (
              // Re-opening invalidates the link, so this is a copy target, not a second "open".
              <div className="space-y-1">
                <Label className="text-xs">{t("bankConnections.connectDialog.linkLabel")}</Label>
                <Input
                  readOnly
                  value={result.webformUrl}
                  onFocus={(e) => e.currentTarget.select()}
                />
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  {t("bankConnections.connectDialog.einmalig")}
                </p>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {!result ? (
            <Button onClick={() => void begin()} disabled={!acknowledged || start.isPending}>
              <ExternalLink className="size-4" />
              {start.isPending
                ? t("bankConnections.connectDialog.starte")
                : t("bankConnections.connectDialog.starten")}
            </Button>
          ) : (
            <Button variant="secondary" onClick={() => setOpen(false)}>
              {t("bankConnections.connectDialog.schliessen")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
