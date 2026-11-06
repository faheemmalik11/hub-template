import { useEffect, useState } from "react";

import type { PaymentFileStep } from "./step-nav";

function useDebouncedTerm(input: string): string {
  const [term, setTerm] = useState(input.trim());
  useEffect(() => {
    const timer = window.setTimeout(() => setTerm(input.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [input]);
  return term;
}

export interface PaymentFileView {
  step: PaymentFileStep;
  setStep(step: PaymentFileStep): void;
  fileId: string | undefined;
  setFileId(id: string | undefined): void;
  accountId: string | null;
  setAccountId(id: string | null): void;
  searchInput: string;
  setSearchInput(value: string): void;
  search: string;
  page: number;
  setPage(page: number): void;
  pageSize: number;
  setPageSize(size: number): void;
}

export function usePaymentFileView(defaultPageSize: number): PaymentFileView {
  const [step, setStep] = useState<PaymentFileStep>("prepare");
  const [fileId, setFileId] = useState<string | undefined>(undefined);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const search = useDebouncedTerm(searchInput);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);

  useEffect(() => {
    setPage(1);
  }, [search, pageSize]);

  return {
    step,
    setStep,
    fileId,
    setFileId,
    accountId,
    setAccountId,
    searchInput,
    setSearchInput,
    search,
    page,
    setPage,
    pageSize,
    setPageSize,
  };
}
