import { useEffect, useState } from "react";

import { cn } from "../lib/class-names";

const SIZE_CLASSES = {
  sm: "size-8 text-xs",
  md: "size-10 text-sm",
  lg: "size-16 text-base",
  xl: "size-24 text-2xl",
} as const;

export type AvatarSize = keyof typeof SIZE_CLASSES;

/** "Faheem Malik" -> "FM". Two letters, because three stops reading as a monogram. */
export function avatarInitials(name: string | null, email?: string | null): string {
  const source = (name ?? "").trim() || (email ?? "").trim();
  const words = source.split(" ").filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/**
 * A round picture of a person, with their initials when there is no picture.
 *
 * The circle is the whole point: a square photo next to a name reads as a logo, a round one reads
 * as a face. A broken picture url falls back to the initials instead of leaving a torn image icon.
 */
export function Avatar({
  name,
  email,
  imageUrl,
  size = "md",
  className,
}: {
  name: string | null;
  email?: string | null;
  imageUrl?: string | null;
  size?: AvatarSize;
  className?: string;
}) {
  const [imageFailed, setImageFailed] = useState(false);

  // A new url deserves a fresh try, even if the previous one failed to load.
  useEffect(() => {
    setImageFailed(false);
  }, [imageUrl]);

  const showImage = !!imageUrl && !imageFailed;

  return (
    <span
      className={cn(
        "inline-grid shrink-0 place-items-center overflow-hidden rounded-full bg-brand-tint font-semibold text-brand-dark select-none",
        SIZE_CLASSES[size],
        className,
      )}
    >
      {showImage ? (
        <img
          src={imageUrl!}
          alt={name ?? email ?? ""}
          className="size-full object-cover"
          onError={() => setImageFailed(true)}
        />
      ) : (
        avatarInitials(name, email)
      )}
    </span>
  );
}
