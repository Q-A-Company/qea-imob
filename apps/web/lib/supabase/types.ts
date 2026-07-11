export type UserRole = "superadmin" | "admin" | "gerente" | "usuario";

// Rótulos exibidos ao usuário — os valores técnicos de role (banco, rotas
// /admin/*, requireRole) continuam admin/gerente/usuario, só o texto
// mudou (pedido do usuário: terminologia de imobiliária). Fonte única
// porque, ao contrário de ROLE_HOME (duplicado entre dal.ts e sidebar.tsx
// por causa da fronteira server-only/client), um mapa de rótulo não tem
// esse problema — server e client components podem importar daqui.
export const ROLE_LABEL: Record<UserRole, string> = {
  superadmin: "SuperAdmin",
  admin: "Diretor / T.I",
  gerente: "Gerente",
  usuario: "Corretor",
};
export type CompetitorStatus = "ativo" | "pausado" | "erro" | "arquivado";
export type SiteConfigStatus = "ativo" | "degradado" | "aprendendo" | "pendente_revisao";
export type PriceStatus = "valor" | "sob_consulta";
export type PropertyStatus = "ativo" | "possivelmente_vendido";
export type ScraperRunType = "checagem" | "recalibracao";
export type PropertyChangeType = "price" | "added" | "removed" | "reappeared";

// postgrest-js exige que cada tabela tenha `Relationships` e que o schema
// tenha `Views`/`Functions` (mesmo vazios) para resolver a inferência de
// tipos — sem isso, Database["public"] deixa de casar com GenericSchema e
// toda query colapsa silenciosamente para `never`.
type NoRelationships = { Relationships: [] };

