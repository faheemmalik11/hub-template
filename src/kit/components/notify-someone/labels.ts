/**
 * Every string the notify components put on screen.
 *
 * Presentational on purpose, like the rest of the kit: each hub keeps its own i18n dictionary and
 * its own data layer, so the kit owns the shape and none of the wording.
 */
export interface NotifySomeoneLabels {
  /** The trigger button. */
  action: string;
  title: string;
  /** Under the title. Says where the message lands. */
  description: string;
  recipientLabel: string;
  recipientPlaceholder: string;
  noteLabel: string;
  notePlaceholder: string;
  cancel: string;
  send: string;
  sending: string;
  sent: string;
  failed: (message: string) => string;
  unknownError: string;
  /** Empty recipient list: everybody else is deactivated, or you are the only account. */
  noRecipients: string;
}

export const englishNotifySomeoneLabels: NotifySomeoneLabels = {
  action: "Notify someone",
  title: "Ask someone to look at this",
  description: "They get it in their bell, and as a direct message if Slack is connected.",
  recipientLabel: "Recipient",
  recipientPlaceholder: "Choose a person",
  noteLabel: "Note (optional)",
  notePlaceholder: "What should they look at?",
  cancel: "Cancel",
  send: "Send",
  sending: "Sending...",
  sent: "Sent",
  failed: (message) => "Nothing was sent. " + message,
  unknownError: "Unknown error.",
  noRecipients: "There is nobody else to notify.",
};

/** What the banner on the notified record says. */
export interface NotifyBannerLabels {
  /** Shown in place of the sender's name when the account is gone. */
  fromUnknown: string;
  /** Stands in for the message when the sender left the note empty. */
  noNote: string;
  dismiss: string;
}

export const englishNotifyBannerLabels: NotifyBannerLabels = {
  fromUnknown: "Somebody",
  noNote: "asked you to look at this",
  dismiss: "Dismiss",
};
