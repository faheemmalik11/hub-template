import { BRAND } from "@/config/brand";
import { cn } from "@/lib/utils";

/**
 * Brand wordmark. `variant="white"` for dark or colored backgrounds.
 *
 * Renders the client's logo artwork or a plain text wordmark, depending on
 * `BRAND.assets.logo.mode`. Callers size it by height (`h-7`, `h-8`); width
 * follows from the artwork's aspect ratio. Setting `mode: "text"` in
 * `src/lib/brand.ts` falls back to the wordmark without touching call sites.
 */
export function Logo({
  variant = "color",
  className,
}: {
  variant?: "color" | "white";
  className?: string;
}) {
  const { logo } = BRAND.assets;

  if (logo.mode === "image") {
    return (
      <img
        src={variant === "white" ? logo.white : logo.src}
        alt={BRAND.wordmark}
        // The intrinsic ratio is declared so the header reserves the right width
        // before the SVG loads, instead of reflowing the nav next to it.
        style={{ aspectRatio: logo.aspectRatio }}
        className={cn("inline-block h-8 w-auto select-none", className)}
      />
    );
  }

  return (
    <span
      className={cn(
        "inline-flex select-none items-center font-display text-2xl leading-none tracking-tight",
        variant === "white" ? "text-white" : "text-brand-hover",
        className,
      )}
      aria-label={BRAND.wordmark}
    >
      {BRAND.wordmark}
    </span>
  );
}
