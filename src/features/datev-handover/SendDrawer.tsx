import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";

import {
  Button,
  Checkbox,
  Label,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  cn,
  fehlerText,
  formatDate,
  formatEUR,
  useTranslation,
  useTriggerDatevHandover,
  type DatevOutgoingInvoice,
  type DatevReadyInvoice,
} from "./adapter";
import { formatBytes, type SendTarget } from "./model";

/** What one company's call came back with. */
interface CompanyOutcome {
  code: string;
  direction: "incoming" | "outgoing";
  batches: {
    status: "success" | "error";
    invoiceCount: number;
    totalBytes: number;
    error?: string;
  }[];
  blocked: { invoiceId: string; reason: string }[];
  /** Set when the call threw outright rather than returning batches. */
  error?: string;
}

/**
 * The last stop before an irreversible email: what is about to go, then what actually went.
 *
 * The send is a real email to an address this app deliberately refuses to display, with no return
 * channel from DATEV — so a bad send fails silently at the tax advisor's end. That is the whole
 * reason this is a confirmation with contents rather than an "are you sure": the summary counts
 * what will REALLY leave, each company's files can be unfolded and read one by one, and the drawer
 * stays open afterwards with the result rather than collapsing into a toast.
 *
 * Both page-level and row-level sends land here. The only difference is how many targets it is
 * handed — there is no second, simpler confirmation for the single-company case, because "simpler"
 * would mean showing less before doing exactly the same irreversible thing.
 */
