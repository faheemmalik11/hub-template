import type { ReactNode } from "react";

import { cn } from "../../lib/class-names";

export function SideBySide({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("grid gap-6 xl:grid-cols-2", className)}>{children}</div>;
}
