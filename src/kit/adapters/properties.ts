import type { QueryResult } from "../lib/query-result";
import type { StatusTone } from "./processing-log";

export type PropertyVatStatus = "taxable" | "taxExempt" | "mixed";

export interface Property {
  id: string;
  code: string;
  name: string | null;
  address: string | null;
  vatStatus: PropertyVatStatus | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface PropertyCompany {
  id: string;
  code: string;
  name: string;
}

export interface PropertyInvoiceTotals {
  bookedAmount: number;
  invoiceCount: number;
}

export interface PropertyInvoiceVatLine {
  rate: number | null;
  netAmount: number | null;
}

export interface PropertyInvoice {
  id: string;
  supplierName: string | null;
  invoiceNumber: string | null;
  companyCode: string | null;
  documentDate: string | null;
  vatRate: number | null;
  vatLines: PropertyInvoiceVatLine[] | null;
  amountGross: number | null;
  status: string | null;
}

export interface PropertyNameVariant {
  id: string;
  text: string;
}

export type NameVariantRejectionReason = "alreadyExists" | "claimedByOther";

export interface PropertyChanges {
  name?: string | null;
  address?: string | null;
  vatStatus?: PropertyVatStatus | null;
}

export interface PropertiesAdapter {
  useProperties(): QueryResult<Property[]>;
  useProperty(code: string): QueryResult<Property | null>;
  useCompanies(): QueryResult<PropertyCompany[]>;
  /** Company ids assigned to each property, keyed by property id. */
  useCompanyIdsByPropertyId(): QueryResult<Record<string, string[]>>;
  /** Booked invoice volume and count per property, keyed by property id. */
  useInvoiceTotalsByPropertyId(): QueryResult<Record<string, PropertyInvoiceTotals>>;
  usePropertyInvoices(code: string): QueryResult<PropertyInvoice[]>;
  useNameVariants(propertyCode: string): QueryResult<PropertyNameVariant[]>;
  createProperty(input: {
    code: string;
    name: string | null;
    address: string | null;
    vatStatus: PropertyVatStatus | null;
  }): Promise<Property>;
  updateProperty(input: { propertyId: string; changes: PropertyChanges }): Promise<void>;
  setPropertyCompanies(input: { propertyId: string; companyIds: string[] }): Promise<void>;
  addNameVariant(input: { propertyCode: string; text: string }): Promise<void>;
  removeNameVariant(input: { propertyCode: string; variantId: string }): Promise<void>;
  /** Classify an addNameVariant rejection so the page can word it; null means a generic failure. */
  nameVariantRejectionReason(error: unknown): NameVariantRejectionReason | null;
  invoiceStatusTone: Record<string, StatusTone>;
  openPropertyList(): void;
  openProperty(code: string): void;
  /** Open the property list with its create dialog pre-filled with this code. */
  openPropertyCreate(code: string): void;
  openInvoice(invoiceId: string): void;
}
