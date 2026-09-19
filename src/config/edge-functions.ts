/**
 * Every Edge Function this app invokes, spelled once.
 *
 * The name is a URL in disguise: a typo is a 404 at run time, in front of a client, and nothing in
 * the type system notices. Listing them here also answers "what runs outside the browser" without
 * a search.
 */
export const EDGE_FUNCTION = {
  bankConnect: "bank-connect",
  bankDisconnect: "bank-disconnect",
  bankSync: "bank-sync",
  notifyDispatch: "notify-dispatch",
  paymentInitiate: "payment-initiate",
  paymentCancel: "payment-cancel",
  expenseToolEmployees: "pleo-employees",
} as const;

export type EdgeFunctionName = (typeof EDGE_FUNCTION)[keyof typeof EDGE_FUNCTION];
