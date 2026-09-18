// Generated Supabase types. PARTIAL: it declares 7 of the 63 public tables, so most reads and
// every write go through the untyped `sb` cast in src/lib/data/queries.ts. CLAUDE.md used to call
// this file empty; it is not, and a stale name in here fails the typecheck rather than the build.
//
// Updated for the bookkeeping rename (invoices -> documents and the rest). Regenerate it from the
// live database when convenient; until then it is kept in step by hand.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      document_files: {
        Row: {
          document_id: string;
          created_at: string | null;
          filename: string | null;
          content: string;
          mime: string | null;
          size_bytes: number | null;
        };
        Insert: {
          document_id: string;
          created_at?: string | null;
          filename?: string | null;
          content: string;
          mime?: string | null;
          size_bytes?: number | null;
        };
        Update: {
          document_id?: string;
          created_at?: string | null;
          filename?: string | null;
          content?: string;
          mime?: string | null;
          size_bytes?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "invoice_files_invoice_id_fkey";
            columns: ["document_id"];
            isOneToOne: true;
            referencedRelation: "documents";
            referencedColumns: ["id"];
          },
        ];
      };
      document_history: {
        Row: {
          actor: string | null;
          document_id: string;
          created_at: string | null;
          data: Json | null;
          id: number;
          text: string | null;
          type: string;
        };
        Insert: {
          actor?: string | null;
          document_id: string;
          created_at?: string | null;
          data?: Json | null;
          id?: never;
          text?: string | null;
          type: string;
        };
        Update: {
          actor?: string | null;
          document_id?: string;
          created_at?: string | null;
          data?: Json | null;
          id?: never;
          text?: string | null;
          type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "invoice_history_invoice_id_fkey";
            columns: ["document_id"];
            isOneToOne: false;
            referencedRelation: "documents";
            referencedColumns: ["id"];
          },
        ];
      };
      documents: {
        Row: {
          order_number: string | null;
          document_date: string | null;
          document_type: string | null;
          amount_gross: number | null;
          amount_net: number | null;
          paid_at: string | null;
          created_at: string | null;
          intake_channel: string | null;
          embedding: string | null;
          recipient_address: string | null;
          recipient_name: string | null;
          extracted: Json | null;
          due_date: string | null;
          fts: unknown;
          deleted_at: string | null;
          deleted_by: string | null;
          company_code: string | null;
          company_id: string | null;
          source_item_id: string | null;
          id: string;
          is_small_amount: boolean | null;
          cost_category: string | null;
          customer_number: string | null;
          service_period_to: string | null;
          service_period_from: string | null;
          service_description: string | null;
          service_date: string | null;
          supplier_id: string | null;
          delete_reason: string | null;
          property_code: string | null;
          line_items: Json | null;
          source: string | null;
          invoice_number: string | null;
          issuer: string | null;
          issuer_address: string | null;
          status: string | null;
          tax: Json | null;
          tax_note: string | null;
          storage_path: string | null;
          updated_at: string | null;
          vat_amount: number | null;
          vat_rate: number | null;
          validation: Json | null;
          payment_reference: string | null;
          ocr_fulltext: string | null;
          currency: string | null;
          workflow_status: string;
          payment_method: string | null;
          assigned_to: string | null;
        };
        Insert: {
          order_number?: string | null;
          document_date?: string | null;
          document_type?: string | null;
          amount_gross?: number | null;
          amount_net?: number | null;
          paid_at?: string | null;
          created_at?: string | null;
          intake_channel?: string | null;
          embedding?: string | null;
          recipient_address?: string | null;
          recipient_name?: string | null;
          extracted?: Json | null;
          due_date?: string | null;
          fts?: unknown;
          deleted_at?: string | null;
          deleted_by?: string | null;
          company_code?: string | null;
          company_id?: string | null;
          source_item_id?: string | null;
          id?: string;
          is_small_amount?: boolean | null;
          cost_category?: string | null;
          customer_number?: string | null;
          service_period_to?: string | null;
          service_period_from?: string | null;
          service_description?: string | null;
          service_date?: string | null;
          supplier_id?: string | null;
          delete_reason?: string | null;
          property_code?: string | null;
          line_items?: Json | null;
          source?: string | null;
          invoice_number?: string | null;
          issuer?: string | null;
          issuer_address?: string | null;
          status?: string | null;
          tax?: Json | null;
          tax_note?: string | null;
          storage_path?: string | null;
          updated_at?: string | null;
          vat_amount?: number | null;
          vat_rate?: number | null;
          validation?: Json | null;
          payment_reference?: string | null;
          ocr_fulltext?: string | null;
          currency?: string | null;
          workflow_status?: string;
          payment_method?: string | null;
          assigned_to?: string | null;
        };
        Update: {
          order_number?: string | null;
          document_date?: string | null;
          document_type?: string | null;
          amount_gross?: number | null;
          amount_net?: number | null;
          paid_at?: string | null;
          created_at?: string | null;
          intake_channel?: string | null;
          embedding?: string | null;
          recipient_address?: string | null;
          recipient_name?: string | null;
          extracted?: Json | null;
          due_date?: string | null;
          fts?: unknown;
          deleted_at?: string | null;
          deleted_by?: string | null;
          company_code?: string | null;
          company_id?: string | null;
          source_item_id?: string | null;
          id?: string;
          is_small_amount?: boolean | null;
          cost_category?: string | null;
          customer_number?: string | null;
          service_period_to?: string | null;
          service_period_from?: string | null;
          service_description?: string | null;
          service_date?: string | null;
          supplier_id?: string | null;
          delete_reason?: string | null;
          property_code?: string | null;
          line_items?: Json | null;
          source?: string | null;
          invoice_number?: string | null;
          issuer?: string | null;
          issuer_address?: string | null;
          status?: string | null;
          tax?: Json | null;
          tax_note?: string | null;
          storage_path?: string | null;
          updated_at?: string | null;
          vat_amount?: number | null;
          vat_rate?: number | null;
          validation?: Json | null;
          payment_reference?: string | null;
          ocr_fulltext?: string | null;
          currency?: string | null;
          workflow_status?: string;
          payment_method?: string | null;
          assigned_to?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "invoices_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invoices_supplier_id_fkey";
            columns: ["supplier_id"];
            isOneToOne: false;
            referencedRelation: "suppliers";
            referencedColumns: ["id"];
          },
        ];
      };
      companies: {
        Row: {
          code: string;
          id: string;
          name: string;
        };
        Insert: {
          code: string;
          id?: string;
          name: string;
        };
        Update: {
          code?: string;
          id?: string;
          name?: string;
        };
        Relationships: [];
      };
      imported_items: {
        Row: {
          attachment_id: string;
          document_id: string | null;
          source_item_id: string;
          imported_at: string | null;
          status: string | null;
        };
        Insert: {
          attachment_id?: string;
          document_id?: string | null;
          source_item_id: string;
          imported_at?: string | null;
          status?: string | null;
        };
        Update: {
          attachment_id?: string;
          document_id?: string | null;
          source_item_id?: string;
          imported_at?: string | null;
          status?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "imported_messages_invoice_id_fkey";
            columns: ["document_id"];
            isOneToOne: false;
            referencedRelation: "documents";
            referencedColumns: ["id"];
          },
        ];
      };
      suppliers: {
        Row: {
          address: string | null;
          contact_person: string | null;
          bank_name: string | null;
          bic: string | null;
          created_at: string | null;
          email: string | null;
          deleted_at: string | null;
          deleted_by: string | null;
          iban: string | null;
          id: string;
          delete_reason: string | null;
          name: string;
          phone: string | null;
          vat_id: string | null;
        };
        Insert: {
          address?: string | null;
          contact_person?: string | null;
          bank_name?: string | null;
          bic?: string | null;
          created_at?: string | null;
          email?: string | null;
          deleted_at?: string | null;
          deleted_by?: string | null;
          iban?: string | null;
          id?: string;
          delete_reason?: string | null;
          name: string;
          phone?: string | null;
          vat_id?: string | null;
        };
        Update: {
          address?: string | null;
          contact_person?: string | null;
          bank_name?: string | null;
          bic?: string | null;
          created_at?: string | null;
          email?: string | null;
          deleted_at?: string | null;
          deleted_by?: string | null;
          iban?: string | null;
          id?: string;
          delete_reason?: string | null;
          name?: string;
          phone?: string | null;
          vat_id?: string | null;
        };
        Relationships: [];
      };
      processing_log: {
        Row: {
          sender: string | null;
          document_id: string | null;
          subject: string | null;
          source_item_id: string | null;
          reason: string | null;
          id: number;
          status: string | null;
          processed_at: string | null;
        };
        Insert: {
          sender?: string | null;
          document_id?: string | null;
          subject?: string | null;
          source_item_id?: string | null;
          reason?: string | null;
          id?: never;
          status?: string | null;
          processed_at?: string | null;
        };
        Update: {
          sender?: string | null;
          document_id?: string | null;
          subject?: string | null;
          source_item_id?: string | null;
          reason?: string | null;
          id?: never;
          status?: string | null;
          processed_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "processing_log_invoice_id_fkey";
            columns: ["document_id"];
            isOneToOne: false;
            referencedRelation: "documents";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
