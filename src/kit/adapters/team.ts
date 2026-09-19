import type { QueryResult } from "../lib/query-result";
import type { AccessPermission } from "../components/access/types";

export interface TeamEmployee {
  id: string;
  name: string | null;
  email: string;
  roleName: string;
  permissions: string[];
  allowedCompanyIds: string[];
  isActive: boolean;
  mustChangePassword: boolean;
}

export interface TeamCompany {
  id: string;
  code: string;
  name: string;
}

export interface TeamRole {
  id: string;
  name: string;
}

export interface CreatedAccount {
  employeeId: string;
  email: string;
  tempPassword: string;
}

export interface TeamAdapter {
  useEmployees(): QueryResult<TeamEmployee[]>;
  useCompanies(): QueryResult<TeamCompany[]>;
  usePermissionCatalogue(): QueryResult<AccessPermission[]>;
  useRoles(): QueryResult<TeamRole[]>;
  useRolePermissions(): QueryResult<Record<string, string[]>>;
  createEmployee(input: {
    email: string;
    name: string;
    roleName: string;
    companyIds: string[];
  }): Promise<CreatedAccount>;
  updateEmployeeProfile(input: { employeeId: string; name: string; email: string }): Promise<void>;
  updateEmployeeRole(input: { employeeId: string; roleName: string }): Promise<void>;
  setCompanyAccess(input: { employeeId: string; companyIds: string[] }): Promise<void>;
  setEmployeeRight(input: { employeeId: string; right: string; value: boolean }): Promise<void>;
  setRolePermission(input: {
    roleId: string;
    roleName: string;
    key: string;
    value: boolean;
  }): Promise<void>;
  setEmployeeActive(input: { employeeId: string; isActive: boolean }): Promise<void>;
  resetPassword(input: { employeeId: string }): Promise<{ email: string; tempPassword: string }>;
  /** Email of the signed-in admin, so the page can stop self-demotion and self-deactivation. */
  currentUserEmail: string | null;
  /** Roles an admin may assign. The owner role stays out of this list. */
  assignableRoles: string[];
  /** Placeholder domain for the new-employee email field, e.g. "example.com". */
  emailDomain: string;
}
