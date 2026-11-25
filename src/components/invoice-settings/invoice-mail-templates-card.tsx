import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/feld";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  useDonationSettings,
  useInvoiceMailTemplates,
  useUpdateInvoiceMailTemplate,
  type InvoiceMailTemplate,
  type InvoiceMailTemplateCase,
} from "@/data";
import { errorText, formatEUR } from "@/lib/data/format";
import { useTranslation } from "@/lib/i18n";

function TemplateFields({
  template,
  canEdit,
}: {
  template: InvoiceMailTemplate;
  canEdit: boolean;
}) {
  const { t } = useTranslation();
  const update = useUpdateInvoiceMailTemplate();
  const [subject, setSubject] = useState(template.subject);
  const [body, setBody] = useState(template.body);

  useEffect(() => {
    setSubject(template.subject);
    setBody(template.body);
  }, [template.subject, template.body]);

  const dirty = subject !== template.subject || body !== template.body;

  return (
    <div className="space-y-3 rounded-lg border border-border/60 p-4">
      <h3 className="text-sm font-semibold text-foreground">
        {t(`invoiceSettings.card.mailTemplates.case.${template.case_key}`)}
      </h3>
      <Field className="space-y-1.5">
        <Label>{t("invoiceSettings.card.mailTemplates.subject")}</Label>
        <Input
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
          disabled={!canEdit}
        />
      </Field>
      <Field className="space-y-1.5">
        <Label>{t("invoiceSettings.card.mailTemplates.body")}</Label>
        <Textarea
          rows={8}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          disabled={!canEdit}
        />
      </Field>
      {canEdit && (
        <Button
          size="sm"
          disabled={!dirty || update.isPending}
          onClick={() =>
            update.mutate(
              { case_key: template.case_key, subject, body },
              {
                onSuccess: () => toast.success(t("invoiceSettings.card.mailTemplates.saved")),
                onError: (error) =>
                  toast.error(t("invoiceSettings.toast.failed", { error: errorText(error) })),
              },
            )
          }
        >
          {t("invoiceSettings.save")}
        </Button>
      )}
    </div>
  );
}

export function InvoiceMailTemplatesCard({ canEdit }: { canEdit: boolean }) {
  const { t } = useTranslation();
  const templatesQ = useInvoiceMailTemplates();
  const donationSettingsQ = useDonationSettings();

  if (!templatesQ.data) return null;

  const order: InvoiceMailTemplateCase[] = [
    "buyer",
    "seller_under_threshold",
    "seller_over_threshold",
  ];
  const byCase = new Map(templatesQ.data.map((template) => [template.case_key, template]));

  return (
    <Card className="flex flex-col shadow-none">
      <CardHeader>
        <CardTitle>{t("invoiceSettings.card.mailTemplates.title")}</CardTitle>
        <CardDescription>
          {donationSettingsQ.data
            ? t("invoiceSettings.card.mailTemplates.desc", {
                amount: formatEUR(donationSettingsQ.data.threshold_amount),
              })
            : t("invoiceSettings.card.mailTemplates.descNoAmount")}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-3">
        {order.map((caseKey) => {
          const template = byCase.get(caseKey);
          return template ? (
            <TemplateFields key={caseKey} template={template} canEdit={canEdit} />
          ) : null;
        })}
      </CardContent>
    </Card>
  );
}
