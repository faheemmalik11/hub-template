// Server functions backing the Team & Rollen screen (Briefing Screen 17, Appendix A7). Creating
// a real login-capable employee needs the Supabase Admin Auth API (service role) -- something
// only server code can hold -- so this one mutation can't live in the client-side query layer
// the way most of this app's writes do (see the staey-data skill). Everything else on that
// screen (role change, company-access grants, deactivation) is a plain RLS-gated row write from
// the client, since app_users/user_company_access already carry admin-only write policies
// (migration 0046) -- no server function needed for those.
import { randomBytes } from "node:crypto";

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PERMISSIONS } from "@/lib/permissions";
import { requirePermission } from "./require-permission";
import { AppError, UnauthorizedError } from "./errors";
import { TABLE } from "@/lib/data/tables";

// The generated Database type only knows a handful of tables (see CLAUDE.md) -- app_users,
// roles, user_company_access, change_history aren't in it, so writes go through an untyped
// client, same convention as datev-handover.functions.ts.
type Db = any; // eslint-disable-line @typescript-eslint/no-explicit-any

function tempPassword(): string {
  // 18 random bytes, base64url -- long enough to be a safe one-time password, never persisted
  // anywhere except handed back once to the admin who created the account.
  return randomBytes(18).toString("base64url");
}

// Shared by every mutation here: resolve the caller's own app_users row via the service-role
// client (bypasses RLS, so this is the real check, not just a UX gate) and require an active
// admin/super_admin. Throws instead of returning false, so callers don't have to remember to
// check a boolean.
async function requireActiveAdmin(db: Db, callerEmail: string): Promise<{ id: string }> {
  return requirePermission(
    db,
    callerEmail,
    PERMISSIONS.pageTeam,
    "Only admins may manage employees",
  );
}

const CreateEmployeeSchema = z.object({
  email: z.string().email(),
  name: z.string().trim().min(1), // display name -- used everywhere an approver/actor is shown by name, not email
  roleName: z.enum(["admin", "supervisor", "assistant"]), // super_admin is never assignable here (A7: invisible to client)
  companyIds: z.array(z.string().uuid()), // empty = unrestricted (mirrors has_company_access's "no grants" default)
});

export const createEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(CreateEmployeeSchema)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as Db;

    const callerEmail = (context.claims as { email?: string } | undefined)?.email;
    if (!callerEmail) throw new UnauthorizedError("No email on the authenticated session");
    const caller = await requireActiveAdmin(db, callerEmail);

    const { data: role } = await db
      .from(TABLE.roles)
      .select("id")
      .eq("name", data.roleName)
      .maybeSingle();
    if (!role) throw new AppError(`Role ${data.roleName} not found`, 500, "ROLE_NOT_FOUND");

    // Check for an existing app_users row (any status, including soft-deleted/inactive) up front
    // -- app_users_email_lower_idx is a case-insensitive unique index, and without this check
    // we'd only find out after already creating a Supabase Auth account, forcing an immediate
    // create-then-rollback round-trip for what is really just a validation failure.
    const { data: existing } = await db
      .from(TABLE.appUsers)
      .select("id")
      .ilike("email", data.email)
      .maybeSingle();
    if (existing) {
      throw new AppError(
        `Ein Mitarbeiter mit der E-Mail-Adresse ${data.email} existiert bereits.`,
        409,
        "EMAIL_ALREADY_EXISTS",
      );
    }

    const password = tempPassword();
    const { data: created, error: createError } = await db.auth.admin.createUser({
      email: data.email.trim().toLowerCase(),
      password,
      email_confirm: true,
    });
    if (createError || !created.user) {
      throw new AppError(
        `Could not create the Supabase Auth account: ${createError?.message ?? "unknown error"}`,
        502,
        "AUTH_CREATE_FAILED",
      );
    }

    // Created inactive on purpose, activated only as the LAST step below. has_company_access()
    // denies an inactive account outright regardless of grants, so if the company-access insert
    // fails partway through, the half-created employee is simply unable to log in yet -- not,
    // per has_company_access's "no grants recorded = unrestricted" default, briefly able to see
    // every company until someone notices and fixes it.
    const { data: appUser, error: insertError } = await db
      .from(TABLE.appUsers)
      .insert({
        auth_user_id: created.user.id,
        email: data.email.trim().toLowerCase(),
        name: data.name,
        role_id: (role as { id: string }).id,
        is_active: false,
        must_change_password: true,
        created_by: caller.id,
      })
      .select("id")
      .single();
    if (insertError) {
      // The Auth account now exists but the app_users row failed -- roll the Auth side back
      // rather than leaving an orphaned login nobody can see or manage from the Team screen.
      await db.auth.admin.deleteUser(created.user.id);
      throw new AppError(
        `Auth account created but the employee record failed to save: ${insertError.message}`,
        500,
        "DB_ERROR",
      );
    }

    const employeeId = (appUser as { id: string }).id;

    if (data.companyIds.length > 0) {
      const { error: accessError } = await db.from(TABLE.userCompanyAccess).insert(
        data.companyIds.map((companyId) => ({
          user_id: employeeId,
          company_id: companyId,
          can_view: true,
          created_by: caller.id,
        })),
      );
      if (accessError) {
        throw new AppError(
          `Employee created but company access could not be saved (account left inactive, ` +
            `safe to retry from the Team screen): ${accessError.message}`,
          500,
          "DB_ERROR",
        );
      }
    }

    const { error: activateError } = await db
      .from(TABLE.appUsers)
      .update({ is_active: true })
      .eq("id", employeeId);
    if (activateError) {
      throw new AppError(
        `Employee and access saved but the account could not be activated ` +
          `(safe to retry from the Team screen): ${activateError.message}`,
        500,
        "DB_ERROR",
      );
    }

    await db.from(TABLE.changeHistory).insert({
      table_name: "app_users",
      record_id: employeeId,
      type: "user_created",
      text: `Mitarbeiter angelegt (Rolle: ${data.roleName})`,
      actor: callerEmail,
      data: { email: data.email, role: data.roleName, company_ids: data.companyIds },
    });

    return { employeeId, email: data.email, tempPassword: password };
  });

