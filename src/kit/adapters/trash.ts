import type { QueryResult } from "../lib/query-result";

export interface TrashedRecord {
  tableName: string;
  id: string;
  label: string;
  deletedAt: string;
  deletedBy: string | null;
  deleteReason: string | null;
}

export interface TrashTableNames {
  eligible: string[];
  purgeable: string[];
}

export interface TrashAdapter {
  useTrashedRecords(tableFilter: string | undefined): QueryResult<TrashedRecord[]>;
  useTrashTableNames(): QueryResult<TrashTableNames>;
  restoreRecord(input: { tableName: string; id: string; reason: string | null }): Promise<void>;
  purgeRecord(input: { tableName: string; id: string }): Promise<void>;
}
