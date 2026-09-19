import type { QueryResult } from "../lib/query-result";
import type { StatusTone } from "./processing-log";

export interface Company {
  id: string;
  code: string;
  name: string;
  area: string | null;
  archivedAt: string | null;
  archiveReason: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface CompanyInvoiceTotals {
  totalAmount: number;
  invoiceCount: number;
}

export interface CompanyInvoice {
  id: string;
  invoiceNumber: string | null;
  propertyCode: string | null;
  documentDate: string | null;
  amountGross: number | null;
  status: string | null;
}

export interface CompanyProperty {
  id: string;
  code: string;
  name: string | null;
}

export interface PropertyCompanyLink {
  propertyId: string;
  companyId: string;
}

export interface CompanyAlias {
  id: string;
  alias: string;
  isActive: boolean;
}

export interface CompanyChanges {
  code?: string;
  name?: string;
  area?: string | null;
}

// addCompanyAlias rejects with these exact messages so the page can pick the right toast.
export const aliasClaimedByAnotherEntityError = "ALIAS_CLAIMED";
export const aliasAlreadyExistsError = "ALIAS_EXISTS";

export interface CompaniesAdapter {
  useCompanies(query: { includeArchived: boolean }): QueryResult<Company[]>;
  useCompanyInvoiceTotals(): QueryResult<Map<string, CompanyInvoiceTotals>>;
  useCompany(companyId: string): QueryResult<Company | null>;
  useInvoicesForCompany(
    companyId: string,
    companyCode: string | undefined,
  ): QueryResult<CompanyInvoice[]>;
  useProperties(): QueryResult<CompanyProperty[]>;
  usePropertyCompanyLinks(): QueryResult<PropertyCompanyLink[]>;
  useCompanyAliases(companyCode: string): QueryResult<CompanyAlias[]>;
  createCompany(input: { code: string; name: string }): Promise<void>;
  updateCompany(input: { companyId: string; changes: CompanyChanges }): Promise<void>;
  archiveCompany(input: { companyId: string; reason: string }): Promise<void>;
  restoreCompany(input: { companyId: string }): Promise<void>;
  addCompanyAlias(input: { companyCode: string; alias: string }): Promise<void>;
  removeCompanyAlias(input: { aliasId: string }): Promise<void>;
  /** Selectable area-of-responsibility values; empty when the project has none. */
  areaOptions: string[];
  invoiceStatusTone: Record<string, StatusTone>;
  openCompany(companyId: string): void;
  openCompanyList(): void;
  openProperty(propertyCode: string): void;
  openInvoice(invoiceId: string): void;
}
