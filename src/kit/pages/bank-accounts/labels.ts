export interface BankAccountsLabels {
  title: string;
  subtitle: string;
  companyAll: string;
  columnAccount: string;
  columnCompany: string;
  columnIban: string;
  columnBank: string;
  columnBalance: string;
  columnStatus: string;
  statusActive: string;
  statusExcluded: string;
  empty: string;
}

export const englishBankAccountsLabels: BankAccountsLabels = {
  title: "Bank accounts",
  subtitle: "Connected and manually entered bank accounts.",
  companyAll: "All companies",
  columnAccount: "Account",
  columnCompany: "Company",
  columnIban: "IBAN",
  columnBank: "Bank",
  columnBalance: "Balance",
  columnStatus: "Status",
  statusActive: "Active",
  statusExcluded: "Excluded",
  empty: "No bank accounts found.",
};
