export type UserRole = "superadmin" | "admin" | "usuario";
export type CompetitorStatus = "ativo" | "pausado" | "erro";
export type SiteConfigStatus = "ativo" | "degradado" | "aprendendo";
export type PriceStatus = "valor" | "sob_consulta";
export type PropertyStatus = "ativo" | "possivelmente_vendido";
export type ScraperRunType = "checagem" | "recalibracao";

export interface Database {
  public: {
    Tables: {
      accounts: {
        Row: {
          id: string;
          name: string;
          active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          active?: boolean;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["accounts"]["Insert"]>;
      };
      profiles: {
        Row: {
          id: string;
          account_id: string | null;
          role: UserRole;
          full_name: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          account_id?: string | null;
          role: UserRole;
          full_name?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
      };
      competitors: {
        Row: {
          id: string;
          account_id: string;
          name: string;
          listing_url: string;
          polling_interval_minutes: number;
          status: CompetitorStatus;
          last_checked_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          account_id: string;
          name: string;
          listing_url: string;
          polling_interval_minutes?: number;
          status?: CompetitorStatus;
          last_checked_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["competitors"]["Insert"]>;
      };
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
      };
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
      };
      property_changes: {
        Row: {
          id: string;
          property_id: string;
          old_price: number | null;
          new_price: number | null;
          old_status: string | null;
          new_status: string | null;
          detected_at: string;
        };
        Insert: {
          id?: string;
          property_id: string;
          old_price?: number | null;
          new_price?: number | null;
          old_status?: string | null;
          new_status?: string | null;
          detected_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["property_changes"]["Insert"]>;
      };
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
      };
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
      };
      scraper_runs: {
        Row: {
          id: string;
          competitor_id: string;
          run_type: ScraperRunType;
          success: boolean;
          properties_captured: number;
          changes_detected: number;
          error_message: string | null;
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
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["scraper_runs"]["Insert"]>;
      };
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
      };
    };
  };
}
