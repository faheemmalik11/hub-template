import { getRouteApi, Link, useBlocker, useNavigate } from "@tanstack/react-router";
import {
  forwardRef,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  BellRing,
  ChevronLeft,
  AlertTriangle,
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCheck,
  ChevronRight,
  CircleCheck,
  ExternalLink,
  MailQuestion,
  MessageCircleQuestion,
  Pencil,
  Bookmark,
  Plus,
  Search,
  Send,
  TriangleAlert,
  Undo2,
  Wand2,
  X,
  Link2,
  Info,
} from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/lib/auth";
import { PERMISSIONS } from "@/config/permissions";
import { usePaymentRight } from "@/lib/payment-right";
import { PaymentRightNotice } from "@/components/bank/payment-right-notice";
import { CloseRemainderButton } from "@/components/bank/close-remainder";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Combobox } from "@/components/ui/combobox";
import { PingDialog, PingNotice, usePingRecipients } from "@/components/belege/ping-button";
import { useShellLeafLabel } from "@/kit/components/shell";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  useUnlinkMatch,
  useCloseInvoiceRemainder,
  useReopenInvoiceRemainder,
  ACTING_AS_NONE,
  useAddNotiz,
  useApplyAssignmentRules,
  useArchiveBeleg,
  useAssignmentRuleCandidates,
  useAssignmentRules,
  useBeleg,
  useBankAccounts,
  useBelegMatches,
  useBelegVerlauf,
  useBwaCategories,
  useCancelPaymentOrder,
  useClearNotRelevant,
  useConfirmMatch,
  useActingCapabilities,
  useGesellschaften,
  useInitiatePayment,
  useAddSupplierBankAccount,
  useInvoiceBankAccounts,
  useLieferant,
  useLinkInvoiceBankAccount,
  useLieferanten,
  useObjekte,
  usePaymentOrders,
  usePropertyCompanies,
  useRejectMatch,
  useResolveApprovalRule,
  useResolvedRules,
  useSetNotRelevant,
  useSoftDeleteBeleg,
  useSupplierBankAccounts,
  useUnarchiveBeleg,
  useUpdateBeleg,
  useVerarbeitungsLogFuerBeleg,
} from "@/lib/data/queries";
import { resolveKostenstelle, type Kostenstelle } from "@/lib/data/kostenstelle";
import {
  releasesPaymentLink,
  UnlinkMatchButton,
  type UnlinkMatchLabels,
} from "@/kit/components/invoice-payment-link";
import { backwardsTargets } from "@/kit/components/invoice-workflow";
import {
  GESELLSCHAFT_OHNE,
  APPROVAL_TERMINAL_STATUSES,
  QUELLE_META,
  WORKFLOW_REIHENFOLGE,
  abgleichStatus,
  istOffenerVorschlag,
  approvalActionLabelDe,
  approvalQueryTarget,
  fehlerText,
  feldAenderungDe,
  fieldSourceKey,
  formatDate,
  formatDateTime,
  formatEUR,
  formatIBAN,
  formatSignedEUR,
  istEingangsrechnung,
  istLastschrift,
  nextLegalActions,
  parseDecimalInput,
  type ApprovalAction,
  type ApprovalActionId,
  workflowLabelDe,
  zahlungGruende,
  FELD_LABEL_DE,
} from "@/lib/data/format";
import { pruefGruendeDetail, pruefKarte } from "./pruefung";
import { useTranslation, tDe, Trans } from "@/lib/i18n";
import { useTabParam } from "@/lib/use-tab-param";
import {
  BelegartBadge,
  KanalBadge,
  KonfidenzDot,
  KonfidenzPill,
  WorkflowBadge,
} from "@/components/belege/badges";
import { AbgleichBadge, MatchStatusBadge } from "@/components/bank/badges";
import { MatchScoreBreakdown } from "@/components/bank/match-score";
import { CopyButton } from "@/components/belege/copy-button";
import {
  ActionButtons,
  HeaderNotes,
  IconMenu,
  InfoTip,
  InfoTipButton,
  LabelledSelect,
  ReviewCard,
  WorkflowLadder,
} from "@/kit/ui";
import type {
  WorkflowLadderLinkComponent,
  WorkflowLadderLinkProps,
  WorkflowLadderStep,
} from "@/kit/ui";
import { AccountChips, type AccountChip } from "@/components/suppliers/account-chips";
import { BankAccountDialog } from "@/components/suppliers/bank-account-dialog";
import { FactList } from "@/components/records/fact-list";
import { PaymentAccounts } from "@/components/suppliers/payment-account-summary";
import { PlainSection } from "@/components/records/plain-section";
import { DocumentPreview } from "@/components/belege/document-preview";
import { SplitOriginNote } from "@/components/belege/split-origin-note";
import { ErrorState } from "@/components/belege/query-states";
import { NeueRegelDialog } from "@/components/zuordnung/neue-regel-dialog";
import type {
  AssignmentRule,
  Beleg,
  BwaCategory,
  ChainPerson,
  Konfidenz,
  Lieferant,
  RuleTarget,
  WorkflowStatus,
} from "@/lib/data/types";
import { INCOME_TAX_TREATMENTS, VAT_SPECIAL_CASES, VAT_TREATMENTS } from "@/lib/data/types";
import { pageTitle } from "@/config/brand";
import { pickListSearch } from "@/lib/belege-list-search";

import {
  APPROVAL_VERLAUF_TYPES,
  AUTO_STUFEN,
  CHAIN_ACTION_IDS,
  CORRECTABLE_STATUSES,
  LADDER_THEME,
  ABGLEICH_ANKER,
  BETRAEGE_ANKER,
  BETEILIGTE_ANKER,
  FELD_SPRUNGZIEL,
  LIEFERANT_ANKER,
  UEBERWEISUNG_ANKER,
  RECHNUNGSDATEN_ANKER,
  REVIEW_ANKER,
  HEADER_NOTE_COUNT,
  NOTIZEN_ANKER,
  RUECKFRAGE_ANKER,
} from "./config";
import { verlaufBasis, verlaufTypLabel, verlaufZeilen, verlaufZusatz } from "./verlauf";
import { AusgangBanner } from "./AusgangFlag";
import { belegNachgeprueft } from "./nachpruefung";
import { ohnePruefungen, pruefGruendeAnzeige, pruefungLabelDe } from "./pruefung";
import { ReviewBadge } from "./ReviewChip";
import { SideBySide } from "./SideBySide";
import { WorkflowVerlaufListe } from "./WorkflowVerlaufListe";

// The page is portable (see PORTING.md) and must not import the Route object from the route
// file, which imports it back -- getRouteApi is TanStack Router's own decoupling for exactly
// this. The route path string is the one thing that has to match the host repo's route file.
const route = getRouteApi("/eingangsrechnungen/$nr");

/**
 * The list state to return to. Empty when the invoice was opened from somewhere other than the
 * list (a dashboard tile, a bank transaction, a pasted link), which just means the back link goes
 * to the plain, unfiltered list.
 */
function useListSearch() {
  return pickListSearch(route.useSearch());
}

export function BelegDetailPage() {
  const { nr } = route.useParams();
  const { t } = useTranslation();
  const listSearch = useListSearch();
  const { data: beleg, isLoading, isError, error, refetch } = useBeleg(nr);
  // The URL carries the row id; the breadcrumb should carry something a person recognises.
  useShellLeafLabel(beleg ? (beleg.invoice_number ?? beleg.issuer ?? null) : null);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-6 lg:grid-cols-[minmax(320px,420px)_1fr]">
          <Skeleton className="h-[520px] rounded-xl" />
          <div className="space-y-4">
            <Skeleton className="h-48 rounded-xl" />
            <Skeleton className="h-48 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  if (isError) {
    return <ErrorState error={error} onRetry={() => refetch()} />;
  }

  if (!beleg) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          {t("belege.detail.notFoundTitle")}
        </h1>
        <p className="mt-2 text-base text-muted-foreground">
          {t("belege.detail.notFoundBody", { nr })}
        </p>
        <Button asChild className="mt-6">
          <Link to="/eingangsrechnungen" search={listSearch}>
            {t("belege.detail.toOverview")}
          </Link>
        </Button>
      </div>
    );
  }

  return <BelegDetail key={beleg.id} beleg={beleg} />;
}

// Editierbare Felder als String-Formular (Inputs liefern Strings).
type FormState = {
  issuer: string;
  issuer_address: string;
  invoice_number: string;
  order_number: string;
  document_date: string;
  // Enterable by hand, and only by hand. The pipeline extracts no due date at all: there is not a
  // single `faelligkeit` key in any `extracted` blob in this database. Without this field
  // invoices.due_date stayed null on all 433 receipts, and Offene Posten's "Fällig" column was a
  // column of dashes on the screen whose whole job is "which of these is late".
  due_date: string;
  service_date: string;
  service_period_from: string;
  service_period_to: string;
  amount_net: string;
  vat_rate: string;
  vat_amount: string;
  amount_gross: string;
  currency: string;
  company_code: string;
  property_code: string;
  // ONE category, picked from the real BWA taxonomy (bwa_categories, migration 0030) — not free
  // text. cost_category still exists in the schema as a legacy mirror the rule engine also
  // reads/writes (RuleTarget stays "cost_category"), but it is never edited directly anymore:
  // speichern() derives it automatically from whichever category is chosen here.
  category_id: string;
  service_description: string;
  recipient_name: string;
  recipient_address: string;
  customer_number: string;
  payment_reference: string;
  payment_method: string;
  tax_note: string;
  vat_deductible_pct: string;
  vat_special_case: string;
  income_tax_treatment: string;
};

function formFromBeleg(b: Beleg): FormState {
  const s = (v: string | null) => v ?? "";
  const n = (v: number | null) => (v == null ? "" : String(v));
  return {
    issuer: s(b.issuer),
    issuer_address: s(b.issuer_address),
    invoice_number: s(b.invoice_number),
    order_number: s(b.order_number),
    document_date: s(b.document_date),
    due_date: s(b.due_date),
    service_date: s(b.service_date),
    service_period_from: s(b.service_period_from),
    service_period_to: s(b.service_period_to),
    amount_net: n(b.amount_net),
    vat_rate: n(b.vat_rate),
    vat_amount: n(b.vat_amount),
    amount_gross: n(b.amount_gross),
    currency: s(b.currency),
    company_code: s(b.company_code),
    property_code: b.is_overhead ? GEMEINKOSTEN : s(b.property_code),
    category_id: s(b.category_id),
    service_description: s(b.service_description),
    recipient_name: s(b.recipient_name),
    recipient_address: s(b.recipient_address),
    customer_number: s(b.customer_number),
    payment_reference: s(b.payment_reference),
    payment_method: s(b.payment_method),
    tax_note: s(b.tax_note),
    vat_deductible_pct: n(b.vat_deductible_pct),
    vat_special_case: s(b.vat_special_case),
    income_tax_treatment: s(b.income_tax_treatment),
  };
}

const TEXT_KEYS = [
  "issuer",
  "issuer_address",
  "invoice_number",
  "order_number",
  "document_date",
  "due_date",
  "service_date",
  "service_period_from",
  "service_period_to",
  "currency",
  "company_code",
  "property_code",
  "category_id",
  "service_description",
  "recipient_name",
  "recipient_address",
  "customer_number",
  "payment_reference",
  "payment_method",
  "tax_note",
  "vat_special_case",
  "income_tax_treatment",
] as const;
const NUM_KEYS = [
  "amount_net",
  "vat_rate",
  "vat_amount",
  "amount_gross",
  "vat_deductible_pct",
] as const;

// The detail screen's six tabs, shared by the always-visible desktop row and the collapsed mobile
// disclosure so the two can never list a different set of tabs from each other.
const TAB_ITEMS = [
  { value: "uebersicht", labelKey: "belege.detail.tab.uebersicht" },
  { value: "freigabe", labelKey: "belege.detail.tab.freigabe" },
  { value: "zahlung", labelKey: "belege.detail.tab.zahlung" },
  { value: "lieferant", labelKey: "belege.detail.tab.lieferant" },
  { value: "details", labelKey: "belege.detail.tab.details" },
  { value: "verlauf", labelKey: "belege.detail.tab.verlauf" },
] as const;

// Formular → DB-Änderungen (nur geänderte Felder); leere Strings → null.
// `invalid` lists numeric fields whose input couldn't be parsed — the caller must
// reject those instead of writing (a wrong number is worse than no change).
// `before` mirrors `changes` key for key with the value that was replaced. The history entry is
// written from it, and it is stored alongside the new values so the record stays readable even if
// the label wording here changes later.
/**
 * "Gemeinkosten" in the property picker.
 *
 * A sentinel in the form only. The invoice stores it as `is_overhead`, because a cost centre that
 * is not a building has no address, no VAT status and no company link, so a fake property row
 * would need every one of those columns to mean "ignore me". Saskia's rule (09.09.2026, 12:36):
 * "If it says overhead costs, then there is no property."
 */
const GEMEINKOSTEN = "__overhead";

function diffChanges(
  form: FormState,
  b: Beleg,
): {
  changes: Partial<Beleg>;
  before: Record<string, unknown>;
  labels: string[];
  invalid: string[];
} {
  const changes: Record<string, unknown> = {};
  const before: Record<string, unknown> = {};
  const labels: string[] = [];
  const invalid: string[] = [];
  for (const k of TEXT_KEYS) {
    const neu = form[k].trim() === "" ? null : form[k].trim();
    const alt = (b[k] as string | null) ?? null;
    if (neu !== alt) {
      changes[k] = neu;
      before[k] = alt;
      labels.push(k);
    }
  }
  for (const k of NUM_KEYS) {
    const neu = parseDecimalInput(form[k]); // null = cleared, NaN = invalid input
    if (neu !== null && Number.isNaN(neu)) {
      invalid.push(k);
      continue; // never overwrite a value with NaN — no silent data loss
    }
    const alt = (b[k] as number | null) ?? null;
    if (neu !== alt) {
      changes[k] = neu;
      before[k] = alt;
      labels.push(k);
    }
  }
  return { changes: changes as Partial<Beleg>, before, labels, invalid };
}

