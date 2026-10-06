/**
 * What the Team screen offers for this client.
 *
 * `approvalSettings` is the area of responsibility, the deputy and the escalation days on a person.
 * Off for van Oepen: the areas it offers (hospitality, stay) belong to other clients, and approval
 * here is by one person. The columns stay in the database; this only hides the controls.
 */
export const TEAM = {
  approvalSettings: false,
} as const;
