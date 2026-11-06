export interface LoginFacts {
  lastSignInAt: string | null;
  neverSignedIn: boolean;
}

export type LoginStatus =
  | { kind: "never" }
  | { kind: "startPassword" }
  | { kind: "last"; at: string }
  | { kind: "unknown" };

export function loginStatusOf(
  mustChangePassword: boolean,
  facts: LoginFacts | null | undefined,
): LoginStatus {
  if (!facts) return { kind: "unknown" };
  if (facts.neverSignedIn || !facts.lastSignInAt) return { kind: "never" };
  if (mustChangePassword) return { kind: "startPassword" };
  return { kind: "last", at: facts.lastSignInAt };
}
