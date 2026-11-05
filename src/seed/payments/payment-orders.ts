import { COMPANIES, SUPPLIERS, sampleId } from "../shared";

/** The one invoice already paid (incoming.ts #3) has the order that paid it. */
export const paymentOrders = [
  {
    id: sampleId(83, 1),
    document_id: sampleId(30, 3),
    company_id: COMPANIES[0].id,
    recipient_name: SUPPLIERS[2].name,
    recipient_iban: "DE89370400440532013000",
    recipient_bic: null,
    amount: 1499.4,
    currency: "EUR",
    payment_reference: "2026-1180",
    status: "executed",
    status_reason: null,
    provider_access_ref: "seed-access-1",
    provider_account_ref: null,
    provider_payment_ref: "seed-payment-1",
    idempotency_key: sampleId(83, 1),
    recipient_iban_changed_recently: false,
    fraud_flags: null,
    is_sandbox: false,
    initiated_by: sampleId(140, 1),
    initiated_at: "2026-09-05T10:58:00Z",
    authorized_at: "2026-09-05T11:00:00Z",
    executed_at: "2026-09-05T11:00:00Z",
    failed_at: null,
    cancelled_at: null,
    created_at: "2026-09-05T10:58:00Z",
    updated_at: "2026-09-05T11:00:00Z",
  },
];
