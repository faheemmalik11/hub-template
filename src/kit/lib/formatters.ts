export interface Formatters {
  formatDate: (isoDate: string | null | undefined) => string;
  formatDateTime: (isoDateTime: string | null | undefined) => string;
  formatMoney: (amount: number | null | undefined) => string;
}

const EMPTY = "—";

export const englishFormatters: Formatters = {
  formatDate(isoDate) {
    if (!isoDate) return EMPTY;
    const date = new Date(isoDate.length <= 10 ? `${isoDate}T00:00:00` : isoDate);
    if (Number.isNaN(date.getTime())) return EMPTY;
    return date.toLocaleDateString("en-GB", { year: "numeric", month: "long", day: "numeric" });
  },
  formatDateTime(isoDateTime) {
    if (!isoDateTime) return EMPTY;
    const date = new Date(isoDateTime);
    if (Number.isNaN(date.getTime())) return EMPTY;
    return date.toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short" });
  },
  formatMoney(amount) {
    if (amount === null || amount === undefined) return EMPTY;
    return new Intl.NumberFormat("en-GB", { style: "currency", currency: "EUR" }).format(amount);
  },
};
