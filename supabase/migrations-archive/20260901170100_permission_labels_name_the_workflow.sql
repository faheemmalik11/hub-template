begin;

update public.permissions set
  description_de = 'Eine Rechnung auf In Prüfung, Rückfrage, Freigegeben (Assistenz) oder Abgelehnt setzen.',
  description_en = 'Move an invoice to In review, Query, Approved (assistant) or Rejected.'
where key = 'invoices.approve';

update public.permissions set
  description_de = 'Eine Rechnung auf Freigegeben (Vorgesetzter) setzen. Erst ab diesem Schritt kann sie bezahlt werden.',
  description_en = 'Move an invoice to Approved (supervisor). Only from that step can it be paid.'
where key = 'invoices.approve_final';

update public.permissions set
  description_de = 'Eine Überweisung auslösen und eine Rechnung als bezahlt markieren. Wer die endgültige Freigabe erteilt hat, kann dieselbe Rechnung nicht bezahlen.',
  description_en = 'Release a transfer and mark an invoice paid. Whoever gave the final approval cannot pay that same invoice.'
where key = 'invoices.pay';

update public.permissions set
  description_de = 'Jeden Schritt der Statusleiste direkt setzen, an den beiden Freigaberechten vorbei.',
  description_en = 'Set any step on the status bar directly, bypassing the two approval permissions.'
where key = 'invoices.override_workflow';

update public.permissions set
  description_de = 'Den Inhalt einer Rechnung bearbeiten: Beträge, Daten, Gesellschaft, Objekt, Notizen.',
  description_en = 'Edit the content of an invoice: amounts, dates, company, property, notes.'
where key = 'invoices.book';

update public.permissions set
  description_de = 'Festlegen, wer sich um eine Rechnung kümmert (Feld "Zugewiesen an").',
  description_en = 'Set who is responsible for an invoice (the "Assigned to" field).'
where key = 'invoices.assign';

commit;
