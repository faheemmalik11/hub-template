import { useMemo, useState } from "react";

import { useTableView } from "../../pages/invoice-list/use-table-view";
import type { InvoiceListConfig, InvoiceListRow } from "../../adapters/invoice-list";

export type InvoiceSortKey = "issuer" | "amount" | "documentDate" | "dueDate";

export interface InvoiceListView {
  search: string;
  setSearch: (value: string) => void;
  company: string;
  setCompany: (value: string) => void;
  activeQueueCard: string | null;
  toggleQueueCard: (key: string) => void;
  rows: InvoiceListRow[];
  pageRows: InvoiceListRow[];
  sort: string;
  setSort: (key: string) => void;
  direction: "asc" | "desc";
  setDirection: (direction: "asc" | "desc") => void;
  page: number;
  setPage: (page: number) => void;
  pageSize: number;
  setPageSize: (size: number) => void;
  totalPages: number;
  total: number;
  from: number;
  to: number;
}

export function useInvoiceListView(
  allRows: InvoiceListRow[],
  queueCards: InvoiceListConfig["queueCards"],
): InvoiceListView {
  const [search, setSearch] = useState("");
  const [company, setCompany] = useState("");
  const [activeQueueCard, setActiveQueueCard] = useState<string | null>(null);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const activeCard = queueCards?.find((card) => card.key === activeQueueCard);
    return allRows.filter((row) => {
      if (company && row.companyCode !== company) return false;
      if (activeCard && !activeCard.filter(row)) return false;
      if (!term) return true;
      return `${row.issuer ?? ""} ${row.invoiceNumber ?? ""}`.toLowerCase().includes(term);
    });
  }, [allRows, search, company, activeQueueCard, queueCards]);

  const view = useTableView(rows, {
    initialSort: "documentDate",
    initialDirection: "desc",
    resetKey: `${search}|${company}|${activeQueueCard}`,
    sortValue: (row, key) => {
      switch (key) {
        case "issuer":
          return row.issuer ?? "";
        case "amount":
          return row.amountGross ?? 0;
        case "dueDate":
          return row.dueDate ?? "";
        default:
          return row.documentDate ?? "";
      }
    },
  });

  return {
    search,
    setSearch,
    company,
    setCompany,
    activeQueueCard,
    toggleQueueCard: (key) => setActiveQueueCard((current) => (current === key ? null : key)),
    rows,
    ...view,
  };
}
