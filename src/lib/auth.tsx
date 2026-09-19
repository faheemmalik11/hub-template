/**
 * Auth gegen Supabase (TP-2). Echte E-Mail/Passwort-Anmeldung; kein Self-Signup
 * (die Login-Seite bietet keine Registrierung — Konten werden in Supabase
 * angelegt). Session wird von Supabase verwaltet (localStorage, Auto-Refresh).
 *
 * Role + company access (Briefing Screen 17, Appendix A7) is loaded from `app_users` /
 * `user_company_access` alongside the session. This mirrors, on the client, exactly what the
 * DB's `has_company_access()`/`current_role_name()` RLS helpers compute server-side (migration
 * 0046) -- same email match, same "no active grants recorded = unrestricted" fallback -- so the
 * UI narrows in step with what RLS actually allows, never showing something it can't fetch or
 * hiding something it could. RLS remains the real security boundary; this is only the UX layer.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";
import { TABLE } from "@/config/tables";

export type AppRole = "super_admin" | "admin" | "supervisor" | "assistant";

type SessionUser = { email: string; name: string };

type Profile = {
  appUserId: string;
  // `app_users.name` -- the authoritative display name (required on every employee since
  // Team & Rollen, used everywhere an approver/actor is shown by name). Overrides the
  // email-derived fallback in toUser() once it's loaded; see applySession.
  name: string | null;
  /** `app_users.picture_url` -- the round picture in the header, null when none was uploaded. */
  pictureUrl: string | null;
  role: AppRole | null;
  allowedCompanyIds: string[] | "all";
  mustChangePassword: boolean;
  permissions: string[];
  /** The permission lookup itself failed (RPC missing or erroring), as opposed to the account
   *  genuinely holding nothing. Both produce an empty set; only this one is a fault. */
  permissionsUnavailable: boolean;
};

// Auth failures are returned as a stable CODE, not a ready-made sentence, so the login and
// set-password screens can render them in the active UI language. Those screens sit outside
// AppShell and carry their own language switch, so a hard-coded German string there would be the
// one thing on the page ignoring the toggle. `raw` carries an unmapped provider message as a
// last-resort fallback.
export type AuthErrorCode =
  | "missing_credentials"
  | "invalid_login"
  | "email_not_confirmed"
  | "rate_limited"
  | "account_deactivated"
  | "password_too_short"
  | "unknown";

export type AuthResult = { ok: boolean; code?: AuthErrorCode; raw?: string };

