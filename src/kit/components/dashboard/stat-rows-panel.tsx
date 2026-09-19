import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";

import { DashboardPanel } from "./panel";
import { StatRow } from "./stat-tile";

export interface StatRowConfig {
  key: string;
  to: string;
  search?: Record<string, unknown>;
  icon: LucideIcon;
  iconClassName: string;
  label: string;
  value: string;
  valueClassName?: string;
}

export function StatRowsPanel({
  title,
  rows,
  loading,
  emptyText,
  footerLink,
  headerRight,
  className,
  dataTour,
}: {
  title: string;
  rows: StatRowConfig[];
  loading?: boolean;
  emptyText?: string;
  footerLink?: { to: string; label: string };
  headerRight?: ReactNode;
  className?: string;
  dataTour?: string;
}) {
  return (
    <DashboardPanel
      title={title}
      headerRight={headerRight}
      className={className}
      dataTour={dataTour}
    >
      {!loading && rows.length === 0 && emptyText ? (
        <p className="mt-3 text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <div className="mt-3 flex flex-1 flex-col gap-1.5">
          {rows.map((row) => (
            <StatRow
              key={row.key}
              to={row.to}
              search={row.search}
              icon={row.icon}
              iconCls={row.iconClassName}
              label={row.label}
              value={loading ? "—" : row.value}
              valueCls={row.valueClassName}
            />
          ))}
        </div>
      )}
      {footerLink && (
        <Link
          to={footerLink.to}
          className="mt-auto pt-2 text-sm font-medium text-brand-dark hover:underline"
        >
          {footerLink.label}
        </Link>
      )}
    </DashboardPanel>
  );
}