const UpdateEmployeeProfileSchema = z.object({
  employeeId: z.string().uuid(),
  name: z.string().trim().min(1),
  email: z.string().email(),
});

// Renaming is a plain client-side app_users write (no auth implications), but changing the
// EMAIL is not: app_users.email is what has_company_access()/current_role_name() match against
// auth.jwt()->>'email' to resolve who's calling. If the app_users row changed but the
// Supabase Auth account's real login email didn't, the two fall out of sync and the employee
// stops resolving to any role at all on their next request -- effectively locked out, silently,
// the next time they load the app. So both sides update together here, server-side, same
// service-role requirement as account creation.
// The super admin's login identity is not an admin's to change. Both call sites below reach the
// service-role Admin API -- one moves the Supabase Auth email, the other sets a new password -- so
// either is a full account takeover of the one unrestricted account in the system. The UI disables
// both controls, but the UI is not a boundary: these are POST endpoints any authenticated admin can
// call directly. The DB trigger (20260813120000) guards is_active and role_id; email and password
// live in auth.users, out of its reach, so they are guarded here.
async function assertNotSuperAdmin(db: Db, employeeId: string): Promise<void> {
  const { data, error } = await db
    .from(TABLE.appUsers)
    .select(`${TABLE.roles}(name)`)
    .eq("id", employeeId)
    .maybeSingle();
  // Fails CLOSED. Discarding the error let a transient PostgREST failure or a schema-cache miss on
  // the roles(name) embed read as "not a super admin", waving the caller straight through to the
  // service-role Admin API -- the exact takeover this guard exists to stop.
  if (error)
    throw new AppError(`Could not verify the target account: ${error.message}`, 502, "DB_ERROR");
  if (!data) throw new AppError("Employee not found", 404, "NOT_FOUND");
  const role = (data as { roles?: { name?: string } | null }).roles?.name;
  if (role === "super_admin") {
    throw new AppError(
      "The super admin account cannot be modified from the Team screen.",
      403,
      "SUPER_ADMIN_PROTECTED",
    );
  }
}

export const updateEmployeeProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(UpdateEmployeeProfileSchema)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as Db;

    const callerEmail = (context.claims as { email?: string } | undefined)?.email;
    if (!callerEmail) throw new UnauthorizedError("No email on the authenticated session");
    await requireActiveAdmin(db, callerEmail);

    const { data: target } = await db
      .from(TABLE.appUsers)
      .select("id, auth_user_id, email")
      .eq("id", data.employeeId)
      .maybeSingle();
    if (!target) throw new AppError("Employee not found", 404, "NOT_FOUND");

    const emailChanged =
      (target as { email: string }).email.toLowerCase() !== data.email.toLowerCase();

    if (emailChanged) {
      // Renaming a super admin is deliberately allowed -- it is the only field Team & Rollen lets
      // an admin edit on that row, and the whole reason the row is listed at all. Only MOVING ITS
      // LOGIN IDENTITY is forbidden, so the guard sits here rather than at the top of the handler,
      // where it rejected the rename too and made the feature unusable.
      await assertNotSuperAdmin(db, data.employeeId);
      const { error: authError } = await db.auth.admin.updateUserById(
        (target as { auth_user_id: string }).auth_user_id,
        { email: data.email.trim().toLowerCase(), email_confirm: true },
      );
      if (authError) {
        throw new AppError(
          `Could not update the login email: ${authError.message}`,
          502,
          "AUTH_UPDATE_FAILED",
        );
      }
    }

    const { error: updateError } = await db
      .from(TABLE.appUsers)
      .update({
        name: data.name,
        // Stored lowercase: fetchProfile() matches with eq(), and every DB helper uses
        // lower(email). zod .email() does not normalise case, so it is done here.
        email: data.email.trim().toLowerCase(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.employeeId);
    if (updateError) {
      if (emailChanged) {
        // Best-effort revert so the Auth account's login email doesn't end up ahead of what
        // app_users records -- if this itself fails, the admin's error toast plus the original
        // app_users.email in the DB are still enough to see and fix the drift by hand.
        await db.auth.admin.updateUserById((target as { auth_user_id: string }).auth_user_id, {
          email: (target as { email: string }).email,
        });
      }
      throw new AppError(
        `Could not save the employee profile: ${updateError.message}`,
        500,
        "DB_ERROR",
      );
    }

    await db.from(TABLE.changeHistory).insert({
      table_name: "app_users",
      record_id: data.employeeId,
      type: "profile_updated",
      text: `Profil aktualisiert${emailChanged ? " (inkl. E-Mail-Änderung)" : ""}`,
      actor: callerEmail,
      data: { name: data.name, email: data.email, email_changed: emailChanged },
    });

    return { employeeId: data.employeeId, name: data.name, email: data.email };
  });

