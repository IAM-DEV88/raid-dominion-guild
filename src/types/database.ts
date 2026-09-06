import type { ParsedSavedVariables } from './parser';

export type RaiddominionRole = 'visitante' | 'member' | 'guild_master' | 'moderator' | 'admin';
export type UploadStatus = 'parsed' | 'verified' | 'rejected';

export type ProfileRow = {
  id: string;
  role: RaiddominionRole;
  display_name: string | null;
  character_name: string | null;
  realm: string | null;
  slug: string | null;
  is_guild_master: boolean;
  is_public: boolean;
  updated_at?: string;
};

// Vista SECURITY DEFINER que expone la superficie mínima de atribución
// (id + slug → handle, realm principal del dueño, y nombre del personaje
// principal SOLO si es público) de todos los perfiles, públicos o privados.
// Migración 20260902_band_attribution_handles.
export type ProfileHandleRow = {
  id: string;
  slug: string;
  realm: string | null;
  // Nombre del personaje principal solo si es público; NULL si privado.
  principal_name?: string | null;
};

export type GuildRow = {
  id: string;
  slug: string;
  name: string;
  realm: string | null;
  server: string | null;
  faction: string | null;
  discord_link: string | null;
  description: string | null;
  is_public: boolean;
  owner_id: string;
  claim_status: 'none' | 'pending' | 'verified' | 'rejected';
};

export type SavedVariableRow = {
  id: string;
  user_id: string;
  guild_id: string | null;
  addon_version: string | null;
  generated_by: string | null;
  status: UploadStatus;
  raw: ParsedSavedVariables | null;
  parsed_at: string;
};

export type GuildConfigRow = {
  id: string;
  guild_id: string;
  config_key: string;
  config_value: unknown;
  updated_at: string;
};

export type CharacterRow = {
  id: string;
  user_id: string;
  sv_upload_id: string | null;
  slug: string | null;
  name: string;
  realm: string | null;
  server: string | null;
  class: string | null;
  class_file: string | null;
  race: string | null;
  race_file: string | null;
  level: number | null;
  talent_spec: string | null;
  avg_ilvl: number | null;
  equipment: unknown[];
  is_public: boolean;
  member_verified: boolean;
  sv_guild_name: string | null;
  sv_guild_rank: string | null;
  sv_is_gm: boolean;
  created_at: string;
  updated_at: string;
};

// Banda persistida en raiddominion_bands. guild_id es NULLABLE: un jugador
// puede llevar bandas+reglas SIN hermandad reclamada (owner-only / público
// por su perfil). players/rules conservan la forma real del addon.
export type BandRow = {
  id: string;
  owner_id: string;
  guild_id: string | null;
  slug: string;
  name: string;
  icon: string | null;
  schedule: string | null;
  min_gs: number | null;
  players: unknown[] | null;
  rules: unknown[] | null;
  is_public: boolean;
  // Índice del rango del dueño dentro de la hermandad (registry.guild.
  // rankIndex del SV; 0 = líder). NULL si el dueño no pertenece a una guild.
  owner_rank_index: number | null;
  // Oculta número y lista de jugadores al público (global).
  hide_players: boolean;
  // true si la banda está aprobada por el GM (cuenta en el portal si además
  // es pública). Antes se auto-calculaba por rango; hoy lo decide el GM.
  is_rank_integrated: boolean;
  // Personaje que subió la banda (atribución). NULL para bandas legacy.
  character_name: string | null;
  character_realm: string | null;
  // Integración propuesta por un miembro y validada por el GM.
  // 'none' | 'pending' | 'approved' | 'rejected'.
  integration_status: string;
  integration_proposed_by: string | null;
  integration_proposed_at: string | null;
  integration_decided_at: string | null;
  // DESTINO de la propuesta de integración: la hermandad elegida por el
  // dueño en Mis Bandas. guild_id (atribución real al portal) solo se
  // escribe cuando el GM aprueba (raiddominion_set_band_integration).
  integration_target_guild_id: string | null;
  created_at: string;
  updated_at: string;
}

type PublicSchema = {
  raiddominion_profile_handles: {
    Row: ProfileHandleRow;
    Insert: never;
    Update: never;
    Relationships: [];
  };
  raiddominion_profiles: {
    Row: ProfileRow;
    Insert: Partial<ProfileRow> & { id: string };
    Update: Partial<ProfileRow>;
    Relationships: [];
  };
  raiddominion_guilds: {
    Row: GuildRow;
    Insert: Partial<GuildRow> & { slug: string; name: string; owner_id: string };
    Update: Partial<GuildRow>;
    Relationships: [];
  };
  raiddominion_saved_variables: {
    Row: SavedVariableRow;
    Insert: Partial<SavedVariableRow> & { user_id: string };
    Update: Partial<SavedVariableRow>;
    Relationships: [];
  };
  raiddominion_guild_config: {
    Row: GuildConfigRow;
    Insert: Pick<GuildConfigRow, 'guild_id' | 'config_key'> & Partial<Pick<GuildConfigRow, 'config_value'>>;
    Update: Partial<GuildConfigRow>;
    Relationships: [];
  };
  raiddominion_bands: {
    Row: BandRow;
    Insert: Partial<BandRow> & { owner_id: string; slug: string; name: string };
    Update: Partial<BandRow>;
    Relationships: [];
  };
  raiddominion_characters: {
    Row: CharacterRow;
    Insert: Partial<CharacterRow> & { user_id: string; name: string };
    Update: Partial<CharacterRow>;
    Relationships: [];
  };
};

