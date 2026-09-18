// Shared by a desktop table row and its mobile card equivalent across the integration-config
// pages (DATEV, LexOffice, ...), so the two can never disagree about what "configured" looks
// like. Labels are passed in already-translated (not looked up here) since each caller owns its
// own page-scoped i18n key for the exact wording.
//
// THREE STATES, NOT TWO. This component used to take a single `configured` boolean, which meant a
// configuration that existed but had been switched off still rendered as a green "Konfiguriert".
// Confirmed live on LexOffice: toggling IMKO's Aktiv switch off changed nothing in the status
// column, so the only sign the integration had been disabled was the switch itself, on the very tab
// whose job is managing that configuration.
//
// The DATEV screen had already solved this with its own bespoke three-state component, while still
// importing this one and never using it. So the two-state version was not a simplification anybody
// chose, it was the older design that DATEV outgrew and LexOffice never caught up with. Both now
// share this, which is what the comment above always claimed.
//
// `enabled` is only meaningful when `configured` is true, and is optional so a caller with no
// enable/disable concept keeps the old two-state behaviour.
//
// The dots are `bg-success` / `bg-warning` rather than raw `emerald-500` / `amber-500`. Those were
// the last hard-coded palette colours on either integration screen, and beside the DATEV screen's
// own success and warning marks they read as a second, slightly different green and amber. Needs
// the status ramp in `styles.css` — see features/datev-handover/PORTING.md if this is copied into a
// repo that has not got it.
export function RouteStatus({
  configured,
  enabled = true,
  configuredLabel,
  notConfiguredLabel,
  disabledLabel,
}: {
  configured: boolean;
  enabled?: boolean;
  configuredLabel: string;
  notConfiguredLabel: string;
  /** Falls back to the configured label when a caller has no disabled state to describe. */
  disabledLabel?: string;
}) {
  if (!configured) {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
        <span className="size-2 shrink-0 rounded-full bg-muted-foreground/40" />
        {notConfiguredLabel}
      </span>
    );
  }
  if (!enabled) {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
        <span className="size-2 shrink-0 rounded-full bg-warning" />
        {disabledLabel ?? configuredLabel}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-foreground">
      <span className="size-2 shrink-0 rounded-full bg-success" />
      {configuredLabel}
    </span>
  );
}
