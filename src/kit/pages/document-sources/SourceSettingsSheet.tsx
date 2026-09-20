import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ChevronDown, Loader2, RefreshCw, TriangleAlert, Wifi, X } from "lucide-react";

import type {
  ConnectionTestResult,
  DocumentSource,
  FieldOption,
  SourceField,
  SourceFieldValue,
  SourceIcon,
} from "../../adapters/document-sources";
import { Button } from "../../ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../../ui/collapsible";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { MultiCombobox } from "../../ui/multi-combobox";
import { TreePicker } from "../../ui/tree-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "../../ui/sheet";
import { Switch } from "../../ui/switch";
import { cn } from "../../lib/class-names";
import { SourceIconBadge, StatusChip } from "./source-visuals";
import type { DocumentSourcesLabels } from "./labels";
import {
  useConnectionTest,
  useDependentFieldOptions,
  useSourceForm,
} from "../../widgets/document-sources";

export interface SourceSettingsSheetProps {
  source: DocumentSource | null;
  labels: DocumentSourcesLabels;
  canEdit: boolean;
  onClose: () => void;
  onSave: (sourceId: string, values: Record<string, SourceFieldValue>) => Promise<void>;
  onRefreshOptions?: (sourceId: string, fieldKey: string) => void;
  onLoadFieldOptions?: (
    sourceId: string,
    fieldKey: string,
    dependsOnValue: string,
  ) => Promise<FieldOption[]>;
  onTestConnection?: (sourceId: string) => Promise<ConnectionTestResult>;
}

