import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { sb, STALE } from "@/data/client";
import { TABLE } from "@/config/tables";

export interface DocumentType {
  id: string;
  code: string;
  label: string;
  description: string | null;
  maps_from: string[];
  is_fallback: boolean;
  is_active: boolean;
  is_seeded: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export type DocumentTypeInput = {
  id?: string;
  code: string;
  label: string;
  sort_order: number;
  is_active: boolean;
  maps_from: string[];
  is_fallback: boolean;
};

function invalidateDocumentTypeState(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["document_types"] });
}

export function useDocumentTypes() {
  return useQuery({
    queryKey: ["document_types"],
    staleTime: STALE,
    queryFn: async (): Promise<DocumentType[]> => {
      const { data, error } = await sb
        .from(TABLE.documentTypes)
        .select("*")
        .order("sort_order", { ascending: true })
        .order("label", { ascending: true });
      if (error) throw error;
      return (data ?? []) as DocumentType[];
    },
  });
}

export function useSaveDocumentType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: DocumentTypeInput): Promise<DocumentType> => {
      const row = {
        code: input.code,
        label: input.label,
        sort_order: input.sort_order,
        is_active: input.is_active,
        maps_from: input.maps_from,
        is_fallback: input.is_fallback,
        updated_at: new Date().toISOString(),
      };
      const query = input.id
        ? sb.from(TABLE.documentTypes).update(row).eq("id", input.id)
        : sb.from(TABLE.documentTypes).insert(row);
      const { data, error } = await query.select("*").single();
      if (error) throw error;
      return data as DocumentType;
    },
    onSuccess: () => invalidateDocumentTypeState(qc),
  });
}
