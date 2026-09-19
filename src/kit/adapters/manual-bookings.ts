export interface ManualBookingRecord {
  id: string;
  companyId: string;
  categoryId: string;
  propertyId: string | null;
  period: string;
  amount: number;
  note: string | null;
  isRecurring: boolean;
  recurrenceUntil: string | null;
}

export interface NewManualBooking {
  companyId: string;
  categoryId: string;
  propertyId: string | null;
  period: string;
  amount: number;
  note: string | null;
  isRecurring: boolean;
  recurrenceUntil: string | null;
}

export interface ManualBookingsAdapter {
  useBookings(
    companyId: string | null,
    from: string,
    to: string,
  ): { data: ManualBookingRecord[]; loading: boolean; error: unknown };
  useCompanyOptions(): { data: { id: string; code: string; name: string }[]; loading: boolean };
  useCategoryOptions(): { data: { id: string; label: string }[]; loading: boolean };
  usePropertyOptions(): {
    data: { id: string; code: string; name: string | null }[];
    loading: boolean;
  };

  createBooking(input: NewManualBooking): Promise<void>;
  updateBooking(id: string, input: NewManualBooking): Promise<void>;
  deleteBooking(id: string): Promise<void>;

  monthLabels: readonly string[];
  formatMoney: (value: number) => string;
}