export function SourceSettingsSheet({
  source,
  labels,
  canEdit,
  onClose,
  onSave,
  onRefreshOptions,
  onLoadFieldOptions,
  onTestConnection,
}: SourceSettingsSheetProps) {
  return (
    <Sheet open={source !== null} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <SheetContent
        hideClose
        className="flex w-full flex-col gap-0 overflow-y-auto pb-0 sm:max-w-lg lg:max-w-xl"
      >
        {source && (
          <SheetBody
            key={source.id}
            source={source}
            labels={labels}
            canEdit={canEdit}
            onClose={onClose}
            onSave={onSave}
            onRefreshOptions={onRefreshOptions}
            onLoadFieldOptions={onLoadFieldOptions}
            onTestConnection={onTestConnection}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function SheetBody({
  source,
  labels,
  canEdit,
  onClose,
  onSave,
  onRefreshOptions,
  onLoadFieldOptions,
  onTestConnection,
}: SourceSettingsSheetProps & { source: DocumentSource }) {
  const form = useSourceForm(source, onSave, onClose);
  const { values, setValue, isDirty, saving, saveFailed: saveError } = form;
  const withDynamicOptions = useDependentFieldOptions(source, values, setValue, onLoadFieldOptions);
  const connection = useConnectionTest(source.id, onTestConnection, labels.sheet.saveFailed);
  const { testing, result: testResult } = connection;
  const test = connection.test;
  const save = form.save;

  const headerField = source.fields.find((field) => field.showInHeader);
  const bodyFields = source.fields.filter((field) => !field.showInHeader);
  const plainFields = bodyFields.filter((field) => !field.advanced);
  const advancedFields = bodyFields.filter((field) => field.advanced);

  const renderField = (field: SourceField, index?: number) => (
    <FieldRow
      key={field.key}
      field={withDynamicOptions(field)}
      value={values[field.key]}
      onChange={(value) => setValue(field.key, value)}
      onRefresh={onRefreshOptions ? () => onRefreshOptions(source.id, field.key) : undefined}
      labels={labels}
      stepNumber={index === undefined ? undefined : index + 1}
      isLastStep={index === plainFields.length - 1}
    />
  );

  return (
    <>
      <SheetHeader className="border-b border-border pb-4 text-left">
        <div className="flex items-start gap-3">
          <SourceIconBadge icon={source.icon} className="size-12" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3">
              <SheetTitle className="truncate text-left">{source.name}</SheetTitle>
              <div className="flex shrink-0 items-center gap-3">
                {headerField && (
                  <div className="flex items-center gap-2">
                    <Label className="text-sm text-muted-foreground">{headerField.label}</Label>
                    <Switch
                      checked={values[headerField.key] === true}
                      onCheckedChange={(checked) => setValue(headerField.key, checked)}
                      disabled={!canEdit}
                    />
                  </div>
                )}
                <SheetClose className="cursor-pointer rounded-sm text-muted-foreground opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring">
                  <X className="size-4" />
                  <span className="sr-only">{labels.sheet.close}</span>
                </SheetClose>
              </div>
            </div>
            <SheetDescription className="truncate text-left">{source.detail}</SheetDescription>
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
              <StatusChip status={source.status} labels={labels} />
              {source.lastChangedBy && (
                <span className="flex flex-wrap items-center gap-1.5 text-xs leading-5 text-muted-foreground">
                  {labels.sheet.lastChangedBy(
                    typeof source.lastChangedBy === "string"
                      ? source.lastChangedBy
                      : source.lastChangedBy.name,
                  )}
                  {typeof source.lastChangedBy === "object" && source.lastChangedBy.role && (
                    <span className="inline-flex items-center rounded-full bg-brand-wash px-2 py-0.5 text-[10px] font-semibold text-brand-dark">
                      {source.lastChangedBy.role}
                    </span>
                  )}
                </span>
              )}
            </div>
          </div>
        </div>
      </SheetHeader>

      <div className="flex-1 pt-5">
        {plainFields.map(renderField)}

        {advancedFields.length > 0 && (
          <Collapsible className="mt-2 border-t border-border py-4">
            <CollapsibleTrigger className="flex w-full cursor-pointer items-center justify-between text-sm font-semibold text-foreground">
              {labels.sheet.advanced}
              <ChevronDown className="size-4 text-muted-foreground" />
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-5 pt-4">
              {advancedFields.map((field) => renderField(field))}
            </CollapsibleContent>
          </Collapsible>
        )}

        {source.runs && source.runs.length > 0 && labels.sheet.recentRuns && (
          <div className="border-t border-border py-4">
            <p className="text-sm font-semibold text-foreground">{labels.sheet.recentRuns}</p>
            <div className="mt-2 space-y-1.5">
              {source.runs.map((run, index) => (
                <p key={index} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span
                    className={cn(
                      "size-1.5 shrink-0 rounded-full",
                      run.running
                        ? "animate-pulse bg-muted-foreground"
                        : run.ok
                          ? "bg-success"
                          : "bg-destructive",
                    )}
                  />
                  <span className="truncate">{run.text}</span>
                </p>
              ))}
            </div>
          </div>
        )}

        {onTestConnection && (
          <div className="border-t border-border pt-4">
            <Button type="button" variant="outline" size="sm" onClick={test} disabled={testing}>
              {testing ? <Loader2 className="animate-spin" /> : <Wifi />}
              {testing ? labels.sheet.testRunning : labels.sheet.testConnection}
            </Button>
            {testResult && (
              <p
                className={cn("mt-2 text-sm", testResult.ok ? "text-success" : "text-destructive")}
              >
                {testResult.message}
              </p>
            )}
          </div>
        )}
      </div>

      <SheetFooter className="sticky bottom-0 -mx-6 mt-auto flex-col gap-2 border-t border-border bg-popover px-6 py-4">
        {saveError && <p className="text-sm text-destructive">{labels.sheet.saveFailed}</p>}
        {!canEdit && <p className="text-xs text-muted-foreground">{labels.sheet.adminOnly}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            {labels.sheet.cancel}
          </Button>
          <Button type="button" onClick={save} disabled={saving || !canEdit || !isDirty}>
            {saving && <Loader2 className="animate-spin" />}
            {saving ? labels.sheet.saving : labels.sheet.save}
          </Button>
        </div>
      </SheetFooter>
    </>
  );
}

function FieldRow({
  field,
  value,
  onChange,
  onRefresh,
  labels,
  stepNumber,
  isLastStep,
}: {
  field: SourceField;
  value: SourceFieldValue;
  onChange: (value: SourceFieldValue) => void;
  onRefresh?: () => void;
  labels: DocumentSourcesLabels;
  stepNumber?: number;
  isLastStep?: boolean;
}) {
  const hasOptions =
    field.kind === "select" || field.kind === "multiSelect" || field.kind === "treeSelect";
  const isMulti = field.kind === "multiSelect";
  const selectedIds = Array.isArray(value) ? value : [];

  if (field.kind === "toggle") {
    return (
      <StepShell stepNumber={stepNumber} isLastStep={isLastStep} dataFokus={field.key}>
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <Label className="text-sm font-semibold text-foreground">{field.label}</Label>
            {field.description && (
              <p className="mt-0.5 text-sm text-muted-foreground">{field.description}</p>
            )}
          </div>
          <Switch checked={value === true} onCheckedChange={onChange} />
        </div>
      </StepShell>
    );
  }

  return (
    <StepShell stepNumber={stepNumber} isLastStep={isLastStep} dataFokus={field.key}>
      <div className="flex items-center justify-between gap-2">
        <Label className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          {field.icon && <FieldGlyph icon={field.icon} />}
          {field.label}
        </Label>
        {hasOptions && onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={field.optionsLoading}
            className="inline-flex cursor-pointer items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
          >
            <RefreshCw className={cn("size-3", field.optionsLoading && "animate-spin")} />
            {labels.sheet.refreshOptions}
          </button>
        )}
      </div>
      {field.description && (
        <p className="mt-0.5 text-sm text-muted-foreground">{field.description}</p>
      )}
      <div className="mt-2">
        <FieldControl field={field} value={value} onChange={onChange} labels={labels} />
      </div>
      {/* Under the control it describes, as a line of text rather than a panel. A bordered box
          above the field reads as a banner about the whole step, when what failed is only the list
          of choices behind this one input. */}
      {hasOptions && field.optionsError && (
        <p className="mt-1.5 flex items-start gap-1.5 text-xs text-destructive">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
          <span>
            {labels.sheet.optionsFailed}
            {typeof field.optionsError === "string" && (
              <span className="mt-0.5 block break-words opacity-80">{field.optionsError}</span>
            )}
          </span>
        </p>
      )}
      {isMulti && selectedIds.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {selectedIds.map((id) => (
            <span
              key={id}
              className="inline-flex max-w-full items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs text-foreground"
            >
              <span className="max-w-44 truncate" title={chipLabel(field.options, id, labels)}>
                {chipLabel(field.options, id, labels)}
              </span>
              <button
                type="button"
                onClick={() => onChange(selectedIds.filter((other) => other !== id))}
                className="cursor-pointer rounded-sm text-muted-foreground hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </StepShell>
  );
}

function StepShell({
  stepNumber,
  isLastStep,
  dataFokus,
  children,
}: {
  stepNumber?: number;
  isLastStep?: boolean;
  dataFokus?: string;
  children: ReactNode;
}) {
  if (stepNumber === undefined) {
    return <div data-fokus={dataFokus}>{children}</div>;
  }
  return (
    <div className="flex gap-4" data-fokus={dataFokus}>
      <div className="flex flex-col items-center">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-xs font-semibold text-foreground">
          {stepNumber}
        </span>
        {!isLastStep && <span className="mt-1 w-px flex-1 bg-border" />}
      </div>
      <div className={cn("min-w-0 flex-1", isLastStep ? "pb-2" : "pb-6")}>{children}</div>
    </div>
  );
}

/** One field's control, exported so a run-now dialog offers exactly the picker the sheet does. */
export function FieldControl({
  field,
  value,
  onChange,
  labels,
}: {
  field: SourceField;
  value: SourceFieldValue;
  onChange: (value: SourceFieldValue) => void;
  labels: DocumentSourcesLabels;
}) {
  const noneLabel = labels.sheet.none;
  const loadingLabel = labels.sheet.optionsLoading;
  const pickerText = {
    selectedCountText: labels.sheet.selectedCount,
    searchPlaceholder: labels.sheet.searchPlaceholder,
    emptyText: labels.sheet.noMatch,
  };
  const selectedIds = Array.isArray(value)
    ? value
    : typeof value === "string" && value
      ? [value]
      : [];
  const options = withSavedValues(field.options, selectedIds, field.optionsLoading === true);
  const placeholder = field.optionsLoading ? loadingLabel : (field.placeholder ?? noneLabel);

  switch (field.kind) {
    case "select":
      return (
        <Select
          value={typeof value === "string" && value !== "" ? value : NONE_VALUE}
          onValueChange={(next) => onChange(next === NONE_VALUE ? null : next)}
          disabled={field.optionsLoading}
        >
          <SelectTrigger>
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE_VALUE}>{noneLabel}</SelectItem>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    case "multiSelect":
      if (hasNestedOptions(field.options)) {
        return (
          <TreePicker
            nodes={treeNodes(field.options, selectedIds, field.optionsLoading === true)}
            values={selectedIds}
            onChange={onChange}
            multi
            placeholder={placeholder}
            disabled={field.optionsLoading}
            {...pickerText}
          />
        );
      }
      return (
        <MultiCombobox
          values={selectedIds}
          onValuesChange={onChange}
          options={options}
          placeholder={placeholder}
          disabled={field.optionsLoading}
          {...pickerText}
        />
      );
    case "treeSelect":
      return (
        <TreePicker
          nodes={treeNodes(field.options, selectedIds, field.optionsLoading === true)}
          values={selectedIds}
          onChange={(next) => onChange(next[0] ?? null)}
          multi={false}
          placeholder={placeholder}
          disabled={field.optionsLoading}
          {...pickerText}
        />
      );
    case "toggle":
      return <Switch checked={value === true} onCheckedChange={onChange} />;
    case "text":
      return (
        <Input
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
          placeholder={field.placeholder}
        />
      );
  }
}

const NONE_VALUE = "__none";

function withSavedValues(
  options: FieldOption[] | undefined,
  selectedIds: string[],
  loading: boolean,
): { value: string; label: string; depth?: number }[] {
  const flat = flattenTree(options ?? []);
  if (loading) {
    return flat;
  }
  const known = new Set(flat.map((option) => option.value));
  const missing = selectedIds.filter((id) => id && id !== NONE_VALUE && !known.has(id));
  return [...flat, ...missing.map((id) => ({ value: id, label: id }))];
}

function flattenTree(
  options: FieldOption[],
  depth = 0,
): { value: string; label: string; depth: number }[] {
  return options.flatMap((option) => {
    const children = flattenTree(option.children ?? [], depth + 1);
    if (!option.value) {
      return children;
    }
    return [{ value: option.value, label: option.label, depth }, ...children];
  });
}

function hasNestedOptions(options: FieldOption[] | undefined): boolean {
  return (options ?? []).some((option) => (option.children ?? []).length > 0);
}

function treeNodes(
  options: FieldOption[] | undefined,
  selectedIds: string[],
  loading: boolean,
): FieldOption[] {
  const known = new Set<string>();
  const walk = (list: FieldOption[]) => {
    for (const option of list) {
      known.add(option.value);
      walk(option.children ?? []);
    }
  };
  walk(options ?? []);
  const missing = loading
    ? []
    : selectedIds.filter((id) => id && id !== NONE_VALUE && !known.has(id));
  return [...(options ?? []), ...missing.map((id) => ({ value: id, label: id }))];
}

function chipLabel(
  options: FieldOption[] | undefined,
  id: string,
  labels: DocumentSourcesLabels,
): string {
  const found = labelFor(options, id);
  if (found !== null) {
    return found;
  }
  const shortId = `…${id.slice(-6)}`;
  return labels.sheet.unknownValue ? labels.sheet.unknownValue(shortId) : id;
}

function labelFor(options: FieldOption[] | undefined, id: string): string | null {
  for (const option of options ?? []) {
    if (option.value === id) {
      return option.label;
    }
    const nested = labelFor(option.children, id);
    if (nested !== null) {
      return nested;
    }
  }
  return null;
}

/** The provider mark beside a field label. Small and inline: it identifies, it does not decorate. */
function FieldGlyph({ icon }: { icon: SourceIcon }) {
  if (typeof icon === "object" && "imageSrc" in icon) {
    return <img src={icon.imageSrc} alt="" className="size-4 shrink-0 object-contain" />;
  }
  const Glyph = icon;
  return <Glyph className="size-4 shrink-0" />;
}