export function SendDrawer({
  targets,
  open,
  onOpenChange,
}: {
  targets: SendTarget[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const trigger = useTriggerDatevHandover();
  const [phase, setPhase] = useState<"review" | "sending" | "result">("review");
  const [outcomes, setOutcomes] = useState<CompanyOutcome[]>([]);
  const [laeuft, setLaeuft] = useState<string | null>(null);
  /**
   * The receipts that will actually go, by id. Everything sendable starts ticked — the common case
   * is "send what is ready", and making somebody tick five boxes to do the obvious thing is a tax
   * on the normal path. Unticking is the exception, and an unticked receipt is not skipped so much
   * as postponed: nothing marks it handed over, so it is still eligible and comes back next time.
   */
  const [gewaehlt, setGewaehlt] = useState<Set<string>>(new Set());

  // Both directions, and only the rows that can actually go. A blocked row is never pre-ticked
  // and can never be ticked, so it can never be counted into what the Send button promises.
  const alleSendbar = useMemo(
    () =>
      targets.flatMap((x) => [
        ...x.ready.map((i) => i.id),
        ...x.outgoing.filter((i) => !i.blockReason).map((i) => i.id),
      ]),
    [targets],
  );

  useEffect(() => {
    if (open) {
      setPhase("review");
      setOutcomes([]);
      setLaeuft(null);
      setGewaehlt(new Set(alleSendbar));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const einzeln = targets.length === 1;
  const sendCount = gewaehlt.size;
  const gesamtBereit = alleSendbar.length;
  const skipCount = targets.reduce((n, x) => n + x.blocked.length, 0);

  function umschalten(id: string) {
    setGewaehlt((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function alleUmschalten(ids: string[], an: boolean) {
    setGewaehlt((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (an) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  /**
   * Sequential, never `Promise.all`. Each call sends real email; running them at once would make a
   * partial failure impossible to attribute and would fire N concurrent Gmail sends from one click.
   * The company in flight is named on screen so a slow fleet-wide run does not look frozen.
   */
  async function senden() {
    setPhase("sending");
    const gesammelt: CompanyOutcome[] = [];
    for (const target of targets) {
      // ONE CALL PER DIRECTION. DATEV files by the address a document arrives at, so incoming and
      // outgoing go to two different inboxes and can never share an email. A company with both
      // ticked is therefore two sends, reported as two lines, because either can fail alone.
      const perDirection: { direction: "incoming" | "outgoing"; ids: string[] }[] = [
        {
          direction: "incoming",
          ids: target.ready.filter((i) => gewaehlt.has(i.id)).map((i) => i.id),
        },
        {
          direction: "outgoing",
          ids: target.outgoing.filter((i) => gewaehlt.has(i.id)).map((i) => i.id),
        },
      ];

      for (const { direction, ids } of perDirection) {
        // Nothing ticked for this direction is skipped outright rather than called with an empty
        // list, which would do nothing and still write a batch row saying so.
        if (ids.length === 0) continue;
        setLaeuft(target.code);
        try {
          const res = await trigger.mutateAsync({
            companyId: target.id,
            direction,
            invoiceIds: ids,
          });
          gesammelt.push({
            code: target.code,
            direction,
            batches: res.batches,
            blocked: res.blockedInvoices,
          });
        } catch (e) {
          gesammelt.push({
            code: target.code,
            direction,
            batches: [],
            blocked: [],
            error: fehlerText(e),
          });
        }
        setOutcomes([...gesammelt]);
      }
    }
    setLaeuft(null);
    setPhase("result");
  }

  return (
    <Sheet open={open} onOpenChange={phase === "sending" ? undefined : onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>
            {phase === "result"
              ? t("datevUebergabe.senden.resultTitle")
              : t("datevUebergabe.senden.title")}
          </SheetTitle>
          <SheetDescription>
            {phase === "result"
              ? t("datevUebergabe.senden.resultDesc")
              : einzeln
                ? t("datevUebergabe.senden.descEine", {
                    // Both directions. It read the incoming count while the total below counted
                    // both, so a company with 5 of each announced 5 and then offered 10.
                    count: gesamtBereit,
                    company: targets[0]?.name ?? targets[0]?.code ?? "",
                  })
                : t("datevUebergabe.senden.desc")}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 flex-1">
          {phase === "result" ? (
            <Ergebnis outcomes={outcomes} />
          ) : (
            <>
              {/* No "Company / Files" header strip and no per-company count. With the description
                  above already naming the company and the total stated below the list, both were
                  restating what the reader had just read, in a row that looked like a table header
                  over a list that is not a table. */}
              <div className="space-y-4">
                {targets.every(
                  (x) => x.ready.length + x.blocked.length + x.outgoing.length === 0,
                ) && (
                  <p className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                    {t("datevUebergabe.senden.leer")}
                  </p>
                )}
                {targets.map((target) => (
                  <TargetBlock
                    key={target.id}
                    target={target}
                    mehrere={!einzeln}
                    gewaehlt={gewaehlt}
                    onToggle={umschalten}
                    onToggleAlle={alleUmschalten}
                  />
                ))}
              </div>

              <p className="mt-4 text-sm font-medium text-foreground">
                {sendCount === gesamtBereit
                  ? t("datevUebergabe.senden.summe", { count: sendCount })
                  : t("datevUebergabe.senden.auswahl", {
                      count: sendCount,
                      total: gesamtBereit,
                    })}
              </p>

              {/* Not a headline number anywhere on the screen, but it belongs HERE: these are paid
                  receipts that qualify in every way except the one that matters at the moment of
                  sending, and this is the moment. */}
              {skipCount > 0 && (
                <p className="mt-1 text-sm text-warning">
                  {t("datevUebergabe.senden.uebersprungen", { count: skipCount })}
                </p>
              )}
            </>
          )}
        </div>

        <SheetFooter className="mt-6">
          {phase === "result" ? (
            <Button onClick={() => onOpenChange(false)}>
              {t("datevUebergabe.aktion.schliessen")}
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={phase === "sending"}
              >
                {t("datevUebergabe.aktion.abbrechen")}
              </Button>
              <Button
                className="gap-2"
                onClick={() => void senden()}
                disabled={sendCount === 0 || phase === "sending"}
              >
                {phase === "sending" && <Loader2 className="size-4 animate-spin" />}
                {phase === "sending"
                  ? laeuft
                    ? t("datevUebergabe.senden.laeuftCompany", { company: laeuft })
                    : t("datevUebergabe.senden.laeuft")
                  : t("datevUebergabe.aktion.anDatevSenden")}
              </Button>
            </>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/**
 * One company, its incoming receipts and its outgoing invoices, as two labelled blocks.
 *
 * NOT COLLAPSIBLE. It was, so that a fleet-wide send would not open onto twelve companies' receipts
 * at once — but the fold also meant the default state of the last screen before an irreversible
 * email was one that showed no receipts at all, and the company name looked like a button that did
 * something to the company. The list is the contents of this drawer; hiding it to save scrolling
 * was saving the wrong thing.
 *
 * A row that cannot be attached is listed but cannot be ticked: there is no choice to offer, only
 * the reason it is staying behind. That is what the whole outgoing block currently looks like — see
 * `OutgoingBlock`.
 */
function TargetBlock({
  target,
  mehrere,
  gewaehlt,
  onToggle,
  onToggleAlle,
}: {
  target: SendTarget;
  mehrere: boolean;
  gewaehlt: Set<string>;
  onToggle: (id: string) => void;
  onToggleAlle: (ids: string[], an: boolean) => void;
}) {
  return (
    <div className="space-y-3">
      {mehrere && (
        <p className="text-sm">
          <span className="font-medium text-foreground">{target.code}</span>
          {target.name && <span className="ml-1.5 text-muted-foreground">{target.name}</span>}
        </p>
      )}
      {/* A CARD EACH. The two directions are not two halves of one thing: they go to two different
          DATEV inboxes, they are two separate emails, and either can fail while the other lands.
          One card with a divider read as a single shipment being described in two parts.

          Blocking is decided per row in both. An earlier version refused the whole outgoing
          direction on the grounds that no outgoing invoice on this database had a file, which was a
          fleet-wide observation standing in for a per-row rule and stopped being true the moment
          one of them did. Whether a receipt can go is a question about that receipt's own file. */}
      <RichtungsBlock
        titel="incoming"
        rows={[...target.ready, ...target.blocked]}
        gewaehlt={gewaehlt}
        onToggle={onToggle}
        onToggleAlle={onToggleAlle}
      />
      <RichtungsBlock
        titel="outgoing"
        rows={target.outgoing}
        gewaehlt={gewaehlt}
        onToggle={onToggle}
        onToggleAlle={onToggleAlle}
      />
    </div>
  );
}

/** One direction's receipts, with a select-all covering exactly the ones that can go. */
function RichtungsBlock({
  titel,
  rows,
  gewaehlt,
  onToggle,
  onToggleAlle,
}: {
  titel: "incoming" | "outgoing";
  rows: (DatevReadyInvoice | DatevOutgoingInvoice)[];
  gewaehlt: Set<string>;
  onToggle: (id: string) => void;
  onToggleAlle: (ids: string[], an: boolean) => void;
}) {
  const { t } = useTranslation();
  if (rows.length === 0) return null;

  const sendbar = rows.filter((r) => !r.blockReason).map((r) => r.id);
  const alleAn = sendbar.length > 0 && sendbar.every((id) => gewaehlt.has(id));

  return (
    <section className="overflow-hidden rounded-xl border border-border">
      <div className="flex items-center gap-3 border-b border-border bg-muted/40 px-3 py-2">
        {sendbar.length > 0 && (
          <Checkbox
            checked={alleAn}
            onCheckedChange={(v: boolean | "indeterminate") => onToggleAlle(sendbar, v === true)}
            aria-label={t("datevUebergabe.senden.alleWaehlen")}
          />
        )}
        <h3 className="text-sm font-medium text-foreground">
          {t(`datevUebergabe.richtung.${titel}`)}
        </h3>
        <span className="ml-auto text-xs text-muted-foreground">
          {t("datevUebergabe.dateien", { count: sendbar.length })}
        </span>
      </div>
      <ul className="divide-y divide-border">
        {rows.map((inv) => (
          <BelegZeile
            key={inv.id}
            inv={inv}
            gewaehlt={gewaehlt.has(inv.id)}
            onToggle={() => onToggle(inv.id)}
          />
        ))}
      </ul>
    </section>
  );
}

/** One receipt line, shared by both directions so they cannot drift apart visually. */
function BelegZeile({
  inv,
  gewaehlt,
  onToggle,
}: {
  inv: DatevReadyInvoice | DatevOutgoingInvoice;
  gewaehlt: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  const sperr = !!inv.blockReason;
  return (
    <li>
      <Label
        htmlFor={`inv-${inv.id}`}
        className={cn(
          "flex items-center gap-3 px-3 py-2 text-sm font-normal",
          sperr ? "cursor-default opacity-70" : "cursor-pointer hover:bg-muted/30",
        )}
      >
        <Checkbox
          id={`inv-${inv.id}`}
          checked={!sperr && gewaehlt}
          disabled={sperr}
          onCheckedChange={onToggle}
        />
        <span className="min-w-0 flex-1 truncate">
          {inv.invoice_number && <span className="text-foreground">{inv.invoice_number}</span>}
          {inv.issuer && (
            <span className={cn(inv.invoice_number && "ml-1.5", "text-muted-foreground")}>
              {inv.issuer}
            </span>
          )}
          {!inv.invoice_number && !inv.issuer && (
            <span className="text-muted-foreground">{formatDate(inv.document_date)}</span>
          )}
        </span>
        <span className="shrink-0 tabular-nums">
          {inv.blockReason ? (
            <span className="text-xs text-warning">
              {t(`datevUebergabe.blockGrund.${inv.blockReason}`)}
            </span>
          ) : (
            <span className="text-muted-foreground">{formatEUR(inv.amount_gross)}</span>
          )}
        </span>
      </Label>
    </li>
  );
}

/** What actually happened, per company. Never a claim the backend did not make. */
function Ergebnis({ outcomes }: { outcomes: CompanyOutcome[] }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-3">
      {outcomes.map((o) => {
        const ok = o.batches.filter((b) => b.status === "success");
        const failed = o.batches.filter((b) => b.status === "error");
        const gesendet = ok.reduce((n, b) => n + b.invoiceCount, 0);
        const schlimm = !!o.error || failed.length > 0;
        return (
          <div
            key={`${o.code}:${o.direction}`}
            className={cn(
              "rounded-xl border p-3",
              schlimm ? "border-danger/40 bg-danger-soft/40" : "border-border bg-card",
            )}
          >
            <div className="flex flex-wrap items-center gap-2">
              {schlimm ? (
                <AlertTriangle className="size-4 shrink-0 text-danger" aria-hidden />
              ) : (
                <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden />
              )}
              <span className="font-medium text-foreground">{o.code}</span>
              {/* Named, because a company can appear twice: the two directions go to two different
                  DATEV inboxes and either can fail on its own. */}
              <span className="text-xs text-muted-foreground">
                {t(`datevUebergabe.richtung.${o.direction}`)}
              </span>
              <span className="text-sm text-muted-foreground">
                {o.error
                  ? t("datevUebergabe.senden.result.fehlgeschlagen")
                  : t("datevUebergabe.senden.result.gesendet", { count: gesendet })}
              </span>
            </div>

            {o.error && <p className="mt-2 text-sm text-danger">{o.error}</p>}

            {/* Printed in full, never summarised. One of the strings that can land here is the send
                function's "EMAIL WAS SENT but recording it failed after 3 attempts ... do NOT
                resend" — the one case where the right next step is the opposite of the obvious one,
                and any paraphrase loses it. */}
            {failed.map((b, i) => (
              <p key={i} className="mt-2 text-sm break-words text-danger">
                {b.error ?? t("datevUebergabe.senden.result.fehlgeschlagen")}
              </p>
            ))}

            {ok.length > 1 && (
              <p className="mt-1 text-xs text-muted-foreground">
                {t("datevUebergabe.senden.result.mails", {
                  count: ok.length,
                  size: formatBytes(ok.reduce((n, b) => n + b.totalBytes, 0)),
                })}
              </p>
            )}

            {o.blocked.length > 0 && (
              <p className="mt-2 border-t border-border pt-2 text-xs text-muted-foreground">
                {t("datevUebergabe.senden.result.uebersprungen", { count: o.blocked.length })}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