export interface Database {
  public: {
    Tables: {
      password_recovery_requests: {
        Row: {
          email: string;
          requested_at: string;
        };
        Insert: {
          email: string;
          requested_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["password_recovery_requests"]["Insert"]>;
      } & NoRelationships;
      accounts: {
        Row: {
          id: string;
          name: string;
          active: boolean;
          internal_notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          active?: boolean;
          internal_notes?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["accounts"]["Insert"]>;
      } & NoRelationships;
      profiles: {
        Row: {
          id: string;
          account_id: string | null;
          role: UserRole;
          full_name: string | null;
          email_notifications_enabled: boolean;
          birth_date: string | null;
          block_reason: string | null;
          avatar_url: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          account_id?: string | null;
          role: UserRole;
          full_name?: string | null;
          email_notifications_enabled?: boolean;
          birth_date?: string | null;
          block_reason?: string | null;
          avatar_url?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
      } & NoRelationships;
      competitors: {
        Row: {
          id: string;
          account_id: string;
          name: string;
          abbreviation: string;
          listing_url: string;
          // Coluna gerada (generated always as ... stored, ver migration
          // 0019) — só leitura, nunca aparece em Insert/Update. Usada pra
          // filtrar duplicata independente de http/https, barra final ou
          // maiúsculas (ver lib/competitors/normalize-url.ts).
          listing_url_normalized: string;
          polling_interval_minutes: number;
          status: CompetitorStatus;
          last_checked_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          account_id: string;
          name: string;
          abbreviation: string;
          listing_url: string;
          polling_interval_minutes?: number;
          status?: CompetitorStatus;
          last_checked_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["competitors"]["Insert"]>;
      } & NoRelationships;
      site_configs: {
        Row: {
          id: string;
          competitor_id: string;
          selectors: Record<string, unknown>;
          version: number;
          confidence_score: number | null;
          status: SiteConfigStatus;
          last_validated_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          competitor_id: string;
          selectors: Record<string, unknown>;
          version?: number;
          confidence_score?: number | null;
          status?: SiteConfigStatus;
          last_validated_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["site_configs"]["Insert"]>;
      } & NoRelationships;
      properties: {
        Row: {
          id: string;
          competitor_id: string;
          external_id: string;
          current_price: number | null;
          price_status: PriceStatus;
          url: string;
          last_seen_at: string;
          status: PropertyStatus;
          created_at: string;
        };
        Insert: {
          id?: string;
          competitor_id: string;
          external_id: string;
          current_price?: number | null;
          price_status: PriceStatus;
          url: string;
          last_seen_at?: string;
          status?: PropertyStatus;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["properties"]["Insert"]>;
      } & NoRelationships;
      property_changes: {
        Row: {
          id: string;
          property_id: string;
          scraper_run_id: string | null;
          change_type: PropertyChangeType;
          old_price: number | null;
          new_price: number | null;
          old_status: string | null;
          new_status: string | null;
          detected_at: string;
        };
        Insert: {
          id?: string;
          property_id: string;
          scraper_run_id?: string | null;
          change_type: PropertyChangeType;
          old_price?: number | null;
          new_price?: number | null;
          old_status?: string | null;
          new_status?: string | null;
          detected_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["property_changes"]["Insert"]>;
      } & NoRelationships;
      notification_settings: {
        Row: {
          account_id: string;
          email_enabled: boolean;
          whatsapp_enabled: boolean;
          site_enabled: boolean;
        };
        Insert: {
          account_id: string;
          email_enabled?: boolean;
          whatsapp_enabled?: boolean;
          site_enabled?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["notification_settings"]["Insert"]>;
      } & NoRelationships;
      notifications: {
        Row: {
          id: string;
          account_id: string;
          property_change_id: string | null;
          title: string;
          message: string;
          read: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          account_id: string;
          property_change_id?: string | null;
          title: string;
          message: string;
          read?: boolean;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["notifications"]["Insert"]>;
      } & NoRelationships;
      scraper_runs: {
        Row: {
          id: string;
          competitor_id: string;
          run_type: ScraperRunType;
          success: boolean;
          properties_captured: number;
          changes_detected: number;
          error_message: string | null;
          stopped_early_due_to_error: boolean;
          duration_ms: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          competitor_id: string;
          run_type: ScraperRunType;
          success: boolean;
          properties_captured?: number;
          changes_detected?: number;
          error_message?: string | null;
          stopped_early_due_to_error?: boolean;
          duration_ms?: number | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["scraper_runs"]["Insert"]>;
      } & NoRelationships;
      restricted_leads: {
        Row: {
          id: string;
          account_id: string;
          competitor_name: string;
          cnpj: string | null;
          start_date: string;
          expiration_date: string;
          active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          account_id: string;
          competitor_name: string;
          cnpj?: string | null;
          start_date: string;
          expiration_date: string;
          active?: boolean;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["restricted_leads"]["Insert"]>;
      } & NoRelationships;
      system_settings: {
        Row: {
          id: boolean;
          email_globally_enabled: boolean;
          updated_at: string;
        };
        Insert: {
          id?: boolean;
          email_globally_enabled?: boolean;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["system_settings"]["Insert"]>;
      } & NoRelationships;
      login_audit_log: {
        Row: {
          id: string;
          user_id: string | null;
          account_id: string | null;
          logged_in_at: string;
          ip_address: string | null;
          user_agent: string | null;
          browser: string | null;
          browser_version: string | null;
          os: string | null;
          is_mobile: boolean | null;
          screen_width: number | null;
          screen_height: number | null;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          account_id?: string | null;
          logged_in_at?: string;
          ip_address?: string | null;
          user_agent?: string | null;
          browser?: string | null;
          browser_version?: string | null;
          os?: string | null;
          is_mobile?: boolean | null;
          screen_width?: number | null;
          screen_height?: number | null;
        };
        Update: Partial<Database["public"]["Tables"]["login_audit_log"]["Insert"]>;
      } & NoRelationships;
      audit_log: {
        Row: {
          id: string;
          actor_user_id: string | null;
          account_id: string | null;
          action_type: string;
          target_type: string | null;
          target_id: string | null;
          details: Record<string, unknown> | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          actor_user_id?: string | null;
          account_id?: string | null;
          action_type: string;
          target_type?: string | null;
          target_id?: string | null;
          details?: Record<string, unknown> | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["audit_log"]["Insert"]>;
      } & NoRelationships;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
}
