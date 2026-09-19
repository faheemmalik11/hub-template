export interface NotificationsPageLabels {
  title: string;
  subtitle: string;
  alertsTab: string;
  settingsTab: string;
  empty: string;
  readSectionTitle: string;
  anyTime: string;
  today: string;
  lastSevenDays: string;
  lastThirtyDays: string;
  remindButton: string;
  bellCardTitle: string;
  bellCardDescription: string;
  groupLabel: (groupKey: string) => string;
  eventLabel: (eventKey: string) => string;
  save: string;
  cancel: string;
  saved: string;
  saveFailed: string;
}

export const englishNotificationsPageLabels: NotificationsPageLabels = {
  title: "Notifications",
  subtitle: "Everything that needs your attention, and the reminders people sent you.",
  alertsTab: "Alerts",
  settingsTab: "Settings",
  empty: "Nothing new. Everything is up to date.",
  readSectionTitle: "Read",
  anyTime: "Any time",
  today: "Today",
  lastSevenDays: "Last 7 days",
  lastThirtyDays: "Last 30 days",
  remindButton: "Remind a person",
  bellCardTitle: "Bell in the Hub",
  bellCardDescription: "Which items the bell in the top right shows.",
  groupLabel: (groupKey) => groupKey,
  eventLabel: (eventKey) => eventKey,
  save: "Save",
  cancel: "Cancel",
  saved: "Saved.",
  saveFailed: "Saving failed.",
};