// RPCs de RaidDominion (SECURITY DEFINER, prefijo raiddominion_).
// Coinciden con las firmas de supabase/migrations/*.sql. Los campos de
// retorno tipo TABLE se tipan como Record<string, unknown> para que el
// consumidor (api.ts) caste a su interfaz verificada.
type PublicFunctions = {
  raiddominion_check_character_owner: { Args: { p_name: string; p_realm: string | null }; Returns: string };
  raiddominion_claim_from_sv: { Args: { p_sv_id: string }; Returns: string };
  raiddominion_ensure_profile_slug: { Args: Record<string, never>; Returns: string };
  raiddominion_upsert_bands: {
    Args: {
      p_sv_id: string;
      p_bands: Record<string, unknown>[];
      p_rules: Record<string, unknown>[];
      p_owner_rank_index: number | null;
      p_guild_name: string | null;
      p_character_name: string | null;
      p_character_realm: string | null;
    };
    Returns: number;
  };
  raiddominion_set_band_hide_players: { Args: { p_band_id: string; p_hide: boolean }; Returns: boolean };
  raiddominion_set_band_guild: { Args: { p_band_id: string; p_guild_id: string | null }; Returns: boolean };
  raiddominion_set_band_rules: { Args: { p_band_id: string; p_rules: Record<string, unknown>[] }; Returns: boolean };
  raiddominion_propose_band_integration: { Args: { p_band_id: string }; Returns: boolean };
  raiddominion_set_band_integration: { Args: { p_band_id: string; p_status: 'approved' | 'rejected' | 'none' }; Returns: boolean };
  raiddominion_list_guild_band_proposals: { Args: { p_guild_id: string }; Returns: Record<string, unknown>[] };
  raiddominion_staff_list_guilds: { Args: Record<string, never>; Returns: Record<string, unknown>[] };
  raiddominion_verify_guild_claim: { Args: { p_guild_id: string; p_approved: boolean; p_members: unknown }; Returns: undefined };
  raiddominion_delete_upload: { Args: { p_sv_id: string }; Returns: undefined };
  raiddominion_staff_set_guild_public: { Args: { p_guild_id: string; p_is_public: boolean }; Returns: undefined };
  raiddominion_admin_list_users: { Args: Record<string, never>; Returns: Record<string, unknown>[] };
  raiddominion_admin_set_role: { Args: { p_user_id: string; p_role: string }; Returns: undefined };
  raiddominion_admin_get_user_entities: { Args: { p_user_id: string }; Returns: Record<string, unknown> };
  raiddominion_admin_set_profile_field: { Args: { p_user_id: string; p_field: string; p_value: string }; Returns: undefined };
  raiddominion_admin_set_character_status: { Args: { p_character_id: string; p_is_public: boolean; p_member_verified: boolean }; Returns: undefined };
  raiddominion_admin_set_guild_status: { Args: { p_guild_id: string; p_is_public: boolean; p_claim_status: string | null }; Returns: undefined };
  raiddominion_admin_set_band_status: { Args: { p_band_id: string; p_is_public: boolean; p_integration_status: string | null }; Returns: undefined };
  raiddominion_upsert_character: {
    Args: {
      p_sv_id: string;
      p_player: Record<string, unknown>;
      p_saved_at: string | null;
      p_guild: Record<string, unknown> | null;
    };
    Returns: string;
  };
  raiddominion_save_roster_evidence: {
    Args: { p_sv_id: string; p_members: Record<string, unknown>[] };
    Returns: number;
  };
  raiddominion_try_promote_member: {
    Args: { p_sv_id?: string };
    Returns: Record<string, unknown>;
  };
  raiddominion_delete_account: { Args: Record<string, never>; Returns: undefined };
  raiddominion_reset_account_data: { Args: Record<string, never>; Returns: undefined };
  raiddominion_ensure_character_slug: { Args: Record<string, never>; Returns: Record<string, unknown>[] };
  raiddominion_public_stats: { Args: Record<string, never>; Returns: Record<string, unknown>[] };
};

export type Database = {
  public: {
    Tables: PublicSchema;
    Views: Record<string, never>;
    Functions: PublicFunctions;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