function BelegDetail({ beleg }: { beleg: Beleg }) {
  // Same list state the page header's back link uses, so both return to the filtered list.
  const listSearch = useListSearch();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const lieferantQ = useLieferant(beleg.supplier_id ?? "");
  const rechnungsKontenQ = useInvoiceBankAccounts(beleg.id, beleg.supplier_id);
  const gesellschaftenQ = useGesellschaften();
  const objekteQ = useObjekte();
  const categoriesQ = useBwaCategories();
  const propertyCompaniesQ = usePropertyCompanies();
  const logQ = useVerarbeitungsLogFuerBeleg(beleg.id);
  const verlaufQ = useBelegVerlauf(beleg.id);
  // Which rule currently wins for this receipt, per field. Shown even when the field is human-set
  // and therefore protected: knowing which rule you are overriding is the useful part.
  const regelnQ = useResolvedRules(beleg.id);

  const updateBeleg = useUpdateBeleg(beleg.id);
  const addNotiz = useAddNotiz(beleg.id);
  const softDelete = useSoftDeleteBeleg(beleg.id);
  const applyRules = useApplyAssignmentRules();
  const setNotRelevant = useSetNotRelevant(beleg.id);
  const clearNotRelevant = useClearNotRelevant(beleg.id);
  const archive = useArchiveBeleg(beleg.id);
  const unarchive = useUnarchiveBeleg(beleg.id);
  const approvalRuleQ = useResolveApprovalRule(beleg.id);

  // Per-section editing: only one section is editable at a time (its key here, or null).
  // Replaces the old single global edit button so a single field can be corrected in isolation.
  //
  // `darfAlsPerson` rather than useAuth().can: every permission-gated control on this screen has to
  // answer for the person in the "Handelnd als" picker, or the label lies. See
  // useActingCapabilities.
  const {
    actingAs,
    people: chainPeople,
    chooseActingAs,
    darfHandelnAls,
    istFremdeIdentitaet,
    darfAlsPerson,
  } = useActingCapabilities();
  const [editSection, setEditSection] = useState<string | null>(null);
  // Which of the six detail tabs is showing.
  const [activeTab, setActiveTab] = useTabParam(
    ["uebersicht", "freigabe", "zahlung", "lieferant", "details", "verlauf"] as const,
    "uebersicht",
  );
  const [form, setForm] = useState<FormState>(() => formFromBeleg(beleg));
  // The receipt as it looked when the open section started editing. The dirty check below diffs
  // against this rather than the live `beleg`, which keeps refetching underneath the open form.
  const [basis, setBasis] = useState<Beleg>(beleg);
  const [notiz, setNotiz] = useState("");
  const [noteFormOpen, setNoteFormOpen] = useState(false);
  const [nichtRelevantGrund, setNichtRelevantGrund] = useState("");
  const [archivHinweis, setArchivHinweis] = useState("");
  // Which destructive action is confirming. One slot, not three booleans: only one of these
  // dialogs can be open at a time, and the ⋮ menu that opens them closes on select.
  const [aktionDialog, setAktionDialog] = useState<
    "nichtRelevant" | "archivieren" | "verwerfen" | null
  >(null);
  const [pingOffen, setPingOffen] = useState(false);
  const pingEmpfaenger = usePingRecipients();
  // Which direction the paid switch was flipped, held until it is confirmed. `null` = no dialog;
  // `true` = about to mark paid, `false` = about to withdraw the mark. Not a plain boolean open
  // flag, because the two directions say different things and one of them is not reversible by the
  // bank reconciliation.
  const [bezahltDialog, setBezahltDialog] = useState<boolean | null>(null);
  // Selected supplier while editing the Lieferant tab (id, or "__none" to unlink).
  const [lieferantWahl] = useState("__none");
  // Deductibility can be entered either as a percentage or as a fixed EUR amount (whichever is more
  // natural for the reviewer); this holds the amount side. vat_deductible_amount itself is a
  // GENERATED column and can never be written directly — only vat_deductible_pct (in `form`) is
  // ever sent to the DB, this is purely a convenience input kept in sync with it.
  const [abzugBetragEingabe, setAbzugBetragEingabe] = useState(() =>
    beleg.vat_deductible_amount != null ? String(beleg.vat_deductible_amount) : "",
  );
  // Pending reassignment awaiting confirmation (overwriting an already-set company/property).
  const [reassign, setReassign] = useState<{
    changes: Partial<Beleg>;
    before: Record<string, unknown>;
    labels: string[];
    // Every field this save touches, as before→after lines — what gets written to the history.
    changeLines: string[];
    istZuordnung: boolean;
    // Only the assignment overwrites, which is what the dialog asks about.
    lines: string[];
  } | null>(null);

  const set = <K extends keyof FormState>(k: K, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const isEdit = (section: string) => editSection === section;
  // One section at a time: while a section is open, every other section's "Bearbeiten" button is
  // disabled (greyed out with a reason on hover, rather than gone, so the reviewer can still see
  // where editing lives). Without this, clicking another section's button ran startEdit and reset
  // the form from `beleg`, discarding everything typed into the open one -- the exact loss the
  // unsaved-changes dialog exists to prevent, reached without ever showing it.
  //
  // It also answers the permission question, because it is the ONE place every section's edit
  // affordance goes through. Without `invoices.book` the database refuses the write (the trigger in
  // migration 20260828270000), so an enabled button here could only ever open a form that fails on
  // save with a raw Postgres error -- the same defect the paid switch had.
  const darfBuchen = darfAlsPerson(PERMISSIONS.documentsWrite);
  const kannBearbeiten = (section: string) =>
    darfBuchen && (editSection === null || editSection === section);

  // The Lieferant section is edited through its own combobox instead of `form`, so diffChanges
  // cannot see it and it has to be checked separately (see speichernLieferant).
  const lieferantGeaendert =
    editSection === "lieferant" &&
    (lieferantWahl === "__none" ? null : lieferantWahl) !== (basis.supplier_id ?? null);

  // Which fields the open edit form would throw away. `diffChanges` is the same helper the save
  // path uses, so "changed" here means exactly what "changed" means when saving -- no separate
  // notion of dirtiness that could disagree with it.
  //
  // Diffed against `basis`, the receipt as it was when this edit started, NOT against the live
  // `beleg`: that one refetches on window focus and after every mutation, so diffing against it
  // reported the server's own changes as the reviewer's unsaved input. Opening a section, typing
  // nothing and clicking "Regeln anwenden" was enough to produce a warning about fields nobody
  // had touched -- and saving from that state would have reverted the rules again.
  const geaenderteFelder = useMemo(() => {
    if (!editSection) return [];
    const { labels, invalid } = diffChanges(form, basis);
    // `invalid` is typed-but-unparseable input ("1.2.3" in Betrag brutto). It never reaches
    // `labels`, which made a mistyped number the one edit that could be dropped in silence --
    // while pressing Speichern would at least have said the value was unusable.
    // Named the way the person sees them on screen, not by column. diffChanges returns raw
    // FormState keys, and "invoice_number, amount_gross" is not what somebody who just typed
    // into "Rechnungsnummer" is looking for. Same map the history lines already use.
    return [...labels, ...invalid]
      .map((k) => FELD_LABEL_DE[k] ?? k)
      .concat(lieferantGeaendert ? [FELD_LABEL_DE.supplier_id] : []);
  }, [editSection, form, basis, lieferantGeaendert]);
  const hatUngespeicherte = geaenderteFelder.length > 0;

  // Switching tabs closes the open section (that is deliberate), so with typed-but-unsaved input
  // it has to ask first. Without this, one click on another tab silently discarded up to 13 fields
  // somebody had just copied off a PDF, with nothing shown at all.
  const [tabWunsch, setTabWunsch] = useState<string | null>(null);

  // Leaving the invoice entirely: the back button, a link, a reload, closing the tab. The tab
  // strip is deliberately NOT blocked here -- it stays on the same invoice and is handled by
  // tabWunsch above, which can be more specific about what is going to happen.
  //
  // Navigations this screen triggers itself (the redirect after discarding the receipt) are not
  // somebody walking away from unsaved input: the record they were editing no longer exists, and
  // "Weiter bearbeiten" would cancel the redirect and leave them editing a deleted receipt. A ref
  // rather than state, so shouldBlockFn sees it in the same tick the navigation starts.
  const eigeneNavigation = useRef(false);

  const blocker = useBlocker({
    shouldBlockFn: ({ current, next }) =>
      !eigeneNavigation.current && hatUngespeicherte && current.pathname !== next.pathname,
    enableBeforeUnload: () => hatUngespeicherte,
    withResolver: true,
  });

  const verwerfenFrage = tabWunsch !== null || blocker.status === "blocked";
  function aenderungenVerwerfen() {
    if (tabWunsch !== null) {
      setActiveTab(tabWunsch);
      setEditSection(null);
      setTabWunsch(null);
      return;
    }
    if (blocker.status === "blocked") {
      setEditSection(null);
      blocker.proceed();
    }
  }
  function weiterBearbeiten() {
    if (tabWunsch !== null) {
      setTabWunsch(null);
      return;
    }
    if (blocker.status === "blocked") blocker.reset();
  }

  /**
   * A scroll target parked until the tab holding it is actually on screen.
   *
   * Scrolling inside the click handler cannot work: the tab panel mounts after the state update,
   * so the node does not exist yet in that tick, and handleTabChange can defer the switch entirely
   * when there are unsaved edits. Parking the target and letting an effect resolve it handles both
   * -- including the case where the reader confirms the unsaved-changes prompt some seconds later.
   */
  /**
   * Whether the review box is open, and a brief flash after jumping to it.
   *
   * Closed on arrival, whatever the receipt's state. The header already says whether a review is
   * needed and how many reasons there are, so opening the panel for everyone pushed the document
   * and the tabs down the page to repeat a headline they had just read. It opens on request, from
   * the header chip.
   *
   * Controlled, because `<details open={...}>` is not: the attribute is written once, and after a
   * reader collapses the box by hand the DOM and the prop disagree, so re-rendering with the same
   * `open={true}` does nothing and the box stays shut for the rest of the visit.
   */
  // Open when the card is asking for something, collapsed when it only reports that every
  // check passed -- which is what the comment above always claimed and the initialiser never
  // did. Initial value only: once a reader toggles it, onToggle owns it for the visit.
  const [reviewOffen, setReviewOffen] = useState(() => pruefGruendeDetail(beleg).length > 0);
  const [reviewBlitz, setReviewBlitz] = useState(false);
  useEffect(() => {
    if (!reviewBlitz) return;
    const id = window.setTimeout(() => setReviewBlitz(false), 1800);
    return () => window.clearTimeout(id);
  }, [reviewBlitz]);

  /** Open the review box, scroll it into view, and flash it so the eye lands on what changed. */
  const zeigeReview = () => {
    setReviewOffen(true);
    setReviewBlitz(true);
    // One frame later: <details> has to have been re-rendered open before scrolling to it, or the
    // browser scrolls to the collapsed summary and the reasons open below the fold.
    requestAnimationFrame(() => {
      document
        .getElementById(REVIEW_ANKER)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  };

  const [scrollZiel, setScrollZiel] = useState<{ tab: string; id: string } | null>(null);
  useEffect(() => {
    if (!scrollZiel || activeTab !== scrollZiel.tab) return;
    let frames = 0;
    let raf = 0;
    const versuch = () => {
      const el = document.getElementById(scrollZiel.id);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        // Scrolling alone drops the reader somewhere on a long tab with no sign of WHICH field the
        // card meant. Applied to the node rather than through state because every anchor is a
        // different section owned by different code.
        const blitz = [
          "ring-2",
          "ring-amber-400",
          "ring-offset-4",
          "ring-offset-background",
          "rounded-lg",
        ];
        el.classList.add(...blitz);
        window.setTimeout(() => el.classList.remove(...blitz), 1800);
        setScrollZiel(null);
        return;
      }
      // The panel is not there yet, and nothing will re-run this effect to try again -- `activeTab`
      // and `scrollZiel` have both already settled. So keep looking across frames instead of
      // reading the DOM once and giving up, which is why this only ever worked when the tab was
      // ALREADY open: the tab value round-trips through the router (useTabParam navigates), so on a
      // switch `activeTab` flips a render or two before Radix mounts the matching TabsContent.
      // Bounded so a wrong id cannot spin forever.
      if (++frames < 60) raf = requestAnimationFrame(versuch);
      else setScrollZiel(null);
    };
    raf = requestAnimationFrame(versuch);
    return () => cancelAnimationFrame(raf);
  }, [scrollZiel, activeTab]);

  const springeZu = (tab: string, id: string) => {
    setScrollZiel({ tab, id });
    handleTabChange(tab);
  };

  const handleTabChange = (v: string) => {
    if (hatUngespeicherte) {
      setTabWunsch(v);
      return;
    }
    setActiveTab(v);
    setEditSection(null);
  };

  // Any section currently in edit disables the other sections' edit buttons (one at a time).
  // Start editing a section from the latest beleg, so edits never build on stale form state.
  function startEdit(section: string) {
    setForm(formFromBeleg(beleg));
    setBasis(beleg);
    setAbzugBetragEingabe(
      beleg.vat_deductible_amount != null ? String(beleg.vat_deductible_amount) : "",
    );
    setEditSection(section);
  }

  // The vat_amount the deductibility math must follow is whatever is live in the form, not the
  // beleg prop from before this edit session started — the reviewer may have just corrected
  // vat_amount in the very same sitting, and the % <-> EUR conversion has to use that, not the
  // stale value on screen before they started editing.
  const liveVatAmountParsed = parseDecimalInput(form.vat_amount);
  const liveVatAmount =
    liveVatAmountParsed != null && !Number.isNaN(liveVatAmountParsed) ? liveVatAmountParsed : null;

  // Whichever of percentage/amount the user actually types drives the other; both ultimately
  // resolve to a single vat_deductible_pct, which is the only real column.
  function onAbzugProzentChange(v: string) {
    set("vat_deductible_pct", v);
    if (v.trim() === "") {
      setAbzugBetragEingabe("");
      return;
    }
    const pct = Number(v.replace(",", "."));
    if (Number.isFinite(pct) && liveVatAmount != null) {
      setAbzugBetragEingabe(String(Math.round(((liveVatAmount * pct) / 100) * 100) / 100));
    }
  }
  function onAbzugBetragChange(v: string) {
    setAbzugBetragEingabe(v);
    if (v.trim() === "") {
      set("vat_deductible_pct", "");
      return;
    }
    const betrag = Number(v.replace(",", "."));
    if (Number.isFinite(betrag) && liveVatAmount) {
      set("vat_deductible_pct", String(Math.round((betrag / liveVatAmount) * 100 * 100) / 100));
    }
  }

  const lieferant = lieferantQ.data ?? null;
  // The accounts THIS document named. Only the ids matter here: the panel shows one account, and
  // this is what tells it that the account came off the invoice rather than off the supplier.
  const rechnungsKonten = useMemo(
    () =>
      rechnungsKontenQ.data?.origin === "invoice" ? (rechnungsKontenQ.data?.accounts ?? []) : [],
    [rechnungsKontenQ.data],
  );
  // What the payment opens on: the first account this document named that money can actually be
  // sent to. A masked IBAN is on file so somebody can complete it, not to be paid.
  const zahlKonto = rechnungsKonten.find((konto) => konto.is_payable !== false) ?? null;
  // Every account this supplier could be paid on, for the "andere wählen" dialog. A masked IBAN is
  // on file to be completed, never to be paid, so it is not offered.
  const lieferantenKontenQ = useSupplierBankAccounts(beleg.supplier_id ?? undefined);
  const neuesLieferantenKonto = useAddSupplierBankAccount(beleg.supplier_id ?? "");
  const kontoVerknuepfen = useLinkInvoiceBankAccount(beleg.id);
  const zahlbareKonten = useMemo(
    () => (lieferantenKontenQ.data ?? []).filter((k) => k.is_active && k.is_payable !== false),
    [lieferantenKontenQ.data],
  );
  const [kontoWahlOffen, setKontoWahlOffen] = useState(false);
  // What the pay dialog opens on: the account this document named, else the supplier's default.
  // Whoever is paying can still switch to any other account of theirs inside that dialog.
  const aktuellesKonto =
    zahlbareKonten.find((k) => k.id === zahlKonto?.id) ??
    zahlbareKonten.find((k) => k.is_default) ??
    null;
  // Payable or not, every account either side knows about, for looking one up by id.
  const alleKonten = useMemo(
    () => [...(rechnungsKontenQ.data?.accounts ?? []), ...zahlbareKonten],
    [rechnungsKontenQ.data, zahlbareKonten],
  );
  const rechnungsKontoIds = useMemo(
    () => new Set(rechnungsKonten.map((k) => k.id)),
    [rechnungsKonten],
  );
  // Three origins, in the order that answers "why is THIS the account": the document named it, it
  // is the supplier's standing account, or somebody chose it by hand.
  /**
   * Everything true of one account, as chips. They are independent on purpose: an account the
   * document named AND that the supplier already had shows both, which the single joined sentence
   * this replaces could not express without implying one followed from the other.
   */
  function kontoChips(id: string): AccountChip[] {
    const konto = alleKonten.find((k) => k.id === id);
    const vonRechnung = rechnungsKontoIds.has(id);
    const chips: AccountChip[] = [];
    // "already saved" and "new" only mean anything ABOUT A DOCUMENT: they answer whether the
    // supplier was billing from this account before this invoice named it. Read off an account the
    // document never mentioned they are nonsense, and an account somebody typed a moment ago was
    // reporting itself as long since on file.
    // Printed on the document is the whole story of where this account came from. Adding "and the
    // supplier already had it" or "and a person typed it" beside that reads as three competing
    // accounts of the same fact, so being on the document silences both.
    if (vonRechnung) {
      chips.push({
        kind: "invoice",
        label: t("belege.detail.lieferant.zahlkonto.chip.rechnung"),
        hint: t("belege.detail.lieferant.zahlkonto.chip.rechnungHinweis"),
      });
      if (!konto?.confirmed_at) {
        chips.push({
          kind: "new",
          label: t("belege.detail.lieferant.zahlkonto.neuBadge"),
          hint: t("belege.detail.lieferant.konten.neuHinweis"),
        });
      }
    }
    if (konto?.is_default) {
      chips.push({
        kind: "default",
        label: t("belege.detail.lieferant.zahlkonto.chip.standard"),
        // When nothing was read off the document, the default is standing in, and that is the one
        // thing a reader most needs to know about why this account is on screen at all.
        hint: vonRechnung
          ? t("belege.detail.lieferant.zahlkonto.chip.standardHinweis")
          : t("belege.detail.lieferant.zahlkonto.standardHinweis"),
      });
    }
    // Nothing above applied, so there is one thing left to say: the supplier has it on file.
    if (chips.length === 0) {
      chips.push({
        kind: "manual",
        label: t("belege.detail.lieferant.zahlkonto.chip.manuell"),
        hint: t("belege.detail.lieferant.zahlkonto.chip.manuellHinweis"),
      });
    }
    return chips;
  }
  // Every account this document named, in the order it printed them, else the one account the
  // supplier is normally paid on. A masked IBAN is listed too: it was on the document, and hiding
  // it would be the panel claiming the invoice named nothing.
  const anzeigeKonten = rechnungsKontenQ.data?.accounts ?? [];
  // Nothing is recorded against this invoice, yet the supplier has an account: it was completed
  // after the invoice was read, so the two were never connected. Offered rather than assumed,
  // because attaching an account to an invoice is a statement about how it gets paid.
  const nachtraeglichesKonto =
    anzeigeKonten.length === 0
      ? (zahlbareKonten.find((k) => k.is_default) ?? zahlbareKonten[0] ?? null)
      : null;
  // The reader is deliberately NOT told "no account exists" when the document did print one and it
  // simply could not be read: those are different facts and only one of them is the supplier's.
  const ibanImDokument = String(beleg.extracted?.iban ?? "").trim();
  const kontoFehltErklaerung = ibanImDokument
    ? t("belege.detail.lieferant.zahlkonto.leerLesefehler")
    : t("belege.detail.lieferant.zahlkonto.leerNichts");
  // The accounts this invoice can be paid to, worded once and rendered on two tabs. Lieferant
  // lists them as the supplier's bank details, Zahlung puts the pay control under the same list,
  // so an account reads identically wherever it is met.
  const zahlkontenPanel = {
    accounts: anzeigeKonten.map((k) => ({
      id: k.id,
      iban: formatIBAN(k.iban),
      rawIban: k.iban,
      bankName: k.bank_name,
      bic: k.bic,
      chips: kontoChips(k.id),
    })),
    emptyExplanation: kontoFehltErklaerung,
    labels: {
      account: t("belege.detail.lieferant.zahlkonto.konto"),
      info: t("belege.detail.lieferant.zahlkonto.chip.info"),
      emptyTitle: t("belege.detail.lieferant.zahlkonto.leerTitel"),
      add: t("belege.detail.lieferant.zahlkonto.hinzufuegen"),
      availableTitle: t("belege.detail.lieferant.zahlkonto.nachgetragenTitel"),
      link: t("belege.detail.lieferant.zahlkonto.verknuepfen"),
    },
    available: nachtraeglichesKonto
      ? {
          iban: formatIBAN(nachtraeglichesKonto.iban),
          bankName: nachtraeglichesKonto.bank_name,
        }
      : null,
    linking: kontoVerknuepfen.isPending,
    onLink: () =>
      nachtraeglichesKonto &&
      kontoVerknuepfen.mutate(nachtraeglichesKonto.id, {
        onSuccess: () =>
          toast.success(
            t("belege.detail.lieferant.zahlkonto.verknuepft", {
              iban: formatIBAN(nachtraeglichesKonto.iban),
            }),
          ),
        onError: (e) =>
          toast.error(t("belege.detail.toast.fehlgeschlagen", { error: fehlerText(e) })),
      }),
    onAdd: () => setKontoWahlOffen(true),
  };
  // `?? []` on its own mints a fresh array every render, which makes every downstream useMemo that
  // depends on it recompute every render. Memoized once here so the master-data lists are stable
  // identities for the lookups below.
  const gesellschaften = useMemo(() => gesellschaftenQ.data ?? [], [gesellschaftenQ.data]);
  const gesellschaft = useMemo(
    () => gesellschaften.find((g) => g.code === beleg.company_code) ?? null,
    [gesellschaften, beleg.company_code],
  );
  const objekte = useMemo(() => objekteQ.data ?? [], [objekteQ.data]);
  const objekt = useMemo(
    () => objekte.find((o) => o.code === beleg.property_code) ?? null,
    [objekte, beleg.property_code],
  );
  // A property code that came from AI extraction but isn't in the master data — must be corrected.
  const objektUnbekannt = !!beleg.property_code && !objekt;

  // assignment_decided_by is ONE shared provenance column for both company and property (there is
  // no per-field source at the DB level — see the ZUORDNUNG_FELDER stamp below), so the SOURCE
  // ("Manual"/AI) is shown next to EACH of the two fields it actually covers, not only company:
  // editing just the property still stamps this column, and the reviewer needs to see "human"
  // land on the field they touched, not only on company. `hasValue` is NOT shared, though — each
  // field's own badge must gate on THAT field's own value, or an empty field reads as manually
  // assigned just because the other field has something in it (e.g. company set, property still
  // empty, showed "Manual" next to the empty property field too — QuelleBadge everywhere else in
  // this file gates hasValue per-field, e.g. `hasValue={beleg.vat_rate != null}`; this was the
  // odd one out).

  // BWA taxonomy (Screen 4/10; migration 0030) — the dropdown source for `category_id`. Every
  // non-deleted category stays selectable regardless of `is_active`, so a receipt already pointing
  // at a since-retired category still shows a real name instead of falling back to a raw id. Not
  // memoized: ~100 rows, cheap to map every render, and avoids chasing a closure through deps.
  const categories = useMemo(() => categoriesQ.data ?? [], [categoriesQ.data]);
  const categoriesById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  // "Coarse › Fine" for a tag under a parent, plain name for a coarse category picked on its own —
  // the briefing explicitly allows assigning at either granularity when the fine tag isn't known.
  const categoryLabel = (c: BwaCategory) =>
    c.parent_id ? `${categoriesById.get(c.parent_id)?.name ?? "?"} › ${c.name}` : c.name;
  // A category id in a history line is not a record of anything a person can check, so every
  // save path renders it through the taxonomy path instead.
  const kategorieName = (id: unknown) => {
    const v = id as string | null | undefined;
    if (!v) return null;
    const c = categoriesById.get(v);
    return c ? categoryLabel(c) : v;
  };
  const categoryOptions = categories.map((c) => ({
    value: c.id,
    label: categoryLabel(c),
    keywords: c.code,
  }));
  const category = beleg.category_id ? (categoriesById.get(beleg.category_id) ?? null) : null;

  // The free-text `cost_category` is described in the code below as a legacy mirror that this
  // screen derives automatically -- true for anything edited HERE, but not for what the pipeline
  // wrote. Receipts carry the free text with no category_id at all, and the screen showed those as
  // "nicht kategorisiert" while the value sat in the row. It is the field the assignment-rule
  // engine targets, so calling it nothing was the one reading that was wrong.
  const freitextKategorie = !beleg.category_id ? (beleg.cost_category?.trim() ?? "") : "";
  // Only offered when the free text names a real category exactly (case aside). A near-miss is a
  // decision for a person, not something to guess at from a detail screen.
  const passendeKategorie = useMemo(() => {
    if (!freitextKategorie) return null;
    const gesucht = freitextKategorie.toLowerCase();
    return (
      categories.find((c) => !c.is_catchall && c.name.trim().toLowerCase() === gesucht) ?? null
    );
  }, [freitextKategorie, categories]);

  // property → company (table property_companies, migration 0083). A property may genuinely belong
  // to more than one company (the client's dual-ownership cases — Hinterstraße is Infio AND this client),
  // so more than one match is a real state to surface, not a master-data contradiction to resolve.
  //
  // Offered as a suggestion rather than written silently: the reviewer stays the one who decides,
  // and a master-data gap (no company linked to this property) has to be visible instead of
  // resolving to "no company" behind their back.
  /**
   * The cost centre this invoice books to. Resolved from the FORM rather than the saved row, so the
   * number follows the property while it is being changed instead of lagging a save behind.
   *
   * The rule itself lives in `resolveKostenstelle` (src/lib/data/kostenstelle.ts), shared with the
   * invoice list and the property page so the three cannot disagree about what a receipt books to.
   */
  const kostenstelle = useMemo(
    () =>
      resolveKostenstelle(
        {
          companyCode: form.company_code,
          propertyCode: form.property_code,
          gemeinkosten: form.property_code === GEMEINKOSTEN,
        },
        { gesellschaften, objekte, links: propertyCompaniesQ.data ?? [] },
      ),
    [gesellschaften, objekte, propertyCompaniesQ.data, form.company_code, form.property_code],
  );

  const companyVorschlag = useMemo(() => {
    const propId = objekte.find((o) => o.code === form.property_code)?.id;
    if (!propId) return null;
    const treffer = (propertyCompaniesQ.data ?? []).filter((a) => a.property_id === propId);
    // More than one company linked to this property means the reviewer has to pick, not something
    // to guess a winner from.
    if (treffer.length !== 1) {
      return { code: null, mehrdeutig: treffer.length > 1, fehlt: treffer.length === 0 };
    }
    const g = gesellschaften.find((x) => x.id === treffer[0].company_id);
    return g ? { code: g.code, mehrdeutig: false, fehlt: false } : null;
  }, [objekte, gesellschaften, propertyCompaniesQ.data, form.property_code]);

  // True when the suggestion exists and disagrees with what is currently in the form.
  const companyVorschlagOffen =
    !!companyVorschlag?.code && companyVorschlag.code !== (form.company_code || null);

  const stellerName = lieferant?.name ?? beleg.issuer ?? t("belege.detail.unknownSteller");
  // Every invoice used to sit in the browser tab as the same static "Beleg". Comparing two
  // receipts in two tabs is an ordinary thing to do here -- the supplier, the amount and the PDF
  // are all on screen to compare -- and the tab bar could not tell them apart. Supplier first
  // because that is the screen's own heading and what a tab truncates to; the number second
  // because two receipts from the SAME supplier is exactly the duplicate case people open two tabs
  // for.
  useEffect(() => {
    const nr = beleg.invoice_number?.trim();
    document.title = pageTitle(`${stellerName}${nr ? ` · ${nr}` : ""}`);
  }, [stellerName, beleg.invoice_number]);
  const konf: Konfidenz = beleg.extracted?.konfidenz ?? {};

  const positionen = beleg.line_items ?? [];
  const volltext = beleg.ocr_fulltext ?? (beleg.extracted?.volltext as string | undefined) ?? null;
  // Envelope metadata of the source email (Briefing Screen 2). One invoice can have several
  // processing_log rows (reprocessing, splits) but they share the same source email — prefer the
  // one matching this invoice's own source_item_id, else fall back to the most recent entry.
  const emailLog =
    (logQ.data ?? []).find((v) => v.source_item_id === beleg.source_item_id) ??
    logQ.data?.[0] ??
    null;
  const wf = beleg.workflow_status ?? "received";
  const lastschrift = istLastschrift(beleg.payment_method);
  // Per-field first (extracted.validation_detail), falling back to the flat gates. `gruendeDetail`
  // stays what the badges count.
  const pruefungen = useMemo(() => pruefKarte(beleg), [beleg]);
  const gruendeDetail = pruefungen.gruende;

  const { appUserId } = useAuth();

  const canApprove = darfAlsPerson(PERMISSIONS.invoicesApprove);
  const canFinalApprove = darfAlsPerson(PERMISSIONS.invoicesApproveFinal);
  const darfZuweisen = darfAlsPerson(PERMISSIONS.documentsWrite);

  const chainPeopleById = useMemo(() => new Map(chainPeople.map((p) => [p.id, p])), [chainPeople]);
  /**
   * Who either picker offers: active accounts, minus the owner account.
   *
   * The super admin is technical. It is never a chain step, an assignee or a deputy -- the
   * approval-rule pickers have excluded it from the start -- and the Acting as picker represents
   * it with its own first entry, so listing it again among the people was a duplicate of the
   * option directly above it.
   */
  const waehlbarePersonen = useMemo(
    () => chainPeople.filter((p) => p.is_active && p.role_name !== "super_admin"),
    [chainPeople],
  );
  // NOT YOURSELF. Assigning is how you ask somebody ELSE to pick this up, and it notifies them
  // (migration 20260901160500) -- so handing it to yourself produces a message addressed to the
  // person who just sent it. The acting-as picker above keeps the unfiltered list on purpose: it
  // answers a different question, namely whose permissions the screen should behave with.
  const zuweisbarePersonen = useMemo(
    () => waehlbarePersonen.filter((p) => p.id !== appUserId),
    [waehlbarePersonen, appUserId],
  );
  // Name plus role, matching the approval-rule step pickers. "Petra Kistner" alone does not say
  // whether picking her produces a chain that can actually move.
  const personenLabel = useCallback(
    (p: ChainPerson) => {
      const name = p.name ?? t("belege.detail.workflow.unbekannt");
      return p.role_name ? `${name} (${t(`team.role.${p.role_name}`)})` : name;
    },
    [t],
  );
  // useCallback so the memos below can depend on it honestly. An id that resolves to nobody is
  // NOT blank: a rule or an assignment pointing at a deleted account has to say so, or the field
  // reads as "not set" and the broken reference stays invisible.
  const personenName = useCallback(
    (id: string | null | undefined) =>
      id ? (chainPeopleById.get(id)?.name ?? t("belege.detail.workflow.unbekannt")) : null,
    [chainPeopleById, t],
  );

  /**
   * Super-admin mode: every step on the ladder is clickable, each click running the manual status
   * correction behind the same confirmation dialog the "Status korrigieren" dropdown used to open.
   *
   * "Acting as (nobody)" is the switch. A super admin who picks it has stepped out of the approval
   * chain on purpose, so `nextLegalActions` has nothing to offer and the ladder would otherwise be
   * a row of dead circles -- which is exactly the moment a super admin wants to put an invoice
   * back where it belongs. Picking a person again leaves the mode and the normal gating returns.
   *
   * `darfHandelnAls` is load-bearing and must not be dropped for brevity. It used to be the
   * override PERMISSION, which every Admin holds, combined with `!actingAs` -- and actingAs was
   * also null for anybody simply missing from the approvers table, which handed a full status
   * bypass to every one of them. Only the owner account can reach this state now, and only by
   * choosing it.
   */
  // THE OWNER ACCOUNT, WHILE NOT STANDING IN FOR ANYBODY. This used to require `!actingAs`, i.e.
  // the "(niemand)" entry picked explicitly -- but with nothing picked yet `actingAs` is the owner
  // themselves, so the mode was unreachable: the picker already displayed that entry, so choosing
  // it fired no change. Impersonating a real approver still leaves the mode, which is the part
  // that matters: a correction taken while wearing somebody else's identity would be recorded
  // against them. Same shape Eiffler uses.
  const superAdminModus = darfHandelnAls && !istFremdeIdentitaet;

  const legalActions = useMemo(
    () =>
      nextLegalActions(wf, approvalRuleQ.data ?? null, actingAs, beleg.assigned_user_id, {
        canApprove,
        canFinalApprove,
      }),
    [wf, approvalRuleQ.data, actingAs, beleg.assigned_user_id, canApprove, canFinalApprove],
  );

  // Rechnungsinfo opened with sixteen fields in four stacked grids, every one of them styled the
  // same. Six of them carry the decision; the rest are confirmation data you look at when something
  // already looks wrong. Off by default, and the toggle is remembered per person -- somebody whose
  // job IS the long tail should not re-open it on every invoice.

  /**
   * Where this invoice is along the chain, as five steps rather than four status pills.
   *
   * The pills stated four independent facts (confidence, review, workflow, payment) and left the
   * reader to assemble a position from them. A document has one position, so it is drawn as one
   * line. The two side paths -- `abgelehnt` and `nicht_relevant` -- are deliberately NOT on it:
   * they are exits from the chain, not points along it, and the strip says so instead of pretending
   * the document is somewhere it is not.
   */
  // The full ladder, taken from WORKFLOW_REIHENFOLGE rather than a second list kept in step by
  // hand. `rueckfrage` is dropped: it is a loop back to the review step, not a stage of its own,
  // which is why the canonical order has eight entries and the ladder has seven.
  const WORKFLOW_STUFEN = useMemo(() => WORKFLOW_REIHENFOLGE.filter((s) => s !== "query"), []);
  // A document in `rueckfrage` is back at the review step, so that is where the marker sits; the
  // query itself is carried by the review chip and the Freigabe tab, not by a node on the line.
  const aktuelleStufe = WORKFLOW_STUFEN.indexOf(
    (wf === "query" ? "in_review" : wf) as (typeof WORKFLOW_STUFEN)[number],
  );
  const abseitsDerKette = wf === "rejected" || wf === "not_relevant";

  /**
   * The chain drawn above IS the control that moves the invoice along it.
   *
   * There used to be a "Workflow-Aktionen" menu next to the strip offering "Zur Prüfung geben" and
   * "Prüfen & freigeben" -- the same two transitions the strip was already drawing, named
   * differently and reached from somewhere else. One of the two had to go, and the menu is the one
   * that never said where the invoice would end up. So each ladder step that an available action
   * lands on becomes a button, and only the actions that move nowhere ON the ladder keep a button
   * of their own below it.
   */
  const stufenAktionen = useMemo(() => {
    const map = new Map<string, ApprovalAction>();
    for (const action of legalActions) {
      if (!CHAIN_ACTION_IDS.includes(action.id)) continue;
      const ziel = WORKFLOW_STUFEN.indexOf(action.nextStatus as (typeof WORKFLOW_STUFEN)[number]);
      // Off the ladder, backwards, or stamped by a DB trigger: not a circle.
      if (ziel < 0 || ziel <= aktuelleStufe) continue;
      if (AUTO_STUFEN.includes(action.nextStatus)) continue;
      map.set(action.nextStatus, action);
    }
    return map;
  }, [legalActions, aktuelleStufe, WORKFLOW_STUFEN]);

  /** The nearest step this person can move the invoice to; drives the dotted run and the arrow. */
  const naechsteAktionStufe = useMemo(() => {
    const treffer = WORKFLOW_STUFEN.map((s, i) => (stufenAktionen.has(s) ? i : -1)).filter(
      (i) => i >= 0,
    );
    return treffer.length > 0 ? Math.min(...treffer) : null;
  }, [WORKFLOW_STUFEN, stufenAktionen]);

  // Everything the strip cannot express. A query goes sideways, a rejection leaves the chain and a
  // failed payment goes backwards, so all three keep a button of their own under the bar. Three at
  // most, so they need no overflow menu behind them.
  const nebenAktionen = useMemo(
    () => legalActions.filter((a) => stufenAktionen.get(a.nextStatus)?.id !== a.id),
    [legalActions, stufenAktionen],
  );

  /**
   * Why there is nothing to do, when there is nothing to do.
   *
   * "No step is available to you" is true but useless: the four reasons behind it need four
   * different responses -- ask an administrator, ask the named approver, nothing is wrong, or
   * wait. Naming the reason is the difference between a dead end and an instruction.
   */
  const keineAktionenGrund = useMemo(() => {
    if (legalActions.length > 0) return null;
    if ((APPROVAL_TERMINAL_STATUSES as string[]).includes(wf)) return { key: "closed" };
    // Only the super admin can reach this, and only by choosing "(nobody)" in the Acting as
    // picker. It used to fire for anybody simply missing from the approvers table, which is a
    // state that cannot exist now that the chain names accounts.
    // Only the super admin can deliberately stand outside the chain, and superAdminModus renders
    // its own message for that. For anybody else this is the directory still loading -- which used
    // to print "you are not set up as an approver": alarming, and for that fraction of a second
    // false. An unresolved identity is not a fact worth stating.
    if (!actingAs) return darfHandelnAls ? { key: "keinFreigeber" } : null;
    // The permission, before the rule. nextLegalActions returns an empty list for a missing
    // `invoices.approve` before it looks at the chain at all, so without this the reader was told
    // "no step is available" -- true, and silent about the one thing that would fix it. Worded
    // differently when previewing somebody else, because "you lack the right" is then false.
    if (!canApprove)
      return {
        key: istFremdeIdentitaet ? "keinRechtPerson" : "keinRecht",
        namen: actingAs.name ?? "",
      };
    const regel = approvalRuleQ.data;
    if (regel) {
      const namen = [regel.step_1_user_id, regel.step_2_user_id]
        .map((id) => personenName(id))
        .filter(Boolean)
        .join(", ");
      // A rule that matches but names nobody. Reading the names out would produce "assigned to .
      // Only they can approve it" -- a sentence with a hole in it, blaming a person who does not
      // exist. It is a broken rule, and saying so is the only thing that leads anywhere.
      if (!namen) return { key: "regelOhneFreigeber" };
      // An assignment counts as being in the chain, exactly as nextLegalActions treats it. Without
      // this, somebody an admin assigned the invoice to would be told "only {{namen}} can approve
      // it" -- which the assignment has just made untrue.
      const drin =
        regel.step_1_user_id === actingAs.id ||
        regel.step_2_user_id === actingAs.id ||
        beleg.assigned_user_id === actingAs.id;
      // Named in the rule but not at this step: it is somebody else's move, not a permission problem.
      if (drin) return { key: "andererSchritt", namen };
      return { key: "nichtImRegelwerk", namen };
    }
    return { key: "keineSchritte" };
  }, [
    legalActions.length,
    wf,
    actingAs,
    darfHandelnAls,
    canApprove,
    istFremdeIdentitaet,
    approvalRuleQ.data,
    beleg.assigned_user_id,
    personenName,
  ]);

  /**
   * Why a step further along the chain cannot be clicked.
   *
   * A greyed-out circle with a not-allowed cursor and nothing else says "no" without saying why,
   * which is the same dead end `keineAktionenGrund` exists to avoid one level up. Four reasons,
   * four different responses: wait for the system, wait for the invoice to get there, it will be
   * skipped, or it is not your move.
   */
  function stufenSperrGrund(index: number, stufe: string): string | null {
    // Already reached, or where the invoice is right now. Nothing to explain.
    if (aktuelleStufe >= 0 && index <= aktuelleStufe) return null;
    // 'bezahlt' and after. None of the three is clickable, but they are not blocked for the same
    // reason and a single sentence covering all three said nothing about any of them: 'bezahlt'
    // comes off a confirmed payment (trigger, migration 0049), 'handed_over' off the DATEV
    // handover (trigger, migration 0051), and 'closed' off NOTHING -- no trigger and no
    // approval action writes it, so the only route to it is the manual "Status korrigieren"
    // select in the Freigabe tab. Each step names its own mechanism.
    if (AUTO_STUFEN.includes(stufe as WorkflowStatus))
      return t(`belege.detail.stufenNav.gesperrt.stufe.${stufe}`, {
        defaultValue: t("belege.detail.stufenNav.gesperrt.automatisch"),
      });
    // Step-specific answers first. The generic "nothing is available" below is the
    // catch-all, and it fires whenever legalActions is empty -- which is the normal
    // state at 'bezahlt' and beyond, so it was swallowing the precise reason these two
    // steps have.
    // One sentence for the closing step, whoever is reading and wherever the invoice is. It is
    // blocked for two reasons at once (not at DATEV yet, and only a supervisor closes it), and
    // answering only one of them left the reader to discover the other by trying.
    if (stufe === "closed") return t("belege.detail.stufenNav.gesperrt.abschluss");
    if (stufe === "approved_final") {
      const regel = approvalRuleQ.data;
      // Mirrors nextLegalActions' own test, so the reason a step is locked can never contradict
      // whether it is actually clickable.
      const darfFinal = regel
        ? !!regel.step_2_user_id && regel.step_2_user_id === actingAs?.id
        : canFinalApprove;
      if (!darfFinal)
        return regel?.step_2_user_id
          ? t("belege.detail.stufenNav.gesperrt.nurFreigeber", {
              name: personenName(regel.step_2_user_id) ?? "",
            })
          : t("belege.detail.stufenNav.gesperrt.nurVorgesetzter");
    }

    // Nothing is available at all: the header already has a sentence for that case, and it names
    // the actual cause (not an approver, rule without approvers, somebody else's step).
    if (legalActions.length === 0)
      return keineAktionenGrund
        ? t(`belege.detail.keineAktionen.${keineAktionenGrund.key}`, {
            namen: keineAktionenGrund.namen ?? "",
          })
        : t("belege.detail.keineAktionen.keineSchritte");
    // A step this person will NEVER be able to take, whatever the invoice does next. Only the
    // manager role may run `final_approve` (or, when a rule applies, its step-2 approver), so an
    // assistant reading "once the assistant has approved it" was being promised a circle that
    // would still be dead after their own approval. Who may act has to beat what has to happen
    // first, or the sentence describes a future that never arrives for this reader.
    // Between here and the step you may take: a manager's approval out of review lands on
    // 'approved_final' and passes straight over 'approved_first'.
    if (naechsteAktionStufe != null && index < naechsteAktionStufe)
      return t("belege.detail.stufenNav.gesperrt.uebersprungen", {
        stufe: t(`belege.workflow.${WORKFLOW_STUFEN[naechsteAktionStufe]}`),
      });
    // Further along the chain. What is missing is an EVENT, so the sentence names the event rather
    // than a position: "Freigegeben (Vorgesetzter)" is waiting for the assistant to approve, which
    // reads better than "once the invoice has reached „Freigegeben (Assistenz)“" and better still
    // than pointing at whichever step happens to be clickable right now. The generic version,
    // built from the preceding step's label, stays as the fallback for a step with no sentence of
    // its own.
    if (index > 0)
      return t(`belege.detail.stufenNav.gesperrt.voraussetzung.${stufe}`, {
        defaultValue: t("belege.detail.stufenNav.gesperrt.spaeter", {
          stufe: t(`belege.workflow.${WORKFLOW_STUFEN[index - 1]}`),
        }),
      });
    return t("belege.detail.stufenNav.gesperrt.nichtErlaubt");
  }

  /** The company's own name; the code stays as the tooltip. */
  const gesellschaftName = useMemo(() => {
    if (!beleg.company_code) return null;
    return (
      gesellschaftenQ.data?.find((g) => g.code === beleg.company_code)?.name ?? beleg.company_code
    );
  }, [gesellschaftenQ.data, beleg.company_code]);

  /** How long this invoice has been at its current step, as a phrase rather than a timestamp. */
  const stufeSeit = useMemo(() => {
    const neueste = (verlaufQ.data ?? [])[0]?.created_at ?? beleg.created_at;
    if (!neueste) return null;
    const tage = Math.floor((Date.now() - new Date(neueste).getTime()) / (24 * 60 * 60 * 1000));
    if (tage <= 0) return t("belege.detail.seit.heute");
    if (tage === 1) return t("belege.detail.seit.gestern");
    return t("belege.detail.seit.vorTagen", { tage });
  }, [verlaufQ.data, beleg.created_at, t]);

  /**
   * The reported checks, as readable sentences.
   *
   * `gruendeDetail` holds check FIELDS ("summe_ok") and reason ids, not text. The review box was
   * translating them locally, so anything else showing the same reasons -- the header tooltip --
   * would have printed the raw keys. Derived once, used by both.
   *
   * Nothing else goes in here. The card used to append a confidence-band sentence, a traffic-light
   * sentence, the pipeline's free-text `decision_reason` and a "nobody has confirmed this yet"
   * fallback whenever the check list came out empty. All four described the receipt rather than a
   * check, and the last one rendered as "1 check" above its own text "no automatic check failed".
   * The card reports validation and only validation; every other axis has its own place on screen.
   */
  const pruefGruendeText = useMemo(
    () => pruefGruendeAnzeige(gruendeDetail, t, FELD_SPRUNGZIEL),
    [gruendeDetail, t],
  );

  /**
   * The service period as one line: a range where the invoice gives two dates, a single date
   * where it gives one. Null when there is nothing to add -- no dates at all, or a service date
   * identical to the invoice date, which is the common case and says nothing the row above does
   * not already say.
   */
  const leistungszeitraum = useMemo(() => {
    const von = beleg.service_period_from;
    const bis = beleg.service_period_to;
    if (von && bis && von !== bis) return `${formatDate(von)} – ${formatDate(bis)}`;
    const einzel = beleg.service_date ?? von ?? bis;
    if (!einzel || einzel === beleg.document_date) return null;
    return formatDate(einzel);
  }, [beleg.service_period_from, beleg.service_period_to, beleg.service_date, beleg.document_date]);

  /** Days past due; null when there is no due date or it has not passed. */
  const tageUeberfaellig = useMemo(() => {
    if (!beleg.due_date || beleg.paid_at) return null;
    const tage = Math.floor(
      (Date.now() - new Date(beleg.due_date).getTime()) / (24 * 60 * 60 * 1000),
    );
    return tage > 0 ? tage : null;
  }, [beleg.due_date, beleg.paid_at]);

  /** Overdue chip text: plain days under a year, years and months beyond that. */
  const ueberfaelligText = useMemo(() => {
    if (tageUeberfaellig == null) return null;
    if (tageUeberfaellig < 365) {
      return t("belege.detail.faellig.ueberfaelligKurz", { tage: tageUeberfaellig });
    }
    const monateGesamt = Math.floor(tageUeberfaellig / 30.44);
    const jahre = Math.floor(monateGesamt / 12);
    const monate = monateGesamt % 12;
    if (monate === 0) return t("belege.detail.faellig.ueberfaelligJahre", { jahre });
    return t("belege.detail.faellig.ueberfaelligJahreMonate", { jahre, monate });
  }, [tageUeberfaellig, t]);

  /**
   * The one thing this invoice needs next, stated as a verb.
   *
   * Read top to bottom and the first match wins, in the order a person would triage: something is
   * wrong with the extraction -> a decision is owed -> it is waiting on somebody else -> it is
   * done. Nothing here is new state; it is the same `wf`, `gruende` and `legalActions` the axes
   * and the Freigabe tab already read, said as an instruction instead of a status.
   */
  // The "next step" banner that used to be derived here is gone. Its one remaining branch printed
  // `gruende.slice(0, 2).join(" · ")`, and `gruende` holds reason IDS, not sentences, so it put
  // raw keys like "ust_satz_ungueltig" on the screen. Everything it could have said is said
  // better elsewhere: the review box lists the failed checks in words, and the header's ladder
  // carries the workflow step. Every other branch already returned null.

  // Escalation badge (Briefing Screen 6: "deputy for absences ... escalation after X days").
  // Stored + displayed only, never auto-reassigns — computed live from the last verlauf
  // timestamp against whichever approver is currently responsible, no cron job.
  //
  // Only states with a genuine single "still needs to act" person get a responsible approver:
  // step 1 owns eingegangen/in_pruefung/rueckfrage, step 2 owns freigegeben_assistenz AND
  // freigegeben_vorgesetzter (the approving manager stays responsible for getting it paid, even
  // after delegating execution to the account holder — see paymentHandoff below, since
  // 'approved_final' IS the "awaiting payment" state, migration 0036). Beyond that,
  // 'bezahlt' has no single "still needs to act" person outside a payment failure, so there is
  // deliberately no fallback to step 1, who already did their part.
  const responsibleApproverId =
    wf === "approved_first" || wf === "approved_final"
      ? approvalRuleQ.data?.step_2_user_id
      : wf === "received" || wf === "in_review" || wf === "query" || !wf
        ? approvalRuleQ.data?.step_1_user_id
        : undefined;
  // The directory includes DEACTIVATED people on purpose: deactivating somebody never edits the
  // approval_rules that already name them, so a rule can keep pointing at them indefinitely.
  // Resolving only against active accounts would make that indistinguishable from "nobody is
  // responsible" -- this way the UI below can tell the two apart and warn instead of showing
  // nothing at all.
  const responsibleApprover = responsibleApproverId
    ? (chainPeopleById.get(responsibleApproverId) ?? null)
    : null;
  // There is no trashed state any more. An approver row could be soft-deleted independently of
  // is_active, which needed its own warning and its own fix (restore from the Papierkorb vs. flip
  // the switch); an account has one switch, so one warning covers it.
  const responsibleApproverInactive = !!responsibleApprover && !responsibleApprover.is_active;

  // 'assigned' also shows here, on top of the general Verlauf tab — the "Zugewiesen an" field
  // it logs lives on this same Freigabe tab, so its history belongs next to it too.
  const approvalActionHistory = useMemo(
    () =>
      // 'query' included. It used to be excluded here and shown in a Queries card of its
      // own, which left the approval history with a hole exactly where the chain had turned
      // around: the invoice went back for a query and this list did not mention it. The query's
      // comment rides along on the row, so nothing is lost by dropping the second card.
      (verlaufQ.data ?? []).filter(
        (v) => APPROVAL_VERLAUF_TYPES.includes(v.type) || v.type === "assigned",
      ),
    [verlaufQ.data],
  );
  const generalHistory = useMemo(
    () => (verlaufQ.data ?? []).filter((v) => !APPROVAL_VERLAUF_TYPES.includes(v.type)),
    [verlaufQ.data],
  );
  const allNotes = useMemo(
    () => (verlaufQ.data ?? []).filter((v) => v.type === "note"),
    [verlaufQ.data],
  );
  const headerNotes = allNotes.slice(0, HEADER_NOTE_COUNT);

  // The escalation clock must move only on genuine approval-chain activity, not on an unrelated
  // note/supplier change/archive toggle — otherwise those silently clear an overdue badge without
  // the approval itself having moved. Reuses the same approval-specific list as the workflow
  // history below, rather than the newest entry of any type.
  const lastMovedAt =
    approvalActionHistory.reduce<string | null>(
      (latest, v) => (!latest || v.created_at > latest ? v.created_at : latest),
      null,
    ) ?? beleg.created_at;
  const daysSinceLastMove = (Date.now() - new Date(lastMovedAt).getTime()) / 86_400_000;
  // An inactive or trashed approver's own escalation clock is moot -- they can't act on it either
  // way, so the warning below takes over instead of the normal overdue banner.
  const isOverdue =
    !responsibleApproverInactive &&
    !!responsibleApprover?.escalation_days &&
    daysSinceLastMove > responsibleApprover.escalation_days;

  /**
   * The workflow history as ONE chronological list: each entry is a move, and each move carries
   * where it went, how long the previous state had lasted, and who made it.
   *
   * This replaces two cards that described the same events from different angles -- an "approval
   * history" listing who did what, and a "time per step" listing how long each leg took -- with no
   * way to line a row in one up against a row in the other. Every fact either card carried belongs
   * to the same event, so it is one row.
   *
   * Oldest first, top to bottom, because each row's left-hand state is the previous row's
   * right-hand state: read downwards, the column spells out the path the invoice actually took.
   */
  const workflowVerlauf = useMemo(() => {
    const chronologisch = [...approvalActionHistory].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
    // The invoice arriving is the implicit first state -- no history row is written for it, but
    // every duration on the first move is measured from it.
    let vonLabel = t("belege.detail.historie.eingegangen");
    let vonAt = beleg.created_at;
    return chronologisch.map((v) => {
      const nach = verlaufBasis(v, t);
      const zeile = {
        v,
        von: vonLabel,
        nach,
        zusatz: verlaufZusatz(v, t),
        ms: new Date(v.created_at).getTime() - new Date(vonAt).getTime(),
      };
      vonLabel = nach;
      vonAt = v.created_at;
      return zeile;
    });
  }, [approvalActionHistory, beleg.created_at, t]);

  // AI confidence, review, workflow and payment are SEPARATE signals — surfaced and explained
  // independently in the header (the user must be able to read "how sure the AI is" apart from
  // "does a human need to check it"). Bank matches drive the reconciliation axis; the same query
  // powers the Payment & reconciliation card below (React Query dedupes it).
  const headerMatchesQ = useBelegMatches(beleg.id);
  // Sums the amount allocated to THIS invoice per link, not the whole transaction: one collective
  // transfer of 3.000 paying three invoices of 1.000 must count 1.000 here, not 3.000.
  const headerMatchedSum = (headerMatchesQ.data ?? [])
    .filter((m) => m.status === "confirmed")
    .reduce((s, m) => s + Math.abs(m.amount_matched ?? 0), 0);
  // A suggestion nobody has confirmed or rejected yet. It contributes nothing to headerMatchedSum
  // (that counts confirmed links only), so without this the header said "Nicht abgeglichen" while a
  // transaction sat one tab away waiting for a yes or a no.
  const headerHatVorschlag = (headerMatchesQ.data ?? []).some((m) => istOffenerVorschlag(m.status));
  const abgleich = abgleichStatus(
    beleg.amount_gross,
    headerMatchedSum,
    headerHatVorschlag,
    Boolean(beleg.paid_at),
  );
  const zahlungReasons = zahlungGruende(beleg, abgleich);

  function speichern() {
    // Against `basis` (the receipt when this edit opened), so the write covers exactly the fields
    // the reviewer touched. Diffing against the live `beleg` meant that anything the server had
    // changed underneath the open form -- a rule run, another reviewer -- came out as a change of
    // theirs and was written back from the stale form value, silently undoing it.
    const { changes, labels, invalid } = diffChanges(form, basis);
    // The history records what was actually overwritten, which is the value live NOW, not the one
    // on screen when the section was opened.
    const before: Record<string, unknown> = Object.fromEntries(
      labels.map((k) => [k, (beleg[k as keyof Beleg] as unknown) ?? null]),
    );
    if (invalid.length > 0) {
      toast.error(t("belege.detail.toast.ungueltigeZahl", { fields: invalid.join(", ") }));
      return;
    }
    // Captured BEFORE any synthetic additions below, so a business-line-driven deductibility
    // recompute (added further down) is never mistaken for the reviewer editing deductibility
    // themselves.
    const deductibilityEditedByHand =
      "vat_deductible_pct" in changes || "vat_special_case" in changes;
    // Keep the foreign keys in sync with the edited codes, so relational queries and the
    // free-text codes can't disagree (company already did this; property now does too).
    if ("company_code" in changes) {
      const g = gesellschaften.find((x) => x.code === changes.company_code);
      (changes as Record<string, unknown>).company_id = g?.id ?? null;
    }
    if ("property_code" in changes) {
      // Gemeinkosten is not a property. It goes to its own column and clears the property, which
      // the database also insists on (invoices_overhead_xor_property).
      const gemeinkosten = changes.property_code === GEMEINKOSTEN;
      (changes as Record<string, unknown>).is_overhead = gemeinkosten;
      if (gemeinkosten) (changes as Record<string, unknown>).property_code = null;
      const o = gemeinkosten ? undefined : objekte.find((x) => x.code === changes.property_code);
      (changes as Record<string, unknown>).property_id = o?.id ?? null;

      // The VAT treatment hangs on the property's own vat_status (migration 0083; previously
      // derived from the business line). So a reviewer changing the property has to carry
      // vat_treatment with it.
      //
      // Without this the value stays derived from the PREVIOUS property, and the pipeline can no
      // longer correct it either: a human assignment freezes vat_treatment against re-extraction.
      // That leaves a receipt claiming, say, "taxable" under a property that is tax-exempt,
      // which is a wrong number with tax consequences rather than a cosmetic mismatch.
      (changes as Record<string, unknown>).vat_treatment = o?.vat_status ?? null;

      // Deductibility is driven by the property's vat_status the same way (migration 0031, re-keyed
      // 0083). The DB trigger that keeps it in sync only ever touches an ai/null-sourced value, so
      // it silently leaves a rule- or human-sourced deductibility stale when the property changes —
      // a stale % under the WRONG property is a wrong tax number, not a cosmetic mismatch, exactly
      // like vat_treatment above. Skipped only when the reviewer is editing deductibility by hand in
      // this very same save — their explicit value wins, not the property's default.
      if (!deductibilityEditedByHand) {
        const pct = o?.vat_status === "taxable" ? 100 : o?.vat_status === "exempt" ? 0 : null;
        (changes as Record<string, unknown>).vat_deductible_pct = pct;
        (changes as Record<string, unknown>).vat_deductibility_source = pct == null ? null : "ai";
      }
    }
    if ("category_id" in changes) {
      // ONE category, picked from the real BWA taxonomy — cost_category is no longer edited
      // directly, it's derived automatically from the chosen category's own name, exactly like
      // the rule engine already derives it, so the two columns can never disagree again.
      const chosen = changes.category_id ? categoriesById.get(changes.category_id as string) : null;
      (changes as Record<string, unknown>).cost_category = chosen?.name ?? null;
    }

    // Provenance. Anything edited here was edited by a person, so the touched fields are stamped
    // 'human' and become untouchable for the rule engine (apply_assignment_rules skips them).
    // Stamped per dimension rather than once for the whole form: correcting the category must not
    // silently freeze the VAT rate against a rule that would still improve it.
    const ZUORDNUNG_FELDER = ["company_code", "property_code"];
    // Per FIELD, not per dimension: the two used to share one assignment_decided_by column, so
    // correcting only the company also marked the property human-decided and its badge flipped to
    // "manual" on a field nobody had touched.
    //
    // Never assignment_source: that column belongs to the pipeline and records HOW the company was
    // resolved, so writing 'human' into it would erase that.
    if ("company_code" in changes) {
      (changes as Record<string, unknown>).company_assignment_source = "human";
    }
    if ("property_code" in changes) {
      (changes as Record<string, unknown>).property_assignment_source = "human";
    }
    if ("cost_category" in changes || "category_id" in changes) {
      // Shared provenance: category_id and cost_category describe the same categorization
      // decision, one structured and one free text (types.ts), so either one being human-edited
      // marks both as human-decided.
      (changes as Record<string, unknown>).cost_category_source = "human";
    }
    if ("vat_rate" in changes || "vat_amount" in changes) {
      (changes as Record<string, unknown>).vat_source = "human";
    }
    if (deductibilityEditedByHand) {
      (changes as Record<string, unknown>).vat_deductibility_source = "human";
    }

    if (labels.length === 0) {
      toast.info(t("belege.detail.toast.keineAenderungen"));
      setEditSection(null);
      return;
    }

    // Explicit before→after history for EVERY changed field, not only the assignment ones. Persisted
    // German (do NOT translate) — mirrors workflowLabelDe usage. A field name on its own ("Felder
    // geändert: amount_gross") is useless to whoever reads the history later: the value that was
    // corrected away is precisely the one they came looking for.
    //
    // A code is replaced by the name it stands for where one exists. "Lieferant: 4f2c-…" is not a
    // record of anything a person can check.
    const ANZEIGE: Record<string, (wert: unknown) => string | null> = {
      category_id: kategorieName,
    };

    const changeLines = labels.map((k) =>
      feldAenderungDe(k, beleg[k as keyof Beleg], changes[k as keyof Beleg], ANZEIGE[k]),
    );

    // `reassignLines` are overwrites of an assignment that was ALREADY set; those need an explicit
    // confirmation before we commit. Clearing one (unlink) does not: removing an assignment is the
    // briefing's own escape hatch and must not be gated behind a dialog.
    const reassignLines = labels
      .filter((k) => ZUORDNUNG_FELDER.includes(k) && !!beleg[k as keyof Beleg])
      .map((k) =>
        feldAenderungDe(k, beleg[k as keyof Beleg], changes[k as keyof Beleg], ANZEIGE[k]),
      );

    // Assignment changes log as typ "booking", pure field edits as "change". Either way the
    // text carries the full list of before→after lines.
    const istZuordnung = labels.some((k) => ZUORDNUNG_FELDER.includes(k));

    if (reassignLines.length > 0) {
      // Overwriting an existing assignment — make it explicit before committing.
      setReassign({
        changes,
        before,
        labels,
        changeLines,
        istZuordnung,
        lines: reassignLines,
      });
      return;
    }
    commitSpeichern(changes, before, labels, changeLines, istZuordnung);
  }

  // Promotes the free-text category to the structured one. Goes through the same save path as any
  // other edit, so it lands in the receipt's history like a hand-made change rather than appearing
  // out of nowhere. cost_category is left exactly as it was: this links the value, it does not
  // rewrite it.
  /**
   * Whether each assignment still needs a person, as opposed to merely being empty.
   *
   * Empty and undecided are not the same thing. A reviewer who looks at an invoice and concludes
   * that no property applies has DEALT with it, and the card should stop asking -- but the column
   * is still null, so "is it filled?" would nag for ever. `assignment_decided_by` and
   * `cost_category_source` already record that a human decided the dimension (they are what stops
   * apply_assignment_rules overwriting a hand-made choice), so the card keys on those instead.
   *
   * Choosing "none" therefore writes only the stamp -- except for the company, where NZO
   * ("Nicht zugeordnet") is a real row that means exactly this and is what every filter and KPI
   * tile already treats as unassigned.
   */
  const KEINE_WAHL = "__keine";
  // `assignment_decided_by` is ONE column for two dimensions -- the existing save path stamps it
  // whenever company_code OR property_code changes -- so it cannot say which of the two a person
  // settled. Keying both on it meant choosing "none" for the company also marked the property
  // decided, and the property row vanished from the card unanswered.
  //
  // The company does not need the stamp: NZO ("Nicht zugeordnet") is a real row meaning exactly
  // "decided, none", so a non-null company_code IS the evidence. The stamp is left to the property,
  // which has no such code and where empty would otherwise be indistinguishable from undecided.
  const objektEntschieden = beleg.property_assignment_source === "human";
  const gesellschaftOffen = !beleg.company_code;
  const objektOffen = !beleg.property_code && !objektEntschieden;
  const kategorieOffen = !beleg.category_id && beleg.cost_category_source !== "human";

  /**
   * Set the company or the property from the attention card, without opening the Zuordnung editor.
   *
   * Stamps assignment_decided_by, NOT assignment_source: the latter belongs to the pipeline and
   * records HOW the company was resolved (migration 0027), so writing 'human' into it would erase
   * that. The stamp matters either way -- apply_assignment_rules skips a field once a person has
   * decided it, so without it the next "Regeln anwenden" overwrites the assignment just made.
   */
  /**
   * Record that a person looked at a dimension and concluded nothing applies.
   *
   * Writes the provenance stamp and nothing else: there is no code meaning "no property" (unlike
   * companies, where NZO is a real row), so the column stays null and the stamp is what carries
   * the decision. It also stops apply_assignment_rules from filling the field in later and
   * quietly overturning that judgement.
   */
  function zuordnungAlsErledigt(feld: "property_code" | "category_id") {
    const stempel =
      feld === "category_id"
        ? { cost_category_source: "human" }
        : { property_assignment_source: "human" };
    commitSpeichern(
      stempel as Partial<Beleg>,
      {},
      [],
      [
        t("belege.detail.eingabe.keineWahlProtokoll", {
          feld: t(`belege.detail.field.${feld === "category_id" ? "kategorie" : "objekt"}`),
        }),
      ],
      feld !== "category_id",
    );
  }

  function zuordnungVerknuepfen(feld: "company_code" | "property_code", code: string) {
    commitSpeichern(
      // Both dimensions get the stamp, each on its own column. A value picked here is a
      // person's decision exactly like one typed in the Zuordnung editor, so the source badge has
      // to read "manual" either way, and the rule engine has to leave it alone.
      {
        ...(feld === "property_code" && code === GEMEINKOSTEN
          ? // Same translation as the Zuordnung editor: overhead is its own column, and it clears
            // the property rather than being stored as one.
            { property_code: null, property_id: null, is_overhead: true }
          : { [feld]: code, ...(feld === "property_code" ? { is_overhead: false } : {}) }),
        [feld === "company_code" ? "company_assignment_source" : "property_assignment_source"]:
          "human",
      } as Partial<Beleg>,
      { [feld]: (beleg[feld] as string | null) ?? null },
      [feld],
      [feldAenderungDe(feld, beleg[feld], code, (v) => String(v ?? ""))],
      true,
    );
  }

  function kategorieVerknuepfen(ziel: BwaCategory) {
    commitSpeichern(
      {
        category_id: ziel.id,
        // The same provenance stamp `speichern` writes for a hand-picked category, for the same
        // reason: apply_assignment_rules only leaves a field alone once its source is 'human'
        // (migration 0083). Without it the next "Regeln anwenden" -- or a bulk run -- overwrote
        // the link a person had just made, and QuelleBadge went on calling it KI/Regel.
        cost_category_source: "human",
      } as Partial<Beleg>,
      { category_id: beleg.category_id ?? null },
      ["category_id"],
      // Rendered by feldAenderungDe like every other change line, so the persisted history keeps
      // one format instead of one special case that has to be read differently.
      [feldAenderungDe("category_id", beleg.category_id, ziel.id, kategorieName)],
      false,
    );
  }

  function commitSpeichern(
    changes: Partial<Beleg>,
    before: Record<string, unknown>,
    labels: string[],
    changeLines: string[],
    istZuordnung: boolean,
  ) {
    /**
     * Which checks this edit fixed, and which it broke again.
     *
     * Nothing about the checks is saved by this screen: they are re-run from the invoice's own
     * data every time anything reads them (see nachpruefung.ts). But a check flipping is a real
     * change to what this screen says, so the history records it, and here is the only place it
     * can be worked out: between the row as it is and the row as it will be.
     */
    const ibanJetzt = lieferant?.iban ?? null;
    const offeneFelder = (b: Beleg) =>
      new Set(
        pruefGruendeDetail(belegNachgeprueft(b, { lieferantIban: ibanJetzt })).map((g) => g.feld),
      );
    const vorher = offeneFelder(beleg);
    const nachher = offeneFelder({ ...beleg, ...changes } as Beleg);
    const behoben = [...vorher].filter((f) => !nachher.has(f));
    const zurueck = [...nachher].filter((f) => !vorher.has(f));
    // Persisted audit text stays German (tDe, not t) whatever language the reviewer reads in.
    const alleLinien = [
      ...changeLines,
      ...behoben.map((f) =>
        tDe("belege.detail.historie.pruefungBehoben", { pruefung: pruefungLabelDe(f, tDe) }),
      ),
      ...zurueck.map((f) =>
        tDe("belege.detail.historie.pruefungZurueck", { pruefung: pruefungLabelDe(f, tDe) }),
      ),
    ];
    updateBeleg.mutate(
      {
        changes,
        // Persisted audit text stays German (do not translate). `daten` keeps the same change
        // machine-readable: `before` and `after` key for key, plus the already-rendered lines, so
        // the detail screen lists them one per row without re-parsing the joined text (a value can
        // itself contain the separator — a business line reads "GB-01 · Vermietung").
        protokoll: {
          typ: istZuordnung ? "booking" : "change",
          text: alleLinien.join(" · "),
          daten: {
            felder: labels,
            before,
            after: changes as Record<string, unknown>,
            lines: alleLinien,
            pruefungen_behoben: behoben,
            pruefungen_zurueck: zurueck,
          },
        },
      },
      {
        onSuccess: () => {
          toast.success(t("belege.detail.toast.gespeichert"));
          setReassign(null);
          setEditSection(null);
        },
        onError: (e) =>
          toast.error(
            t("belege.detail.toast.speichernFehlgeschlagen", {
              error: fehlerText(e),
            }),
          ),
      },
    );
  }

  function abbrechen() {
    setForm(formFromBeleg(beleg));
    setEditSection(null);
  }

  // Escape cancels the active section edit. Skip when a dropdown/dialog is open so Escape first
  // dismisses that overlay (Radix portals it outside this subtree and handles its own Escape);
  // pressing Escape again then cancels the edit.
  useEffect(() => {
    if (!editSection) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const overlayOpen = document.querySelector(
        "[data-radix-popper-content-wrapper], [role='dialog'][data-state='open'], [role='alertdialog'][data-state='open']",
      );
      if (overlayOpen) return;
      abbrechen();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editSection]);

  // Approval action in progress: return-with-query and reject require a comment, so those two
  // open this dialog first; every other action fires immediately, from a step circle in the
  // header's workflow bar or from the action row underneath it.
  // A second click before the first mutation settles used to fire the action twice -- two writes,
  // two history rows and two toasts. `updateBeleg.isPending` already disables the circle, but it
  // cannot win this race: it only becomes true after React re-renders, and both clicks of a real
  // double-click land in the same frame, before that. A ref flips synchronously inside the click
  // itself, so the second one is refused by the time it arrives.
  const aktionLaeuft = useRef(false);
  const [pendingAction, setPendingAction] = useState<ApprovalAction | null>(null);
  const [actionComment, setActionComment] = useState("");

  function runApprovalAction(action: ApprovalAction, comment: string) {
    if (aktionLaeuft.current) return;
    aktionLaeuft.current = true;
    const label = approvalActionLabelDe(action.id);
    const text = comment.trim() ? `${label}: ${comment.trim()}` : label;
    // The id the notification producer addresses (migration 20260901160500), plus the display name
    // the history list and the "returned to me" bucket have always printed. Both, because rows
    // written before this carry only the name and the readers still have to render them.
    const returnedToId =
      action.id === "return_with_query"
        ? approvalQueryTarget(approvalRuleQ.data ?? null, actingAs)
        : null;
    const returnedTo = personenName(returnedToId);
    // Who approved, as a key rather than a name. The two-person rule compares the payer against
    // this, and it has to be cleared the moment the invoice leaves the approved state -- otherwise
    // a rejected-then-reapproved invoice still names whoever approved it the first time.
    const approvedBy = action.nextStatus === "approved_final" ? (appUserId ?? null) : null;
    updateBeleg.mutate(
      {
        // Every remaining action is a plain move along the chain. The one that also cleared
        // paid_at was 'payment_failed', and nobody marks a payment failed by hand any more.
        changes: { workflow_status: action.nextStatus, approved_by: approvedBy },
        protokoll: {
          typ: action.typ,
          text,
          daten: {
            ...(returnedTo ? { returned_to: returnedTo } : {}),
            ...(returnedToId ? { recipient_user_id: returnedToId } : {}),
            // The action and its comment as DATA, next to the German `text` above rather than
            // instead of it. `text` stays exactly as it was -- it is the audit record and it is
            // deliberately German -- but it is also the only thing the history list had to render,
            // so an English reader got a German sentence under an English heading. With the id
            // stored, the list can translate; rows written before this keep falling back to `text`.
            aktion: action.id,
            // Where it landed. `aktion` says what was clicked; this says what the invoice
            // BECAME, which is what "Time per step" needs to chain its rows together -- without
            // it every point was named after its event type, so three corrections in a row read
            // "Status manually corrected → Status manually corrected → Status manually corrected".
            nach: action.nextStatus,
            ...(comment.trim() ? { kommentar: comment.trim() } : {}),
            // Who the approval was given AS. `actor` on the history row is the logged-in account,
            // which is the right thing to hold someone to, but the chain itself is name-based
            // (useActingAs lets one account act as any approver), so the actor alone never said
            // which step of the chain a row belonged to. Recording both makes the trail answerable:
            // who clicked, and in whose place.
            handelnd_als: actingAs?.name ?? null,
            // The id, not a coarse tier. The old `handelnd_als_rolle` recorded the approvers
            // table's assistant/manager label, which was a stale copy of a permission and is gone
            // with that table; an account reference is what actually identifies the step.
            handelnd_als_id: actingAs?.id ?? null,
          },
        },
      },
      {
        onSuccess: () => {
          toast.success(
            t("belege.detail.toast.statusGesetzt", {
              label: t(`belege.workflow.${action.nextStatus}`),
            }),
          );
          setPendingAction(null);
          setActionComment("");
        },
        onError: (e) =>
          toast.error(
            t("belege.detail.toast.fehlgeschlagen", {
              error: fehlerText(e),
            }),
          ),
        // Released whichever way it went, so a failed action can be retried immediately.
        onSettled: () => {
          aktionLaeuft.current = false;
        },
      },
    );
  }

  function onApprovalAction(action: ApprovalAction) {
    if (action.requiresComment) {
      setPendingAction(action);
      return;
    }
    runApprovalAction(action, "");
  }

  // Manual correction — fixes an accidental click by setting workflow_status directly to any
  // status, bypassing the gated actions entirely (so it also works to undo a terminal state like
  // 'rejected', which nextLegalActions otherwise blocks everything on). Confirmed before applying
  // so the fix itself can't be another accidental click. 'not_relevant' is excluded — that has
  // its own dedicated flow (useSetNotRelevant/useClearNotRelevant) which also updates the mailbox
  // return flags; setting the raw column here would desync those.
  const [pendingCorrection, setPendingCorrection] = useState<WorkflowStatus | null>(null);
  // Undoing a payment has to say why, and that reason is kept: it is what the workflow
  // history shows under "Grund", and what the tax adviser reads later.
  const [korrekturGrund, setKorrekturGrund] = useState("");

  // H8 (client meeting 09.09.2026): somebody marks an invoice paid, finds out later it was not, and
  // corrects the status back. Fabian was explicit that the payment link has to come off WITH the
  // reversal -- otherwise the invoice reads as unpaid while the bank transaction still reads as
  // reconciled against it, and the next import has nothing left to match.
  //
  // The rule lives in hub-kit so all four hubs answer it the same way; the chain differs per repo
  // (Immonetz has an extra approval step), which is why it takes WORKFLOW_REIHENFOLGE as an
  // argument rather than assuming one.
  const korrekturUnlinkMatch = useUnlinkMatch();
  const bestaetigteMatches = (headerMatchesQ.data ?? []).filter((m) => m.status === "confirmed");
  const { mayPay: darfSelbstZahlen, reason: keinZahlrechtKorrektur } = usePaymentRight();
  const korrekturLoestZahlung =
    pendingCorrection != null &&
    bestaetigteMatches.length > 0 &&
    releasesPaymentLink(wf, pendingCorrection, WORKFLOW_REIHENFOLGE);

  // Moving an invoice back down the bar (client meeting 09.09.2026). Two different decisions wear
  // the same gesture, and hub-kit keeps them apart so all four hubs answer identically:
  //
  //   before payment  an approval is taken back. Anyone who may approve; nothing else happens.
  //   at "Bezahlt"    a payment is undone. Only somebody who may move money, it has to say why,
  //                   and the confirmed bank transactions come off with it.
  //
  // Past "Bezahlt" nothing is offered: those records have gone to DATEV and are not coming back.
  const rueckschritt = backwardsTargets(wf, WORKFLOW_REIHENFOLGE, {
    mayApprove: canApprove,
    mayPay: darfAlsPerson(PERMISSIONS.paymentsWrite),
  });

  // WHO THE CHANGE WAS MADE AS, for every workflow write -- not just the approval actions.
  // Only runApprovalAction recorded this, so a correction, a withdrawn payment or an assignment
  // taken while standing in for somebody came out of the history looking like the signed-in
  // account's own work. Selecting a person and acting twice produced two rows that disagreed.
  const handelndAlsDaten = actingAs
    ? { handelnd_als: actingAs.name ?? null, handelnd_als_id: actingAs.id ?? null }
    : {};
  async function runCorrection(target: WorkflowStatus, grund: string | null) {
    // Before the status moves, not after: if the unlink fails the invoice must not be
    // left claiming it is unpaid while the transaction still points at it.
    if (releasesPaymentLink(wf, target, WORKFLOW_REIHENFOLGE)) {
      try {
        for (const treffer of bestaetigteMatches) {
          await korrekturUnlinkMatch.mutateAsync({
            matchId: treffer.id,
            belegId: beleg.id,
            // Persisted audit text stays German (do not translate).
            grund: `Statuskorrektur ${workflowLabelDe(wf)} \u2192 ${workflowLabelDe(target)}`,
          });
        }
      } catch (e) {
        toast.error(t("belege.detail.toast.fehlgeschlagen", { error: fehlerText(e) }));
        return;
      }
    }
    // 'bezahlt'/'handed_over' are otherwise DB-trigger-derived only (migrations 0036/0038,
    // fire on paid_at/handed_over_at null→non-null) — correcting the raw column here must
    // keep those checkbox fields in step, or they desync: correcting FORWARD past one without a
    // real event leaves it null forever (the trigger can never re-fire); correcting BACKWARD past
    // one leaves it stale (blocking a later real event's null→non-null edge from ever firing).
    // Ranked by position in the main chain (WORKFLOW_REIHENFOLGE) so this holds for every
    // transition, not just to/from 'bezahlt' — 'rejected' (not in that array, indexOf = -1)
    // ranks below 'received', so correcting a paid/handed-over invoice to rejected also clears
    // both, matching "this never should have progressed".
    const targetRank = WORKFLOW_REIHENFOLGE.indexOf(
      target as (typeof WORKFLOW_REIHENFOLGE)[number],
    );
    const currentRank = WORKFLOW_REIHENFOLGE.indexOf(wf as (typeof WORKFLOW_REIHENFOLGE)[number]);
    const bezahltRank = WORKFLOW_REIHENFOLGE.indexOf("paid");
    const uebergebenRank = WORKFLOW_REIHENFOLGE.indexOf("handed_over");

    const paymentSync =
      targetRank >= bezahltRank && !beleg.paid_at
        ? { paid_at: new Date().toISOString(), paid_source: "manual" as const }
        : targetRank < bezahltRank && currentRank >= bezahltRank
          ? { paid_at: null, paid_source: null }
          : {};
    const datevSync =
      targetRank >= uebergebenRank && !beleg.handed_over_at
        ? { handed_over_at: new Date().toISOString() }
        : targetRank < uebergebenRank && currentRank >= uebergebenRank
          ? { handed_over_at: null }
          : {};
    updateBeleg.mutate(
      {
        changes: { workflow_status: target, ...paymentSync, ...datevSync },
        protokoll: {
          typ: "correction",
          // Persisted audit text stays German (do not translate).
          text: grund
            ? `Manuell korrigiert: ${workflowLabelDe(wf)} → ${workflowLabelDe(target)} – ${grund}`
            : `Manuell korrigiert: ${workflowLabelDe(wf)} → ${workflowLabelDe(target)}`,
          // The two ends of the move as STATUS CODES, so the history list can name them in the
          // reader's language and, more to the point, name them at all: "Status manually
          // corrected" on its own says that something was overridden but not to what, which is
          // the only part anybody reads this row to find out. `text` above is untouched -- it is
          // the German audit record. Rows written before this fall back to it.
          daten: {
            korrektur_von: wf,
            korrektur_nach: target,
            ...handelndAlsDaten,
            // The key verlaufKommentar() reads, so the reason renders under
            // "Grund" in the workflow history without a change there.
            ...(grund ? { kommentar: grund } : {}),
          },
        },
      },
      {
        onSuccess: () => {
          toast.success(
            t("belege.detail.toast.statusGesetzt", { label: t(`belege.workflow.${target}`) }),
          );
          setPendingCorrection(null);
          setKorrekturGrund("");
        },
        onError: (e) =>
          toast.error(
            t("belege.detail.toast.fehlgeschlagen", {
              error: fehlerText(e),
            }),
          ),
      },
    );
  }

  function setZuweisung(userId: string) {
    const wert = userId === "__none" ? null : userId;
    // Reopening the detail page and reclicking the same already-set value must not append a
    // "Zuweisung entfernt"/"Zugewiesen an X" audit line — nothing actually changed.
    if (wert === (beleg.assigned_user_id ?? null)) return;
    const name = personenName(wert);
    updateBeleg.mutate(
      {
        changes: { assigned_user_id: wert },
        // Persisted audit text stays German.
        protokoll: {
          typ: "assigned",
          text: wert ? `Zugewiesen an ${name}` : "Zuweisung entfernt",
          // What notify_event_from_history() reads to address the notification (migration
          // 20260901160500). Without it the trigger falls back to matching `assigned_to` by name
          // against app_users, which is the fragile path this whole change removes -- and for an
          // un-assignment there is deliberately nobody to tell.
          daten: wert ? { recipient_user_id: wert, assigned_to: name } : null,
        },
      },
      {
        onSuccess: () =>
          toast.success(
            wert
              ? t("belege.detail.toast.zugewiesenAn", { name: name ?? "" })
              : t("belege.detail.toast.zuweisungEntfernt"),
          ),
        onError: (e) =>
          toast.error(
            t("belege.detail.toast.fehlgeschlagen", {
              error: fehlerText(e),
            }),
          ),
      },
    );
  }

  async function setBezahlt(checked: boolean) {
    // Turning the switch OFF has to undo what turning it on did, and until now it only did half.
    // paid_at going null -> non-null advances workflow_status to 'bezahlt' through
    // advance_workflow_on_payment(), and that trigger has no reverse: it fires on null -> non-null
    // only. So clearing paid_at on its own left the invoice standing at "Bezahlt" in the chain with
    // no payment behind it, and nothing in the workflow history saying the mark had been withdrawn.
    // The status is walked back here, in the same mutation as the clear, exactly the way
    // payment_failed already does it for a failed transfer.
    //
    // Guarded on 'bezahlt': once an invoice has moved on to DATEV or been closed, removing a paid
    // mark is not a reason to drag it back through the chain -- that is a correction for a
    // super_admin to make deliberately, not a side effect of a switch.
    const zuruecknahme = !checked && beleg.workflow_status === "paid";

    // H8 (client meeting 09.09.2026). This switch is the path anybody holding invoices.pay takes
    // to say an invoice was not paid after all, and it walks the status back from 'bezahlt' on its
    // own. The confirmed bank transaction has to come off with it: leaving it linked means the
    // invoice reads as unpaid while the transaction still reads as reconciled against it, and the
    // next bank import has nothing left to match. Same rule as the super-admin correction, which
    // is why both ask hub-kit rather than each deciding for itself.
    if (zuruecknahme && releasesPaymentLink(wf, "in_review", WORKFLOW_REIHENFOLGE)) {
      try {
        for (const treffer of bestaetigteMatches) {
          await korrekturUnlinkMatch.mutateAsync({
            matchId: treffer.id,
            belegId: beleg.id,
            // Persisted audit text stays German (do not translate).
            grund: "Bezahlt-Markierung entfernt",
          });
        }
      } catch (e) {
        toast.error(t("belege.detail.toast.fehlgeschlagen", { error: fehlerText(e) }));
        return;
      }
    }
    updateBeleg.mutate(
      {
        // paid_source marks this as a human decision, so the bank-match trigger (migration 0024)
        // never clears it again when coverage drops. Only a paid_at it set itself is withdrawn.
        changes: {
          paid_at: checked ? new Date().toISOString() : null,
          paid_source: checked ? "manual" : null,
          // `already_paid` goes with it. It is the flag saying no company bank transaction can
          // ever settle this, and it is what keeps the invoice out of Offene Posten. Withdrawing
          // the paid mark while leaving the flag standing would send the invoice back to In
          // Prüfung as unpaid AND keep it invisible in the open items -- owed to the supplier and
          // listed nowhere.
          ...(zuruecknahme ? { workflow_status: "in_review" as const, already_paid: null } : {}),
        },
        // Persisted audit text stays German.
        // `korrektur` rather than `aenderung`, and only for the withdrawal: it is the type for
        // "workflow_status set directly, outside the gated actions", which is what this is -- and
        // it is one of APPROVAL_VERLAUF_TYPES, so the row lands in the Workflow-history timeline
        // instead of the general history nobody reads for chain movements. `nach` is what
        // verlaufZielStatus() reads to title the row with the state reached.
        protokoll: zuruecknahme
          ? {
              typ: "correction",
              text: "Manuelle Bezahlt-Markierung entfernt, Status zurück auf In Prüfung",
              daten: { nach: "in_review", ...handelndAlsDaten },
            }
          : {
              typ: "change",
              text: checked
                ? "Manuell als bezahlt markiert"
                : "Manuelle Bezahlt-Markierung entfernt",
            },
      },
      {
        onError: (e) =>
          toast.error(
            t("belege.detail.toast.fehlgeschlagen", {
              error: fehlerText(e),
            }),
          ),
      },
    );
  }

  function notizSpeichern() {
    if (!notiz.trim()) return;
    addNotiz.mutate(notiz.trim(), {
      onSuccess: () => {
        toast.success(t("belege.detail.toast.notizGespeichert"));
        setNotiz("");
      },
      onError: (e) =>
        toast.error(
          t("belege.detail.toast.fehlgeschlagen", {
            error: fehlerText(e),
          }),
        ),
    });
  }

  // Run the stored rules against this receipt. The RPC decides what it may touch, so the result
  // is reported field by field rather than as a blanket "done": a run that changed nothing because
  // a person already decided everything is a success, but a different one, and saying "2 fields
  // updated" when 2 were skipped would be a lie the user cannot check.
  function regelnAnwenden() {
    applyRules.mutate(beleg.id, {
      onSuccess: (res) => {
        if (res.changed.length === 0 && res.skipped.length === 0) {
          toast.info(t("belege.detail.regel.keineTreffer"));
        } else if (res.changed.length === 0) {
          toast.info(t("belege.detail.regel.nurUebersprungen", { count: res.skipped.length }));
        } else {
          toast.success(
            t("belege.detail.regel.angewendet", {
              count: res.changed.length,
              skipped: res.skipped.length,
            }),
          );
        }
      },
      onError: (e) =>
        toast.error(
          t("belege.detail.regel.fehlgeschlagen", {
            error: fehlerText(e),
          }),
        ),
    });
  }

  function nichtRelevant() {
    setNotRelevant.mutate(nichtRelevantGrund.trim(), {
      onSuccess: () => {
        toast.success(t("belege.detail.action.nichtRelevantOk"));
        setNichtRelevantGrund("");
      },
      onError: (e) =>
        toast.error(
          t("belege.detail.toast.fehlgeschlagen", {
            error: fehlerText(e),
          }),
        ),
    });
  }

  function archivieren() {
    archive.mutate(archivHinweis.trim(), {
      onSuccess: () => {
        toast.success(t("belege.detail.action.archivierenOk"));
        setArchivHinweis("");
      },
      onError: (e) =>
        toast.error(
          t("belege.detail.toast.fehlgeschlagen", {
            error: fehlerText(e),
          }),
        ),
    });
  }

  function verwerfen() {
    // Persisted reason (loesch_grund) stays German.
    softDelete.mutate("Verworfen — kein Beleg", {
      onSuccess: () => {
        toast.success(t("belege.detail.toast.verworfen"));
        // The receipt is gone, so the open edit is moot. Without this the blocker asked about
        // unsaved changes to a deleted record, and "Weiter bearbeiten" cancelled the redirect and
        // left the reviewer sitting on it.
        eigeneNavigation.current = true;
        setEditSection(null);
        navigate({ to: "/eingangsrechnungen" });
      },
      onError: (e) =>
        toast.error(
          t("belege.detail.toast.verwerfenFehlgeschlagen", {
            error: fehlerText(e),
          }),
        ),
    });
  }

  // Document-level actions. In the header row rather than a bar under the page: they act on the
  // document as a whole, so they belong with its title, not after 2,000 pixels of detail.
  //
  // Behind a ⋮ menu rather than four buttons in a row. All four are rare -- two only appear in one
  // status each -- so the header was sized for controls most people never press, and the two
  // destructive ones sat at the same weight as everything else.
  //
  // The dialogs are CONTROLLED and rendered outside the menu, rather than wrapped in
  // AlertDialogTrigger inside a menu item: selecting an item closes the menu, which unmounts its
  // children, so a trigger nested in there takes the dialog down with it before it can open.
  /**
   * Who you are acting as — a workflow CONTROL, so it sits under the workflow bar rather than in
   * the Workflow tab. It decides which steps the chain offers you, which makes it a setting for
   * the bar directly above it, not a field on a tab you have to open to discover why the bar looks
   * the way it does.
   *
   * Only a super admin gets to CHOOSE. For anyone else this was a free pick of any approver in the
   * house, kept in localStorage and never checked server-side — an assistant could approve as a
   * manager by selecting them in a dropdown. Everyone else sees the identity they are matched to
   * and nothing to change it with. Super admins keep it switchable at any time, because testing
   * the chain end to end is exactly their job, so it renders whether or not `actingAs` resolved.
   */
  // Null when there IS something to do, and in super-admin mode, where the whole ladder is
  // clickable and an explanation for absent buttons would contradict it.
  const keineAktionenText =
    legalActions.length === 0 && !superAdminModus
      ? keineAktionenGrund
        ? t(`belege.detail.keineAktionen.${keineAktionenGrund.key}`, {
            namen: keineAktionenGrund.namen ?? "",
          })
        : t("belege.detail.keineAktionen.keineSchritte")
      : null;

  const actingAsControl = darfHandelnAls ? (
    <LabelledSelect
      label={t("belege.detail.workflow.actingAsChoose")}
      // THE VALUE HAS TO BE ONE OF THE OPTIONS, or the select renders blank. With nothing chosen
      // yet, `actingAs` is the signed-in person -- and a super admin is filtered out of the list
      // below, so their own id matched no option and the control came up empty: it never said who
      // you were acting as, and the default state had no representation at all. Anyone who is not
      // selectable (yourself included) maps onto the ACTING_AS_NONE entry, which is exactly what
      // that entry means.
      value={
        actingAs && waehlbarePersonen.some((p) => p.id === actingAs.id)
          ? actingAs.id
          : ACTING_AS_NONE
      }
      onValueChange={chooseActingAs}
      options={[
        // The owner account itself, and the way INTO super-admin mode (see `superAdminModus`).
        // It read "(nobody)" before, which describes the mechanism rather than the situation: the
        // super admin has not become nameless, they are acting as themselves, outside the
        // approval chain. It also cannot be an absent key -- an empty override falls through
        // to "me".
        {
          value: ACTING_AS_NONE,
          label: t("belege.detail.workflow.alsSuperAdmin"),
        },
        ...waehlbarePersonen.map((p) => ({ value: p.id, label: personenLabel(p) })),
      ]}
    />
  ) : null;

  /**
   * Zugewiesen an. Gated on `invoices.assign`: assigning is a dispatcher's job, not a reviewer's —
   * it says who should pick this up, and letting anyone re-point it at anyone turns a queue into a
   * way to hand your own work to somebody else.
   *
   * An assignment ADDS an actor. The assignee may act on this receipt even when the resolved rule
   * names other people, which makes it the escape hatch when a rule points at somebody who cannot
   * act. It also NOTIFIES them (migration 20260901160500) — before that, the only way to find out
   * you had been handed a receipt was to open the one you did not know existed.
   *
   * Verantwortlich used to sit beside it, derived from the rule. It was removed: it repeated what
   * the workflow ladder already shows, and read as a contradiction next to an assignment pointing
   * somewhere else. The derivation itself stays — responsibleApprover still drives the
   * deactivated/overdue warnings on this tab and the Verantwortlich column on the invoice list.
   */
  const zuweisungControl = darfZuweisen ? (
    <LabelledSelect
      label={t("belege.detail.workflow.assignedTo")}
      value={beleg.assigned_user_id ?? "__none"}
      onValueChange={setZuweisung}
      placeholder={t("belege.detail.workflow.nobody")}
      options={[
        { value: "__none", label: t("belege.detail.workflow.nobody") },
        ...zuweisbarePersonen.map((p) => ({ value: p.id, label: personenLabel(p) })),
        // An existing assignment pointing at a deactivated account -- or at yourself, from before
        // this filter -- stays selectable, so the field does not look broken and the current value
        // is not silently rewritten on the next save. Not offered as a choice going forward.
        ...(beleg.assigned_user_id &&
        !zuweisbarePersonen.some((p) => p.id === beleg.assigned_user_id)
          ? [
              {
                value: beleg.assigned_user_id,
                label:
                  personenName(beleg.assigned_user_id) ?? t("belege.detail.workflow.unbekannt"),
              },
            ]
          : []),
      ]}
    />
  ) : null;

  async function linkKopieren() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success(t("belege.detail.action.linkKopiert"));
    } catch {
      toast.error(t("common.copy.failed"));
    }
  }

  // Return-with-query, Reject and Pay now, up on the title line. Approving stays on the ladder:
  // the step a click lands on depends on the person, and a single button cannot say that.
  const kopfAktionen = (
    <>
      {legalActions.length > 0 && (
        <ActionButtons
          disabled={updateBeleg.isPending}
          onAction={(id) => {
            const action = nebenAktionen.find((a) => a.id === id);
            if (action) onApprovalAction(action);
          }}
          actions={nebenAktionen.map((action) => ({
            id: action.id,
            icon: APPROVAL_ACTION_ICON[action.id],
            label: t(`belege.workflow.actions.${action.id}`),
            destructive: action.id === "reject",
          }))}
        />
      )}
      {wf === "approved_final" && !beleg.paid_at && (
        <Button
          size="sm"
          className="gap-2"
          onClick={() => springeZu("zahlung", UEBERWEISUNG_ANKER)}
        >
          <Send className="size-4" />
          {t("belege.detail.lieferant.zahlung.jetztBezahlen")}
        </Button>
      )}
    </>
  );

  const dokumentAktionen = (
    <>
      <IconMenu
        label={t("belege.detail.action.mehr")}
        className="size-8"
        onSelect={(id) => {
          if (id === "linkKopieren") linkKopieren();
          else if (id === "regelnAnwenden") regelnAnwenden();
          else if (id === "nichtRelevantZurueck")
            clearNotRelevant.mutate(undefined, {
              onSuccess: () => toast.success(t("belege.detail.action.nichtRelevantZurueckOk")),
            });
          else if (id === "nichtRelevant") setAktionDialog("nichtRelevant");
          else if (id === "archivZurueck")
            unarchive.mutate(undefined, {
              onSuccess: () => toast.success(t("belege.detail.action.archivZurueckOk")),
            });
          else if (id === "archivieren") setAktionDialog("archivieren");
          else if (id === "ping") setPingOffen(true);
          else if (id === "verwerfen") setAktionDialog("verwerfen");
        }}
        items={[
          { id: "linkKopieren", icon: Link2, label: t("belege.detail.action.linkKopieren") },
          // No confirmation dialog: the RPC cannot touch a human-set value, so the worst case is
          // that it changes an AI guess, and every change is logged and reversible by editing the
          // field. Gating a safe, audited action behind a dialog trains people to click through
          // dialogs, which is what makes the genuinely destructive ones dangerous.
          {
            id: "regelnAnwenden",
            icon: Wand2,
            label: t("belege.detail.regel.anwenden"),
            disabled: applyRules.isPending,
            separatorBefore: true,
          },
          // Nicht relevant: ein echter Beleg, aber nicht unserer -- geht zurück ins Postfach.
          beleg.not_relevant_at
            ? {
                id: "nichtRelevantZurueck",
                icon: Undo2,
                label: t("belege.detail.action.nichtRelevantZurueck"),
                disabled: clearNotRelevant.isPending,
                separatorBefore: true,
              }
            : {
                id: "nichtRelevant",
                icon: MailQuestion,
                label: t("belege.detail.action.nichtRelevant"),
                separatorBefore: true,
              },
          // Archivieren: falsch eingesammelter Beleg, bleibt mit Warnhinweis erhalten.
          beleg.archived_at
            ? {
                id: "archivZurueck",
                icon: ArchiveRestore,
                label: t("belege.detail.action.archivZurueck"),
                disabled: unarchive.isPending,
              }
            : {
                id: "archivieren",
                icon: Archive,
                label: t("belege.detail.action.archivieren"),
                destructive: true,
              },
          ...(pingEmpfaenger.length > 0
            ? [{ id: "ping", icon: BellRing, label: t("ping.aktion") }]
            : []),
          // Verwerfen (für "zu prüfen"): kein Beleg -- Soft-Delete mit Grund.
          ...(beleg.status === "needs_review"
            ? [
                {
                  id: "verwerfen",
                  icon: X,
                  label: t("belege.detail.action.verwerfen"),
                  destructive: true,
                },
              ]
            : []),
        ]}
      />

      <PingDialog
        kind="invoice"
        id={beleg.id}
        recipients={pingEmpfaenger}
        open={pingOffen}
        onOpenChange={setPingOffen}
      />

      {/* The dialogs themselves, unchanged in wording and effect -- only the trigger moved. */}
      <AlertDialog
        open={aktionDialog === "nichtRelevant"}
        onOpenChange={(o) => !o && setAktionDialog(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("belege.detail.action.nichtRelevantTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("belege.detail.action.nichtRelevantDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={nichtRelevantGrund}
            onChange={(e) => setNichtRelevantGrund(e.target.value)}
            placeholder={t("belege.detail.action.grundPlaceholder")}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>{t("belege.detail.action.abbrechen")}</AlertDialogCancel>
            <AlertDialogAction onClick={nichtRelevant}>
              {t("belege.detail.action.nichtRelevantConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={aktionDialog === "archivieren"}
        onOpenChange={(o) => !o && setAktionDialog(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("belege.detail.action.archivierenTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("belege.detail.action.archivierenDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={archivHinweis}
            onChange={(e) => setArchivHinweis(e.target.value)}
            placeholder={t("belege.detail.action.hinweisPlaceholder")}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>{t("belege.detail.action.abbrechen")}</AlertDialogCancel>
            <AlertDialogAction onClick={archivieren}>
              {t("belege.detail.action.archivierenConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={aktionDialog === "verwerfen"}
        onOpenChange={(o) => !o && setAktionDialog(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("belege.detail.action.verwerfenTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("belege.detail.action.verwerfenDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("belege.detail.action.abbrechen")}</AlertDialogCancel>
            <AlertDialogAction onClick={verwerfen}>
              {t("belege.detail.action.verwerfenConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );

  return (
    <div>
      {/* Kopf. A bordered card rather than loose content on the page background: it is one
          block of information about one document, and the separators inside it only read as
          divisions of something if that something has an edge. */}
      {/* A warm wash at the top, fading to card white by the time the ladder starts. The identity
          block (supplier, number, total, the status chips) sits in the tint, which is what gives
          this card the weight of a page header rather than of the first of eight identical white
          panels. It fades out on purpose: the ladder's dots and the current step's halo read
          better against a flat background. */}
      {/* Why this person is here. Somebody sent them to this invoice with a note, and without this
          the note stays behind in the bell on the screen they came from. Above the header card
          because it explains the whole page, and it renders nothing when nothing is waiting. */}
      <PingNotice kind="invoice" id={beleg.id} />

      <div
        data-tour="invoice-detail-header"
        className="rounded-xl border border-brand-soft/35 bg-gradient-to-b from-brand-wash/70 via-card via-40% to-card p-5"
      >
        <div className="min-w-0">
          {/* Actions ON the invoice -- apply rules, hand back to the mailbox, archive -- as opposed
              to the workflow actions below, which move it along the approval chain. Up here, away
              from the figures: a menu sitting directly above a total reads as acting on the total. */}
          <div className="flex items-center justify-between gap-4">
            <Link
              to="/eingangsrechnungen"
              search={listSearch}
              className="inline-flex items-center gap-1.5 text-base text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="size-4" /> {t("belege.detail.back")}
            </Link>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {kopfAktionen}
              {dokumentAktionen}
            </div>
          </div>

          {/* Identity left, money right, and the two columns aligned at their BOTTOM rather than
              their top. That is what keeps the due date level with the review and reconciliation
              chips no matter what else is in the column: an overdue warning appears ABOVE the due
              date and pushes the stack upward, instead of shoving the date down out of line with
              the chips. Top-aligned, the right column's last row moved every time its contents
              changed, and no fixed margin can chase that. */}
          <div className="mt-3 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
            <div className="min-w-0">
              <h1 className="min-w-0 break-words text-2xl font-semibold tracking-tight text-foreground sm:max-w-[40ch]">
                {/* Two different things wear this heading: a supplier the invoice is LINKED to, or
                    the issuer name the extraction read off the letterhead and never matched to one.
                    They look identical and behave differently -- only the first is clickable, and
                    only the first has master data behind it -- so the label says which. */}
                <InfoTip
                  label={
                    lieferant
                      ? t("belege.detail.tip.lieferant")
                      : t("belege.detail.tip.rechnungssteller")
                  }
                >
                  {lieferant ? (
                    <Link
                      to="/lieferanten/$id"
                      params={{ id: lieferant.id }}
                      className="underline-offset-4 hover:underline"
                    >
                      {stellerName}
                    </Link>
                  ) : (
                    <span>{stellerName}</span>
                  )}
                </InfoTip>
              </h1>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-base text-muted-foreground">
                <InfoTip label={t("belege.detail.tip.rechnungsnummer")}>
                  <span className="font-mono">
                    {beleg.invoice_number ?? t("belege.detail.ohneNr")}
                  </span>
                </InfoTip>
                {beleg.invoice_number && (
                  <CopyButton
                    value={beleg.invoice_number}
                    label={t("belege.detail.field.rechnungsnummer")}
                    className="size-6"
                  />
                )}
                {gesellschaftName && (
                  <>
                    <span aria-hidden="true">·</span>
                    {/* The company's NAME; the code is an internal handle and lives in the
                        explanation rather than on screen. */}
                    <InfoTip label={t("belege.detail.tip.gesellschaft")}>
                      <span>{gesellschaftName}</span>
                    </InfoTip>
                  </>
                )}
                {/* The gross total sits with the identity, not opposite it. VAT moved out
                    entirely: it is one line of the Beträge card, where it reads as part of the
                    calculation rather than as a third fact about the document. */}
                <span aria-hidden="true">·</span>
                <InfoTip label={t("belege.detail.tip.brutto")}>
                  <span className="text-lg font-semibold tabular-nums text-foreground">
                    {formatEUR(beleg.amount_gross)}
                  </span>
                </InfoTip>
                {!istEingangsrechnung(beleg.document_type) && (
                  <BelegartBadge belegart={beleg.document_type} />
                )}
                {/* 'query' is the one workflow status the ladder cannot draw: it is a loop
                    back to the review step, not a stage of its own, so the bar marks the invoice
                    as sitting on "In Prüfung" and nothing anywhere said a query was open. The
                    invoice LIST says so plainly (WorkflowBadge on workflow_status), so a reader
                    coming from a row marked "Rückfrage" opened the invoice and lost the fact. Same
                    badge, same colour, stated where it went missing. */}
                {wf === "query" && (
                  <button
                    type="button"
                    onClick={() => springeZu("freigabe", RUECKFRAGE_ANKER)}
                    aria-label={t("belege.detail.rueckfrageOffen")}
                    className="cursor-pointer rounded-md transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
                  >
                    <WorkflowBadge status="query" />
                  </button>
                )}
              </div>
              {/* Read with the identity above it, not stranded under the ladder: whether a person still has to look at the
                extraction, and whether the bank agrees. Confidence is a subordinate clause on the
                review chip, not a headline metric of its own. */}
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  {/* Says WHY, not what the chip is called. "Review needed" next to a chip reading
                      "Needs review" is a tautology; the reasons are the thing worth surfacing, and
                      they are already computed for the box further down. */}
                  {/* The tooltip no longer reprints the first four reasons with a "+N more"
                      underneath. Clicking the chip opens the panel that lists ALL of them, with
                      the failing field named and a jump link to it -- so the hover was a worse
                      copy of what the click gives you, and the "+3 more" line advertised that it
                      was. It now says the verdict and what the click does, which is the one thing
                      the panel cannot say before it is open. Two lines, same shape as the
                      reconciliation chip beside it. */}
                  {pruefGruendeText.length > 0 ? (
                    <InfoTipButton
                      onClick={zeigeReview}
                      label={
                        <>
                          <div className="font-medium">
                            {t("belege.detail.tip.reviewBefund", {
                              count: pruefGruendeText.length,
                            })}
                          </div>
                          <div className="mt-1 text-sm opacity-80">
                            {t("belege.detail.tip.reviewOeffnen")}
                          </div>
                        </>
                      }
                    >
                      <ReviewBadge
                        reasonCount={pruefGruendeText.length}
                        ungeprueft={ohnePruefungen(beleg)}
                        status={beleg.status}
                      />
                    </InfoTipButton>
                  ) : (
                    <Tooltip>
                      {/* asChild with a bare span: the chip keeps its own shape and stays out of
                          the tab order, which is what "not a control" means to a keyboard. */}
                      <TooltipTrigger asChild>
                        <span className="inline-flex">
                          <ReviewBadge
                            reasonCount={pruefGruendeText.length}
                            ungeprueft={ohnePruefungen(beleg)}
                            status={beleg.status}
                          />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-[18rem]">
                        {/* With the count where the pipeline reported one: "Alle 14 Prüfungen
                            bestanden" stands behind the verdict in a way the bare sentence does
                            not. Falls back to the sentence for a receipt whose validation is only
                            the old flat gates, where there is no honest number to name. */}
                        {pruefungen.bestanden.length > 0
                          ? t("belege.detail.tip.reviewAlleBestanden", {
                              count: pruefungen.bestanden.length,
                            })
                          : t("belege.detail.tip.reviewOhneBefund")}
                      </TooltipContent>
                    </Tooltip>
                  )}
                </span>
                {/* The badge IS the way into the reconciliation tab. It states one of four things
                    -- nothing matched, a suggestion is waiting, partly covered, fully covered --
                    and every one of them is acted on in the same place, so making the reader hunt
                    for the tab was a step with no decision in it. */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => springeZu("zahlung", ABGLEICH_ANKER)}
                      aria-label={t("belege.detail.abgleichTip.oeffnen")}
                      // brightness, not a colour swap: the badge's own background and label move
                      // together, so the hover is visible and the text stays as readable as it was
                      // at rest. Whatever state colour the pill is carrying keeps working.
                      className="cursor-pointer rounded-md transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
                    >
                      <AbgleichBadge status={abgleich} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-[18rem]">
                    <div className="font-medium">{t(`belege.detail.abgleichTip.${abgleich}`)}</div>
                    <div className="mt-1 text-sm opacity-80">
                      {t("belege.detail.abgleichTip.oeffnen")}
                    </div>
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>

            {/* No top margin: the row bottom-aligns this column (see above), so where it starts
                is decided by how tall it is, and a margin here would only push the whole stack
                down again. */}
            <div className="flex shrink-0 flex-col items-end gap-2">
              {/* AI confidence, stated in full rather than as a bare percentage tucked behind the
                  review chip. It used to ride the left-hand meta row as "96 %" with the words only
                  reachable by hovering, which made it the one number on the header nobody could
                  read without already knowing what it measured -- and hover says nothing at all on
                  a touch screen. Naming it costs a few characters and removes the tooltip. Muted
                  and unbordered by band on purpose: it reports how well the extraction read, it is
                  not a verdict, and colouring it would make it argue with the review chip. */}
              {beleg.confidence_score != null && (
                <KonfidenzPill
                  score={beleg.confidence_score}
                  mitLabel
                  className="px-2.5 py-1 text-base"
                />
              )}
              {/* Last in the column, so bottom alignment lands it on the chips' line -- and ONE
                  line, warning beside date rather than above it. Stacked, the overdue chip made
                  this block two rows tall and shunted the confidence chip up a line, so an invoice
                  going overdue silently rearranged the header above it. Side by side, the column
                  is two rows whatever happens and nothing above moves. */}
              {(tageUeberfaellig != null || beleg.due_date) && (
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {tageUeberfaellig != null && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-destructive/10 px-2 py-0.5 text-sm font-medium text-destructive">
                      <AlertTriangle className="size-3.5 shrink-0" />
                      {ueberfaelligText}
                    </span>
                  )}
                  {beleg.due_date && (
                    <span className="text-sm text-muted-foreground">
                      {t("belege.detail.faellig.am", { datum: formatDate(beleg.due_date) })}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          <Separator className="my-4" />

          {/* The lifecycle as one line, and the line is the control. Each step is a circle inside a
              circle: a step already passed is a ring with a filled centre, a step still ahead is a
              filled disc, and the ones this person may actually move the invoice to are the only
              ones that can be clicked. The separate workflow menu is gone -- it offered the same
              transitions a second time, in words that never said where the invoice would land. */}
          <div className="mt-1">
            {abseitsDerKette ? (
              <div className="inline-flex items-center gap-2 rounded-md bg-muted px-3 py-1.5 text-base text-muted-foreground">
                <WorkflowBadge status={wf} />
                {t("belege.detail.stufen.abseits")}
              </div>
            ) : (
              // The connector belongs to the node it LEAVES, so each step is [dot][line] and the
              // last is [dot] alone. Centring a dot inside an equal slice instead -- the previous
              // attempt -- put the first dot a tenth of the way in and the last a tenth from the
              // end, so the line neither started nor finished on a node.
              <WorkflowLadder
                ariaLabel={t("belege.detail.stufenNav.aria")}
                theme={LADDER_THEME}
                disabled={updateBeleg.isPending}
                LinkComponent={LadderLink}
                steps={WORKFLOW_STUFEN.map((stufe, i): WorkflowLadderStep => {
                  const erreicht = aktuelleStufe >= 0 && i <= aktuelleStufe;
                  const aktuell = i === aktuelleStufe;
                  const aktion = stufenAktionen.get(stufe) ?? null;
                  const stufeLabel = t(`belege.workflow.${stufe}`);
                  // Super-admin mode: any step, forwards or backwards, through runCorrection's confirmation
                  // dialog. The step the invoice is already on is excluded -- correcting a status to itself
                  // does nothing but write an audit line saying so.
                  const korrekturZiel =
                    (superAdminModus &&
                      !aktuell &&
                      CORRECTABLE_STATUSES.includes(stufe as WorkflowStatus)) ||
                    rueckschritt.targets.includes(stufe)
                      ? (stufe as WorkflowStatus)
                      : null;
                  const sperrGrund = aktion || korrekturZiel ? null : stufenSperrGrund(i, stufe);
                  // The one blocked step whose event is produced on another screen. Not offered in super-admin
                  // mode: there the circle sets the status directly, and sending the one person who can do
                  // that off to another screen instead would be a downgrade.
                  const datevZiel =
                    !aktion && !korrekturZiel && !erreicht && stufe === "handed_over"
                      ? "/datev-uebergabe"
                      : null;
                  return {
                    id: stufe,
                    label: stufeLabel,
                    reached: erreicht,
                    current: aktuell,
                    // Every segment between where the invoice IS and the step it can be moved to is dotted,
                    // not just the first one: a manager approving out of review lands two nodes along.
                    onPath:
                      naechsteAktionStufe != null && i >= aktuelleStufe && i < naechsteAktionStufe,
                    since: stufeSeit ?? undefined,
                    // The open query, marked on the step it is holding up. The bar could never say this, and
                    // it is the reason a reader had to open a tab to find out why the invoice had stopped.
                    // Aimed at the same tab the header's own query badge opens (see `wf === "query"`
                    // above): one control, one destination, whichever of the two a reader happens to click.
                    note:
                      aktuell && wf === "query"
                        ? {
                            icon: MessageCircleQuestion,
                            label: t("belege.detail.rueckfrageOffen"),
                            onClick: () => springeZu("freigabe", RUECKFRAGE_ANKER),
                          }
                        : undefined,
                    interaction: aktion
                      ? {
                          kind: "action",
                          // Named per step, not "move to X" plus the action's own name underneath: those two
                          // lines said the same move twice in different words.
                          hint: t(`belege.detail.stufenNav.klick.${stufe}`, {
                            defaultValue: t("belege.detail.stufenNav.tooltip", {
                              stufe: stufeLabel,
                            }),
                          }),
                          onSelect: () => onApprovalAction(aktion),
                        }
                      : korrekturZiel
                        ? {
                            kind: "correction",
                            hint: t("belege.detail.stufenNav.korrektur"),
                            onSelect: () => setPendingCorrection(korrekturZiel),
                          }
                        : datevZiel
                          ? {
                              kind: "link",
                              to: datevZiel,
                              linkLabel: t("belege.detail.stufenNav.datevLink"),
                              reason: sperrGrund ?? undefined,
                            }
                          : sperrGrund
                            ? { kind: "blocked", reason: sperrGrund }
                            : { kind: "plain" },
                  };
                })}
              />
            )}
            {/* Phone only: the name of the step the invoice is actually on. The seven labels above
                are hidden there, so without this the row is seven dots and no words. */}
            {!abseitsDerKette && aktuelleStufe >= 0 && (
              <div className="mt-3 text-center sm:hidden">
                <div className="text-base font-medium text-foreground">
                  {t(`belege.workflow.${WORKFLOW_STUFEN[aktuelleStufe]}`)}
                </div>
                {stufeSeit && <div className="text-sm text-muted-foreground">{stufeSeit}</div>}
              </div>
            )}
          </div>

          <Separator className="my-4" />

          <HeaderNotes
            labels={{
              title: t("belege.detail.section.notizenNur"),
              add: t("belege.detail.notiz.add"),
              placeholder: t("belege.detail.notiz.placeholder"),
              cancel: t("belege.detail.notiz.abbrechen"),
              save: t("belege.detail.notiz.save"),
              empty: t("belege.detail.notiz.keine"),
              more: (count) => t("belege.detail.notiz.weitere", { count }),
            }}
            notes={headerNotes.map((v) => ({
              id: v.id,
              text: v.text ?? "",
              meta: `${v.actor ?? t("belege.detail.actorSystem")} · ${formatDateTime(v.created_at)}`,
            }))}
            totalCount={allNotes.length}
            loading={verlaufQ.isLoading}
            draft={notiz}
            onDraftChange={setNotiz}
            onSave={notizSpeichern}
            saving={addNotiz.isPending}
            onMoreClick={() => springeZu("verlauf", NOTIZEN_ANKER)}
          />
        </div>
      </div>

      {/* Outgoing-invoice flag. Lives in ./AusgangFlag so the list screen and the other hub repos
          render the same thing from the same predicate. */}
      <AusgangBanner beleg={beleg} className="mt-6" />

      {/* Lifecycle banners. Shown above everything because they change what the rest of the screen
          means: editing a receipt that is on its way back to the mailbox, or one that has been
          archived as wrongly ingested, is almost always a mistake. */}
      {beleg.archived_at ? (
        <div className="mt-6 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-base text-amber-900">
          <div className="flex items-center gap-2 font-medium">
            <Archive className="size-4 shrink-0" />
            {t("belege.detail.banner.archiviert", {
              date: formatDateTime(beleg.archived_at),
              by: beleg.archived_by ?? "—",
            })}
          </div>
          {/* The warning note is the whole point of archiving rather than deleting: it says who has
              to deal with this receipt outside the system. */}
          <p className="mt-1">
            {beleg.archive_note
              ? t("belege.detail.banner.archivHinweis", { note: beleg.archive_note })
              : t("belege.detail.banner.archivOhneHinweis")}
          </p>
        </div>
      ) : null}

      {beleg.not_relevant_at ? (
        <div className="mt-6 rounded-xl border border-sky-300 bg-sky-50 px-4 py-3 text-base text-sky-900">
          <div className="flex items-center gap-2 font-medium">
            <MailQuestion className="size-4 shrink-0" />
            {t("belege.detail.banner.nichtRelevant", {
              date: formatDateTime(beleg.not_relevant_at),
              by: beleg.not_relevant_by ?? "—",
            })}
          </div>
          {/* The mail move happens in the ingestion pipeline, so the honest report is "requested"
              until the pipeline stamps mailbox_reset_at. Claiming it is back in the inbox when it
              is not would send someone looking for an email that is still filed away. */}
          <p className="mt-1">
            {beleg.mailbox_reset_at
              ? t("belege.detail.banner.postfachZurueck", {
                  date: formatDateTime(beleg.mailbox_reset_at),
                })
              : t("belege.detail.banner.postfachOffen")}
          </p>
          {beleg.not_relevant_note ? (
            <p className="mt-1">
              {t("belege.detail.banner.nichtRelevantGrund", { note: beleg.not_relevant_note })}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* The original ratio, kept. Widening the source column was tried and taken back: at
          0.85fr the preview crowds the fields, and the pane's own viewport-relative height
          (PANE_H in document-preview) already fixed the real complaint -- an A4 page squeezed
          into a fixed 480px box. Immonetz runs this same ratio. */}
      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(320px,420px)_1fr]">
        {/* Linke Spalte — Original & Eingang & Workflow. min-w-0 on both grid children below:
            grid items default to min-width:auto, so without it a single unshrinkable descendant
            (long unwrapped text, etc.) forces the whole implicit mobile column — and both
            columns, since a single-column grid shares one track — wider than the viewport.
            Sticky on desktop: reading a field against the source document is this page's whole
            job, so the document shouldn't scroll out of view once you reach lower fields. Needs
            the parent's items-start above (sticky no-ops under a stretch-height grid item) and
            overflow-x-hidden alongside overflow-y-auto — setting only the y-axis leaves x to
            compute as auto, and one stray pixel of width produces a spurious horizontal
            scrollbar for the whole column. */}
        <div
          data-tour="invoice-detail-document"
          className="min-w-0 space-y-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto lg:overflow-x-hidden lg:pr-1"
        >
          <div className="rounded-xl border border-border bg-card p-4">
            <DocumentPreview belegId={beleg.id} beleg={beleg} />
            {/* Where this invoice came from when it was not a document of its own: a multi-receipt
                scan, whose complete original this is the way back to, or one attachment of a mail
                that carried several — which has no original scan to go back to. */}
            <SplitOriginNote
              sourceDocumentId={beleg.source_document_id}
              pageRange={beleg.page_range}
            />
          </div>
        </div>

        {/* Rechte Spalte */}
        <div data-tour="invoice-detail-fields" className="min-w-0 space-y-6">
          {/* Direct debit: information, not a warning. It still guards against paying twice, but
              nothing is wrong and nothing needs doing, so it carries the "i" and a calm colour
              rather than the amber triangle the "Braucht deine Eingabe" card uses. Saskia read the
              triangle as an error or a required action (17.09.2026); same rule as H13 in
              TriangleAlert only where the user must act. */}
          {lastschrift && (
            <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/40 p-4 text-base text-foreground">
              <Info className="mt-0.5 size-5 shrink-0 text-brand" />
              <div>
                <p className="font-medium">{t("belege.detail.lastschrift.bannerTitle")}</p>
                <p className="mt-0.5 text-muted-foreground">
                  {t("belege.detail.lastschrift.bannerBody")}
                </p>
              </div>
            </div>
          )}

          {/* Review box: the checks that did NOT pass, and nothing else. Lives in hub-kit so
              the other hub repos render the same card from the same data. */}
          <ReviewCard
            lines={pruefGruendeText}
            labels={{
              title: t("belege.detail.review.title"),
              checkCount: (count) => t("belege.detail.review.pruefungen", { count }),
              choose: t("belege.detail.review.waehlen"),
              fix: t("belege.detail.review.beheben"),
            }}
            anchorId={REVIEW_ANKER}
            open={reviewOffen}
            onOpenChange={setReviewOffen}
            flash={reviewBlitz}
            onNavigate={springeZu}
          />

          {/* Why there is nothing to do, next to the controls that decide it, rather than inside
              the header card. Acting as is what changes this sentence, so the two belong on one
              row: the reason sits left, the pickers right, and on a narrow screen the reason wraps
              above them instead of being buried further up the page. */}
          {(actingAsControl || zuweisungControl || keineAktionenText) && (
            <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <p className="min-w-0 flex-1 text-sm text-muted-foreground">{keineAktionenText}</p>
              <div className="flex flex-wrap items-center justify-end gap-2">
                {actingAsControl}
                {zuweisungControl}
              </div>
            </div>
          )}

          <Tabs value={activeTab} onValueChange={handleTabChange}>
            {/* Mobile: a real Select dropdown instead of the six-button row — picking a tab opens
                a proper floating menu instead of pushing the actual tab content down the screen
                with an inline-expanded list. Desktop has the room, so it keeps the plain
                always-visible row. Tabs.Root only needs `value`/`onValueChange` to switch content;
                this drives it directly, no TabsList/TabsTrigger involved on this branch. */}
            <div data-tour="invoice-detail-tabs">
              <div className="sm:hidden">
                <Select value={activeTab} onValueChange={handleTabChange}>
                  <SelectTrigger className="w-full bg-card font-medium text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TAB_ITEMS.map(({ value, labelKey }) => (
                      <SelectItem key={value} value={value}>
                        {t(labelKey)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <TabsList className="hidden h-auto w-full flex-wrap justify-start gap-1 sm:flex">
                {TAB_ITEMS.map(({ value, labelKey }) => (
                  <TabsTrigger key={value} value={value} className="px-3 py-1.5 text-base">
                    {t(labelKey)}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            {/* Tab: Übersicht — Kerndaten (Rechnungsinformationen) + Zuordnung */}
            <TabsContent value="uebersicht" className="mt-4 space-y-6">
              {/* Braucht deine Eingabe.
                  The tab used to be ordered by database schema: every extracted column got an
                  equal-sized labelled slot whether or not it held a value and whether or not
                  anyone acts on it. The two fields that actually need a decision sat ~900px down,
                  styled exactly like "Currency: EUR". This card renders ONLY when something is
                  unresolved, so on a clean invoice it does not exist. */}
              {(gesellschaftOffen || objektOffen || kategorieOffen) && (
                <section className="rounded-xl border border-amber-300 bg-amber-50/60 p-5">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                    <h2 className="flex items-center gap-1.5 text-base font-semibold uppercase tracking-wide text-amber-900">
                      <AlertTriangle className="size-4 shrink-0" />
                      {t("belege.detail.eingabe.titel")}
                    </h2>
                    <span className="text-sm text-amber-900/80">
                      {t("belege.detail.eingabe.offen", {
                        count:
                          (gesellschaftOffen ? 1 : 0) +
                          (objektOffen ? 1 : 0) +
                          (kategorieOffen ? 1 : 0),
                      })}
                    </span>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {gesellschaftOffen && (
                      <div className="space-y-1">
                        <span className="text-sm text-amber-900/80">
                          {t("belege.detail.field.gesellschaft")}
                        </span>
                        <Combobox
                          ariaLabel={t("belege.detail.field.gesellschaft")}
                          value=""
                          onValueChange={(v) =>
                            zuordnungVerknuepfen(
                              "company_code",
                              v === KEINE_WAHL ? GESELLSCHAFT_OHNE : v,
                            )
                          }
                          placeholder={t("belege.detail.eingabe.gesellschaftWaehlen")}
                          options={[
                            { value: KEINE_WAHL, label: t("belege.detail.eingabe.keineWahl") },
                            ...gesellschaften.map((g) => ({
                              value: g.code,
                              label: `${g.code} · ${g.name}`,
                            })),
                          ]}
                        />
                        <p className="text-sm text-amber-900/80">
                          {t("belege.detail.eingabe.gesellschaftFolge")}
                        </p>
                      </div>
                    )}
                    {objektOffen && (
                      <div className="space-y-1">
                        <span className="text-sm text-amber-900/80">
                          {t("belege.detail.field.objekt")}
                        </span>
                        <Combobox
                          ariaLabel={t("belege.detail.field.objekt")}
                          value=""
                          onValueChange={(v) =>
                            v === KEINE_WAHL
                              ? zuordnungAlsErledigt("property_code")
                              : zuordnungVerknuepfen("property_code", v)
                          }
                          placeholder={t("belege.detail.eingabe.objektWaehlen")}
                          options={[
                            { value: KEINE_WAHL, label: t("belege.detail.eingabe.keineWahl") },
                            { value: GEMEINKOSTEN, label: t("belege.detail.field.gemeinkosten") },
                            ...objekte.map((o) => ({
                              value: o.code,
                              label: `${o.code} · ${o.name}`,
                            })),
                          ]}
                        />
                        {/* What happens if it stays empty, not what the field is. */}
                        <p className="text-sm text-amber-900/80">
                          {t("belege.detail.eingabe.objektFolge")}
                        </p>
                      </div>
                    )}
                    {kategorieOffen && (
                      <div className="space-y-1">
                        <span className="text-sm text-amber-900/80">
                          {t("belege.detail.field.kategorie")}
                        </span>
                        <Combobox
                          ariaLabel={t("belege.detail.field.kategorie")}
                          value=""
                          onValueChange={(v) => {
                            if (v === KEINE_WAHL) {
                              zuordnungAlsErledigt("category_id");
                              return;
                            }
                            const ziel = categories.find((k) => k.id === v);
                            if (ziel) kategorieVerknuepfen(ziel);
                          }}
                          placeholder={t("belege.detail.eingabe.kategorieWaehlen")}
                          options={[
                            { value: KEINE_WAHL, label: t("belege.detail.eingabe.keineWahl") },
                            ...categoryOptions,
                          ]}
                        />
                        <p className="text-sm text-amber-900/80">
                          {t("belege.detail.eingabe.kategorieFolge")}
                        </p>
                      </div>
                    )}
                  </div>
                </section>
              )}
              {/* Amounts and invoice data share a row: see ./SideBySide for why. */}
              <SideBySide>
                {/* 1. Rechnungsinformationen */}
                <Section
                  title={t("belege.detail.section.betraege")}
                  anchorId={BETRAEGE_ANKER}
                  hint={t("belege.detail.hint.ampel")}
                  editable
                  editDisabled={!kannBearbeiten("betraege")}
                  isEditing={isEdit("betraege")}
                  saving={updateBeleg.isPending}
                  onEdit={() => startEdit("betraege")}
                  onCancel={abbrechen}
                  onSave={speichern}
                >
                  {/* Net, VAT and gross as the ARITHMETIC they are, not four peer cells.
                      Four equal boxes hid the one calculation a bookkeeper opens this screen to
                      check: that net plus VAT makes the gross printed on the document. Right-aligned
                      tabular figures with a rule above the total read the way an invoice does.
                      Currency disappears into the symbol -- it was a labelled slot saying "EUR". */}
                  <dl className="ml-auto w-full max-w-sm space-y-2 text-base">
                    <div className="flex items-baseline justify-between gap-4">
                      <dt className="text-muted-foreground">
                        {t("belege.detail.field.betragNetto")}
                      </dt>
                      <dd className="tabular-nums text-foreground">
                        {isEdit("betraege") ? (
                          <Input
                            type="number"
                            step="0.01"
                            value={form.amount_net}
                            onChange={(e) => set("amount_net", e.target.value)}
                            className="h-8 w-36 text-right"
                          />
                        ) : (
                          formatEUR(beleg.amount_net)
                        )}
                      </dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-4">
                      <dt className="flex items-center gap-1.5 text-muted-foreground">
                        {beleg.vat_rate != null
                          ? t("belege.detail.ustSatzKurz", { satz: beleg.vat_rate })
                          : t("belege.detail.field.ustBetrag")}
                        <QuelleBadge source={beleg.vat_source} hasValue={beleg.vat_rate != null} />
                      </dt>
                      <dd className="tabular-nums text-foreground">
                        {isEdit("betraege") ? (
                          <Input
                            type="number"
                            step="0.01"
                            value={form.vat_amount}
                            onChange={(e) => set("vat_amount", e.target.value)}
                            className="h-8 w-36 text-right"
                          />
                        ) : (
                          formatEUR(beleg.vat_amount)
                        )}
                      </dd>
                    </div>
                    {/* The rule, drawn where an invoice draws it. */}
                    <div className="flex items-baseline justify-between gap-4 border-t border-border pt-2">
                      <dt className="font-medium text-foreground">
                        {t("belege.detail.field.betragBrutto")}
                      </dt>
                      <dd className="text-lg font-semibold tabular-nums text-foreground">
                        {isEdit("betraege") ? (
                          <Input
                            type="number"
                            step="0.01"
                            value={form.amount_gross}
                            onChange={(e) => set("amount_gross", e.target.value)}
                            className="h-8 w-36 text-right"
                          />
                        ) : (
                          formatEUR(beleg.amount_gross)
                        )}
                      </dd>
                    </div>
                    {isEdit("betraege") && (
                      <div className="flex items-baseline justify-between gap-4">
                        <dt className="text-muted-foreground">
                          {t("belege.detail.field.ustSatz")}
                        </dt>
                        <dd>
                          <Input
                            type="number"
                            step="0.01"
                            value={form.vat_rate}
                            onChange={(e) => set("vat_rate", e.target.value)}
                            className="h-8 w-36 text-right"
                          />
                        </dd>
                      </div>
                    )}
                  </dl>

                  {/* Deductibility as a sentence plus the one action that follows from it, rather
                      than four labelled cells most invoices never need. */}
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
                    <span className="text-sm text-muted-foreground">
                      {beleg.vat_deductible_pct != null
                        ? t("belege.detail.betraege.abzugsfaehig", {
                            prozent: beleg.vat_deductible_pct,
                          })
                        : t("belege.detail.betraege.abzugUnbestimmt")}
                    </span>
                    {!isEdit("betraege") && beleg.vat_rate != null && !regelnQ.data?.vat_rate ? (
                      <NeueRegelDialog
                        fixedTarget="vat_rate"
                        defaultVatRate={beleg.vat_rate}
                        defaultVatTreatment={
                          beleg.vat_treatment && VAT_TREATMENTS.includes(beleg.vat_treatment)
                            ? beleg.vat_treatment
                            : null
                        }
                        defaultVatDeductiblePct={beleg.vat_deductible_pct}
                        defaultVatSpecialCase={beleg.vat_special_case}
                        trigger={
                          <Button size="sm" variant="outline" className="h-7 gap-1.5 text-sm">
                            <Wand2 className="size-3" />
                            {t("belege.detail.regel.alsRegelUst", { satz: beleg.vat_rate })}
                          </Button>
                        }
                      />
                    ) : null}
                  </div>

                  {beleg.vat_conflict_at ? (
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                      <span className="flex items-center gap-1.5">
                        <TriangleAlert className="size-3.5 shrink-0" />
                        {beleg.vat_conflict_note ?? t("belege.detail.field.ustKonflikt")}
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 gap-1 border-amber-300 px-2 text-sm text-amber-800 hover:bg-amber-100"
                        disabled={updateBeleg.isPending}
                        onClick={() =>
                          updateBeleg.mutate({
                            changes: { vat_conflict_at: null, vat_conflict_note: null },
                          })
                        }
                      >
                        {t("belege.detail.field.ustKonfliktVerstanden")}
                      </Button>
                    </div>
                  ) : null}

                  {/* The gate checklist that used to sit here is gone. It printed all eight checks,
                      passing ones included, in a grid nobody read on the seven receipts out of eight
                      where everything passed. What FAILED is the only part worth a reader's time, and
                      the review box above already lists exactly that, in sentences rather than
                      green ticks. */}
                </Section>

                {/* Rechnungsdaten, and only the three fields anyone opens this screen to check:
                    number, invoice date, due date. The order number and the three service dates
                    moved to their own card on the Details tab, where a field that is looked at
                    occasionally belongs. Six fields here pushed those three into a second row. */}
                <Section
                  title={t("belege.detail.section.rechnungsdaten")}
                  anchorId={RECHNUNGSDATEN_ANKER}
                  editable
                  editDisabled={!kannBearbeiten("rechnungsdaten")}
                  isEditing={isEdit("rechnungsdaten")}
                  saving={updateBeleg.isPending}
                  onEdit={() => startEdit("rechnungsdaten")}
                  onCancel={abbrechen}
                  onSave={speichern}
                >
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field
                      edit={isEdit("rechnungsdaten")}
                      label={t("belege.detail.field.rechnungsnummer")}
                      konfidenz={konf.rechnungsnummer}
                      copy
                      value={beleg.invoice_number}
                      formValue={form.invoice_number}
                      onChange={(v) => set("invoice_number", v)}
                    />
                    <Field
                      edit={isEdit("rechnungsdaten")}
                      label={t("belege.detail.field.rechnungsdatum")}
                      type="date"
                      konfidenz={konf.beleg_datum}
                      value={formatDate(beleg.document_date)}
                      formValue={form.document_date}
                      onChange={(v) => set("document_date", v)}
                    />
                    <Field
                      edit={isEdit("rechnungsdaten")}
                      label={t("belege.detail.field.faelligkeit")}
                      type="date"
                      value={formatDate(beleg.due_date)}
                      formValue={form.due_date}
                      onChange={(v) => set("due_date", v)}
                    />
                    {/* WHEN the service was delivered, shown only when the invoice says. It used to
                        hang under the invoice date in the list, where a full date range set the
                        width of the column; here it has room. Read-only on purpose: the three
                        underlying dates are edited in one place, the Leistung & Auftrag card on the
                        Details tab, and a second edit site for the same columns is how they drift. */}
                    {leistungszeitraum && (
                      <ReadField
                        label={t("belege.detail.field.leistungszeitraum")}
                        value={leistungszeitraum}
                      />
                    )}
                  </div>
                </Section>
              </SideBySide>

              {/* 2. Zuordnung */}
              <Section
                title={t("belege.detail.section.beteiligte")}
                anchorId={BETEILIGTE_ANKER}
                editable
                editDisabled={!kannBearbeiten("booking")}
                isEditing={isEdit("booking")}
                saving={updateBeleg.isPending}
                onEdit={() => startEdit("booking")}
                onCancel={abbrechen}
                onSave={speichern}
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    edit={isEdit("booking")}
                    label={t("belege.detail.field.rechnungssteller")}
                    konfidenz={konf.rechnungssteller}
                    value={beleg.issuer}
                    formValue={form.issuer}
                    onChange={(v) => set("issuer", v)}
                  />
                  {isEdit("booking") ? (
                    <div className="space-y-1">
                      <span className="text-sm text-muted-foreground">
                        {t("belege.detail.field.gesellschaft")}
                      </span>
                      <Combobox
                        value={form.company_code || "__none"}
                        onValueChange={(v) => set("company_code", v === "__none" ? "" : v)}
                        options={[
                          { value: "__none", label: t("belege.detail.field.ohne") },
                          ...gesellschaften.map((g) => ({
                            value: g.code,
                            label: `${g.code} · ${g.name}`,
                            keywords: g.name,
                          })),
                        ]}
                      />
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <ReadField
                        label={t("belege.detail.field.gesellschaft")}
                        konfidenz={konf.gesellschaft_code}
                        quelle={beleg.company_assignment_source}
                        value={
                          gesellschaft
                            ? `${gesellschaft.code} · ${gesellschaft.name}`
                            : beleg.company_code
                        }
                        // The company's overhead cost centre (1000 or 10000), next to the company
                        // it belongs to, whether or not this invoice is booked to Gemeinkosten.
                        sub={
                          gesellschaft ? (
                            gesellschaft.overhead_cost_centre != null ? (
                              t("belege.detail.field.gemeinkostenNummer", {
                                nr: gesellschaft.overhead_cost_centre,
                              })
                            ) : (
                              <>
                                {t("belege.detail.field.gemeinkostenNummerFehlt")}
                                <Link
                                  to="/gesellschaften/$id"
                                  params={{ id: gesellschaft.id }}
                                  className="ml-1 text-brand underline-offset-4 hover:underline"
                                >
                                  {t("belege.detail.field.kostenstelleBeiGesellschaft")}
                                </Link>
                              </>
                            )
                          ) : undefined
                        }
                        badge={
                          <QuelleBadge
                            source={beleg.company_assignment_source}
                            hasValue={!!beleg.company_code}
                          />
                        }
                      />
                      {/* Unassigned is a legitimate state, not an error: the briefing wants an
                          assignment removable without immediately setting a new one. It still has
                          to be visible, because an unassigned receipt belongs to nobody's company
                          and only shows up in the watch-all bucket. */}
                      {!beleg.company_code ? (
                        <p className="text-sm text-muted-foreground">
                          {t("belege.detail.field.ohneGesellschaftHinweis")}
                        </p>
                      ) : null}
                    </div>
                  )}
                  <div className="space-y-1">
                    {isEdit("booking") ? (
                      <>
                        <span className="text-sm text-muted-foreground">
                          {t("belege.detail.field.objekt")}
                        </span>
                        <Combobox
                          value={form.property_code || "__none"}
                          onValueChange={(v) => set("property_code", v === "__none" ? "" : v)}
                          options={[
                            { value: "__none", label: t("belege.detail.field.ohne") },
                            // Overhead sits WITH the properties, not beside them: it is the other
                            // answer to the same question, and the two are mutually exclusive.
                            { value: GEMEINKOSTEN, label: t("belege.detail.field.gemeinkosten") },
                            // Legacy AI-extracted code not in the master data — keep it visible/selectable
                            // so the current state is clear, but flag it (below) for correction.
                            ...(objektUnbekannt && form.property_code === beleg.property_code
                              ? [
                                  {
                                    value: beleg.property_code as string,
                                    label: `${beleg.property_code} (${t("belege.detail.field.objektUnbekanntKurz")})`,
                                  },
                                ]
                              : []),
                            ...objekte.map((o) => ({
                              value: o.code,
                              label: o.name ? `${o.code} · ${o.name}` : o.code,
                              keywords: o.name ?? "",
                            })),
                          ]}
                        />
                      </>
                    ) : (
                      <ReadField
                        label={t("belege.detail.field.objekt")}
                        konfidenz={konf.objekt_code}
                        quelle={beleg.property_assignment_source}
                        leerAls={objektEntschieden ? <KeineWahlWert /> : undefined}
                        value={
                          beleg.is_overhead
                            ? t("belege.detail.field.gemeinkosten")
                            : objekt
                              ? `${objekt.code}${objekt.name ? ` · ${objekt.name}` : ""}`
                              : objektUnbekannt
                                ? `${beleg.property_code} (${t("belege.detail.field.objektUnbekanntKurz")})`
                                : beleg.property_code
                        }
                        sub={
                          kostenstelle ? (
                            <KostenstelleHinweis
                              kostenstelle={kostenstelle}
                              objektCode={objekt?.code ?? null}
                            />
                          ) : undefined
                        }
                        badge={
                          <QuelleBadge
                            source={beleg.property_assignment_source}
                            hasValue={!!beleg.property_code}
                          />
                        }
                      />
                    )}
                    {/* Extracted property code isn't in the master data → offer to create it. */}
                    {objektUnbekannt ? (
                      <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-sm text-amber-700">
                        <span className="flex items-center gap-1">
                          <TriangleAlert className="size-3 shrink-0" />
                          {t("belege.detail.field.objektUnbekannt")}
                        </span>
                        <Button
                          asChild
                          size="sm"
                          variant="outline"
                          className="h-6 gap-1 border-amber-300 px-2 text-sm text-amber-800 hover:bg-amber-100"
                        >
                          <Link to="/objekte" search={{ neu: beleg.property_code ?? undefined }}>
                            <Plus className="size-3" /> {t("belege.detail.field.objektAnlegen")}
                          </Link>
                        </Button>
                      </div>
                    ) : null}
                    {/* The company follows from the property (migration 0083), so offer it instead
                        of making the reviewer look it up on the property page. */}
                    {isEdit("booking") && companyVorschlagOffen ? (
                      <div className="flex flex-wrap items-center gap-2 rounded-md border border-sky-300 bg-sky-50 px-2 py-1.5 text-sm text-sky-800">
                        <span>
                          {t("belege.detail.field.gesellschaftVorschlag", {
                            code: companyVorschlag?.code ?? "",
                          })}
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 gap-1 border-sky-300 px-2 text-sm text-sky-900 hover:bg-sky-100"
                          onClick={() => set("company_code", companyVorschlag?.code ?? "")}
                        >
                          <Check className="size-3" />
                          {t("belege.detail.field.gesellschaftUebernehmen")}
                        </Button>
                      </div>
                    ) : isEdit("booking") && companyVorschlag?.mehrdeutig ? (
                      <p className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-sm text-amber-800">
                        {t("belege.detail.field.gesellschaftMehrdeutig")}
                      </p>
                    ) : isEdit("booking") && companyVorschlag?.fehlt ? (
                      <p className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-sm text-amber-800">
                        {t("belege.detail.field.gesellschaftKeineZuordnung")}
                      </p>
                    ) : null}
                  </div>
                  {/* ONE category, picked from the real BWA taxonomy (bwa_categories, migration
                      0030) — not free text. cost_category still exists in the schema as a legacy
                      mirror the rule engine also writes, but it is derived automatically
                      (speichern() above) and never shown or edited here directly anymore. */}
                  <div className="space-y-1">
                    {isEdit("booking") ? (
                      <>
                        <span className="text-sm text-muted-foreground">
                          {t("belege.detail.field.kategorie")}
                        </span>
                        <Combobox
                          value={form.category_id || "__none"}
                          onValueChange={(v) => set("category_id", v === "__none" ? "" : v)}
                          options={[
                            { value: "__none", label: t("belege.detail.field.ohne") },
                            ...categoryOptions,
                          ]}
                        />
                      </>
                    ) : (
                      <ReadField
                        label={t("belege.detail.field.kategorie")}
                        leerAls={
                          beleg.cost_category_source === "human" ? <KeineWahlWert /> : undefined
                        }
                        // Falls back to the free-text value rather than an em dash: there IS a
                        // category here, it is simply not linked to the taxonomy yet.
                        value={
                          category
                            ? categoryLabel(category)
                            : freitextKategorie
                              ? `${freitextKategorie} ${t("belege.detail.field.nurFreitext")}`
                              : null
                        }
                        badge={
                          <QuelleBadge
                            source={beleg.cost_category_source}
                            hasValue={!!beleg.category_id}
                          />
                        }
                      />
                    )}
                    {!isEdit("booking") && !beleg.category_id ? (
                      freitextKategorie ? (
                        // There IS a category on this receipt, it is just the free-text one the
                        // pipeline wrote and never linked to the taxonomy. Showing it beats
                        // showing "—": it is what the rule engine matched on, and hiding it made
                        // the screen disagree with the rule preview.
                        <div className="space-y-1">
                          <p className="text-sm text-muted-foreground">
                            {t("belege.detail.field.freitextHinweis")}
                          </p>
                          {passendeKategorie ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="mt-1"
                              disabled={updateBeleg.isPending}
                              onClick={() => kategorieVerknuepfen(passendeKategorie)}
                            >
                              {t("belege.detail.field.verknuepfen", {
                                name: categoryLabel(passendeKategorie),
                              })}
                            </Button>
                          ) : null}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          {t("belege.detail.field.ohneKategorieHinweis")}
                        </p>
                      )
                    ) : null}
                    {/* Teach the correction back, so the next receipt from this supplier lands
                        right on its own. Only offered once a category is actually set and no rule
                        already covers it, otherwise the button either has nothing to store or
                        would collide with an existing rule. Supplier (+ payment reference, when
                        this receipt has one) is the suggested scope — both adjustable in the
                        dialog, with the same retroactive preview as the rules screen
                        (Briefing Screen 4: "this would change N receipts"). */}
                    {!isEdit("booking") &&
                    beleg.category_id &&
                    beleg.supplier_id &&
                    !regelnQ.data?.cost_category ? (
                      <NeueRegelDialog
                        fixedTarget="cost_category"
                        defaultSupplierId={beleg.supplier_id}
                        defaultReferencePattern={beleg.payment_reference ?? undefined}
                        defaultCategoryId={beleg.category_id ?? undefined}
                        trigger={
                          <Button size="sm" variant="outline" className="h-7 gap-1.5 text-sm">
                            <Wand2 className="size-3" />
                            {t("belege.detail.regel.alsRegel")}
                          </Button>
                        }
                      />
                    ) : null}
                    {!isEdit("booking") && regelnQ.data?.cost_category ? (
                      <RegelHinweis
                        belegId={beleg.id}
                        target="cost_category"
                        humanOverride={beleg.cost_category_source === "human"}
                      />
                    ) : null}
                  </div>
                </div>
              </Section>
            </TabsContent>

            {/* Tab: Freigabe — approval flow (progress display + gated actions) + assignee.
                Payment & reconciliation moved to its own tab below. */}
            <TabsContent value="freigabe" className="mt-4 space-y-6">
              {/* Only when it has something to say. Every child of this card is conditional, and
                  with the two pickers and the correction dropdown gone there is no longer any
                  unconditional content holding it up -- so on an invoice with no responsible
                  approver and no payment handoff it rendered as a bordered box with a heading and
                  nothing under it. A card that can be empty has to be able to not exist. */}
              {(responsibleApproverInactive || isOverdue) && !!responsibleApprover && (
                <Section title={t("belege.detail.section.freigabe")}>
                  {responsibleApproverInactive && responsibleApprover && (
                    <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                      <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                      <span>
                        {t("belege.detail.workflow.verantwortlicherInaktiv", {
                          name: responsibleApprover.name ?? "",
                        })}
                      </span>
                    </div>
                  )}

                  {isOverdue && responsibleApprover && (
                    <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                      <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                      <span>
                        {t("belege.detail.workflow.overdue", {
                          name: responsibleApprover.name ?? "",
                          days: Math.floor(daysSinceLastMove),
                        })}
                        {responsibleApprover.deputy_user_id && (
                          <>
                            {" "}
                            {t("belege.detail.workflow.overdueDeputy", {
                              name: personenName(responsibleApprover.deputy_user_id) ?? "",
                            })}
                          </>
                        )}
                      </span>
                    </div>
                  )}
                </Section>
              )}

              {/* Rückfragen get their own section, separate from the other approval actions —
                  each shows who raised it (actor email) and who it's addressed to. The card is
                  ALWAYS here, empty or not: this tab is where you come to check whether anybody
                  has raised a query, and a heading that only exists once one has been raised
                  cannot answer that question -- "no queries" and "the queries live somewhere I
                  have not found" look identical when both show nothing. The card costs one
                  border; being unable to trust the absence costs a hunt through the tab. */}
              {/* ONE CARD for the whole workflow history. It was two -- "Freigabe-Verlauf" listing
                  who did what, and "Dauer je Stufe" listing how long each leg took -- describing
                  the same events from two angles, in two vocabularies, running in two directions,
                  with no way to line a row in one up against a row in the other. Every fact both
                  carried belongs to a single move, so it is a single row. */}
              <Section title={t("belege.detail.section.freigabeVerlauf")}>
                {verlaufQ.isLoading ? (
                  <Skeleton className="h-16 w-full" />
                ) : (
                  <WorkflowVerlaufListe
                    zeilen={workflowVerlauf}
                    eingegangenAm={beleg.created_at}
                    emptyText={t("belege.detail.workflow.verlaufEmpty")}
                    t={t}
                  />
                )}
              </Section>
            </TabsContent>

            <Dialog
              open={!!pendingAction}
              onOpenChange={(open) => {
                if (!open) {
                  setPendingAction(null);
                  setActionComment("");
                }
              }}
            >
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>
                    {pendingAction && t(`belege.workflow.actions.${pendingAction.id}`)}
                  </DialogTitle>
                  <DialogDescription>
                    {t("belege.detail.workflow.commentRequired")}
                  </DialogDescription>
                </DialogHeader>
                <Textarea
                  value={actionComment}
                  onChange={(e) => setActionComment(e.target.value)}
                  rows={3}
                  autoFocus
                />
                <DialogFooter>
                  <Button variant="outline" onClick={() => setPendingAction(null)}>
                    {t("belege.detail.workflow.abbrechen")}
                  </Button>
                  <Button
                    disabled={!actionComment.trim() || updateBeleg.isPending}
                    onClick={() => pendingAction && runApprovalAction(pendingAction, actionComment)}
                  >
                    {t("belege.detail.workflow.bestaetigen")}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <AlertDialog
              open={!!pendingCorrection}
              onOpenChange={(open) => {
                if (!open) {
                  setPendingCorrection(null);
                  setKorrekturGrund("");
                }
              }}
            >
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t("belege.detail.workflow.korrektur.title")}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {pendingCorrection &&
                      t("belege.detail.workflow.korrektur.desc", {
                        von: t(`belege.workflow.${wf}`),
                        nach: t(`belege.workflow.${pendingCorrection}`),
                      })}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                {rueckschritt.requiresReason && (
                  <div className="space-y-1.5">
                    <Label htmlFor="korrektur-grund">
                      {t("belege.detail.workflow.korrektur.grundLabel")}
                    </Label>
                    <Textarea
                      id="korrektur-grund"
                      value={korrekturGrund}
                      onChange={(e) => setKorrekturGrund(e.target.value)}
                      placeholder={t("belege.detail.workflow.korrektur.grundPlatzhalter")}
                      rows={3}
                    />
                  </div>
                )}
                {korrekturLoestZahlung && (
                  <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    {t("belege.detail.workflow.korrektur.loestZahlung", {
                      count: bestaetigteMatches.length,
                    })}
                  </div>
                )}
                {korrekturLoestZahlung && !darfSelbstZahlen && (
                  <p className="mt-2 text-sm text-warning">{keinZahlrechtKorrektur}</p>
                )}
                <AlertDialogFooter>
                  <AlertDialogCancel>{t("belege.detail.workflow.abbrechen")}</AlertDialogCancel>
                  <AlertDialogAction
                    disabled={
                      (rueckschritt.requiresReason && korrekturGrund.trim() === "") ||
                      (korrekturLoestZahlung && !darfSelbstZahlen)
                    }
                    onClick={() =>
                      pendingCorrection &&
                      runCorrection(pendingCorrection, korrekturGrund.trim() || null)
                    }
                  >
                    {t("belege.detail.workflow.bestaetigen")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            {/* Tab: Zahlung & Abgleich — manual paid status + BANKSapi reconciliation */}
            <TabsContent value="zahlung" className="mt-4 space-y-6">
              <Section title={t("belege.detail.section.zahlungsstatus")}>
                {/* The three payment axes -- paid, reconciled, handed to DATEV. This used to be a
                    card standing above the tabs, on every tab, saying the same thing the header
                    already says with its Abgleich badge. It belongs where the payment is actually
                    worked on, next to the controls that change it. */}
                <ul className="mb-3 space-y-1 text-base text-muted-foreground">
                  {zahlungReasons.map((g) => (
                    <li key={g} className="flex items-start gap-2">
                      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-muted-foreground/50" />
                      {t(`belege.detail.zahlung.grund.${g}`)}
                    </li>
                  ))}
                </ul>
                <div className="rounded-lg bg-muted/40 px-3 py-2">
                  <div className="flex items-center justify-between">
                    <span className="text-base text-muted-foreground">
                      {t("belege.detail.workflow.bezahltManuell")}
                    </span>
                    <div className="flex items-center gap-2">
                      {beleg.paid_at && (
                        <span className="text-sm text-muted-foreground">
                          {formatDateTime(beleg.paid_at)}
                        </span>
                      )}
                      {/* Confirmed, not applied on the flip: a manual paid mark is the one
                          payment state the bank reconciliation will never correct on its own
                          (updateBeleg writes paid_source: "manual", which migration 0024's trigger
                          deliberately leaves alone), so a mis-click here quietly makes an unpaid
                          invoice look settled. */}
                      {/* ONLY UNTIL IT IS PAID. Turning this back off used to walk the workflow
                          from "Bezahlt" to "In Prüfung" as a side effect of a switch, with nothing
                          asked and nothing recorded beyond a status line. Undoing a payment is a
                          decision that has to say why and that releases the bank transactions
                          linked to the invoice, so it now lives on the workflow bar, where it is
                          confirmed, explained and written into the history. */}
                      {!beleg.paid_at &&
                        ((
                          !darfAlsPerson(PERMISSIONS.paymentsWrite)
                            ? t("belege.detail.zahlung.keineZahlBerechtigung")
                            : null
                        ) ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              {/* A disabled control does not reliably fire hover events, so the
                                  reason needs a focusable host. Same wrapper as "Jetzt bezahlen". */}
                              <span tabIndex={0} className="inline-block">
                                <Switch checked={false} disabled className="pointer-events-none" />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              {!darfAlsPerson(PERMISSIONS.paymentsWrite)
                                ? t("belege.detail.zahlung.keineZahlBerechtigung")
                                : null}
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <Switch checked={false} onCheckedChange={(c) => setBezahltDialog(c)} />
                        ))}
                    </div>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t("belege.detail.workflow.bezahltManuellHint")}
                  </p>
                </div>
              </Section>

              {/* Sibling of the switch, controlled: what is being confirmed depends on the
                  direction, so both texts live in one dialog keyed on `bezahltDialog`. */}
              <AlertDialog
                open={bezahltDialog !== null}
                onOpenChange={(o) => !o && setBezahltDialog(null)}
              >
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      {bezahltDialog
                        ? t("belege.detail.zahlung.bezahltTitle")
                        : t("belege.detail.zahlung.bezahltZurueckTitle")}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      {bezahltDialog
                        ? t("belege.detail.zahlung.bezahltDesc")
                        : t("belege.detail.zahlung.bezahltZurueckDesc")}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t("belege.detail.action.abbrechen")}</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => {
                        if (bezahltDialog !== null) setBezahlt(bezahltDialog);
                        setBezahltDialog(null);
                      }}
                    >
                      {bezahltDialog
                        ? t("belege.detail.zahlung.bezahltConfirm")
                        : t("belege.detail.zahlung.bezahltZurueckConfirm")}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              {/* Where this invoice actually gets paid: the same accounts the Lieferant tab
                  lists, with the pay control under them. The transfer payload (IBAN, amount,
                  reference) is no longer restated here. It is what the pay dialog shows, right
                  before the money moves, assembled from the choices made in it. */}
              {beleg.supplier_id && lieferant && (
                <div id={UEBERWEISUNG_ANKER} className="scroll-mt-24">
                  <Section title={t("belege.detail.lieferant.ueberweisung")}>
                    {/* The account nobody has vouched for yet is called out HERE, where the
                        payment decision is made, rather than on the supplier's master data. */}
                    {aktuellesKonto && !aktuellesKonto.confirmed_at && (
                      <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900">
                        <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                        <span className="text-base">
                          {t("belege.detail.lieferant.konten.neuHinweis")}
                        </span>
                      </div>
                    )}
                    {/* onAdd deliberately undefined: adding a bank account is master data about
                        the supplier, so it belongs on the Supplier tab (and in the pay dialog,
                        where a new IBAN can be the one you are about to pay). This card is about
                        executing THIS payment, so it lists accounts and does not create them. */}
                    <PaymentAccounts
                      {...zahlkontenPanel}
                      onAdd={undefined}
                      actions={
                        aktuellesKonto ? (
                          <JetztBezahlenSection
                            beleg={beleg}
                            lieferant={lieferant}
                            vorgeschlagenesKonto={aktuellesKonto.id}
                            chipsFuer={kontoChips}
                          />
                        ) : null
                      }
                    />
                  </Section>
                </div>
              )}

              {/* Zahlung & Abgleich (BANKSapi reconciliation) */}
              <div id={ABGLEICH_ANKER} className="scroll-mt-24">
                <ZahlungAbgleichSection beleg={beleg} />
              </div>
            </TabsContent>

            {/* Tab: Details — everything else + all extracted data */}
            <TabsContent value="details" className="mt-4 space-y-6">
              {/* Order of this tab, deliberately: what was INVOICED first (the line items
                  and the tax breakdown, the two things with actual content), then this
                  invoice's remaining fields, then where the document came from, then the
                  raw extraction last. It used to open on four metadata cards with the two
                  tables buried in the middle, so the richest thing on the tab was the
                  thing you had to scroll past three cards to reach. */}

              {/* 4. Positionen */}
              {positionen.length > 0 && (
                <Section title={t("belege.detail.section.positionen")}>
                  <div className="overflow-hidden rounded-lg border border-border">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/40">
                          <TableHead>{t("belege.detail.positionen.beschreibung")}</TableHead>
                          <TableHead className="text-right">
                            {t("belege.detail.positionen.menge")}
                          </TableHead>
                          <TableHead className="text-right">
                            {t("belege.detail.positionen.einzelpreis")}
                          </TableHead>
                          <TableHead className="text-right">
                            {t("belege.detail.positionen.ustProzent")}
                          </TableHead>
                          <TableHead className="text-right">
                            {t("belege.detail.positionen.betrag")}
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {positionen.map((p, i) => (
                          <TableRow key={i}>
                            <TableCell className="text-base text-foreground">
                              {p.beschreibung ?? "—"}
                            </TableCell>
                            <TableCell className="text-right text-base tabular-nums">
                              {p.menge ?? "—"}
                            </TableCell>
                            <TableCell className="text-right text-base tabular-nums">
                              {p.einzelpreis != null ? formatEUR(p.einzelpreis) : "—"}
                            </TableCell>
                            <TableCell className="text-right text-base tabular-nums">
                              {p.ust_satz != null ? `${p.ust_satz} %` : "—"}
                            </TableCell>
                            <TableCell className="text-right text-base font-medium tabular-nums">
                              {p.betrag != null ? formatEUR(p.betrag) : "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </Section>
              )}

              {/* VAT deductibility, the VAT special case and the income-tax treatment. They lived
                  behind a "show all fields" toggle inside the Beträge card, which meant three
                  decisions with tax consequences were one click away from invisible, and the click
                  had to be repeated per person because the toggle remembered itself in
                  localStorage. Here they are simply present, on the tab for the fields somebody
                  opens when they are checking something specific. */}
              <Section
                title={t("belege.detail.section.steuerlicheBehandlung")}
                editable
                isEditing={isEdit("steuern")}
                saving={updateBeleg.isPending}
                onEdit={() => startEdit("steuern")}
                onCancel={abbrechen}
                onSave={speichern}
              >
                {/* Deductibility (Briefing Screen 5, migration 0031): decides net vs. gross cost.
                    Defaults from the business line's VAT treatment, overridden by a rule, overridden
                    by a human — same triad and same "human beats a rule" stance as vat_rate above.
                    Editable as either a percentage or a fixed EUR amount — whichever is typed drives
                    the other; only the percentage is ever actually written (the amount is generated). */}
                <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Field
                    edit={isEdit("steuern")}
                    label={t("belege.detail.field.abzugsfaehigkeit")}
                    type="number"
                    value={beleg.vat_deductible_pct != null ? `${beleg.vat_deductible_pct} %` : "—"}
                    formValue={form.vat_deductible_pct}
                    onChange={onAbzugProzentChange}
                    badge={
                      <QuelleBadge
                        source={beleg.vat_deductibility_source}
                        hasValue={beleg.vat_deductible_pct != null}
                      />
                    }
                  />
                  <Field
                    edit={isEdit("steuern") && liveVatAmount != null && liveVatAmount !== 0}
                    label={t("belege.detail.field.abzugsfaehigerBetrag")}
                    type="number"
                    value={
                      beleg.vat_deductible_amount != null
                        ? formatEUR(beleg.vat_deductible_amount)
                        : t("belege.detail.field.nichtBestimmt")
                    }
                    formValue={abzugBetragEingabe}
                    onChange={onAbzugBetragChange}
                  />
                  <ReadField
                    label={t("belege.detail.field.nichtAbzugsfaehigerBetrag")}
                    value={
                      isEdit("steuern") &&
                      form.vat_deductible_pct.trim() !== "" &&
                      liveVatAmount != null &&
                      Number.isFinite(Number(form.vat_deductible_pct.replace(",", ".")))
                        ? formatEUR(
                            Math.round(
                              (liveVatAmount -
                                (liveVatAmount *
                                  Number(form.vat_deductible_pct.replace(",", "."))) /
                                  100) *
                                100,
                            ) / 100,
                          )
                        : beleg.vat_nondeductible_amount != null
                          ? formatEUR(beleg.vat_nondeductible_amount)
                          : t("belege.detail.field.nichtBestimmt")
                    }
                  />
                  {isEdit("steuern") ? (
                    <div className="space-y-1">
                      <span className="text-sm text-muted-foreground">
                        {t("belege.detail.field.sonderfall")}
                      </span>
                      <Combobox
                        value={form.vat_special_case || "__none"}
                        onValueChange={(v) => set("vat_special_case", v === "__none" ? "" : v)}
                        options={[
                          { value: "__none", label: t("belege.detail.field.ohne") },
                          ...VAT_SPECIAL_CASES.map((v) => ({
                            value: v,
                            label: t(`belege.detail.vatSonderfall.${v}`),
                          })),
                        ]}
                      />
                    </div>
                  ) : (
                    <ReadField
                      label={t("belege.detail.field.sonderfall")}
                      value={
                        beleg.vat_special_case
                          ? t(`belege.detail.vatSonderfall.${beleg.vat_special_case}`)
                          : null
                      }
                    />
                  )}
                </div>
                {/* Herstellungsaufwand vs. Erhaltungsaufwand (production vs. maintenance expense,
                    migration 0055) — an income-tax capitalization question, deliberately kept
                    separate from the VAT-deductibility grid above (it is not a VAT question and
                    does not affect vat_deductible_pct). Null/"ohne" = not applicable, the common
                    case. */}
                <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {isEdit("steuern") ? (
                    <div className="space-y-1">
                      <span className="text-sm text-muted-foreground">
                        {t("belege.detail.field.einkommensteuerBehandlung")}
                      </span>
                      <Combobox
                        value={form.income_tax_treatment || "__none"}
                        onValueChange={(v) => set("income_tax_treatment", v === "__none" ? "" : v)}
                        options={[
                          { value: "__none", label: t("belege.detail.field.ohne") },
                          ...INCOME_TAX_TREATMENTS.map((v) => ({
                            value: v,
                            label: t(`belege.detail.einkommensteuer.${v}`),
                          })),
                        ]}
                      />
                    </div>
                  ) : (
                    <ReadField
                      label={t("belege.detail.field.einkommensteuerBehandlung")}
                      value={
                        beleg.income_tax_treatment
                          ? t(`belege.detail.einkommensteuer.${beleg.income_tax_treatment}`)
                          : null
                      }
                    />
                  )}
                </div>
              </Section>

              {/* Order number and the service dates. They sat in Rechnungsdaten on the overview,
                  where they pushed the three fields anyone actually opens this screen for (number,
                  invoice date, due date) into a second row. They are looked at when something
                  specific is being checked, which is what this tab is for. */}
              <Section
                title={t("belege.detail.section.leistungsdaten")}
                editable
                editDisabled={!kannBearbeiten("leistungsdaten")}
                isEditing={isEdit("leistungsdaten")}
                saving={updateBeleg.isPending}
                onEdit={() => startEdit("leistungsdaten")}
                onCancel={abbrechen}
                onSave={speichern}
              >
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <Field
                    edit={isEdit("leistungsdaten")}
                    label={t("belege.detail.field.auftragsnummer")}
                    value={beleg.order_number}
                    formValue={form.order_number}
                    onChange={(v) => set("order_number", v)}
                  />
                  <Field
                    edit={isEdit("leistungsdaten")}
                    label={t("belege.detail.field.leistungsdatum")}
                    type="date"
                    konfidenz={konf.leistungsdatum}
                    value={formatDate(beleg.service_date)}
                    formValue={form.service_date}
                    onChange={(v) => set("service_date", v)}
                  />
                  <Field
                    edit={isEdit("leistungsdaten")}
                    label={t("belege.detail.field.leistungVon")}
                    type="date"
                    value={formatDate(beleg.service_period_from)}
                    formValue={form.service_period_from}
                    onChange={(v) => set("service_period_from", v)}
                  />
                  <Field
                    edit={isEdit("leistungsdaten")}
                    label={t("belege.detail.field.leistungBis")}
                    type="date"
                    value={formatDate(beleg.service_period_to)}
                    formValue={form.service_period_to}
                    onChange={(v) => set("service_period_to", v)}
                  />
                </div>
              </Section>

              {/* Weitere Angaben (additional extracted fields — "no data loss") */}
              <Section
                title={t("belege.detail.section.weitere")}
                editable
                editDisabled={!kannBearbeiten("weitere")}
                isEditing={isEdit("weitere")}
                saving={updateBeleg.isPending}
                onEdit={() => startEdit("weitere")}
                onCancel={abbrechen}
                onSave={speichern}
              >
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <Field
                    edit={isEdit("weitere")}
                    label={t("belege.detail.field.anschriftSteller")}
                    value={beleg.issuer_address}
                    formValue={form.issuer_address}
                    onChange={(v) => set("issuer_address", v)}
                  />
                  <Field
                    edit={isEdit("weitere")}
                    label={t("belege.detail.field.empfaenger")}
                    value={beleg.recipient_name}
                    formValue={form.recipient_name}
                    onChange={(v) => set("recipient_name", v)}
                  />
                  <Field
                    edit={isEdit("weitere")}
                    label={t("belege.detail.field.kundennummer")}
                    copy
                    value={beleg.customer_number}
                    formValue={form.customer_number}
                    onChange={(v) => set("customer_number", v)}
                  />
                  <Field
                    edit={isEdit("weitere")}
                    label={t("belege.detail.field.zahlungsart")}
                    value={beleg.payment_method}
                    formValue={form.payment_method}
                    onChange={(v) => set("payment_method", v)}
                  />
                  <Field
                    edit={isEdit("weitere")}
                    label={t("belege.detail.field.verwendungszweck")}
                    copy
                    value={beleg.payment_reference}
                    formValue={form.payment_reference}
                    onChange={(v) => set("payment_reference", v)}
                  />
                  <Field
                    edit={isEdit("weitere")}
                    label={t("belege.detail.field.empfaengerAnschrift")}
                    value={beleg.recipient_address}
                    formValue={form.recipient_address}
                    onChange={(v) => set("recipient_address", v)}
                  />
                  <Field
                    edit={isEdit("weitere")}
                    label={t("belege.detail.field.steuerhinweis")}
                    value={beleg.tax_note}
                    formValue={form.tax_note}
                    onChange={(v) => set("tax_note", v)}
                  />
                </div>
                {/* Full width under the grid: a service description is a sentence, not a field
                    value, and in a third of a row it wrapped to four lines. Moved here with the
                    issuer's address, off the assignment card, which is now only the four things
                    that decide where an invoice belongs. */}
                <div className="mt-4">
                  {isEdit("weitere") ? (
                    <div className="space-y-1">
                      <span className="text-sm text-muted-foreground">
                        {t("belege.detail.field.leistungsbeschreibung")}
                      </span>
                      <Textarea
                        value={form.service_description}
                        onChange={(e) => set("service_description", e.target.value)}
                        rows={2}
                      />
                    </div>
                  ) : beleg.service_description ? (
                    <div>
                      <div className="text-sm text-muted-foreground">
                        {t("belege.detail.field.leistungsbeschreibung")}
                      </div>
                      <p className="mt-1 text-base text-foreground">{beleg.service_description}</p>
                    </div>
                  ) : null}
                </div>
              </Section>

              {/* Where this document came in. Lifted out of the sticky preview column: it is
                  provenance, looked at once when something looks wrong, and it was occupying the
                  half of the screen meant for reading the document itself. */}
              <Section title={t("belege.detail.section.eingang")}>
                <div className="flex items-center justify-between text-base">
                  <span className="text-muted-foreground">
                    {t("belege.detail.meta.eingangskanal")}
                  </span>
                  <KanalBadge kanal={beleg.intake_channel} />
                </div>
                <Separator className="my-3" />
                <div className="text-base">
                  <Meta
                    label={t("belege.detail.meta.eingegangen")}
                    value={formatDateTime(beleg.created_at)}
                  />
                  <Meta
                    label={t("belege.detail.meta.faellig")}
                    value={formatDate(beleg.due_date)}
                  />
                  {/* `source` is dropped, not moved. It printed the raw column -- "mailbox",
                      lowercase and untranslated -- directly under Eingangskanal, which says the
                      same thing in the reader's language. */}
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-muted-foreground">
                      {t("belege.detail.meta.belegart")}
                    </span>
                    {beleg.document_type ? (
                      <BelegartBadge belegart={beleg.document_type} />
                    ) : (
                      <span className="text-foreground">—</span>
                    )}
                  </div>
                </div>
              </Section>

              {beleg.extracted && <RohdatenDialog extracted={beleg.extracted} />}
            </TabsContent>

            {/* Tab: Lieferant — supplier master data & bank/transfer details */}
            <TabsContent value="lieferant" className="mt-6 space-y-8">
              <PlainSection title={t("belege.detail.section.lieferant")}>
                <div id={LIEFERANT_ANKER} className="scroll-mt-24">
                  {beleg.supplier_id && lieferant ? (
                    <div className="grid gap-x-12 gap-y-3.5 sm:grid-cols-2">
                      <FactList
                        facts={[
                          {
                            label: t("belege.detail.lieferant.name"),
                            value: lieferant.name,
                            node: (
                              <Link
                                to="/lieferanten/$id"
                                params={{ id: lieferant.id }}
                                className="underline decoration-muted-foreground/40 underline-offset-4 transition-colors hover:text-brand-dark hover:decoration-brand"
                              >
                                {lieferant.name}
                              </Link>
                            ),
                          },
                          { label: t("belege.detail.lieferant.ustId"), value: lieferant.vat_id },
                          {
                            label: t("belege.detail.lieferant.ansprechpartner"),
                            value: lieferant.contact_person,
                          },
                        ]}
                      />
                      <FactList
                        facts={[
                          {
                            label: t("belege.detail.lieferant.anschrift"),
                            value: lieferant.address,
                          },
                          { label: t("belege.detail.lieferant.telefon"), value: lieferant.phone },
                        ]}
                      />
                    </div>
                  ) : (
                    <p className="text-base text-muted-foreground">
                      {t("belege.detail.lieferant.none")}
                    </p>
                  )}
                </div>
              </PlainSection>

              {beleg.supplier_id && lieferant && (
                <PlainSection title={t("belege.detail.lieferant.konten.titel")}>
                  {/* Master data, nothing else: this is who the supplier is and where they bank.
                      Paying is an act on THIS invoice, so the button lives on the Zahlung tab. */}
                  <PaymentAccounts {...zahlkontenPanel} />
                  {/* Somebody looking at the IBANs is often about to pay, and the button they
                      expect beside them is one tab over. Say so, and take them to it. */}
                  <p className="mt-4 text-base text-muted-foreground">
                    <Trans
                      i18nKey="belege.detail.lieferant.konten.zahlungHinweis"
                      values={{ tab: t("belege.detail.tab.zahlung") }}
                      components={{
                        tabLink: (
                          <button
                            type="button"
                            onClick={() => springeZu("zahlung", UEBERWEISUNG_ANKER)}
                            className="cursor-pointer font-medium text-brand-dark underline decoration-brand/40 underline-offset-4 transition-colors hover:decoration-brand"
                          />
                        ),
                      }}
                    />
                  </p>
                </PlainSection>
              )}
            </TabsContent>

            <BankAccountDialog
              open={kontoWahlOffen}
              onOpenChange={setKontoWahlOffen}
              existingIbans={alleKonten.map((k) => k.iban)}
              saving={neuesLieferantenKonto.isPending}
              labels={{
                title: t("lieferanten.detail.bankkonten.dialog.title"),
                iban: t("lieferanten.detail.bankkonten.col.iban"),
                bic: t("lieferanten.detail.bankkonten.col.bic"),
                bank: t("lieferanten.detail.bankkonten.col.bank"),
                cancel: t("lieferanten.detail.bankkonten.dialog.abbrechen"),
                save: t("lieferanten.detail.bankkonten.dialog.speichern"),
                invalidIban: t("lieferanten.detail.bankkonten.toast.ungueltig"),
                duplicateIban: t("lieferanten.detail.bankkonten.toast.bereitsVorhanden"),
              }}
              onSave={(input) =>
                neuesLieferantenKonto.mutate(input, {
                  onSuccess: () => {
                    setKontoWahlOffen(false);
                    toast.success(
                      t("lieferanten.detail.bankkonten.toast.hinzugefuegt", {
                        iban: formatIBAN(input.iban),
                      }),
                    );
                  },
                  onError: (e) =>
                    toast.error(t("belege.detail.toast.fehlgeschlagen", { error: fehlerText(e) })),
                })
              }
            />

            <TabsContent value="verlauf" className="mt-4 space-y-6">
              {/* Notes first. It is the only thing on this tab a person WRITES, and it was
                  last, under the OCR text and the processing log, so adding a note meant
                  scrolling past two things nobody opens this tab for. Then the mail it
                  arrived in, then what the machine did with it, then the raw read text. */}

              {/* E-Mail — envelope metadata of the source email (Briefing Screen 2), only for
                  mail-imported invoices with a matching processing_log entry. */}
              {beleg.intake_channel === "email" && emailLog && (
                <Section title={t("belege.detail.section.email")}>
                  <Meta label={t("belege.detail.meta.betreff")} value={emailLog.subject ?? "—"} />
                  <Meta label={t("belege.detail.meta.absender")} value={emailLog.sender ?? "—"} />
                  <Meta
                    label={t("belege.detail.meta.gesendetAm")}
                    value={formatDateTime(emailLog.sent_at)}
                  />
                  {emailLog.body && (
                    <details className="mt-3">
                      <summary className="cursor-pointer text-base text-brand-dark">
                        {t("belege.detail.mailtextShow")}
                      </summary>
                      <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">
                        {emailLog.body}
                      </pre>
                    </details>
                  )}
                </Section>
              )}

              {/* 7. Volltext */}
              {volltext && (
                <Section title={t("belege.detail.section.volltext")}>
                  <details>
                    <summary className="cursor-pointer text-base text-brand-dark">
                      {t("belege.detail.volltextShow")}
                    </summary>
                    <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">
                      {volltext}
                    </pre>
                  </details>
                </Section>
              )}

              {/* 3. Notizen & Verlauf */}
              <Section title={t("belege.detail.section.notizen")} anchorId={NOTIZEN_ANKER}>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Textarea
                    value={notiz}
                    onChange={(e) => setNotiz(e.target.value)}
                    placeholder={t("belege.detail.notiz.placeholder")}
                    rows={2}
                    className="flex-1"
                  />
                  <Button
                    onClick={notizSpeichern}
                    disabled={!notiz.trim() || addNotiz.isPending}
                    className="sm:self-start"
                  >
                    {t("belege.detail.notiz.save")}
                  </Button>
                </div>
                <div className="mt-4">
                  {verlaufQ.isLoading ? (
                    <Skeleton className="h-16 w-full" />
                  ) : generalHistory.length > 0 ? (
                    <ol className="space-y-3">
                      {generalHistory.map((v) => (
                        <li key={v.id} className="flex gap-3">
                          <span
                            className={cn(
                              "mt-1.5 size-2 shrink-0 rounded-full",
                              v.type === "note"
                                ? "bg-brand"
                                : v.type === "deletion"
                                  ? "bg-red-500"
                                  : "bg-muted-foreground/50",
                            )}
                          />
                          <div className="min-w-0">
                            <p className="text-base font-medium text-foreground">
                              {verlaufTypLabel(v.type, t)}
                            </p>
                            {/* Field changes are listed one per row rather than run together on a
                                line: the point of the entry is that each value is checkable on its
                                own. `lines` is written by the save; older entries and entries from
                                the database triggers only have `text`, so that is the fallback. */}
                            {verlaufZeilen(v, t).length > 0 ? (
                              <ul className="mt-0.5 space-y-0.5">
                                {verlaufZeilen(v, t).map((line, i) => (
                                  <li key={i} className="text-base text-foreground">
                                    {line}
                                  </li>
                                ))}
                              </ul>
                            ) : null}
                            <p className="mt-0.5 text-sm text-muted-foreground">
                              {v.actor ?? t("belege.detail.actorSystem")} ·{" "}
                              {formatDateTime(v.created_at)}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="text-base text-muted-foreground">
                      {t("belege.detail.notiz.empty")}
                    </p>
                  )}
                </div>
              </Section>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Unsaved edits. Deliberately NOT a native confirm(): it names the fields, so the choice is
          informed rather than "are you sure?". Both routes into it -- a tab click and leaving the
          invoice -- ask the same question, because from where the person is sitting they are the
          same event: the form is about to close. */}
      <AlertDialog
        open={verwerfenFrage}
        onOpenChange={(o) => {
          if (!o) weiterBearbeiten();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("belege.detail.ungespeichert.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("belege.detail.ungespeichert.body", {
                count: geaenderteFelder.length,
                felder: geaenderteFelder.join(", "),
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={weiterBearbeiten}>
              {t("belege.detail.ungespeichert.weiter")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={aenderungenVerwerfen}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("belege.detail.ungespeichert.verwerfen")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reassignment confirmation: overwriting an already-set company/property is explicit. */}
      <AlertDialog open={reassign != null} onOpenChange={(o) => !o && setReassign(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("belege.detail.zuordnung.reassignTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("belege.detail.zuordnung.reassignDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="space-y-1 rounded-lg bg-muted/40 px-3 py-2 text-base text-foreground">
            {reassign?.lines.map((line) => (
              <li key={line} className="font-medium">
                {line}
              </li>
            ))}
          </ul>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("belege.detail.action.abbrechen")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                reassign &&
                commitSpeichern(
                  reassign.changes,
                  reassign.before,
                  reassign.labels,
                  reassign.changeLines,
                  reassign.istZuordnung,
                )
              }
            >
              {t("belege.detail.zuordnung.reassignConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// Approval flow as an ordered progress display: every stage is shown, the ones before the current
// one read as "done", and the current one is highlighted in brand colour. The same full row renders
// at every width — mobile just wraps it onto more lines instead of showing a cut-down substitute —
// so nothing scrolls and nothing is hidden. Read-only — actual transitions go through the gated

/**
 * A short hover label saying what a value IS.
 *
 * Deliberately one noun phrase, not a sentence: the header is dense with figures whose meaning is
 * obvious once you know the system, and the question a reader has is "what is this?", not "explain
 * this to me". A paragraph in a tooltip is read by nobody.
 */
/**
 * "None", said as a decision rather than an absence.
 *
 * An empty property or category renders as "—", which is indistinguishable from a field nobody has
 * looked at yet. Once a person has chosen "none" the stamp is on the row, so the value can say so
 * -- otherwise the attention card stops asking while the field still looks unanswered, which reads
 * like the card gave up rather than like somebody decided.
 */
function KeineWahlWert() {
  const { t } = useTranslation();
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-muted-foreground">{t("belege.detail.eingabe.keine")}</span>
      {/* The provenance chip this screen already uses everywhere else, rather than a second one
          that means the same thing. `hasValue` is true on purpose: the value here IS the decision,
          and fieldSourceKey renders nothing at all when it is false. */}
      <QuelleBadge source="human" hasValue />
    </span>
  );
}

// `label` is a node, not a string: most of these are one noun phrase, but the review chip needs
// to list the actual reasons rather than repeat its own name back at the reader.
/**
 * InfoTip that does something when clicked.
 *
 * Separate from InfoTip rather than an optional prop on it: a tooltip you may click and one you may
 * only read want different cursors, different affordances and different elements underneath, and
 * a `cursor-help` span that silently became interactive is the version nobody notices is clickable.
 */
// The ladder takes a router-agnostic link. Declared at module scope, not inside the page: a
// component identity that changes every render would remount the circle it draws.
const LadderLink: WorkflowLadderLinkComponent = forwardRef<
  HTMLAnchorElement,
  WorkflowLadderLinkProps
>(function LadderLink({ to, className, "aria-label": ariaLabel }, ref) {
  return <Link ref={ref} to={to} className={className} aria-label={ariaLabel} />;
});

const APPROVAL_ACTION_ICON: Record<ApprovalActionId, typeof Check> = {
  complete: CircleCheck,
  send_for_review: Send,
  approve: Check,
  final_approve: CheckCheck,
  return_with_query: MessageCircleQuestion,
  reject: X,
};

// Gated action buttons (Briefing Screen 6): only the actions `nextLegalActions` returned for the

// KEEP IN SYNC with IBAN_CHANGE_LOOKBACK_DAYS in supabase/functions/payment-initiate/index.ts.
// This is only the client-side PREVIEW banner; payment-initiate's own copy is the real,
// server-side hard-stop. Changing one without the other means the UI warning and the actual
// payment block disagree — the UI could show no warning while the server still blocks the
// payment, or vice versa. No shared config exists between the Deno function runtime and this
// app to enforce this mechanically; see docs/BANKSAPI_PAYMENT_INITIATION.md open questions
// (the 90-day figure itself is also still an open business question, not just this duplication).
const IBAN_CHANGE_LOOKBACK_DAYS = 90;

function paymentOrderStatusLabel(
  t: ReturnType<typeof useTranslation>["t"],
  status: string,
): string {
  return t(`belege.detail.lieferant.zahlung.statusValue.${status}`, { defaultValue: status });
}

// "Jetzt bezahlen" — trigger a BANKSapi payment for this invoice (docs/BANKSAPI_PAYMENT_INITIATION.md,
// migration 0081). Role-gated client-side for UX only; the payment-initiate Edge Function is the
// real authorization boundary and re-checks supervisor/admin/super_admin server-side. Hidden
// entirely (not just disabled) for anyone else, matching the existing "whoever may not approve
// doesn't see the button" convention (Screen 6, docs/ROLES_AND_ACCESS.md).
function JetztBezahlenSection({
  beleg,
  lieferant,
  vorgeschlagenesKonto,
  chipsFuer,
}: {
  beleg: Beleg;
  lieferant: Lieferant;
  /** The account this invoice named, which is what the dialog opens on. Null falls back to the default. */
  vorgeschlagenesKonto: string | null;
  /** What is true of an account, in the host's words, so the list says which is which. */
  chipsFuer: (id: string) => AccountChip[];
}) {
  const { t } = useTranslation();
  const { appUserId } = useAuth();
  // The granted permission alone. A role check beside it would silently override what Team & Rollen
  // says, which is the whole point of the permission existing. Asked of the person being ACTED AS,
  // like every other gate on this screen -- this section is a separate component, so it resolves
  // that itself rather than taking it as a prop (React Query dedupes the underlying reads).
  const { darfAlsPerson, istFremdeIdentitaet } = useActingCapabilities();
  const canTriggerPayment = darfAlsPerson(PERMISSIONS.paymentsWrite);

  const ordersQ = usePaymentOrders(beleg.id);
  const accountsQ = useBankAccounts();
  const empfaengerKontenQ = useSupplierBankAccounts(lieferant.id);
  const neuesKonto = useAddSupplierBankAccount(lieferant.id);
  const initiatePayment = useInitiatePayment();
  const cancelPayment = useCancelPaymentOrder();

  const [open, setOpen] = useState(false);
  const [bankAccountId, setBankAccountId] = useState("");
  // Which of the SUPPLIER's accounts gets paid. An id, never a typed IBAN: the choice is always
  // one of the accounts on file, so there is no path from this dialog to an arbitrary destination.
  const [empfaengerKontoId, setEmpfaengerKontoId] = useState("");
  // The amount is editable -- a part payment, or a corrected sum where the invoice total is wrong.
  // Held as a string so a half-typed "12," is not silently rewritten while it is being entered.
  const [betragEingabe, setBetragEingabe] = useState("");
  const [neueIbanOffen, setNeueIbanOffen] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState("");
  // Fallback for when the synchronous-popup trick in confirm() still gets blocked (some browsers
  // block window.open("", "_blank") itself outside a "trusted" click) — kept until the attempt
  // leaves pending_sca, so there's always a real, unambiguous click available to open it.
  const [pendingWebformUrl, setPendingWebformUrl] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);

  // WITHOUT THE PAY PERMISSION THE BUTTON IS SHOWN, DISABLED, WITH THE REASON ON HOVER. It used to
  // be hidden outright, following the "whoever may not approve does not see the button" convention
  // in docs/ROLES_AND_ACCESS.md. That convention hides a button somebody else will press; this one
  // is the last step of an invoice they are otherwise working on, and a control that is simply
  // absent reads as "this invoice cannot be paid" rather than "not by you" (client, 09.09.2026).
  if (!canTriggerPayment) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          {/* A disabled button does not reliably fire hover events, so the reason needs a
              focusable host. */}
          <span tabIndex={0} className="inline-block">
            <Button type="button" size="sm" disabled className="pointer-events-none">
              <Send className="mr-1.5 size-4" />
              {t("belege.detail.lieferant.zahlung.jetztBezahlen")}
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>{t("belege.detail.zahlung.keineZahlBerechtigung")}</TooltipContent>
      </Tooltip>
    );
  }

  const ordersLoading = ordersQ.isLoading;
  const accountsLoading = accountsQ.isLoading;
  const orders = ordersQ.data ?? [];
  const latest = orders[0] ?? null;
  const hasOpenAttempt =
    !!latest &&
    (latest.status === "draft" ||
      latest.status === "pending_sca" ||
      latest.status === "authorized");
  // Both company_id fields are nullable — a plain === would let two unrelated "no company
  // assigned" rows match each other, offering an unverified account as a payment source for an
  // unclassified invoice. Both sides must be a real, equal, non-null id.
  const accounts = (accountsQ.data ?? []).filter(
    (a) => !!beleg.company_id && a.company_id === beleg.company_id && !!a.provider_account_ref,
  );

  // A masked IBAN is on file so somebody can complete it, and is not a thing money can be sent to.
  // payment-initiate refuses one too; leaving it out of the list means nobody gets that far.
  const empfaengerKontenLaedt = empfaengerKontenQ.isLoading;
  const empfaengerKonten = (empfaengerKontenQ.data ?? []).filter(
    (k) => k.is_active && k.is_payable !== false,
  );
  const empfaengerKonto = empfaengerKonten.find((k) => k.id === empfaengerKontoId) ?? null;
  const betrag = Number(betragEingabe.replace(",", "."));
  const betragGueltig = Number.isFinite(betrag) && betrag > 0;

  // 'approved_final' IS the "awaiting payment" state (migration 0037/0048). UX gate
  // only — payment-initiate enforces this server-side too, since that's the real authorization
  // boundary.
  const alreadyPaid = !!beleg.paid_at || (!!latest && latest.status === "executed");

  // SOME REASONS END THE CONVERSATION. "Already paid" and "collected by direct debit" are not
  // obstacles on the way to paying, they are statements that paying is not the thing to do at all.
  // Listing them beside "must first be approved by the supervisor" produced a tooltip that
  // contradicted itself: an invoice that is already paid does not need approving, and a reader
  // cannot tell which half to believe. When one of these holds, it is the whole answer.
  const abschliessenderGrund = alreadyPaid
    ? t("belege.detail.lieferant.zahlung.deaktiviertGrund.bereitsBezahlt")
    : istLastschrift(beleg.payment_method)
      ? t("belege.detail.lieferant.zahlung.deaktiviertGrund.lastschrift")
      : null;

  const disabledReasons = abschliessenderGrund
    ? [abschliessenderGrund]
    : [
        !empfaengerKontenLaedt &&
          empfaengerKonten.length === 0 &&
          t("belege.detail.lieferant.zahlung.deaktiviertGrund.keinIban"),
        beleg.workflow_status !== "approved_final" &&
          t("belege.detail.lieferant.zahlung.deaktiviertGrund.nichtFreigegeben"),
        // The two-person rule. payment-initiate and payment_orders' INSERT policy both refuse this
        // too; saying so here is what turns a refusal into an explanation.
        //
        // ACTING AS SOMEBODY ELSE DOES NOT LIFT IT, and the wording has to say so. The policy compares
        // invoices.approved_by against the JWT's email (migration 20260829150000), i.e. the account
        // that logged in -- it knows nothing about the identity picked in "Handeln als". So the block
        // is right, but "You approved this invoice" read as a lie while acting as Petra, who did not:
        // it named the wrong person and left the reader to guess why switching identity changed
        // nothing. The second sentence exists to answer that.
        !!beleg.approved_by &&
          beleg.approved_by === appUserId &&
          t(
            istFremdeIdentitaet
              ? "belege.detail.lieferant.zahlung.deaktiviertGrund.selbstFreigegebenFremd"
              : "belege.detail.lieferant.zahlung.deaktiviertGrund.selbstFreigegeben",
          ),
        // While ordersQ/accountsQ are still loading, their ?? [] fallback is indistinguishable from
        // "genuinely none found" — show a neutral loading reason instead of guessing at one derived
        // from data that hasn't arrived yet (a supervisor would otherwise briefly see "no bank
        // account found" on a company that has one).
        ordersLoading || accountsLoading || empfaengerKontenLaedt
          ? t("belege.detail.lieferant.zahlung.deaktiviertGrund.wirdGeladen")
          : null,
        !ordersLoading &&
          hasOpenAttempt &&
          t("belege.detail.lieferant.zahlung.deaktiviertGrund.offenerVersuch"),
        !accountsLoading &&
          accounts.length === 0 &&
          t("belege.detail.lieferant.zahlung.deaktiviertGrund.keinKonto"),
      ].filter((reason): reason is string => !!reason);

  function openDialog() {
    setIdempotencyKey(crypto.randomUUID());
    setBankAccountId(accounts[0]?.id ?? "");
    // Opens on the account THIS invoice named, so the common case is one click. Whoever is paying
    // can still switch to any other account the supplier has, or add one.
    const vorgeschlagen = empfaengerKonten.find((k) => k.id === vorgeschlagenesKonto);
    setEmpfaengerKontoId(
      (vorgeschlagen ?? empfaengerKonten.find((k) => k.is_default) ?? empfaengerKonten[0])?.id ??
        "",
    );
    setBetragEingabe(beleg.amount_gross != null ? String(beleg.amount_gross) : "");
    setNeueIbanOffen(false);
    setPendingWebformUrl(null);
    setOpen(true);
  }

  function confirm() {
    if (!bankAccountId || !empfaengerKontoId || !betragGueltig) return;
    // Open a blank tab SYNCHRONOUSLY, in the same call stack as this click (AlertDialogAction's
    // onClick), then redirect it once the webform URL comes back from the async mutation.
    // Browsers' popup-block heuristics key off "was this window.open() a direct, synchronous
    // continuation of a user gesture" — a window.open() called from inside the mutation's
    // onSuccess callback (after an awaited network round trip) fails that check and gets silently
    // blocked. Deliberately no "noopener": the returned handle is needed to redirect it later.
    const popup = window.open("", "_blank");
    initiatePayment.mutate(
      {
        invoiceId: beleg.id,
        bankAccountId,
        idempotencyKey,
        recipientAccountId: empfaengerKontoId,
        amount: betrag,
      },
      {
        onSuccess: (data) => {
          setOpen(false);
          if (data.webformUrl) {
            setPendingWebformUrl(data.webformUrl);
            if (popup && !popup.closed) {
              popup.location.href = data.webformUrl;
            } else {
              // The synchronous open above was itself blocked (happens on some strict configs) —
              // one more best-effort attempt; if that's also blocked, the status line below still
              // offers a manual "open" link for as long as the attempt stays pending_sca.
              window.open(data.webformUrl, "_blank", "noopener,noreferrer");
            }
            toast.success(t("belege.detail.lieferant.zahlung.ausgeloest"));
          } else {
            popup?.close(); // no webform needed (e.g. mock auto-complete) — close the blank tab
            if (data.paymentOrder.status === "executed") {
              toast.success(t("belege.detail.lieferant.zahlung.sofortAusgefuehrt"));
            } else if (data.paymentOrder.status === "failed") {
              toast.error(
                t("belege.detail.lieferant.zahlung.sofortFehlgeschlagen", {
                  grund: data.paymentOrder.status_reason ?? "—",
                }),
              );
            } else {
              toast.success(t("belege.detail.lieferant.zahlung.ausgeloest"));
            }
          }
        },
        onError: (e) => {
          popup?.close();
          // The dialog stays open here (unlike onSuccess) so the user can retry immediately —
          // but payment-initiate's idempotency check returns any existing row for a repeated key
          // VERBATIM, including one it already marked 'failed' server-side before this error was
          // thrown. Without a fresh key, "try again" would silently replay the same failure
          // instead of actually calling BANKSapi again. payment_orders' own design is one row per
          // ATTEMPT, so a retry belongs on a new row, same as reopening the dialog already does
          // via openDialog().
          setIdempotencyKey(crypto.randomUUID());
          toast.error(
            t("belege.detail.toast.fehlgeschlagen", {
              error: fehlerText(e),
            }),
          );
        },
      },
    );
  }

  // Abandon a stuck attempt (SCA webform never completed, tab closed by mistake, etc.) so
  // "Jetzt bezahlen" is clickable again — otherwise hasOpenAttempt keeps the button disabled with
  // no way out short of editing the database.
  function cancelAttempt() {
    if (!latest) return;
    cancelPayment.mutate(
      { paymentOrderId: latest.id, invoiceId: beleg.id },
      {
        onSuccess: () => {
          setCancelOpen(false);
          setPendingWebformUrl(null);
          toast.success(t("belege.detail.lieferant.zahlung.abbrechenToast"));
        },
        onError: (e) =>
          toast.error(
            t("belege.detail.toast.fehlgeschlagen", {
              error: fehlerText(e),
            }),
          ),
      },
    );
  }

  return (
    <div className="mt-4 space-y-2">
      {latest && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{t("belege.detail.lieferant.zahlung.status")}</span>
          <div className="flex items-center gap-2">
            <span className="font-medium text-foreground">
              {paymentOrderStatusLabel(t, latest.status)}
            </span>
            {hasOpenAttempt && (
              <button
                type="button"
                onClick={() => setCancelOpen(true)}
                className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                {t("belege.detail.lieferant.zahlung.attemptAbbrechen")}
              </button>
            )}
          </div>
        </div>
      )}
      {/* Fallback in case the synchronous window.open() trick in confirm() still got blocked —
          a real click here always works, unlike a further programmatic attempt would. */}
      {latest?.status === "pending_sca" && pendingWebformUrl && (
        <a
          href={pendingWebformUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-sm text-brand-dark underline-offset-4 hover:underline"
        >
          {t("belege.detail.lieferant.zahlung.webformOeffnen")}
          <ExternalLink className="size-3" />
        </a>
      )}
      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("belege.detail.lieferant.zahlung.abbrechenConfirmTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("belege.detail.lieferant.zahlung.abbrechenConfirmBody")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("belege.detail.workflow.abbrechen")}</AlertDialogCancel>
            <AlertDialogAction disabled={cancelPayment.isPending} onClick={cancelAttempt}>
              {t("belege.detail.lieferant.zahlung.attemptAbbrechen")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {disabledReasons.length > 0 ? (
        <Tooltip>
          <TooltipTrigger asChild>
            {/* Native disabled buttons don't reliably fire hover/pointer events in every
                  browser (Button applies disabled:pointer-events-none) -- wrap in a focusable
                  span so the tooltip still triggers on hover and keyboard focus. */}
            <span tabIndex={0} className="inline-block">
              <Button type="button" size="sm" disabled className="pointer-events-none">
                <Send className="mr-1.5 size-4" />
                {t("belege.detail.lieferant.zahlung.jetztBezahlen")}
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>
            <ul className="list-disc space-y-0.5 pl-3.5">
              {disabledReasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </TooltipContent>
        </Tooltip>
      ) : (
        <Button type="button" size="sm" disabled={initiatePayment.isPending} onClick={openDialog}>
          <Send className="mr-1.5 size-4" />
          {t("belege.detail.lieferant.zahlung.jetztBezahlen")}
        </Button>
      )}
      {/* A Dialog, not an AlertDialog: this one closes on a click outside. Nothing is lost by
          backing out of it, and Radix's AlertDialog blocks outside clicks in a way no prop can
          undo. */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("belege.detail.lieferant.zahlung.confirmTitle")}</DialogTitle>
            <DialogDescription>
              {t("belege.detail.lieferant.zahlung.confirmBody", {
                empfaenger: lieferant.name,
                betrag: formatEUR(betragGueltig ? betrag : (beleg.amount_gross ?? 0)),
              })}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-base">
            <div>
              <Label className="text-sm text-muted-foreground">
                {t("belege.detail.lieferant.zahlung.anKonto")}
              </Label>
              <Select value={empfaengerKontoId} onValueChange={setEmpfaengerKontoId}>
                {/* h-auto: the value is two lines, and the default single-line height crushed them
                    together against the edges of the control. */}
                <SelectTrigger className="mt-1 h-auto py-2">
                  <SelectValue placeholder={t("belege.detail.lieferant.zahlung.kontoWaehlen")} />
                </SelectTrigger>
                <SelectContent>
                  {empfaengerKonten.map((k) => (
                    <SelectItem key={k.id} value={k.id}>
                      {/* Two lines: an IBAN and its provenance on one line ran wider than the
                          dialog and pushed the whole modal into a horizontal scroll. */}
                      <span className="flex flex-col gap-1 py-0.5 text-left">
                        {/* The same marks as the supplier panel, beside the number they qualify,
                            so an account reads the same way wherever it appears. */}
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-mono">{formatIBAN(k.iban)}</span>
                          <AccountChips
                            chips={chipsFuer(k.id)}
                            infoLabel={t("belege.detail.lieferant.zahlkonto.chip.info")}
                          />
                        </span>
                        {(k.bank_name || k.bic) && (
                          <span className="text-xs text-muted-foreground">
                            {[k.bank_name, k.bic].filter(Boolean).join(" · ")}
                          </span>
                        )}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* An account nobody has vouched for yet is exactly the case this warning exists
                  for, so it is said here, where the money is about to move, not only on the panel. */}
              {empfaengerKonto && !empfaengerKonto.confirmed_at && (
                <p className="mt-1 flex items-start gap-1.5 text-sm text-amber-800">
                  <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                  {t("belege.detail.lieferant.konten.neuHinweis")}
                </p>
              )}

              {/* The same dialog the supplier screen uses, so the IBAN is validated the same way
                  here. The bespoke form this replaces had no check at all: any text enabled Save
                  and the only thing that stopped it was the database. */}
              {/* No hover fill: it sits flush against the field above with no padding of its own,
                  so a ghost button's background lit up a bar wider than the text it belongs to. */}
              {/* No hover fill: it sits flush against the field above with no padding of its own,
                  so a ghost button's background lit up a bar wider than the text it belongs to.
                  gap-0 and an inline icon so the plus reads as part of the word, and so the hover
                  underline runs under it: Button is inline-flex, and a line drawn on a flex
                  container never reaches a flex-item icon. */}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="group mt-1 h-auto gap-0 px-0 text-sm hover:bg-transparent hover:text-brand-dark"
                onClick={() => setNeueIbanOffen(true)}
              >
                <span className="underline-offset-4 group-hover:underline">
                  <Plus className="inline size-3.5 align-[-0.15em]" />
                  {t("belege.detail.lieferant.zahlung.neuesKonto.hinzufuegen")}
                </span>
              </Button>
              <BankAccountDialog
                open={neueIbanOffen}
                onOpenChange={setNeueIbanOffen}
                existingIbans={(empfaengerKontenQ.data ?? []).map((k) => k.iban)}
                saving={neuesKonto.isPending}
                labels={{
                  title: t("lieferanten.detail.bankkonten.dialog.title"),
                  iban: t("lieferanten.detail.bankkonten.col.iban"),
                  bic: t("lieferanten.detail.bankkonten.col.bic"),
                  bank: t("lieferanten.detail.bankkonten.col.bank"),
                  cancel: t("lieferanten.detail.bankkonten.dialog.abbrechen"),
                  save: t("lieferanten.detail.bankkonten.dialog.speichern"),
                  invalidIban: t("lieferanten.detail.bankkonten.toast.ungueltig"),
                  duplicateIban: t("lieferanten.detail.bankkonten.toast.bereitsVorhanden"),
                }}
                onSave={(input) =>
                  neuesKonto.mutate(input, {
                    onSuccess: (id) => {
                      // Adding an account here is always a step towards paying it, so it becomes
                      // the selected recipient straight away.
                      setEmpfaengerKontoId(id);
                      setNeueIbanOffen(false);
                      toast.success(
                        t("lieferanten.detail.bankkonten.toast.hinzugefuegt", {
                          iban: formatIBAN(input.iban),
                        }),
                      );
                    },
                    onError: (e) =>
                      toast.error(
                        t("belege.detail.toast.fehlgeschlagen", { error: fehlerText(e) }),
                      ),
                  })
                }
              />
            </div>

            <div>
              <Label className="text-sm text-muted-foreground">
                {t("belege.detail.lieferant.betrag")}
              </Label>
              <Input
                className="mt-1 tabular-nums"
                type="number"
                step="0.01"
                min="0"
                value={betragEingabe}
                onChange={(e) => setBetragEingabe(e.target.value)}
              />
              {/* Paying something other than the invoice total is allowed, but never silently:
                  a part payment and a typo look identical until one of them is pointed out. */}
              {/* The line always occupies its row, so typing a different amount does not push the
                  summary card below it down by a line. */}
              <p className="mt-1 min-h-[1.25rem] text-sm text-amber-800">
                {betragGueltig && beleg.amount_gross != null && betrag !== beleg.amount_gross
                  ? t("belege.detail.lieferant.zahlung.betragWeichtAb", {
                      betrag: formatEUR(beleg.amount_gross),
                    })
                  : null}
              </p>
            </div>

            {/* What is about to leave the account, assembled from the choices above rather than
                from the invoice, so the last thing read before confirming is the transfer itself. */}
            <div className="rounded-lg border border-brand-soft/50 bg-brand-wash p-3">
              <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
                {t("belege.detail.lieferant.zahlung.zusammenfassung")}
              </p>
              <dl className="space-y-1.5 text-base">
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-muted-foreground">
                    {t("belege.detail.lieferant.verwendungszweck")}
                  </dt>
                  <dd className="text-right">{beleg.invoice_number ?? "—"}</dd>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-muted-foreground">{t("belege.detail.lieferant.iban")}</dt>
                  <dd className="text-right font-mono">
                    {empfaengerKonto ? formatIBAN(empfaengerKonto.iban) : "—"}
                    {empfaengerKonto && (empfaengerKonto.bank_name || empfaengerKonto.bic) && (
                      <span className="block font-sans text-sm text-muted-foreground">
                        {[empfaengerKonto.bank_name, empfaengerKonto.bic]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    )}
                  </dd>
                </div>
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-muted-foreground">{t("belege.detail.lieferant.betrag")}</dt>
                  <dd className="text-right font-semibold tabular-nums">
                    {betragGueltig ? formatEUR(betrag) : "—"}
                  </dd>
                </div>
              </dl>
            </div>
            <div>
              <Label className="text-sm text-muted-foreground">
                {t("belege.detail.lieferant.zahlung.vonKonto")}
              </Label>
              <Select value={bankAccountId} onValueChange={setBankAccountId}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder={t("belege.detail.lieferant.zahlung.kontoWaehlen")} />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.account_name ?? a.iban ?? a.id}
                      {a.iban ? ` (${formatIBAN(a.iban)})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {t("belege.detail.workflow.abbrechen")}
            </Button>
            {/* Deliberately not a Close: confirm() keeps the dialog open when the call fails, so
                whoever is paying can correct the amount or the account and try again. */}
            <Button
              type="button"
              disabled={
                !bankAccountId || !empfaengerKontoId || !betragGueltig || initiatePayment.isPending
              }
              onClick={confirm}
            >
              {t("belege.detail.lieferant.zahlung.bestaetigen")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Payment reconciliation card: derived abgleich status + matched/candidate bank
// transactions with confirm/reject. Matching only links records — no payment is triggered.
// The header's reconciliation badge scrolls here, so the id lives next to both users of it
// rather than as a string typed twice.

function ZahlungAbgleichSection({ beleg }: { beleg: Beleg }) {
  const { t } = useTranslation();
  const { mayPay, reason: keinZahlrecht } = usePaymentRight();
  const matchesQ = useBelegMatches(beleg.id);
  const confirmMatch = useConfirmMatch();
  const rejectMatch = useRejectMatch();
  const unlinkMatch = useUnlinkMatch();
  const closeRemainder = useCloseInvoiceRemainder();
  const reopenRemainder = useReopenInvoiceRemainder();
  // H7 (client meeting 09.09.2026): a CONFIRMED match had no control on this screen at all. Undoing
  // one meant leaving the invoice, finding the transaction again and unlinking from the bank side,
  // which is not where anybody notices the link is wrong.
  const unlinkLabels: UnlinkMatchLabels = {
    action: t("belege.detail.abgleich.trennen"),
    title: t("belege.detail.abgleich.trennenDialog.title"),
    description: t("belege.detail.abgleich.trennenDialog.desc"),
    reasonLabel: t("belege.detail.abgleich.trennenDialog.grundLabel"),
    reasonPlaceholder: t("belege.detail.abgleich.trennenDialog.grundPlaceholder"),
    cancel: t("belege.detail.abgleich.trennenDialog.abbrechen"),
    confirm: t("belege.detail.abgleich.trennenDialog.bestaetigen"),
    running: t("belege.detail.abgleich.trennenDialog.laeuft"),
    done: t("belege.detail.toast.zuordnungGetrennt"),
    failed: (meldung) => t("belege.detail.toast.fehlgeschlagen", { error: meldung }),
    unknownError: t("belege.detail.abgleich.trennenDialog.unbekannterFehler"),
  };

  const matches = matchesQ.data ?? [];
  // Per-link allocation, not the transaction total. See headerMatchedSum above.
  const matchedSum = matches
    .filter((m) => m.status === "confirmed")
    .reduce((s, m) => s + Math.abs(m.amount_matched ?? 0), 0);
  // Invoice claims it is already paid (direct debit) AND a bank transaction was found but not yet
  // confirmed: nudge the reviewer to confirm — paid is only set once the match is confirmed.
  const claimsPaid = istLastschrift(beleg.payment_method);
  const hasOpenMatch = matches.some((m) => m.status === "candidate" || m.status === "auto");
  // `hasOpenMatch` passed, same as the header does. Without it this call could only ever return
  // 'open' or 'reconciled', so the card sat on a grey "Nicht abgeglichen" chip with the pending
  // suggestion rendered directly underneath it, while the header two cards up read "Vorschlag
  // offen" about the very same invoice.
  const status = abgleichStatus(
    beleg.amount_gross,
    matchedSum,
    hasOpenMatch,
    Boolean(beleg.paid_at),
  );
  // The gap between the invoice and what the bank actually allocated to it. `paid_at` is what
  // closing sets, so a paid invoice that still shows a gap is one whose remainder was written off.
  const restOffen = Math.max(Math.abs(beleg.amount_gross ?? 0) - matchedSum, 0);
  const restGeschlossen = Boolean(beleg.paid_at);

  return (
    <Section title={t("belege.detail.section.zahlungAbgleich")}>
      <PaymentRightNotice className="mb-3" />
      {/* ONE ROW: the state as a chip on the left, how much of the invoice it covers on the right.
          Both labels that used to sit in front of these are gone. "Abgleich-Status: Abgeglichen"
          and "Zugeordnet: 27,74 € von 27,74 €" each named the axis in front of a value that
          already said it -- and with the first label removed the chip was left orphaned on a line
          of its own above a second, unrelated-looking label/value row. The card's own title says
          which axis this is. */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <AbgleichBadge status={status} />
        {/* Figures only once something is actually matched. An installment plan is only readable
            as a running total: 400 of 1.000, then 1.000 of 1.000. */}
        {matchedSum > 0 && (
          <span className="text-sm tabular-nums text-muted-foreground">
            {t("belege.detail.abgleich.vonSumme", {
              matched: formatEUR(matchedSum),
              total: formatEUR(Math.abs(beleg.amount_gross ?? 0)),
            })}
            {status === "partial" &&
              ` · ${t("belege.detail.abgleich.restOffen", {
                rest: formatEUR(Math.max(Math.abs(beleg.amount_gross ?? 0) - matchedSum, 0)),
              })}`}
          </span>
        )}
      </div>

      {/* WHAT IS LEFT, and the way to close it. Same judgement as on the payment side: a link
          allocates the smaller of the two amounts, so an invoice that disagrees with the payment
          keeps a remainder that nobody will ever settle. Closing it writes the difference off,
          marks the invoice paid and takes it out of the open items. The reason lands in the
          Verlauf, which is why the closed line points there rather than repeating it. */}
      {restOffen > 0.01 && matchedSum > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-base">
          <span>
            {restGeschlossen
              ? t("bank.detail.restschliessen.istAbgeschrieben")
              : t("bank.detail.restschliessen.offenRechnung", {
                  betrag: formatEUR(restOffen),
                })}
          </span>
          {restGeschlossen
            ? mayPay && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    reopenRemainder.mutate(
                      { belegId: beleg.id },
                      {
                        onSuccess: () =>
                          toast.success(t("bank.detail.restschliessen.wiederGeoeffnet")),
                        onError: (e) => toast.error(fehlerText(e)),
                      },
                    )
                  }
                >
                  {t("bank.detail.restschliessen.wiederOeffnen")}
                </Button>
              )
            : null}
          {!restGeschlossen && (
            <CloseRemainderButton
              title={t("bank.detail.restschliessen.titelRechnung")}
              description={t("bank.detail.restschliessen.beschreibungRechnung")}
              actionLabel={t("bank.detail.restschliessen.aktionRechnung")}
              remainderLabel={formatEUR(restOffen)}
              disabledReason={mayPay ? null : keinZahlrecht}
              onClose={async (reason) => {
                await closeRemainder.mutateAsync({ belegId: beleg.id, reason });
              }}
            />
          )}
        </div>
      )}
      <Separator className="my-3" />
      {claimsPaid && hasOpenMatch && (
        <div className="mb-3 rounded-lg border border-sky-200 bg-sky-50 p-3 text-base text-sky-900">
          {t("belege.detail.abgleich.claimsPaidNudge")}
        </div>
      )}
      {matchesQ.isLoading ? (
        <Skeleton className="h-16 w-full" />
      ) : matches.length === 0 ? (
        <p className="text-base text-muted-foreground">{t("belege.detail.abgleich.empty")}</p>
      ) : (
        <ul className="space-y-3">
          {matches.map((m) => {
            const txn = m.bank_transactions ?? null;
            const offen = (m.status === "candidate" || m.status === "auto") && !!txn;
            return (
              <li
                key={m.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {txn ? (
                      <Link
                        to="/banktransaktionen/$id"
                        params={{ id: txn.id }}
                        // Underlined at rest, not only on hover. It is the one thing on this card
                        // that navigates somewhere, and a hover-only underline means the reader has
                        // to already suspect it is a link before anything tells them it is.
                        className="truncate text-base font-medium text-foreground underline decoration-muted-foreground/50 underline-offset-4 transition-colors hover:text-brand-dark hover:decoration-brand"
                      >
                        {txn.counterparty_holder ?? t("belege.detail.abgleich.transaktion")}
                      </Link>
                    ) : (
                      <span className="text-base text-muted-foreground">
                        {t("belege.detail.abgleich.transaktion")}
                      </span>
                    )}
                    <MatchStatusBadge status={m.status} />
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    <span className="tabular-nums">{formatSignedEUR(txn?.amount)}</span>
                    {/* Only worth showing when the link carries less than the whole transaction,
                        i.e. a collective payment shared with other invoices. On a plain 1:1 match
                        the two are identical and repeating the number is just noise. */}
                    {txn != null &&
                      Math.abs(Math.abs(txn.amount) - Math.abs(m.amount_matched ?? 0)) > 0.01 && (
                        <span className="tabular-nums font-medium text-foreground">
                          {t("belege.detail.abgleich.davon", {
                            betrag: formatEUR(m.amount_matched),
                          })}
                        </span>
                      )}
                    <span>{formatDate(txn?.booking_date)}</span>
                    {m.score != null && <span>· {Math.round(m.score * 100)} %</span>}
                  </div>
                </div>
                {offen && txn && (
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={rejectMatch.isPending}
                      onClick={() =>
                        rejectMatch.mutate(
                          { matchId: m.id, belegId: beleg.id },
                          {
                            onSuccess: () =>
                              toast.success(t("belege.detail.toast.zuordnungAbgelehnt")),
                            onError: (e) =>
                              toast.error(
                                t("belege.detail.toast.fehlgeschlagen", {
                                  error: fehlerText(e),
                                }),
                              ),
                          },
                        )
                      }
                    >
                      {t("belege.detail.abgleich.ablehnen")}
                    </Button>
                    <Button
                      size="sm"
                      disabled={confirmMatch.isPending || !mayPay}
                      title={keinZahlrecht}
                      onClick={() =>
                        confirmMatch.mutate(
                          { matchId: m.id, belegId: beleg.id },
                          {
                            onSuccess: () =>
                              toast.success(t("belege.detail.toast.zuordnungBestaetigt")),
                            onError: (e) =>
                              toast.error(
                                t("belege.detail.toast.fehlgeschlagen", {
                                  error: fehlerText(e),
                                }),
                              ),
                          },
                        )
                      }
                    >
                      {t("belege.detail.abgleich.zuordnen")}
                    </Button>
                  </div>
                )}
                {m.status === "confirmed" && (
                  <UnlinkMatchButton
                    labels={unlinkLabels}
                    disabled={unlinkMatch.isPending || !mayPay}
                    onUnlink={async (grund) => {
                      await unlinkMatch.mutateAsync({
                        matchId: m.id,
                        belegId: beleg.id,
                        grund: grund ?? undefined,
                        // Undoing a payment: the invoice goes back to In Prüfung and the move is
                        // recorded in the Workflow-Verlauf, same as any other backwards step.
                        walkBack: true,
                      });
                    }}
                  />
                )}
                <MatchScoreBreakdown reasons={m.match_reasons} score={m.score} />
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

// The detail lines of one history entry, one per changed field.
//
// Reads the pre-rendered `data.lines` written by the save, and falls back to the free-text `text`
// for everything that does not have them: notes, status changes, and the entries the database
// triggers write (rule application, bank matching). Never re-splits `text` on the separator, since
// a value can contain it (a business line reads "GB-01 · Vermietung").

function Section({
  title,
  anchorId,
  hint,
  children,
  editable,
  editDisabled,
  editLabel,
  editIcon: EditIcon = Pencil,
  isEditing,
  saving,
  onEdit,
  onCancel,
  onSave,
}: {
  title: string;
  anchorId?: string;
  hint?: string;
  children: React.ReactNode;
  // Optional per-section editing controls, rendered in the header.
  editable?: boolean;
  // Another section is open: this one can be edited, just not right now.
  editDisabled?: boolean;
  // What the button DOES, when "Bearbeiten" would be a lie. The supplier section's button does not
  // edit the supplier at all; it picks a different one, and calling that "Edit" invited people to
  // open it expecting to correct an IBAN.
  editLabel?: string;
  editIcon?: typeof Pencil;
  isEditing?: boolean;
  saving?: boolean;
  onEdit?: () => void;
  onCancel?: () => void;
  onSave?: () => void;
}) {
  const { t } = useTranslation();

  return (
    <section
      id={anchorId}
      className={cn(
        "overflow-hidden rounded-xl border transition-shadow",
        anchorId && "scroll-mt-24",
        // Warm border and a tinted header band instead of grey-on-white. Every card on this screen
        // was the same white rectangle with a grey hairline and a grey heading, so a page carrying
        // eight of them read as a spreadsheet: nothing to catch the eye, and no way to tell one
        // card's start from the previous card's end at a glance. The brand tokens are the app's own
        // warm beige, so this adds temperature rather than a new colour.
        isEditing ? "border-brand shadow-sm ring-2 ring-brand/30" : "border-brand-soft/35",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-brand-soft/25 bg-brand-wash/40 px-5 py-3">
        <h2 className="text-base font-semibold uppercase tracking-wide text-brand-dark">{title}</h2>
        <div className="flex shrink-0 items-center gap-2">
          {hint && !isEditing && <span className="text-xs text-muted-foreground">{hint}</span>}
          {editable &&
            (isEditing ? (
              <>
                <Button variant="ghost" size="sm" onClick={onCancel} className="h-8 gap-1.5">
                  <X className="size-3.5" /> {t("belege.detail.action.abbrechen")}
                </Button>
                <Button size="sm" onClick={onSave} disabled={saving} className="h-8 gap-1.5">
                  {saving
                    ? t("belege.detail.action.speichere")
                    : t("belege.detail.action.speichern")}
                </Button>
              </>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={onEdit}
                disabled={editDisabled}
                title={editDisabled ? t("belege.detail.action.bearbeitenGesperrt") : undefined}
                className="h-8 gap-1.5"
              >
                <EditIcon className="size-3.5" />{" "}
                {editLabel ?? t("belege.detail.action.bearbeiten")}
              </Button>
            ))}
        </div>
      </div>
      <div className="bg-card p-5">{children}</div>
    </section>
  );
}

// Ein Feld: read-only Anzeige ODER Input im Edit-Modus.
function Field({
  edit,
  label,
  value,
  formValue,
  onChange,
  konfidenz,
  quelle,
  copy,
  align = "left",
  strong,
  type = "text",
  badge,
}: {
  edit: boolean;
  label: string;
  value: string | null | undefined;
  formValue: string;
  onChange: (v: string) => void;
  konfidenz?: number;
  // Who decided this value. A confidence score belongs to a value the AI READ; once a person or a
  // rule has set it, that score is about text nobody is looking at any more, and an amber dot
  // beside a value somebody typed themselves reads as doubt about their own entry.
  quelle?: string | null;
  copy?: boolean;
  align?: "left" | "right";
  strong?: boolean;
  type?: "text" | "number" | "date";
  badge?: ReactNode;
}) {
  if (edit) {
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-1.5">
          <span className="text-sm text-muted-foreground">{label}</span>
          {badge}
        </div>
        {/* Dates go through the shared picker, everything else stays a plain input. One date
            control for the whole app, rather than the browser's grey native one here and a
            styled one two screens over. */}
        {type === "date" ? (
          <DatePicker value={formValue} onChange={onChange} />
        ) : (
          <Input
            type={type}
            step={type === "number" ? "0.01" : undefined}
            value={formValue}
            onChange={(e) => onChange(e.target.value)}
            className={cn(align === "right" && "text-right")}
          />
        )}
      </div>
    );
  }
  return (
    <ReadField
      label={label}
      value={value}
      konfidenz={konfidenz}
      quelle={quelle}
      copy={copy}
      align={align}
      strong={strong}
      badge={badge}
    />
  );
}

// Provenance of one field: who decided this value. Rendered next to the label rather than next to
// the value, because it qualifies the field rather than being part of the data.
//
// Nothing is shown when the field is empty: "no value" needs no provenance, and a badge there
// would read as a claim about a decision nobody made.
function QuelleBadge({
  source,
  hasValue,
}: {
  source: string | null | undefined;
  hasValue: boolean;
}) {
  const { t } = useTranslation();
  const key = fieldSourceKey(source, hasValue);
  if (key === "none") return null;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-1.5 py-0 text-[11px] font-medium leading-4",
        QUELLE_META[key].cls,
      )}
      title={t(`belege.quelle.hint.${key}`)}
    >
      {t(`belege.quelle.${key}`)}
    </span>
  );
}

// Rule-conflict visibility (Briefing Screen 4: "if two rules match ... a clear priority is needed").
// The priority itself is resolved server-side (assignment_rule_specificity, migration 0025); this
// only makes the outcome visible — when more than one rule matches this receipt for this field, say
// so and name the one that actually wins, instead of the previous plain "a rule applies" text.
function RegelHinweis({
  belegId,
  target,
  humanOverride,
}: {
  belegId: string;
  target: RuleTarget;
  humanOverride: boolean;
}) {
  const { t } = useTranslation();
  const candidatesQ = useAssignmentRuleCandidates(belegId, target);
  const rulesQ = useAssignmentRules();
  const lieferantenQ = useLieferanten();
  const objekteQ = useObjekte();
  const gesellschaftenQ = useGesellschaften();

  const candidates = candidatesQ.data ?? [];
  if (candidates.length === 0) return null;

  if (candidates.length === 1) {
    return (
      <p className="text-sm text-muted-foreground">
        {humanOverride
          ? t("belege.detail.regel.regelUeberstimmt")
          : t("belege.detail.regel.regelGreift")}
      </p>
    );
  }

  // More than one rule matches — name the winner instead of silently applying it. A short scope
  // label built from data already loaded elsewhere on this page (no extra queries beyond the
  // candidates RPC itself; React Query dedupes these against the same hooks used above).
  const winnerId = candidates.find((c) => c.is_winner)?.rule_id;
  const winner = rulesQ.data?.find((r) => r.id === winnerId);
  const scopeLabel = (r: AssignmentRule | undefined): string => {
    if (!r) return "—";
    const parts: string[] = [];
    if (r.supplier_id) {
      parts.push(
        lieferantenQ.data?.find((l) => l.id === r.supplier_id)?.name ??
          t("zuordnungsregeln.scope.lieferant"),
      );
    }
    if (r.property_id) {
      parts.push(
        objekteQ.data?.find((o) => o.id === r.property_id)?.code ??
          t("zuordnungsregeln.scope.objekt"),
      );
    }
    if (r.company_id) {
      parts.push(
        gesellschaftenQ.data?.find((g) => g.id === r.company_id)?.code ??
          t("zuordnungsregeln.scope.gesellschaft"),
      );
    }
    if (r.reference_pattern) parts.push(`"${r.reference_pattern}"`);
    return parts.join(" + ") || "—";
  };

  return (
    <p className="text-sm text-amber-700">
      {t(
        humanOverride
          ? "belege.detail.regel.konfliktUeberstimmt"
          : "belege.detail.regel.konfliktGreift",
        { count: candidates.length, gewinner: scopeLabel(winner) },
      )}
    </p>
  );
}

/**
 * The cost centre under the Objekt field: the number, or what is missing and where to fill it in.
 *
 * Nobody picks a cost centre on the invoice. It follows from the property and the company, so a gap
 * is a gap in the master data, and the line says which one and links to it instead of reading like
 * a field left empty here. Saskia read "Keine Kostenstelle hinterlegt" as something to choose on the
 * invoice (17.09.2026).
 */
function KostenstelleHinweis({
  kostenstelle,
  objektCode,
}: {
  kostenstelle: Kostenstelle;
  objektCode: string | null;
}) {
  const { t } = useTranslation();
  if (kostenstelle.nummer != null) {
    return <>{t("belege.detail.field.kostenstelle", { nr: kostenstelle.nummer })}</>;
  }
  const linkClass = "ml-1 text-brand underline-offset-4 hover:underline";
  if (kostenstelle.gemeinkosten) {
    return (
      <>
        {t("belege.detail.field.kostenstelleGemeinkostenFehlt")}
        <Link
          to="/gesellschaften/$id"
          params={{ id: kostenstelle.gesellschaftId }}
          className={linkClass}
        >
          {t("belege.detail.field.kostenstelleBeiGesellschaft")}
        </Link>
      </>
    );
  }
  return (
    <>
      {kostenstelle.verknuepft
        ? t("belege.detail.field.kostenstelleFehlt")
        : t("belege.detail.field.kostenstelleNichtZugeordnet")}
      {objektCode && (
        <Link to="/objekte/$code" params={{ code: objektCode }} className={linkClass}>
          {kostenstelle.verknuepft
            ? t("belege.detail.field.kostenstelleBeimObjekt")
            : t("belege.detail.field.kostenstelleZuordnen")}
        </Link>
      )}
    </>
  );
}

function ReadField({
  label,
  value,
  konfidenz,
  quelle,
  copy,
  align = "left",
  strong,
  badge,
  truncate,
  leerAls,
  sub,
}: {
  label: string;
  value: string | null | undefined;
  konfidenz?: number;
  // Who decided this value. A confidence score belongs to a value the AI READ; once a person or a
  // rule has set it, that score is about text nobody is looking at any more, and an amber dot
  // beside a value somebody typed themselves reads as doubt about their own entry.
  quelle?: string | null;
  copy?: boolean;
  align?: "left" | "right";
  strong?: boolean;
  // Sits next to the label, for provenance and similar per-field metadata.
  badge?: ReactNode;
  // What to render INSTEAD of an em dash when the value is empty -- used to say "none, decided"
  // rather than "nothing here".
  leerAls?: ReactNode;
  // For opaque identifiers: show one line, keep the whole value on hover and on the copy button.
  // A Gmail message id is ~120 characters of base64 that wrapped across three lines and pushed
  // everything beside it out of the card, to say something nobody reads -- they copy it.
  truncate?: boolean;
  // A quiet second line under the value, for something derived FROM it rather than another field
  // of its own -- the cost centre a property and company resolve to, say.
  sub?: ReactNode;
}) {
  const display = value && value !== "" ? value : leerAls ? leerAls : "—";
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        {konfidenz !== undefined && quelle !== "human" && quelle !== "rule" && (
          <KonfidenzDot score={konfidenz} />
        )}
        <span className="text-sm text-muted-foreground">{label}</span>
        {badge}
        {copy && value && <CopyButton value={value} label={label} className="size-5" />}
      </div>
      <div
        className={cn(
          "text-base text-foreground",
          align === "right" && "text-right tabular-nums",
          strong && "font-semibold",
          truncate && "truncate",
        )}
        title={truncate && value ? value : undefined}
      >
        {display}
      </div>
      {sub ? <div className="text-sm text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

/**
 * The extraction as something a person reads, rather than as JSON.
 *
 * The point of it is `volltext`: JSON.stringify writes a whole OCR page as one line with literal
 * \n between the words, so the most useful field in the object is the least readable thing in it.
 * Here a multi-line string becomes multi-line text under its own key, and the braces, quotes and
 * commas that carry no meaning for a reader are gone.
 */
function lesbarerText(value: unknown, tiefe = 0): string {
  const pad = "  ".repeat(tiefe);
  if (value == null) return `${pad}—`;
  if (Array.isArray(value)) {
    if (value.length === 0) return `${pad}—`;
    return value
      .map((v, i) =>
        v !== null && typeof v === "object"
          ? `${pad}${i + 1}.\n${lesbarerText(v, tiefe + 1)}`
          : `${pad}${i + 1}. ${String(v)}`,
      )
      .join("\n");
  }
  if (typeof value === "object") {
    const zeilen: string[] = [];
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      const label = feldLabel(key);
      if (v !== null && typeof v === "object") {
        zeilen.push(`${pad}${label}:`);
        zeilen.push(lesbarerText(v, tiefe + 1));
      } else {
        const text = v == null || v === "" ? "—" : String(v);
        // A value with its own line breaks gets the room for them, under its key.
        if (text.includes("\n")) {
          zeilen.push(`${pad}${label}:`);
          zeilen.push(
            text
              .split("\n")
              .map((line) => `${pad}  ${line}`)
              .join("\n"),
          );
        } else {
          zeilen.push(`${pad}${label}: ${text}`);
        }
      }
    }
    return zeilen.join("\n");
  }
  return `${pad}${String(value)}`;
}

/** snake_case as words, so the reader view reads as labels rather than as column names. */
function feldLabel(key: string): string {
  return key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

/**
 * Everything that was read off this document, in a dialog you can search.
 *
 * It used to be a <details> holding a raw dump in a 24rem box, in the storage format, with a whole
 * OCR page written as one line. So the fullest record of the document was also the least readable
 * thing on the screen. Now it is rendered as labelled text, the dialog gives it room, and
 * find-as-you-type gives it a way in.
 */
function RohdatenDialog({ extracted }: { extracted: object }) {
  const { t } = useTranslation();
  const [offen, setOffen] = useState(false);
  const [suche, setSuche] = useState("");
  const [treffer, setTreffer] = useState(0);
  // One rendering, in words. The raw shape used to be offered next to it as a "JSON" toggle,
  // which is a question about the storage format on a screen whose reader is checking an invoice.
  const text = useMemo(() => lesbarerText(extracted), [extracted]);
  const markRefs = useRef<(HTMLElement | null)[]>([]);

  // A search term is about one question. Reopening the dialog is a new question, and finding the
  // last one still typed in (with the view scrolled to its hit) reads as a stuck field.
  const schliessen = (auf: boolean) => {
    setOffen(auf);
    if (!auf) {
      setSuche("");
      setTreffer(0);
    }
  };

  // Split the text on the query so every hit can be a <mark> of its own, which is what makes
  // "next match" possible at all. The query is escaped: somebody searching for "1.199,12" must not
  // have the dot treated as "any character", and an unescaped "(" would throw.
  const teile = useMemo(() => {
    const q = suche.trim();
    if (!q) return [{ text, hit: false }];
    const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    const out: { text: string; hit: boolean }[] = [];
    let last = 0;
    for (const m of text.matchAll(re)) {
      if (m.index > last) out.push({ text: text.slice(last, m.index), hit: false });
      out.push({ text: m[0], hit: true });
      last = m.index + m[0].length;
    }
    if (last < text.length) out.push({ text: text.slice(last), hit: false });
    return out;
  }, [text, suche]);

  const anzahl = teile.filter((p) => p.hit).length;
  useEffect(() => setTreffer(0), [suche]);
  useEffect(() => {
    markRefs.current[treffer]?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [treffer, teile]);

  const springe = (delta: number) => {
    if (anzahl === 0) return;
    setTreffer((i) => (i + delta + anzahl) % anzahl);
  };

  let hitIndex = -1;
  return (
    <>
      {/* A button, and it looks like one. Styled as a full-width search field it read as an input
          somebody could type into, and the first thing it did on click was open a dialog with the
          real field in it, so the typing went nowhere. */}
      <Button
        variant="outline"
        // Brand-tinted rather than the default grey outline. It is the last thing on the tab and
        // the only control on it, and in plain outline it read as a footer note under four cards
        // instead of as the way into everything the document holds.
        className="gap-2 border-brand-soft bg-brand-wash text-brand-dark hover:border-brand hover:bg-brand-tint hover:text-brand-dark"
        onClick={() => setOffen(true)}
      >
        <Search className="size-4" />
        {t("belege.detail.rohdatenShow")}
      </Button>
      <Dialog open={offen} onOpenChange={schliessen}>
        <DialogContent className="flex max-h-[85vh] max-w-3xl flex-col">
          <DialogHeader>
            <DialogTitle>{t("belege.detail.rohdaten.titel")}</DialogTitle>
            <DialogDescription>{t("belege.detail.rohdaten.hinweis")}</DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                value={suche}
                onChange={(e) => setSuche(e.target.value)}
                placeholder={t("belege.detail.rohdaten.suchen")}
                className="pl-9"
                // Enter walks the hits, the way find-in-page does, so the keyboard alone is enough.
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    springe(e.shiftKey ? -1 : 1);
                  }
                }}
              />
            </div>
            {suche.trim() !== "" && (
              <div className="flex shrink-0 items-center gap-1">
                <span className="tabular-nums text-sm text-muted-foreground">
                  {anzahl === 0
                    ? t("belege.detail.rohdaten.keineTreffer")
                    : t("belege.detail.rohdaten.treffer", { n: treffer + 1, gesamt: anzahl })}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  disabled={anzahl === 0}
                  onClick={() => springe(-1)}
                  aria-label={t("belege.detail.rohdaten.vorher")}
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  disabled={anzahl === 0}
                  onClick={() => springe(1)}
                  aria-label={t("belege.detail.rohdaten.naechster")}
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            )}
            <CopyButton value={text} label={t("belege.detail.rohdaten.titel")} />
          </div>
          <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">
            {teile.map((teil, i) => {
              if (!teil.hit) return <span key={i}>{teil.text}</span>;
              hitIndex += 1;
              const aktiv = hitIndex === treffer;
              const index = hitIndex;
              return (
                <mark
                  key={i}
                  ref={(el) => {
                    markRefs.current[index] = el;
                  }}
                  className={cn(
                    "rounded",
                    aktiv ? "bg-brand text-white" : "bg-amber-200 text-amber-950",
                  )}
                >
                  {teil.text}
                </mark>
              );
            })}
          </pre>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="mt-2 flex items-center justify-between first:mt-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums text-foreground">{value}</span>
    </div>
  );
}