type AuthContextValue = {
  ready: boolean;
  user: SessionUser | null;
  role: AppRole | null;
  /** The signed-in person's profile picture, null when they never uploaded one. */
  pictureUrl: string | null;
  /** app_users.id of the signed-in person; null until the profile row is loaded. */
  appUserId: string | null;
  /** What this person may DO, resolved by current_permissions() (role defaults merged with
   *  personal overrides). Empty until the profile row is loaded, so a half-loaded session can
   *  never approve or pay. RLS remains the real boundary; this is the UX layer. */
  permissions: string[];
  /** True when the signed-in account holds `key`. Use this instead of testing `role`. */
  can: (key: string) => boolean;
  /** The permission lookup failed — an empty `permissions` is a fault here, not an answer. */
  permissionsUnavailable: boolean;
  allowedCompanyIds: string[] | "all";
  isAdmin: boolean;
  mustChangePassword: boolean;
  login: (email: string, password: string) => Promise<AuthResult>;
  logout: () => Promise<void>;
  // Sets a new password for the current session AND clears must_change_password server-side
  // (via the clear_must_change_password RPC, migration 0048) in one step -- a new employee's
  // temp password (createEmployee) must not remain usable once they've set their own.
  completePasswordChange: (newPassword: string) => Promise<AuthResult>;
  /** Re-reads the signed-in account's permissions without a page reload. */
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

// Deactivated (A7: "deactivated, not deleted" on offboarding) still resolves a role/id, so the
// caller can tell "no app_users row at all" (null) apart from "row exists but is inactive" --
// the latter needs a sign-out with an explanation, not a silent stuck loading state.
async function fetchProfile(email: string): Promise<(Profile & { isActive: boolean }) | null> {
  const { data: appUser, error } = await sb
    .from(TABLE.appUsers)
    .select(`id, name, picture_url, is_active, must_change_password, ${TABLE.roles}(name)`)
    // eq on a lowercased email, NOT ilike: `_` and `%` are LIKE wildcards, and login() now feeds
    // raw form input straight into this. `max_mustermann@x.de` would also match
    // `maxxmustermann@x.de` -- two matches make .maybeSingle() error (silently skipping the
    // deactivation check), one wrong match signs an active user out as "deactivated".
    .eq("email", email.trim().toLowerCase())
    .maybeSingle();
  if (error || !appUser) return null;

  const row = appUser as unknown as {
    id: string;
    name: string | null;
    picture_url: string | null;
    is_active: boolean;
    must_change_password: boolean;
    roles: { name: string } | null;
  };
  const role = (row.roles?.name as AppRole | undefined) ?? null;

  if (!row.is_active) {
    return {
      appUserId: row.id,
      name: row.name,
      pictureUrl: row.picture_url,
      role,
      allowedCompanyIds: "all",
      mustChangePassword: false,
      isActive: false,
      permissions: [],
      permissionsUnavailable: false,
    };
  }

  const { data: grants } = await sb
    .from(TABLE.userCompanyAccess)
    .select("company_id")
    .eq("user_id", row.id)
    .eq("can_view", true)
    .is("deleted_at", null);

  const allowedCompanyIds: string[] | "all" =
    grants && grants.length > 0
      ? (grants as { company_id: string }[]).map((g) => g.company_id)
      : "all";

  // Resolved server-side by current_permissions() rather than recomputed here: the same function
  // backs has_permission() in RLS, so the UI can never offer something the database will refuse.
  //
  // A failure here is reported, not swallowed. The set fails CLOSED -- an empty list hides every
  // gated nav entry and every approve/pay control -- which is right for security and unreadable as
  // UX: on a database where this migration has not run, the app would open with an empty sidebar
  // and no way to tell that apart from "you have no rights". `permissionsUnavailable` lets the
  // shell say which of the two it is.
  const { data: perms, error: permsError } = await sb.rpc("current_permissions");
  const permissions = Array.isArray(perms)
    ? (perms as (string | { current_permissions: string })[]).map((row) =>
        typeof row === "string" ? row : row.current_permissions,
      )
    : [];

  return {
    appUserId: row.id,
    name: row.name,
    pictureUrl: row.picture_url,
    role,
    allowedCompanyIds,
    mustChangePassword: row.must_change_password,
    isActive: true,
    permissions,
    permissionsUnavailable: !!permsError,
  };
}

function nameFromEmail(email: string) {
  const local = email.split("@")[0] ?? "";
  return (
    local
      .split(/[.\-_]/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ") || email
  );
}

function toUser(session: Session | null): SessionUser | null {
  const u = session?.user;
  if (!u?.email) return null;
  const metaName =
    typeof u.user_metadata?.name === "string" ? (u.user_metadata.name as string) : "";
  return { email: u.email, name: metaName || nameFromEmail(u.email) };
}

// Supabase's own English error text -> our stable code. Anything unrecognised becomes 'unknown'
// and the caller shows the provider's raw wording, which still beats a blank failure.
function errorCode(message: string): AuthErrorCode {
  const m = message.toLowerCase();
  if (m.includes("invalid login")) return "invalid_login";
  if (m.includes("email not confirmed")) return "email_not_confirmed";
  if (m.includes("rate limit")) return "rate_limited";
  return "unknown";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  // Generation counter for profile loads. applySession() awaits a network round trip before
  // writing state, so a load that started earlier can resolve LATER and clobber newer state. Any
  // write that supersedes what an in-flight load is about to produce bumps this, and the stale
  // load then discards its own result instead of applying it.
  //
  // The bug this fixes: supabase.auth.updateUser({ password }) emits USER_UPDATED, which starts an
  // applySession that reads must_change_password while it is STILL true, because
  // clear_must_change_password has not run yet. The RPC then cleared the flag in state and the
  // late-resolving read put it straight back to true, leaving the user staring at the
  // set-password form after a successful save until a manual refresh.
  const profileGeneration = useRef(0);

  useEffect(() => {
    let mounted = true;

    async function applySession(session: Session | null) {
      const generation = ++profileGeneration.current;
      const nextUser = toUser(session);
      if (!nextUser) {
        if (mounted) setProfile(null);
        if (mounted) setUser(null);
        return;
      }
      const found = await fetchProfile(nextUser.email);
      if (!mounted || generation !== profileGeneration.current) return;
      if (found && !found.isActive) {
        // A7 offboarding: deactivated, not deleted. A deactivated account must not keep a live
        // session just because the Supabase Auth login itself still succeeds -- RLS would deny
        // almost everything anyway, but a signed-out state with a clear reason is honest,
        // a half-working app full of empty screens is not.
        await supabase.auth.signOut();
        setUser(null);
        setProfile(null);
        return;
      }
      // Prefer the real saved name (app_users.name) over the email-derived fallback in nextUser
      // -- toUser() has no way to know it, since that field lives in app_users, not the Supabase
      // Auth session/metadata it reads. "buchhaltung@netz.immo" was showing as "Buchhaltung" in
      // the header for exactly this reason before this fix.
      setUser(found?.name ? { ...nextUser, name: found.name } : nextUser);
      setProfile(
        found
          ? {
              appUserId: found.appUserId,
              name: found.name,
              pictureUrl: found.pictureUrl,
              role: found.role,
              allowedCompanyIds: found.allowedCompanyIds,
              mustChangePassword: found.mustChangePassword,
              permissions: found.permissions,
              permissionsUnavailable: found.permissionsUnavailable,
            }
          : null,
      );
    }

    supabase.auth.getSession().then(async ({ data }) => {
      await applySession(data.session);
      if (mounted) setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      void applySession(session);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const login: AuthContextValue["login"] = async (email, password) => {
    if (!email.trim() || !password) {
      return { ok: false, code: "missing_credentials" };
    }
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) return { ok: false, code: errorCode(error.message), raw: error.message };

    // A deactivated account still authenticates successfully: is_active lives in app_users, not in
    // Supabase Auth, so signInWithPassword has no opinion about it. applySession() already bounces
    // such a session, but it can only sign the person out -- from the login form that looks like
    // the submit silently did nothing, since the screen it returns to IS the login screen.
    // Checking here is what lets us say WHY, in the same error slot as a wrong password.
    const found = await fetchProfile(email.trim());
    if (found && !found.isActive) {
      await supabase.auth.signOut();
      return { ok: false, code: "account_deactivated" };
    }
    return { ok: true };
  };

  const logout = async () => {
    await supabase.auth.signOut();
  };

  /**
   * Re-read the signed-in account's own row.
   *
   * The profile is loaded once per session, so an admin who changed their OWN rights -- or their
   * role's -- kept the old set until a reload, which reads as "the switch did nothing". Called by
   * Team & Rollen after any grant or revoke; cheap enough to call unconditionally rather than work
   * out whether the change touched the current user, and correct for the role case, where it can
   * touch them without naming them. Mein Profil calls it after a name or picture change, both of
   * which the header shows.
   */
  const refreshProfile = async () => {
    const email = user?.email;
    if (!email) return;
    const found = await fetchProfile(email);
    if (!found || !found.isActive) return;
    // Bumped so an applySession() still in flight cannot overwrite this with the older set -- the
    // same race the generation counter exists for.
    profileGeneration.current++;
    setProfile((prev) =>
      prev
        ? {
            ...prev,
            name: found.name,
            pictureUrl: found.pictureUrl,
            permissions: found.permissions,
            permissionsUnavailable: found.permissionsUnavailable,
          }
        : prev,
    );
    if (found.name) setUser((prev) => (prev ? { ...prev, name: found.name! } : prev));
  };

  const completePasswordChange: AuthContextValue["completePasswordChange"] = async (
    newPassword,
  ) => {
    if (newPassword.length < 8) {
      return { ok: false, code: "password_too_short" };
    }
    const { error: pwError } = await supabase.auth.updateUser({ password: newPassword });
    if (pwError) return { ok: false, code: errorCode(pwError.message), raw: pwError.message };

    const { error: rpcError } = await sb.rpc("clear_must_change_password");
    if (rpcError) {
      // The password itself is already set at this point -- the RPC only clears the flag, so a
      // failure here must not be reported as "your new password didn't take". It leaves the user
      // stuck back on this same screen next load (must_change_password still true), which is a
      // safe failure mode: annoying, never a security gap, and retryable with the new password.
      return { ok: false, code: errorCode(rpcError.message), raw: rpcError.message };
    }

    // Supersede any profile load still in flight from updateUser()'s USER_UPDATED event before
    // writing the cleared flag -- see profileGeneration's own comment.
    profileGeneration.current++;
    setProfile((prev) => (prev ? { ...prev, mustChangePassword: false } : prev));
    return { ok: true };
  };

  const role = profile?.role ?? null;
  // Memoized so `can` keeps a stable identity across renders: it is a dependency of every memo
  // that filters nav entries or actions by permission, and a fresh arrow each render would make
  // all of them recompute on every render.
  const permissions = useMemo(() => profile?.permissions ?? [], [profile?.permissions]);
  const can = useCallback((key: string) => permissions.includes(key), [permissions]);

  return (
    <AuthContext.Provider
      value={{
        ready,
        user,
        role,
        allowedCompanyIds: profile?.allowedCompanyIds ?? "all",
        isAdmin: role === "admin" || role === "super_admin",
        appUserId: profile?.appUserId ?? null,
        pictureUrl: profile?.pictureUrl ?? null,
        permissions,
        can,
        permissionsUnavailable: profile?.permissionsUnavailable ?? false,
        mustChangePassword: profile?.mustChangePassword ?? false,
        login,
        logout,
        completePasswordChange,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth muss innerhalb von AuthProvider genutzt werden");
  return ctx;
}
