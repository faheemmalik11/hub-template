/**
 * Whether this Hub reads sample data instead of a client's database.
 *
 * ONE SWITCH, read in one place (`src/data/client.ts`). Set `VITE_SEED=1` to look at the screens
 * with data in them and no database behind them; leave it unset and nothing about the app changes.
 *
 * Never on in a client's build: their `.env` does not carry it, and a Hub in seed mode writes
 * nothing and reads nothing real, so a screen would silently show invented figures as if they were
 * theirs. That is why it is an explicit opt-in rather than a fallback when a query fails.
 */
export const SEED_MODE = import.meta.env.VITE_SEED === "1";
