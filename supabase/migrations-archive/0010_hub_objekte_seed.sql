-- 0007 — properties (property) seed.
--
-- EMPTIED FOR STÄY. The original migration seeded immonetz's own properties
-- (Mecklenburg-Vorpommern) plus their name/address aliases -- that client's master data,
-- not ours. Stäy's properties come from the cost-center workbook the client supplied
-- (communication thread 1) and must be seeded in a separate, Stäy-specific migration
-- once the dual-company assignments are resolved.
--
-- Kept as a numbered no-op so migration ordering stays stable.

begin;
commit;
