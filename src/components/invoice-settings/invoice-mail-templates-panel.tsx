import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2, User } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { errorText, formatEUR } from "@/lib/data/format";
import { useTranslation } from "@/lib/i18n";

const VARIABLES = ["buyer_name", "seller_name", "invoice_number", "invoice_amount"] as const;
const NEW_TEMPLATE_ID = "new";

const EMPTY_DRAFT: InvoiceMailTemplateDraft = {
  name: "",
  side: "buyer",
  condition: "all",
  subject: "",
  body: "",
};

export function InvoiceMailTemplatesPanel({ canEdit }: { canEdit: boolean }) {
  const { t } = useTranslation();
  const templatesQ = useInvoiceMailTemplates();
  const donationSettingsQ = useDonationSettings();
  const create = useCreateInvoiceMailTemplate();
  const update = useUpdateInvoiceMailTemplate();
  const deleteTemplate = useDeleteInvoiceMailTemplate();

  const templates = useMemo(() => templatesQ.data ?? [], [templatesQ.data]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const [lastFocused, setLastFocused] = useState<"subject" | "body">("body");

  useEffect(() => {
    if (selectedId !== null) return;
    if (templates.length > 0) setSelectedId(templates[0].id);
  }, [selectedId, templates]);

  const isNew = selectedId === NEW_TEMPLATE_ID;
  const selectedTemplate = isNew ? null : (templates.find((one) => one.id === selectedId) ?? null);
  const original: InvoiceMailTemplateDraft = selectedTemplate ?? EMPTY_DRAFT;

  const [draft, setDraft] = useState<InvoiceMailTemplateDraft>(original);
  const [seededFor, setSeededFor] = useState<string | null>(null);
  if (selectedId !== seededFor) {
    setSeededFor(selectedId);
    setDraft(original);
  }

  const pending = create.isPending || update.isPending;
  const textInvalid =
    draft.name.trim() === "" || draft.subject.trim() === "" || draft.body.trim() === "";
  const dirty =
    draft.name !== original.name ||
    draft.side !== original.side ||
    draft.condition !== original.condition ||
    draft.subject !== original.subject ||
    draft.body !== original.body;

  const conditionLabel = (condition: InvoiceMailTemplateCondition) =>
    condition === "all"
      ? t("invoiceSettings.card.mailTemplates.conditionAll")
      : condition === "below_threshold"
        ? t("invoiceSettings.card.mailTemplates.conditionBelow")
        : t("invoiceSettings.card.mailTemplates.conditionAtOrAbove");

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
    const onError = (error: unknown) =>
      toast.error(t("invoiceSettings.toast.failed", { error: errorText(error) }));
    if (isNew) {
      create.mutate(draft, {
        onSuccess: (newId) => {
          toast.success(t("invoiceSettings.card.mailTemplates.saved"));
          setSelectedId(newId);
        },
        onError,
      });
    } else if (selectedTemplate) {
      update.mutate(
        { id: selectedTemplate.id, ...draft },
        {
          onSuccess: () => toast.success(t("invoiceSettings.card.mailTemplates.saved")),
          onError,
        },
      );
    }
  }

  function discard() {
    setDraft(original);
  }

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="border-b border-border/60 px-5 py-4">
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

      <div className="grid sm:grid-cols-[260px_1fr]">
        <div className="space-y-1 border-b border-border/60 p-3 sm:border-b-0 sm:border-r">
          {templates.length === 0 && !isNew && (
            <p className="px-2 py-3 text-sm text-muted-foreground">
              {t("invoiceSettings.card.mailTemplates.empty")}
            </p>
          )}
          {templates.map((template) => {
            const active = !isNew && template.id === selectedId;
            return (
              <button
                key={template.id}
                type="button"
                onClick={() => setSelectedId(template.id)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md border-l-2 border-transparent px-3 py-2 text-left text-sm transition-colors",
                  active
                    ? "border-l-primary bg-brand-tint font-medium text-brand-dark"
                    : "text-foreground hover:bg-muted/60",
                )}
              >
                <User className="size-4 shrink-0" />
                <span className="flex-1 truncate">{template.name}</span>
              </button>
            );
          })}
          {isNew && (
            <div className="flex w-full items-center gap-2 rounded-md border-l-2 border-l-primary bg-brand-tint px-3 py-2 text-left text-sm font-medium text-brand-dark">
              <User className="size-4 shrink-0" />
              <span className="flex-1 truncate">
                {draft.name.trim() || t("invoiceSettings.card.mailTemplates.addTitle")}
              </span>
            </div>
          )}
          {canEdit && (
            <button
              type="button"
              onClick={() => setSelectedId(NEW_TEMPLATE_ID)}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-input px-3 py-2 text-sm font-medium text-brand-dark hover:bg-brand-tint"
            >
              <Plus className="size-4" />
              {t("invoiceSettings.card.mailTemplates.add")}
            </button>
          )}
        </div>

        <div className="p-5">
          {!isNew && !selectedTemplate ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {t("invoiceSettings.card.mailTemplates.empty")}
            </p>
          ) : (
            <div className="space-y-4">
              <Field className="space-y-1.5">
                <Label>{t("invoiceSettings.card.mailTemplates.name")}</Label>
                <Input
                  value={draft.name}
                  disabled={!canEdit}
                  onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field className="space-y-1.5">
                  <Label>{t("invoiceSettings.card.mailTemplates.side")}</Label>
                  <Select
                    value={draft.side}
                    disabled={!canEdit}
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
                    disabled={!canEdit}
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
              {!canEdit && selectedTemplate && (
                <p className="text-xs text-muted-foreground">
                  {conditionLabel(selectedTemplate.condition)}
                </p>
              )}

              <Field className="space-y-1.5">
                <Label>{t("invoiceSettings.card.mailTemplates.subject")}</Label>
                <Input
                  ref={subjectRef}
                  value={draft.subject}
                  disabled={!canEdit}
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
                  disabled={!canEdit}
                  onFocus={() => setLastFocused("body")}
                  onChange={(event) => setDraft({ ...draft, body: event.target.value })}
                  className="flex w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                />
              </Field>

              {canEdit && (
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground">
                    {t("invoiceSettings.card.mailTemplates.variablesHint")}
                  </p>
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

              {canEdit && (
                <div className="flex items-center justify-between pt-2">
                  {selectedTemplate ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="text-destructive hover:text-destructive"
                      disabled={pending}
                      onClick={() => setConfirmingDelete(true)}
                    >
                      <Trash2 className="size-4" />
                      {t("invoiceSettings.card.mailTemplates.delete")}
                    </Button>
                  ) : (
                    <span />
                  )}
                  <div className="flex items-center gap-2">
                    {dirty && (
                      <Button type="button" variant="outline" onClick={discard} disabled={pending}>
                        {t("invoiceSettings.discard")}
                      </Button>
                    )}
                    <Button
                      type="button"
                      onClick={save}
                      disabled={textInvalid || !dirty || pending}
                    >
                      {pending ? t("invoiceSettings.saving") : t("invoiceSettings.save")}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <AlertDialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("invoiceSettings.card.mailTemplates.deleteTitle", {
                name: selectedTemplate?.name ?? "",
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
                if (!selectedTemplate) return;
                deleteTemplate.mutate(selectedTemplate.id, {
                  onSuccess: () => {
                    toast.success(t("invoiceSettings.card.mailTemplates.deleted"));
                    setConfirmingDelete(false);
                    setSelectedId(null);
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
