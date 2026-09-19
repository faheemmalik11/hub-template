import {
  englishBankMatchPanelLabels,
  type BankMatchPanelLabels,
} from "../../components/bank-match/BankMatchPanel";

export interface BankTransactionsLabels extends BankMatchPanelLabels {
  title: string;
  subtitle: string;
  searchPlaceholder: string;
  accountAll: string;
  statusAll: string;
  columnDate: string;
  columnCounterparty: string;
  columnReference: string;
  columnAccount: string;
  columnAmount: string;
  columnType: string;
  columnDirection: string;
  columnStatus: string;
  empty: string;
  sortLabel: string;
  sortAscending: string;
  sortDescending: string;
  matchingStatus: (status: string) => string;
  panelSubtitle: (account: string) => string;
  noReceiptCleared: string;
}

export const englishBankTransactionsLabels: BankTransactionsLabels = {
  ...englishBankMatchPanelLabels,
  title: "Bank reconciliation",
  subtitle: "Match incoming bank movements to invoices.",
  searchPlaceholder: "Search counterparty or reference",
  accountAll: "All accounts",
  statusAll: "All statuses",
  columnDate: "Date",
  columnCounterparty: "Counterparty",
  columnReference: "Reference",
  columnAccount: "Account",
  columnAmount: "Amount",
  columnType: "Type",
  columnDirection: "Direction",
  columnStatus: "Status",
  empty: "No transactions found.",
  sortLabel: "Sort by",
  sortAscending: "Ascending",
  sortDescending: "Descending",
  matchingStatus: (status) => status,
  panelSubtitle: (account) => `Account: ${account}`,
  noReceiptCleared: "Cleared.",
};