const ResetEmployeePasswordSchema = z.object({
  employeeId: z.string().uuid(),
});

// Admin-triggered password reset (Team screen): generates a fresh one-time temp password --
// same tempPassword() helper and "never persisted, shown once" convention as createEmployee --
// writes it to the real Supabase Auth account via the service-role Admin API, and flips
// must_change_password back to true so the employee lands on SetNewPasswordScreen
// (auth-gate.tsx) on their next login instead of being able to keep using the old (now
// invalidated) or new temp password indefinitely. Restricted to active employees only: an
// inactive account can't log in at all (has_company_access()/current_role_name() both deny it
// regardless of a valid password), so handing out a temp password for one would be misleading --
// reactivate via the Team screen first.
//
// Also doubles as "create the missing login": some app_users rows predate createEmployee
// (seeded directly in the DB, e.g. the two bootstrap accounts -- see ROLES_AND_ACCESS.md) and
// were never linked to a real Supabase Auth account. Rather than rejecting those with a
// dead-end error, this creates the Auth account now (same as createEmployee) and links
// auth_user_id -- an employee with no login and an employee whose login needs replacing are the
// same problem from this screen's point of view ("give them a working temp password"), so one
// action covers both instead of requiring a separate admin flow for the first-login case.
export const resetEmployeePassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(ResetEmployeePasswordSchema)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as Db;

    const callerEmail = (context.claims as { email?: string } | undefined)?.email;
    if (!callerEmail) throw new UnauthorizedError("No email on the authenticated session");
    await requireActiveAdmin(db, callerEmail);
    await assertNotSuperAdmin(db, data.employeeId);

    const { data: target } = await db
      .from(TABLE.appUsers)
      .select("id, auth_user_id, email, is_active")
      .eq("id", data.employeeId)
      .maybeSingle();
    if (!target) throw new AppError("Employee not found", 404, "NOT_FOUND");
    if (!(target as { is_active: boolean }).is_active) {
      throw new AppError(
        "Cannot reset the password of a deactivated employee -- reactivate the account first",
        409,
        "EMPLOYEE_INACTIVE",
      );
    }

    const email = (target as { email: string }).email;
    const existingAuthUserId = (target as { auth_user_id: string | null }).auth_user_id;
    const password = tempPassword();
    let authUserId = existingAuthUserId;

    if (existingAuthUserId) {
      const { error: authError } = await db.auth.admin.updateUserById(existingAuthUserId, {
        password,
      });
      if (authError) {
        throw new AppError(
          `Could not set the new password: ${authError.message}`,
          502,
          "AUTH_UPDATE_FAILED",
        );
      }
    } else {
      const { data: created, error: createError } = await db.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (createError || !created.user) {
        throw new AppError(
          `Could not create the Supabase Auth account: ${createError?.message ?? "unknown error"}`,
          502,
          "AUTH_CREATE_FAILED",
        );
      }
      authUserId = created.user.id;
    }

    // The password is already live on the real Auth account at this point regardless of what
    // happens below -- flipping must_change_password (and linking auth_user_id, for the
    // create-account branch) is what forces SetNewPasswordScreen on next login, so a failure
    // here is reported but the temp password returned below is still valid either way.
    const { error: updateError } = await db
      .from(TABLE.appUsers)
      .update({ must_change_password: true, auth_user_id: authUserId })
      .eq("id", data.employeeId);
    if (updateError) {
      throw new AppError(
        `Password was set but the account could not be updated (safe to retry from the Team ` +
          `screen): ${updateError.message}`,
        500,
        "DB_ERROR",
      );
    }

    await db.from(TABLE.changeHistory).insert({
      table_name: "app_users",
      record_id: data.employeeId,
      type: "password_reset",
      text: existingAuthUserId
        ? "Passwort zurückgesetzt"
        : "Login erstellt (zuvor kein Supabase-Auth-Konto verknüpft)",
      actor: callerEmail,
      data: { email },
    });

    return {
      employeeId: data.employeeId,
      email,
      tempPassword: password,
    };
  });
