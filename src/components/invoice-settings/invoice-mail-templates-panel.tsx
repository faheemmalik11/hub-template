import { useRef, useState } from "react";
import { Eye, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/feld";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useCreateInvoiceMailTemplate,
  useDeleteInvoiceMailTemplate,
  useDonationSettings,
  useInvoiceMailTemplates,
  useUpdateInvoiceMailTemplate,
  type InvoiceMailTemplate,
  type InvoiceMailTemplateCondition,
  type InvoiceMailTemplateDraft,
  type InvoiceMailTemplateSide,
} from "@/data";
import { errorText, formatDateTime, formatEUR } from "@/lib/data/format";
import { useTranslation } from "@/lib/i18n";

const VARIABLES = ["buyer_name", "seller_name", "invoice_number", "invoice_amount"] as const;

const EMPTY_DRAFT: InvoiceMailTemplateDraft = {
  name: "",
  side: "buyer",
  condition: "all",
  subject: "",
  body: "",
};

type DrawerMode =
  | { kind: "closed" }
  | { kind: "create" }
  | { kind: "view" | "edit"; template: InvoiceMailTemplate };

function TemplateDrawer({
  mode,
  canEdit,
  onClose,
}: {
  mode: DrawerMode;
  canEdit: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const create = useCreateInvoiceMailTemplate();
  const update = useUpdateInvoiceMailTemplate();
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const [lastFocused, setLastFocused] = useState<"subject" | "body">("body");

  const isOpen = mode.kind !== "closed";
  const isViewOnly = mode.kind === "view";
  const existing = mode.kind === "view" || mode.kind === "edit" ? mode.template : null;

  const [draft, setDraft] = useState<InvoiceMailTemplateDraft>(existing ?? EMPTY_DRAFT);

  // Re-seed the draft whenever a different template (or a fresh "create") opens, not on every
  // render, so typing doesn't get stomped by this effect re-running on its own state updates.
  const [seededFor, setSeededFor] = useState<string>("");
  const seedKey =
    mode.kind === "closed" ? "" : mode.kind === "create" ? "create" : mode.template.id;
  if (isOpen && seedKey !== seededFor) {
    setSeededFor(seedKey);
    setDraft(existing ?? EMPTY_DRAFT);
  }

  const pending = create.isPending || update.isPending;
  const textInvalid =
    draft.name.trim() === "" || draft.subject.trim() === "" || draft.body.trim() === "";
  const original = existing ?? EMPTY_DRAFT;
  const dirty =
    draft.name !== original.name ||
    draft.side !== original.side ||
    draft.condition !== original.condition ||
    draft.subject !== original.subject ||
    draft.body !== original.body;

  function insertVariable(name: string) {
    const token = `{{${name}}}`;
    if (lastFocused === "subject") {
      const el = subjectRef.current;
      const start = el?.selectionStart ?? draft.subject.length;
      const end = el?.selectionEnd ?? draft.subject.length;
      const next = draft.subject.slice(0, start) + token + draft.subject.slice(end);
      setDraft({ ...draft, subject: next });
      requestAnimationFrame(() =>
        el?.setSelectionRange(start + token.length, start + token.length),
      );
    } else {
      const el = bodyRef.current;
      const start = el?.selectionStart ?? draft.body.length;
      const end = el?.selectionEnd ?? draft.body.length;
      const next = draft.body.slice(0, start) + token + draft.body.slice(end);
      setDraft({ ...draft, body: next });
      requestAnimationFrame(() =>
        el?.setSelectionRange(start + token.length, start + token.length),
      );
    }
  }

  function save() {
    if (textInvalid || !dirty || pending) return;
    const onSettled = {
      onSuccess: () => {
        toast.success(t("invoiceSettings.card.mailTemplates.saved"));
        onClose();
      },
      onError: (error: unknown) =>
        toast.error(t("invoiceSettings.toast.failed", { error: errorText(error) })),
    };
    if (mode.kind === "create") {
      create.mutate(draft, onSettled);
    } else if (mode.kind === "edit") {
      update.mutate({ id: mode.template.id, ...draft }, onSettled);
    }
  }

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>
            {mode.kind === "create"
              ? t("invoiceSettings.card.mailTemplates.addTitle")
              : isViewOnly
                ? t("invoiceSettings.card.mailTemplates.viewTitle")
                : t("invoiceSettings.card.mailTemplates.editTitle")}
          </SheetTitle>
          <SheetDescription>{t("invoiceSettings.card.mailTemplates.drawerDesc")}</SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-4 py-4">
          <Field className="space-y-1.5">
            <Label>{t("invoiceSettings.card.mailTemplates.name")}</Label>
            <Input
              value={draft.name}
              disabled={isViewOnly || !canEdit}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field className="space-y-1.5">
              <Label>{t("invoiceSettings.card.mailTemplates.side")}</Label>
              <Select
                value={draft.side}
                disabled={isViewOnly || !canEdit}
                onValueChange={(value) =>
                  setDraft({ ...draft, side: value as InvoiceMailTemplateSide })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="buyer">
                    {t("invoiceSettings.card.mailTemplates.sideBuyer")}
                  </SelectItem>
                  <SelectItem value="seller">
                    {t("invoiceSettings.card.mailTemplates.sideSeller")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field className="space-y-1.5">
              <Label>{t("invoiceSettings.card.mailTemplates.condition")}</Label>
              <Select
                value={draft.condition}
                disabled={isViewOnly || !canEdit}
                onValueChange={(value) =>
                  setDraft({ ...draft, condition: value as InvoiceMailTemplateCondition })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    {t("invoiceSettings.card.mailTemplates.conditionAll")}
                  </SelectItem>
                  <SelectItem value="below_threshold">
                    {t("invoiceSettings.card.mailTemplates.conditionBelow")}
                  </SelectItem>
                  <SelectItem value="at_or_above_threshold">
                    {t("invoiceSettings.card.mailTemplates.conditionAtOrAbove")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field className="space-y-1.5">
            <Label>{t("invoiceSettings.card.mailTemplates.subject")}</Label>
            <Input
              ref={subjectRef}
              value={draft.subject}
              disabled={isViewOnly || !canEdit}
              onFocus={() => setLastFocused("subject")}
              onChange={(event) => setDraft({ ...draft, subject: event.target.value })}
            />
          </Field>

          <Field className="space-y-1.5">
            <Label>{t("invoiceSettings.card.mailTemplates.body")}</Label>
            <textarea
              ref={bodyRef}
              rows={8}
              value={draft.body}
              disabled={isViewOnly || !canEdit}
              onFocus={() => setLastFocused("body")}
              onChange={(event) => setDraft({ ...draft, body: event.target.value })}
              className="flex w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            />
          </Field>

          {!isViewOnly && canEdit && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                {t("invoiceSettings.card.mailTemplates.variablesHint")}
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {VARIABLES.map((name) => (
                  <Button
                    key={name}
                    type="button"
                    size="sm"
                    variant="outline"
                    className="font-mono text-xs"
                    onClick={() => insertVariable(name)}
                  >
                    {`{{${name}}}`}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>

        <SheetFooter>
          {isViewOnly ? (
            <Button onClick={onClose}>{t("invoiceSettings.card.mailTemplates.close")}</Button>
          ) : (
            <>
              <Button variant="outline" onClick={onClose} disabled={pending}>
                {t("invoiceSettings.discard")}
              </Button>
              <Button onClick={save} disabled={!canEdit || textInvalid || !dirty || pending}>
                {pending ? t("invoiceSettings.saving") : t("invoiceSettings.save")}
              </Button>
            </>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export function InvoiceMailTemplatesPanel({ canEdit }: { canEdit: boolean }) {
  const { t } = useTranslation();
  const templatesQ = useInvoiceMailTemplates();
  const donationSettingsQ = useDonationSettings();
  const deleteTemplate = useDeleteInvoiceMailTemplate();

  const [drawer, setDrawer] = useState<DrawerMode>({ kind: "closed" });
  const [pendingDelete, setPendingDelete] = useState<InvoiceMailTemplate | null>(null);

  const templates = templatesQ.data ?? [];

  const conditionLabel = (condition: InvoiceMailTemplateCondition) =>
    condition === "all"
      ? t("invoiceSettings.card.mailTemplates.conditionAll")
      : condition === "below_threshold"
        ? t("invoiceSettings.card.mailTemplates.conditionBelow")
        : t("invoiceSettings.card.mailTemplates.conditionAtOrAbove");

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/60 px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">
            {t("invoiceSettings.card.mailTemplates.title")}
          </h2>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            {donationSettingsQ.data
              ? t("invoiceSettings.card.mailTemplates.desc", {
                  amount: formatEUR(donationSettingsQ.data.threshold_amount),
                })
              : t("invoiceSettings.card.mailTemplates.descNoAmount")}
          </p>
        </div>
        {canEdit && (
          <Button size="sm" onClick={() => setDrawer({ kind: "create" })}>
            <Plus /> {t("invoiceSettings.card.mailTemplates.add")}
          </Button>
        )}
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("invoiceSettings.card.mailTemplates.colName")}</TableHead>
              <TableHead>{t("invoiceSettings.card.mailTemplates.colSide")}</TableHead>
              <TableHead>{t("invoiceSettings.card.mailTemplates.colCondition")}</TableHead>
              <TableHead>{t("invoiceSettings.card.mailTemplates.colUpdated")}</TableHead>
              <TableHead className="text-right">
                {t("invoiceSettings.card.mailTemplates.colActions")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {templates.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                  {t("invoiceSettings.card.mailTemplates.empty")}
                </TableCell>
              </TableRow>
            )}
            {templates.map((template) => (
              <TableRow
                key={template.id}
                className="cursor-pointer"
                onClick={() => setDrawer({ kind: "view", template })}
              >
                <TableCell className="font-medium text-foreground">{template.name}</TableCell>
                <TableCell>
                  <Badge variant="outline">
                    {template.side === "buyer"
                      ? t("invoiceSettings.card.mailTemplates.sideBuyer")
                      : t("invoiceSettings.card.mailTemplates.sideSeller")}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {conditionLabel(template.condition)}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {formatDateTime(template.updated_at)}
                </TableCell>
                <TableCell className="text-right">
                  <div
                    className="flex items-center justify-end gap-1"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t("invoiceSettings.card.mailTemplates.view")}
                      onClick={() => setDrawer({ kind: "view", template })}
                    >
                      <Eye className="size-4" />
                    </Button>
                    {canEdit && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={t("invoiceSettings.card.mailTemplates.edit")}
                          onClick={() => setDrawer({ kind: "edit", template })}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={t("invoiceSettings.card.mailTemplates.delete")}
                          onClick={() => setPendingDelete(template)}
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <TemplateDrawer
        mode={drawer}
        canEdit={canEdit}
        onClose={() => setDrawer({ kind: "closed" })}
      />

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("invoiceSettings.card.mailTemplates.deleteTitle", {
                name: pendingDelete?.name ?? "",
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("invoiceSettings.card.mailTemplates.deleteBody")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {t("invoiceSettings.card.mailTemplates.keepTemplate")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteTemplate.isPending}
              onClick={() => {
                if (!pendingDelete) return;
                deleteTemplate.mutate(pendingDelete.id, {
                  onSuccess: () => {
                    toast.success(t("invoiceSettings.card.mailTemplates.deleted"));
                    setPendingDelete(null);
                  },
                  onError: (error) =>
                    toast.error(t("invoiceSettings.toast.failed", { error: errorText(error) })),
                });
              }}
            >
              {t("invoiceSettings.card.mailTemplates.confirmDelete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
