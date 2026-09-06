import { supabase } from './supabase';
import { resolveRankName, sortRanks } from '@/lib/ui/ranks';
import type { ParsedSavedVariables, GuildRank, ContentItem } from '@/types/parser';
import type { SavedVariableRow, ProfileRow, GuildRow, BandRow, RaiddominionRole } from '@/types/database';

// Tipos re-exportados para los consumidores de la capa de datos.
export type { BandRow } from '@/types/database';

export interface UploadSummary {
  id: string;
  generatedBy: string | null;
  parsedAt: string;
  members: number;
  bands: number;
  rawRules: ContentItem[];
}

// Guarda un parseo en el historial del usuario autenticado
export async function saveUpload(data: ParsedSavedVariables): Promise<{ ok: boolean; id?: string; error?: string }> {
  const { data: session } = await supabase.auth.getSession();
  const user = session.session?.user;
  if (!user) return { ok: false, error: 'sin sesión' };

  const insert = await supabase
    .from('raiddominion_saved_variables')
    .insert({
      user_id: user.id,
      generated_by: data.generatedBy ?? null,
      addon_version: data.version ?? null,
      status: 'parsed',
      raw: data,
    })
    .select('id')
    .single();

  if (insert.error) return { ok: false, error: insert.error.message };
  return { ok: true, id: insert.data.id };
}

// Lista los uploads del usuario autenticado (más recientes primero)
export async function listMyUploads(): Promise<{ ok: boolean; items?: UploadSummary[]; error?: string }> {
  const query = await supabase
    .from('raiddominion_saved_variables')
    .select('id, generated_by, parsed_at, raw')
    .order('parsed_at', { ascending: false })
    .limit(50);

  if (query.error) return { ok: false, error: query.error.message };

  const items: UploadSummary[] = (query.data as Array<{
    id: string;
    generated_by: string | null;
    parsed_at: string;
    raw: ParsedSavedVariables | null;
  }>).map((row) => ({
    id: row.id,
    generatedBy: row.generated_by,
    parsedAt: row.parsed_at,
    members: row.raw?.guild?.members?.length ?? 0,
    bands: row.raw?.bands?.length ?? 0,
    rawRules: row.raw?.rules ?? [],
  }));

  return { ok: true, items };
}

// Obtiene un upload completo por id (RLS garantiza que sea del usuario)
export async function getUpload(id: string): Promise<{ ok: boolean; item?: SavedVariableRow; error?: string }> {
  const query = await supabase
    .from('raiddominion_saved_variables')
    .select('*')
    .eq('id', id)
    .single();

  if (query.error) return { ok: false, error: query.error.message };
  return { ok: true, item: query.data as SavedVariableRow };
}

// Elimina un upload individual del usuario (RPC SECURITY DEFINER: solo el
// dueño; cascada a roster_evidence; characters conservan la fila).
export async function deleteMyUpload(svId: string): Promise<{ ok: boolean; error?: string }> {
  const res = await supabase.rpc('raiddominion_delete_upload', { p_sv_id: svId });
  if (res.error) return { ok: false, error: res.error.message };
  return { ok: true };
}

// ─── Perfil y roles (fuente de verdad: raiddominion_profiles.role) ──────

export interface ProfileUpdate {
  display_name?: string | null;
  character_name?: string | null;
  is_public?: boolean;
}

// Perfil del usuario autenticado
export async function getMyProfile(): Promise<{ ok: boolean; profile?: ProfileRow; error?: string }> {
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData.session?.user;
  if (!user) return { ok: false, error: 'sin sesión' };

  // El perfil puede no existir aún (handle_new_user pendiente); se crea al vuelo
  const existing = await supabase
    .from('raiddominion_profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  if (existing.error) return { ok: false, error: existing.error.message };
  if (existing.data) return { ok: true, profile: existing.data as ProfileRow };

  const created = await supabase
    .from('raiddominion_profiles')
    .upsert({ id: user.id })
    .select('*')
    .single();

  if (created.error) return { ok: false, error: created.error.message };
  return { ok: true, profile: created.data as ProfileRow };
}

// Actualiza campos básicos del perfil (nombre visible, visibilidad pública)
export async function updateMyProfile(patch: ProfileUpdate): Promise<{ ok: boolean; error?: string }> {
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData.session?.user;
  if (!user) return { ok: false, error: 'sin sesión' };

  const res = await supabase
    .from('raiddominion_profiles')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', user.id);

  if (res.error) return { ok: false, error: res.error.message };
  return { ok: true };
}

// Reclama la hermandad leyendo registry.guild DESDE EL SV GUARDADO.
// Sin formularios: los datos de la ficha provienen solo del addon y nadie
// puede reclamar un nombre de hermandad que no exista en su SV.
export async function claimGuildFromSV(svId: string): Promise<{ ok: boolean; guildId?: string; error?: string }> {
  const rpc = await supabase.rpc('raiddominion_claim_from_sv', { p_sv_id: svId });
  if (rpc.error) {
    let msg = rpc.error.message;
    if (msg.includes('duplicate key')) msg = 'Ese slug ya existe; reintenta.';
    if (msg.includes('Ya tienes una hermandad')) msg = 'Ya tienes una hermandad registrada.';
    if (msg.includes('ya tiene un maestro registrado')) msg = 'Esa hermandad ya tiene un maestro registrado en el portal; no se puede reclamar dos veces.';
    return { ok: false, error: msg };
  }
  return { ok: true, guildId: rpc.data as string };
}

// ─── Hermandades del usuario (guild_master multi-hermandad) ─────────────

// Hermandades propias (RLS: owner las ve aunque no estén publicadas).
// Un jugador puede ser maestro de más de una.
export async function getMyGuilds(): Promise<{ ok: boolean; items?: GuildRow[]; error?: string }> {
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData.session?.user;
  if (!user) return { ok: false, error: 'sin sesión' };

  const res = await supabase
    .from('raiddominion_guilds')
    .select('*')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: true });

  if (res.error) return { ok: false, error: res.error.message };
  return { ok: true, items: (res.data as GuildRow[]) ?? [] };
}

// ─── Páginas públicas (Fase 3) ──────────────────────────────────────────

export interface GuildPortalSnapshot {
  generatedBy: string | null;
  lastUpdate: number | null;
  // Jerarquía de rangos de la hermandad (registry.guild.ranks), ordenada por
  // index (0 = líder). El portal la muestra y ordena el roster con ella.
  ranks?: Array<{ index: number; name: string }>;
  // Whitelist explícita: el snapshot es público (SELECT TRUE) y jamás
  // debe incluir officerNote ni campos privados futuros. `rankIndex` se
  // conserva para ordenar el roster por jerarquía en el portal.
  members: Array<{
    name: string;
    class: string;
    rank: string;
    rankIndex?: number;
    publicNote: string;
    slug?: string;
  }>;
  bands: ParsedSavedVariables['bands'];
  rules: ParsedSavedVariables['rules'];
}

export function buildPortalSnapshot(data: ParsedSavedVariables): GuildPortalSnapshot {
  // Jerarquía de rangos: unión de registry.guild.ranks de todos los registros
  // del SV (dedupe por index), ordenada por jerarquía (0 = líder).
  const ranksRaw = new Map<number, string>();
  const addRanks = (r: GuildRank[] | undefined): void => {
    (r ?? []).forEach((x) => { if (!ranksRaw.has(x.index)) ranksRaw.set(x.index, x.name); });
  };
  addRanks(data.registryGuild?.ranks);
  data.registries.forEach((r) => addRanks(r.guild?.ranks));
  const ranks = sortRanks(Array.from(ranksRaw, ([index, name]) => ({ index, name })));

  // Roster efectivo: memberList v3 (registry.*.guild.memberList) ∪ legacy,
  // dedupe por nombre (misma lógica que el preview del upload). El nombre del
  // rango de cada miembro se RESUELVE desde su rankIndex contra la jerarquía
  // (índice 0 = líder), no desde el texto crudo del SV.
  const seen = new Set<string>();
  const members: GuildPortalSnapshot['members'] = [];
  const push = (m: { name: string; class?: string; rank?: string; rankIndex?: number; publicNote?: string }): void => {
    const key = m.name.trim().toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    members.push({
      name: m.name,
      class: m.class ?? '',
      rank: resolveRankName({ rankIndex: m.rankIndex, rank: m.rank, ranks }),
      rankIndex: typeof m.rankIndex === 'number' ? m.rankIndex : undefined,
      publicNote: m.publicNote ?? '',
    });
  };
  data.registries.forEach((r) =>
    r.guild?.memberList?.forEach((gm) => push({
      name: gm.name,
      class: gm.class ?? gm.classFile ?? '',
      rank: gm.rank,
      rankIndex: gm.rankIndex,
      publicNote: '',
    }))
  );
  if (members.length === 0) data.guild.members.forEach((m) => push(m));
  // Las reglas NUNCA viajan en el snapshot: subir un SV no llena las reglas
  // del portal ni las de una banda. La regla de producto (2026-09-06): solo
  // el usuario agrega/quita reglas desde su dashboard (guild_rules y
  // set_band_rules / band_integration_rules).
  return {
    generatedBy: data.generatedBy ?? null,
    lastUpdate: data.lastUpdate ?? null,
    ranks: ranks.length > 0 ? ranks : undefined,
    members,
    bands: data.bands ?? [],
    rules: [],
  };
}

// Asegura el slug público del propio perfil (RPC SECURITY DEFINER)
export async function ensureMyProfileSlug(): Promise<{ ok: boolean; slug?: string; error?: string }> {
  const rpc = await supabase.rpc('raiddominion_ensure_profile_slug');
  if (rpc.error) return { ok: false, error: rpc.error.message };
  return { ok: true, slug: rpc.data as string };
}

// Perfil público por slug (/jugador/:slug) — RLS permite si is_public o es propio
export async function getPublicProfileBySlug(slug: string): Promise<{ ok: boolean; profile?: ProfileRow; error?: string }> {
  const res = await supabase
    .from('raiddominion_profiles')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();

  if (res.error) return { ok: false, error: res.error.message };
  return { ok: true, profile: (res.data as ProfileRow | null) ?? undefined };
}

// Listado público de JUGADORES (perfiles con visibilidad activa). Distinto de
// /personajes: aquí se listan las cuentas humanas (perfiles), no los
// personajes validados. Cada entrada enlaza a su perfil /jugador/:slug.
export async function listPublicPlayers(): Promise<{ ok: boolean; players?: ProfileRow[]; error?: string }> {
  const res = await supabase
    .from('raiddominion_profiles')
    .select('*')
    .eq('is_public', true)
    .not('slug', 'is', null)
    .order('display_name', { ascending: true, nullsFirst: false })
    .order('character_name', { ascending: true, nullsFirst: false })
    .limit(200);

  if (res.error) return { ok: false, error: res.error.message };
  return { ok: true, players: (res.data as ProfileRow[]) ?? [] };
}

// Directorio público de hermandades
export async function listPublicGuilds(): Promise<{ ok: boolean; guilds?: GuildRow[]; error?: string }> {
  const res = await supabase
    .from('raiddominion_guilds')
    .select('*')
    .eq('is_public', true)
    .order('name', { ascending: true })
    .limit(200);

  if (res.error) return { ok: false, error: res.error.message };
  return { ok: true, guilds: (res.data as GuildRow[]) ?? [] };
}

// Portal de hermandad por slug (/:slug) — RLS filtra privadas salvo del dueño
export async function getPublicGuildBySlug(slug: string): Promise<{ ok: boolean; guild?: GuildRow; error?: string }> {
  const res = await supabase
    .from('raiddominion_guilds')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();

  if (res.error) return { ok: false, error: res.error.message };
  return { ok: true, guild: (res.data as GuildRow | null) ?? undefined };
}

// ─── Servidores (realmlist) y reinos — capa pública ────────────────────

// Servidores distintos que aparecen en personajes/hermandades públicas.
export async function listPublicServers(): Promise<{ ok: boolean; servers?: string[]; error?: string }> {
  const [chars, guilds] = await Promise.all([
    supabase.from('raiddominion_characters').select('server').eq('is_public', true).not('server', 'is', null),
    supabase.from('raiddominion_guilds').select('server').eq('is_public', true).not('server', 'is', null),
  ]);
  if (chars.error) return { ok: false, error: chars.error.message };
  if (guilds.error) return { ok: false, error: guilds.error.message };

  const set = new Set<string>();
  (chars.data as Array<{ server: string | null }>).forEach((r) => r.server && set.add(r.server));
  (guilds.data as Array<{ server: string | null }>).forEach((r) => r.server && set.add(r.server));
  return { ok: true, servers: [...set].sort((a, b) => a.localeCompare(b)) };
}

// Reinos distintos dentro de un servidor (personajes/hermandades públicas).
export async function getServerRealms(server: string): Promise<{ ok: boolean; realms?: string[]; error?: string }> {
  const [chars, guilds] = await Promise.all([
    supabase.from('raiddominion_characters').select('realm').eq('is_public', true).eq('server', server).not('realm', 'is', null),
    supabase.from('raiddominion_guilds').select('realm').eq('is_public', true).eq('server', server).not('realm', 'is', null),
  ]);
  if (chars.error) return { ok: false, error: chars.error.message };
  if (guilds.error) return { ok: false, error: guilds.error.message };

  const set = new Set<string>();
  (chars.data as Array<{ realm: string | null }>).forEach((r) => r.realm && set.add(r.realm));
  (guilds.data as Array<{ realm: string | null }>).forEach((r) => r.realm && set.add(r.realm));
  return { ok: true, realms: [...set].sort((a, b) => a.localeCompare(b)) };
}

// Estadísticas públicas de un servidor (realmlist): reinos distintos, número
// de personajes públicos y número de jugadores (cuentas distintas) con
// visibilidad activa en ese servidor. Alimenta el resumen de /servidor/:server.
export async function getServerStats(
  server: string
): Promise<{ ok: boolean; realms?: number; characters?: number; players?: number; error?: string }> {
  const [charsRes, guildsRes] = await Promise.all([
    supabase
      .from('raiddominion_characters')
      .select('realm,user_id', { count: 'exact' })
      .eq('is_public', true)
      .eq('server', server),
    supabase
      .from('raiddominion_guilds')
      .select('realm')
      .eq('is_public', true)
      .eq('server', server),
  ]);
  if (charsRes.error) return { ok: false, error: charsRes.error.message };
  if (guildsRes.error) return { ok: false, error: guildsRes.error.message };

  const realms = new Set<string>();
  const players = new Set<string>();
  (charsRes.data as Array<{ realm: string | null; user_id: string | null }> | null)?.forEach((r) => {
    if (r.realm) realms.add(r.realm);
    if (r.user_id) players.add(r.user_id);
  });
  (guildsRes.data as Array<{ realm: string | null }> | null)?.forEach((r) => {
    if (r.realm) realms.add(r.realm);
  });

  return {
    ok: true,
    realms: realms.size,
    characters: charsRes.count ?? 0,
    players: players.size,
  };
}

// Resumen público de un reino (anidado en un servidor): hermandades y
// personajes públicos de ese reino en ese servidor. server+realm definen la
// capa: el mismo nombre de reino puede existir en servidores distintos.
// Las HERMANDADES se filtran SOLO por reino (ilike): el claim histórico de
// maestro guarda realm pero no server (la migración 20260905 backfills
// server), así que exigir .eq('server', …) ocultaría guilds legítimas del
// reino que sí aparecen en /hermandades. Los personajes sí tienen server y
// mantienen el filtro por capa.
export async function getRealmOverview(
  server: string,
  realm: string
): Promise<{ ok: boolean; guilds?: GuildRow[]; characters?: CharacterRow[]; error?: string }> {
  const [guildsRes, charsRes] = await Promise.all([
    supabase.from('raiddominion_guilds').select('*').eq('is_public', true).ilike('realm', realm).order('name', { ascending: true }).limit(200),
    supabase.from('raiddominion_characters').select('*').eq('is_public', true).eq('server', server).ilike('realm', realm).order('avg_ilvl', { ascending: false }).limit(200),
  ]);
  if (guildsRes.error) return { ok: false, error: guildsRes.error.message };
  if (charsRes.error) return { ok: false, error: charsRes.error.message };
  return {
    ok: true,
    guilds: (guildsRes.data as GuildRow[]) ?? [],
    characters: (charsRes.data as CharacterRow[]) ?? [],
  };
}

// Bandas públicas de un reino (anidado en un servidor). Las bandas no tienen
// campo de server fiable (solo character_realm/character_name), así que se
// filtran por reino combinando tres vías complementarias:
//   1. character_realm del BANDA coincide con el reino (mismo criterio de capa
//      que las guilds del reino, ver nota en getRealmOverview).
//   2. Dueño de la banda tiene un personaje PÚBLICO en ese reino: cubre bandas
//      cuyo character_realm es NULL (p. ej. bandas de prueba/legacy), que sí
//      aparecen en /bandas y deben listarse también aquí.
//   3. El reino PRINCIPAL del dueño (vista raiddominion_profile_handles)
//      coincide: cubre bandas de dueños con perfil privado y sin personaje
//      público en el reino — su banda pública aparece igualmente en su reino.
// Excluye bandas con hide_players porque su roster es privado.
export async function getRealmBands(
  realm: string
): Promise<{ ok: boolean; bands?: BandRow[]; error?: string }> {
  const [byRealmRes, charsRes, handlesRes] = await Promise.all([
    supabase
      .from('raiddominion_bands')
      .select('*')
      .eq('is_public', true)
      .eq('hide_players', false)
      .ilike('character_realm', realm)
      .order('name', { ascending: true })
      .limit(200),
    supabase
      .from('raiddominion_characters')
      .select('user_id')
      .eq('is_public', true)
      .ilike('realm', realm),
    supabase
      .from('raiddominion_profile_handles')
      .select('id')
      .ilike('realm', realm),
  ]);
  if (byRealmRes.error) return { ok: false, error: byRealmRes.error.message };
  if (handlesRes.error) return { ok: false, error: handlesRes.error.message };

  const byRealm = (byRealmRes.data as BandRow[]) ?? [];
  const seen = new Set(byRealm.map((b) => b.id));
  let extra: BandRow[] = [];

  const ownerIds = Array.from(new Set([
    ...((charsRes.data ?? []) as Array<{ user_id: string | null }>)
      .map((c) => c.user_id)
      .filter((id): id is string => Boolean(id)),
    ...((handlesRes.data ?? []) as Array<{ id: string | null }>)
      .map((h) => h.id)
      .filter((id): id is string => Boolean(id)),
  ]));
  if (ownerIds.length > 0) {
    const byOwnerRes = await supabase
      .from('raiddominion_bands')
      .select('*')
      .eq('is_public', true)
      .eq('hide_players', false)
      .in('owner_id', ownerIds)
      .order('name', { ascending: true })
      .limit(200);
    if (byOwnerRes.error) return { ok: false, error: byOwnerRes.error.message };
    extra = ((byOwnerRes.data as BandRow[]) ?? []).filter((b) => !seen.has(b.id));
  }

  return { ok: true, bands: [...byRealm, ...extra] };
}

// ─── Bandas públicas (tabla raiddominion_bands) ─────────────────────────

// Bandas públicas (espejo de visibilidad de su guild o del perfil del dueño).
export async function listPublicBands(): Promise<{ ok: boolean; bands?: BandRow[]; error?: string }> {
  const res = await supabase
    .from('raiddominion_bands')
    .select('*')
    .eq('is_public', true)
    .order('name', { ascending: true })
    .limit(200);

  if (res.error) return { ok: false, error: res.error.message };
  const rows = (res.data as BandRow[]) ?? [];
  // No exponer players[] de bandas que ocultan jugadores al público.
  rows.forEach((b) => {
    if (b.hide_players) b.players = [];
  });
  return { ok: true, bands: rows };
}

// Banda pública por slug.
export async function getPublicBandBySlug(slug: string): Promise<{ ok: boolean; band?: BandRow; error?: string }> {
  const res = await supabase
    .from('raiddominion_bands')
    .select('*')
    .eq('slug', slug)
    .eq('is_public', true)
    .maybeSingle();

  if (res.error) return { ok: false, error: res.error.message };
  const band = res.data as BandRow | null;
  if (band && band.hide_players) band.players = [];
  return { ok: true, band: band ?? undefined };
}

// ─── Gestión de bandas propias ──────────────────────────────────────────

// Bandas del usuario autenticado (RLS: solo las propias).
export async function getMyBands(): Promise<{ ok: boolean; items?: BandRow[]; error?: string }> {
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData.session?.user;
  if (!user) return { ok: false, error: 'sin sesión' };

  const res = await supabase
    .from('raiddominion_bands')
    .select('*')
    .eq('owner_id', user.id)
    .order('name', { ascending: true });

  if (res.error) return { ok: false, error: res.error.message };
  return { ok: true, items: (res.data as BandRow[]) ?? [] };
}

// Alterna la visibilidad pública de una banda propia.
export async function setBandVisibility(id: string, isPublic: boolean): Promise<{ ok: boolean; error?: string }> {
  const res = await supabase
    .from('raiddominion_bands')
    .update({ is_public: isPublic, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (res.error) return { ok: false, error: res.error.message };
  return { ok: true };
}

// El dueño fija la lista de reglas de UNA banda (subset del catálogo del SV).
// Varias bandas pueden compartir la misma regla (modelo embedded). Vía RPC.
export async function setBandRules(bandId: string, rules: ContentItem[]): Promise<{ ok: boolean; error?: string }> {
  const rpc = await supabase.rpc('raiddominion_set_band_rules', {
    p_band_id: bandId,
    p_rules: (rules ?? []) as unknown as Record<string, unknown>[],
  });
  if (rpc.error) return { ok: false, error: rpc.error.message };
  return { ok: true };
}

// Catálogo de reglas asignables: unión de raw.rules de los uploads del usuario
// (más reciente primero). Es el pool que el dashboard ofrece por banda.
export async function getMyRulesCatalog(): Promise<{ ok: boolean; items?: ContentItem[]; error?: string }> {
  const ups = await listMyUploads();
  if (!ups.ok) return { ok: false, error: ups.error };
  const seen = new Set<string>();
  const items: ContentItem[] = [];
  (ups.items ?? []).forEach((u) => {
    (u.rawRules ?? []).forEach((r) => {
      const key = `${r.title ?? ''}|${r.content ?? ''}`;
      if (seen.has(key)) return;
      seen.add(key);
      items.push(r);
    });
  });
  return { ok: true, items };
}

// Persiste bandas/reglas de un SV vía RPC SECURITY DEFINER.
// ownerRankIndex = registry.guild.rankIndex del dueño (índice de su rango
// dentro de la hermandad; 0 = líder). guildName = registry.guild.name (la
// hermandad del dueño, sea o no el maestro) que asocia guild_id a cada banda.
export async function upsertBands(
  svId: string,
  bands: ParsedSavedVariables['bands'],
  rules: ParsedSavedVariables['rules'],
  ownerRankIndex?: number | null,
  guildName?: string | null,
  characterName?: string | null,
  characterRealm?: string | null
): Promise<{ ok: boolean; count?: number; error?: string }> {
  const rpc = await supabase.rpc('raiddominion_upsert_bands', {
    p_sv_id: svId,
    p_bands: (bands ?? []) as unknown as Record<string, unknown>[],
    p_rules: (rules ?? []) as unknown as Record<string, unknown>[],
    p_owner_rank_index: ownerRankIndex ?? null,
    p_guild_name: guildName ?? null,
    p_character_name: characterName ?? null,
    p_character_realm: characterRealm ?? null,
  });

  if (rpc.error) return { ok: false, error: rpc.error.message };
  return { ok: true, count: rpc.data as number };
}

// Alterna la ocultación global (número + lista de jugadores) de una banda
// propia frente al público. Vía RPC SECURITY DEFINER (solo owner).
export async function setBandHidePlayers(id: string, hide: boolean): Promise<{ ok: boolean; error?: string }> {
  const rpc = await supabase.rpc('raiddominion_set_band_hide_players', {
    p_band_id: id,
    p_hide: hide,
  });
  if (rpc.error) return { ok: false, error: rpc.error.message };
  return { ok: true };
}

// Asigna la banda del usuario a UNA hermandad (NULL = personal). 1:N: una
// hermandad puede tener muchas bandas, una banda una sola. Vía RPC (solo
// owner; valida pertenencia a la hermandad). No toca la integración.
export async function setBandGuild(bandId: string, guildId: string | null): Promise<{ ok: boolean; error?: string }> {
  const rpc = await supabase.rpc('raiddominion_set_band_guild', {
    p_band_id: bandId,
    p_guild_id: guildId,
  });
  if (rpc.error) return { ok: false, error: rpc.error.message };
  return { ok: true };
}

// Hermandades donde el usuario aparece como MIEMBRO (sv_guild_name de sus
// personajes, cruzado contra las hermandades reclamadas) más las suyas. Es
// la fuente del select "Hermandad" de Mis Bandas.
export async function getMyMembershipGuilds(): Promise<{ ok: boolean; items?: GuildRow[]; error?: string }> {
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData.session?.user;
  if (!user) return { ok: false, error: 'sin sesión' };

  const charsRes = await supabase
    .from('raiddominion_characters')
    .select('sv_guild_name')
    .eq('user_id', user.id)
    .not('sv_guild_name', 'is', null);

  if (charsRes.error) return { ok: false, error: charsRes.error.message };
  // Nombres tal como los reporta el SV (case exacto) para el match con
  // raiddominion_guilds.name; se deduplican ignorando mayúsculas.
  const seen = new Set<string>();
  const names = (charsRes.data as Array<{ sv_guild_name: string | null }>)
    .map((c) => (c.sv_guild_name || '').trim())
    .filter((n) => {
      const key = n.toLowerCase();
      if (!key) return false;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  if (names.length === 0) {
    const mine = await getMyGuilds();
    return mine;
  }

  const res = await supabase
    .from('raiddominion_guilds')
    .select('*')
    .in('name', names);
  if (res.error) return { ok: false, error: res.error.message };

  const items = (res.data as GuildRow[]) ?? [];
  // Además las propias (por si un personaje de otra cuenta aún no las refleja)
  const mine = await getMyGuilds();
  const seenIds = new Set(items.map((g) => g.id));
  (mine.items ?? []).forEach((g) => { if (!seenIds.has(g.id)) items.push(g); });

  return { ok: true, items };
}

// El dueño de la banda propone integrarla al portal de su hermandad (la
// valida el GM). Requiere banda asignada a una hermandad. Vía RPC.
export async function proposeBandIntegration(bandId: string): Promise<{ ok: boolean; error?: string }> {
  const rpc = await supabase.rpc('raiddominion_propose_band_integration', {
    p_band_id: bandId,
  });
  if (rpc.error) return { ok: false, error: rpc.error.message };
  return { ok: true };
}

// El GM (owner de la hermandad) aprueba/rechaza la integración de una banda
// propuesta por un miembro. Solo mueve el estado de integración; NUNCA toca
// las reglas de la banda: las reglas viven en la banda del proponente y la
// selección del GM (qué se publica) se persiste aparte vía
// setGuildBandIntegrationRules. Vía RPC (solo owner de la guild).
export async function setBandIntegration(
  bandId: string,
  status: 'approved' | 'rejected' | 'none'
): Promise<{ ok: boolean; error?: string }> {
  const rpc = await supabase.rpc('raiddominion_set_band_integration', {
    p_band_id: bandId,
    p_status: status,
  });
  if (rpc.error) return { ok: false, error: rpc.error.message };
  return { ok: true };
}

// Vista del GM: bandas de su hermandad con integración propuesta, con el
// perfil del proponente para mostrarle su nombre o @hex. Vía RPC (solo
// owner de la guild; sortea la RLS de bands).
export interface GuildBandProposal {
  id: string;
  name: string;
  slug: string;
  is_public: boolean;
  integration_status: string;
  integration_proposed_by: string | null;
  integration_proposed_at: string | null;
  integration_decided_at: string | null;
  owner_id: string;
  rules: ContentItem[] | null;
  proposer: {
    slug: string | null;
    display_name: string | null;
    character_name: string | null;
    is_public: boolean;
  } | null;
}

export async function getGuildBandProposals(guildId: string): Promise<{ ok: boolean; items?: GuildBandProposal[]; error?: string }> {
  const rpc = await supabase.rpc('raiddominion_list_guild_band_proposals', {
    p_guild_id: guildId,
  });
  if (rpc.error) return { ok: false, error: rpc.error.message };
  return { ok: true, items: (rpc.data as unknown as GuildBandProposal[]) ?? [] };
}

// Bandas que cuentan en el portal de la hermandad (fuente REAL-TIME, ya no
// el snapshot): filas con guild_id = hermandad, dueño de rango autorizado
// (is_rank_integrated) Y públicas (is_public) — consistente con RLS
// (SELECT owner OR is_public), así el portal anónimo ve exactamente esto.
// Si hide_players, se quita players[] para que no se exponga número ni lista.
export async function listGuildPortalBands(guildId: string): Promise<{ ok: boolean; bands?: BandRow[]; error?: string }> {
  const res = await supabase
    .from('raiddominion_bands')
    .select('*')
    .eq('guild_id', guildId)
    .eq('is_rank_integrated', true)
    .eq('is_public', true)
    .order('name', { ascending: true })
    .limit(200);

  if (res.error) return { ok: false, error: res.error.message };

  const rows = (res.data as BandRow[]) ?? [];
  // Si la banda oculta jugadores, no exponer players[] al consumidor.
  rows.forEach((b) => {
    if (b.hide_players) b.players = [];
  });
  return { ok: true, bands: rows };
}


// Primer portal público de un dueño (multi-hermandad: toma el más reciente)
export async function getPublicGuildByOwner(ownerId: string): Promise<{ ok: boolean; guild?: GuildRow; error?: string }> {
  const res = await supabase
    .from('raiddominion_guilds')
    .select('*')
    .eq('owner_id', ownerId)
    .eq('is_public', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (res.error) return { ok: false, error: res.error.message };
  return { ok: true, guild: (res.data as GuildRow | null) ?? undefined };
}

// Hermandades públicas donde un jugador es maestro (owner_id). Soporta varias
// (un jugador puede ser GM de más de una cuenta/claim); alimenta la sección
// "Hermandades" del perfil público de jugador.
export async function getPublicGuildsForPlayer(
  ownerId: string
): Promise<{ ok: boolean; guilds?: GuildRow[]; error?: string }> {
  const res = await supabase
    .from('raiddominion_guilds')
    .select('*')
    .eq('owner_id', ownerId)
    .eq('is_public', true)
    .order('name', { ascending: true })
    .limit(20);

  if (res.error) return { ok: false, error: res.error.message };
  return { ok: true, guilds: (res.data as GuildRow[]) ?? [] };
}

// Snapshot público del portal (roster/rangos) desde guild_config. Las reglas
// NO viajan en el snapshot: el maestro las fija a mano (guild_rules) o por
// banda vía band_integration_rules/set_band_rules.
export async function getGuildSnapshot(guildId: string): Promise<{ ok: boolean; snapshot?: GuildPortalSnapshot; error?: string }> {
  const res = await supabase
    .from('raiddominion_guild_config')
    .select('config_value')
    .eq('guild_id', guildId)
    .eq('config_key', 'portal_snapshot')
    .maybeSingle();

  if (res.error) return { ok: false, error: res.error.message };
  return { ok: true, snapshot: (res.data?.config_value as GuildPortalSnapshot | undefined) ?? undefined };
}

// Guarda/actualiza el snapshot del portal de UNA hermandad (RLS: solo owner)
export async function saveGuildSnapshot(guildId: string, snapshot: GuildPortalSnapshot): Promise<{ ok: boolean; error?: string }> {
  const upsert = await supabase
    .from('raiddominion_guild_config')
    .upsert(
      { guild_id: guildId, config_key: 'portal_snapshot', config_value: snapshot },
      { onConflict: 'guild_id,config_key' }
    );

  if (upsert.error) return { ok: false, error: upsert.error.message };
  return { ok: true };
}

// ─── Reglas por hermandad (elección del maestro, separada del SV) ────────
// Se persisten en raiddominion_guild_config(config_key='guild_rules'), su
// propia fila: un re-upload solo toca 'portal_snapshot', así la selección
// manual del maestro NO se pisa con el catálogo crudo del SV cada vez.
// RLS: select público; insert/update solo del owner de la guild (upsert
// directo del cliente, mismo patrón que saveGuildSnapshot).

// Reglas seleccionadas por el maestro para el portal de UNA hermandad.
// 'items' indefinido = el maestro aún no ha fijado selección: el portal no
// muestra reglas (el snapshot ya no aporta catálogo desde 2026-09-06).
export async function getGuildRules(guildId: string): Promise<{ ok: boolean; items?: ContentItem[]; error?: string }> {
  const res = await supabase
    .from('raiddominion_guild_config')
    .select('config_value')
    .eq('guild_id', guildId)
    .eq('config_key', 'guild_rules')
    .maybeSingle();

  if (res.error) return { ok: false, error: res.error.message };
  return {
    ok: true,
    items: Array.isArray(res.data?.config_value) ? (res.data.config_value as ContentItem[]) : undefined,
  };
}

// El maestro fija qué reglas del catálogo aplican al portal de su hermandad.
export async function setGuildRules(guildId: string, rules: ContentItem[]): Promise<{ ok: boolean; error?: string }> {
  const upsert = await supabase
    .from('raiddominion_guild_config')
    .upsert(
      { guild_id: guildId, config_key: 'guild_rules', config_value: rules ?? [] },
      { onConflict: 'guild_id,config_key' }
    );

  if (upsert.error) return { ok: false, error: upsert.error.message };
  return { ok: true };
}

// ─── Reglas de bandas integradas (selección del GM, aparte del proponente) ─
// El GM TOGGLEA qué reglas de cada banda propuesta se publican en el portal.
// La selección vive en guild_config(config_key='band_integration_rules') — la
// data del GM — y el contenido SIEMPRE se lee de la banda del proponente al
// renderizar: no se graba ni se elimina nada de bands.rules.
export type BandIntegrationRules = Record<string, string[]>;

export async function getGuildBandIntegrationRules(guildId: string): Promise<{ ok: boolean; selection?: BandIntegrationRules; error?: string }> {
  const res = await supabase
    .from('raiddominion_guild_config')
    .select('config_value')
    .eq('guild_id', guildId)
    .eq('config_key', 'band_integration_rules')
    .maybeSingle();

  if (res.error) return { ok: false, error: res.error.message };
  const v = res.data?.config_value;
  const selection = v && typeof v === 'object' && !Array.isArray(v)
    ? (v as unknown as BandIntegrationRules)
    : undefined;
  return { ok: true, selection };
}

export async function setGuildBandIntegrationRules(guildId: string, selection: BandIntegrationRules): Promise<{ ok: boolean; error?: string }> {
  const upsert = await supabase
    .from('raiddominion_guild_config')
    .upsert(
      { guild_id: guildId, config_key: 'band_integration_rules', config_value: selection ?? {} },
      { onConflict: 'guild_id,config_key' }
    );

  if (upsert.error) return { ok: false, error: upsert.error.message };
  return { ok: true };
}

// Actualiza el snapshot del portal para CADA hermandad propia que aparezca
// en el SV (por nombre). Un re-upload mantiene al día todos los portales
// de un jugador que es maestro de varias hermandades.
export async function saveMyGuildSnapshotsFromSV(data: ParsedSavedVariables): Promise<{ ok: boolean; updated: number; error?: string }> {
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData.session?.user;
  if (!user) return { ok: false, updated: 0, error: 'sin sesión' };

  // Solo una subida de un personaje MAESTRO (registry.guild.isGM) refresca
  // el snapshot del portal. Una subida de otro rango (miembro/líder) NO debe
  // pisar roster/bandas/reglas publicados por el maestro (bug 2026-08-31).
  if (!data.registryGuild?.isGM) {
    return { ok: true, updated: 0 };
  }

  const guildsRes = await supabase
    .from('raiddominion_guilds')
    .select('id, name')
    .eq('owner_id', user.id);

  if (guildsRes.error) return { ok: false, updated: 0, error: guildsRes.error.message };
  const owned = (guildsRes.data as Array<{ id: string; name: string }>) ?? [];

  // Nombres de hermandad presentes en el SV (registryGuild + registries)
  const svGuildNames = new Set<string>();
  if (data.registryGuild?.name) svGuildNames.add(data.registryGuild.name.trim().toLowerCase());
  data.registries.forEach((r) => {
    if (r.guild?.name) svGuildNames.add(r.guild.name.trim().toLowerCase());
  });

  const snapshot = buildPortalSnapshot(data);
  let updated = 0;
  for (const g of owned) {
    if (!svGuildNames.has(g.name.trim().toLowerCase())) continue;
    const res = await saveGuildSnapshot(g.id, snapshot);
    if (!res.ok) return { ok: false, updated, error: res.error };
    updated += 1;
  }

  return { ok: true, updated };
}

// ─── Staff: moderación y administración (Fase 3.5) ──────────────────────

function friendlyStaffError(msg: string): string {
  if (msg.includes('No autorizado')) return 'No tienes permisos de staff para esta acción.';
  if (msg.includes('Rol inválido')) return 'Rol inválido.';
  if (msg.includes('propio rol')) return 'No puedes cambiar tu propio rol.';
  return msg;
}

export interface StaffGuildRow {
  id: string;
  slug: string;
  name: string;
  realm: string | null;
  faction: string | null;
  description: string | null;
  claim_status: 'pending' | 'verified' | 'rejected';
  is_public: boolean;
  owner_email: string | null;
  updated_at: string;
}

export interface AuditRow {
  id: string;
  actor_id: string | null;
  action: string;
  target: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

// Todas las hermandades (moderador/admin), incluidas pendientes y privadas
export async function staffListGuilds(): Promise<{ ok: boolean; guilds?: StaffGuildRow[]; error?: string }> {
  const rpc = await supabase.rpc('raiddominion_staff_list_guilds');
  if (rpc.error) return { ok: false, error: friendlyStaffError(rpc.error.message) };
  return { ok: true, guilds: (rpc.data as unknown as StaffGuildRow[]) ?? [] };
}

// Verifica/rechaza un claim pendiente (moderador/admin); sincroniza roster
export async function verifyClaim(guildId: string, approved: boolean): Promise<{ ok: boolean; error?: string }> {
  const rpc = await supabase.rpc('raiddominion_verify_guild_claim', {
    p_guild_id: guildId,
    p_approved: approved,
    p_members: null,
  });
  if (rpc.error) return { ok: false, error: friendlyStaffError(rpc.error.message) };
  return { ok: true };
}

// Takedown / republicación de un portal (moderador/admin)
export async function staffSetGuildPublic(guildId: string, isPublic: boolean): Promise<{ ok: boolean; error?: string }> {
  const rpc = await supabase.rpc('raiddominion_staff_set_guild_public', {
    p_guild_id: guildId,
    p_is_public: isPublic,
  });
  if (rpc.error) return { ok: false, error: friendlyStaffError(rpc.error.message) };
  return { ok: true };
}

// Bitácora reciente de acciones staff (RLS: solo staff lee)
export async function listAuditLog(): Promise<{ ok: boolean; items?: AuditRow[]; error?: string }> {
  const res = await supabase
    .from('raiddominion_audit_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);

  if (res.error) return { ok: false, error: res.error.message };
  return { ok: true, items: (res.data as AuditRow[]) ?? [] };
}

export interface AdminUserRow {
  id: string;
  email: string | null;
  display_name: string | null;
  character_name: string | null;
  realm: string | null;
  slug: string | null;
  role: RaiddominionRole;
  is_public: boolean;
  created_at: string;
}

// Listado completo de usuarios (solo admin)
export async function adminListUsers(): Promise<{ ok: boolean; users?: AdminUserRow[]; error?: string }> {
  const rpc = await supabase.rpc('raiddominion_admin_list_users');
  if (rpc.error) return { ok: false, error: friendlyStaffError(rpc.error.message) };
  return { ok: true, users: (rpc.data as unknown as AdminUserRow[]) ?? [] };
}

// Cambia el rol de un usuario (solo admin; vía RPC SECURITY DEFINER)
export async function adminSetRole(userId: string, role: RaiddominionRole): Promise<{ ok: boolean; error?: string }> {
  const rpc = await supabase.rpc('raiddominion_admin_set_role', {
    p_user_id: userId,
    p_role: role,
  });
  if (rpc.error) return { ok: false, error: friendlyStaffError(rpc.error.message) };
  return { ok: true };
}

// ─── Personajes y onboarding visitante → member ─────────────────────────

export interface CharacterRow {
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
  equipment: Array<{ slot: number; name: string; ilvl: number; quality: number }>;
  is_public: boolean;
  member_verified: boolean;
  sv_guild_name: string | null;
  sv_guild_rank: string | null;
  sv_is_gm: boolean;
  created_at: string;
  updated_at: string;
}

// Registra/actualiza el personaje del SV subido (RPC SECURITY DEFINER).
// 'conflict' = el (nombre, reino) ya está vinculado a otra cuenta.
export async function upsertMyCharacter(
  svId: string,
  player: ParsedSavedVariables['player'],
  savedAt?: string | null,
  guild?: ParsedSavedVariables['registryGuild']
): Promise<{ ok: boolean; result?: 'created' | 'updated' | 'conflict'; error?: string }> {
  if (!player) return { ok: false, error: 'el archivo no trae registry.player' };

  const rpc = await supabase.rpc('raiddominion_upsert_character', {
    p_sv_id: svId,
    p_player: player as unknown as Record<string, unknown>,
    p_saved_at: savedAt ?? null,
    p_guild: (guild ?? null) as unknown as Record<string, unknown> | null,
  });

  if (rpc.error) {
    let msg = rpc.error.message;
    if (msg.includes('personaje inválido')) msg = 'El personaje del archivo es inválido.';
    if (msg.includes('raiddominion_characters_name_realm_unique')) msg = 'conflict';
    if (msg.includes('duplicate key')) msg = 'conflict';
    return { ok: false, error: msg };
  }
  return { ok: true, result: rpc.data as 'created' | 'updated' | 'conflict' };
}

// Pre-check (20260925): ¿a quién pertenece UN personaje por nombre/reino?
// 'other' = ya está en OTRA cuenta (el SV que lo traiga como principal es
// ajeno y no debe guardarse); 'mine' = es de esta cuenta; 'free' = nadie.
// Orden deliberado: ante un empate realm-tolerante (reino vacío en un lado),
// gana 'other' ("a toda costa"): un duplicado entre cuentas se bloquea.
export async function checkCharacterOwner(
  name: string,
  realm?: string
): Promise<{ ok: boolean; result?: 'free' | 'mine' | 'other'; error?: string }> {
  const rpc = await supabase.rpc('raiddominion_check_character_owner', {
    p_name: name,
    p_realm: realm ?? null,
  });
  if (rpc.error) return { ok: false, error: rpc.error.message };
  return { ok: true, result: rpc.data as 'free' | 'mine' | 'other' };
}

// Guarda el roster del upload como evidencia para promociones ajenas
export async function saveRosterEvidence(
  svId: string,
  members: ParsedSavedVariables['guild']['members']
): Promise<{ ok: boolean; count?: number; error?: string }> {
  const rpc = await supabase.rpc('raiddominion_save_roster_evidence', {
    p_sv_id: svId,
    p_members: members as unknown as Record<string, unknown>[],
  });
  if (rpc.error) return { ok: false, error: rpc.error.message };
  return { ok: true, count: rpc.data as number };
}

export interface PromotionResult {
  promoted: boolean;
  reason?: string;
  character?: string;
}

// Intenta promover visitante→member. p_sv_id opcional habilita la
// auto-validación GM (regla 20260925): un SV con registry.guild.isGM y >= 1
// personaje registrado valida la cuenta. La regla base (>= 2 personajes
// acumulados) sigue vigente para cuentas sin SV de maestro.
// Si la DB aún no tiene la nueva firma (sin parámetro p_sv_id), reintenta sin
// argumento por si la firma antigua sigue viva.
export async function tryPromoteMember(svId?: string): Promise<{ ok: boolean; data?: PromotionResult; error?: string }> {
  const rpc = await supabase.rpc('raiddominion_try_promote_member', svId ? { p_sv_id: svId } : {});
  if (rpc.error && svId) {
    const retry = await supabase.rpc('raiddominion_try_promote_member');
    if (!retry.error) return { ok: true, data: retry.data as unknown as PromotionResult };
  }
  if (rpc.error) return { ok: false, error: rpc.error.message };
  return { ok: true, data: rpc.data as unknown as PromotionResult };
}

// Elimina los datos del usuario SOLO en RaidDominion (perfil, personajes,
// uploads y hermandades) y su membresía del app. No toca auth.users ni
// otras apps del ecosistema (decisión de producto 2026-08-24).
export async function deleteMyAccount(): Promise<{ ok: boolean; error?: string }> {
  const rpc = await supabase.rpc('raiddominion_delete_account');
  if (rpc.error) return { ok: false, error: rpc.error.message };
  return { ok: true };
}

// Resetea TODO el flujo del SV (uploads, personajes, hermandad/portal) y
// devuelve el rol a visitante salvo staff. Conserva la cuenta y el perfil.
export async function resetMyData(): Promise<{ ok: boolean; error?: string }> {
  const rpc = await supabase.rpc('raiddominion_reset_account_data');
  if (rpc.error) return { ok: false, error: rpc.error.message };
  return { ok: true };
}

// Personajes del usuario autenticado
export async function getMyCharacters(): Promise<{ ok: boolean; items?: CharacterRow[]; error?: string }> {
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData.session?.user;
  if (!user) return { ok: false, error: 'sin sesión' };

  // Escopado al usuario SIEMPRE: RLS permite leer personajes públicos de otros
  // (is_public = TRUE), así que sin el filtro "Mis Personajes" mezclaría datos
  // de terceros para moderadores/admins (y para cualquier cuenta).
  const res = await supabase
    .from('raiddominion_characters')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (res.error) return { ok: false, error: res.error.message };
  return { ok: true, items: (res.data as CharacterRow[]) ?? [] };
}

// Alterna visibilidad pública de un personaje propio
export async function setCharacterVisibility(id: string, isPublic: boolean): Promise<{ ok: boolean; error?: string }> {
  const res = await supabase
    .from('raiddominion_characters')
    .update({ is_public: isPublic, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (res.error) return { ok: false, error: res.error.message };
  return { ok: true };
}

// Personajes públicos de un usuario (perfil público /jugador/:slug)
export async function getPublicCharactersByUser(userId: string): Promise<{ ok: boolean; items?: CharacterRow[]; error?: string }> {
  const res = await supabase
    .from('raiddominion_characters')
    .select('*')
    .eq('user_id', userId)
    .eq('is_public', true)
    .order('avg_ilvl', { ascending: false });

  if (res.error) return { ok: false, error: res.error.message };
  return { ok: true, items: (res.data as CharacterRow[]) ?? [] };
}

// Nombres públicos por cuenta (batch) para sanitizar la presentación: un
// perfil puede declarar un personaje principal que NO es público, y su nombre
// no debe exponerse. Devuelve por user_id el set de nombres públicos y el
// personaje público más relevante (GM primero, luego mayor ilvl).
export interface PublicAccountNames {
  publicNames: Set<string>;
  principal?: string;
  // ¿La cuenta tiene un personaje PÚBLICO marcado como maestro (sv_is_gm)?
  // La insignia "Maestro" solo debe exponerse si ese personaje es visible.
  hasPublicGm: boolean;
}

export async function getPublicAccountNames(userIds: string[]): Promise<Map<string, PublicAccountNames>> {
  const map = new Map<string, PublicAccountNames>();
  const scores = new Map<string, number>();
  const ids = Array.from(new Set(userIds.filter(Boolean)));
  ids.forEach((id) => map.set(id, { publicNames: new Set<string>(), hasPublicGm: false }));
  if (ids.length === 0) return map;

  const res = await supabase
    .from('raiddominion_characters')
    .select('user_id, name, sv_is_gm, avg_ilvl')
    .eq('is_public', true)
    .in('user_id', ids)
    .limit(500);

  if (res.error) return map;
  (res.data as Array<{ user_id: string; name: string; sv_is_gm: boolean | null; avg_ilvl: number | null }> ?? []).forEach((c) => {
    const info = map.get(c.user_id);
    if (!info) return;
    info.publicNames.add(c.name.toLowerCase());
    if (c.sv_is_gm) info.hasPublicGm = true;
    const score = (c.sv_is_gm ? 1000 : 0) + (typeof c.avg_ilvl === 'number' ? c.avg_ilvl : 0);
    if ((scores.get(c.user_id) ?? -1) < score) {
      scores.set(c.user_id, score);
      info.principal = c.name;
    }
  });
  return map;
}

export interface CharacterSlugRow {
  id: string;
  slug: string;
}

// Genera/recupera slugs hex-8 para TODOS los personajes propios (RPC
// SECURITY DEFINER). Idempotente: conserva los existentes. Útil para
// enlazar cards secundarias y el directorio a /personaje/<slug>.
export async function ensureMyCharacterSlugs(): Promise<{ ok: boolean; slugs?: CharacterSlugRow[]; error?: string }> {
  const rpc = await supabase.rpc('raiddominion_ensure_character_slug');
  if (rpc.error) return { ok: false, error: rpc.error.message };
  return { ok: true, slugs: (rpc.data as unknown as CharacterSlugRow[]) ?? [] };
}

export interface PublicCharacterResult {
  character: CharacterRow;
  // Dueño del personaje; presente solo si su perfil es público (RLS).
  profile?: ProfileRow;
}

// Ficha POR PERSONAJE (/personaje/:slug): devuelve el personaje consultado
// + el perfil público de su dueño en UNA consulta (vista
// raiddominion_character_public, security_invoker). El card principal
// SIEMPRE es el personaje del slug, no el último subido.
export async function getPublicCharacterBySlug(slug: string): Promise<{ ok: boolean; result?: PublicCharacterResult; error?: string }> {
  const res = await supabase
    .from('raiddominion_character_public')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();

  if (res.error) return { ok: false, error: res.error.message };
  if (!res.data) return { ok: true };

  const row = res.data as CharacterRow & {
    profile_slug: string | null;
    profile_display_name: string | null;
    profile_character_name: string | null;
    profile_realm: string | null;
    profile_role: RaiddominionRole | null;
    profile_is_guild_master: boolean | null;
    profile_is_public: boolean | null;
  };

  // Perfil del dueño solo si es público (RLS de la vista lo filtra a NULL).
  const profile: ProfileRow | undefined = row.profile_role !== null
    ? {
        id: row.user_id,
        role: row.profile_role,
        display_name: row.profile_display_name,
        character_name: row.profile_character_name,
        realm: row.profile_realm,
        slug: row.profile_slug,
        is_guild_master: row.profile_is_guild_master ?? false,
        is_public: row.profile_is_public ?? false,
      }
    : undefined;

  return { ok: true, result: { character: row, profile } };
}

export interface PublicBandSummary {
  name: string;
  slug?: string;
  schedule?: string;
  minGS?: number;
  role?: string;
  // ¿Integrada a una hermandad? (guild_id + is_rank_integrated).
  integrated?: boolean;
  // Datos de atribución (resolveBandOwners): guild o perfil dueño.
  guildId?: string | null;
  ownerId?: string;
}

// Resuelve slugs públicos de /personaje/:slug por nombre. La clave del mapa
// es el nombre normalizado en minúsculas (join por nombre, como
// getPublicBandsForCharacter): se leen TODOS los personajes públicos con
// slug y se cruzan en cliente, porque .in('name', …) de PostgREST compara
// con mayúsculas exactas y el addon/SV puede guardar distinta capitalización.
// Alimenta los enlaces del roster del portal y del core de banda.
export async function getPublicCharacterSlugsByNames(
  names: string[],
): Promise<{ ok: boolean; slugs?: Record<string, string>; error?: string }> {
  const clean = Array.from(new Set(names.map((n) => (n ?? '').trim()).filter(Boolean)));
  if (clean.length === 0) return { ok: true, slugs: {} };

  const res = await supabase
    .from('raiddominion_characters')
    .select('name, slug')
    .eq('is_public', true)
    .not('slug', 'is', null)
    .limit(500);

  if (res.error) return { ok: false, error: res.error.message };

  const wanted = new Set(clean.map((n) => n.toLowerCase()));
  const slugs: Record<string, string> = {};
  ((res.data as Array<{ name: string; slug: string }>) ?? []).forEach((r) => {
    const key = (r.name || '').trim().toLowerCase();
    if (key && wanted.has(key) && r.slug && !slugs[key]) slugs[key] = r.slug;
  });
  return { ok: true, slugs };
}

// Bandas donde aparece un personaje dentro de raiddominion_bands: cruza la
// tabla buscando en players[] el nombre insensible a mayúsculas. Ya no depende
// del snapshot: las bandas viven en su propia tabla con su visibilidad espejo.
//
// Visibilidad (bug corregido 2026-09-01): el query NUNCA filtra is_public en
// SQL — lo hace RLS (públicas para cualquiera + propias para el dueño con
// sesión) — porque ese filtro dejaba invisibles las bandas PRIVADAS del propio
// jugador en su perfil. Aquí se refina en cliente:
//   - bandas privadas: solo las ve su dueño (autenticado);
//   - bandas con hide_players: el dueño conserva su membresía y rol; el resto
//     no expone pertenencia alguna.
// Se leen TODAS las filas visibles (paginado), sin truncar en el primer lote.
export async function getPublicBandsForCharacter(
  charName: string
): Promise<{ ok: boolean; bands?: PublicBandSummary[]; error?: string }> {
  const name = (charName ?? '').trim().toLowerCase();
  if (!name) return { ok: true, bands: [] };

  const { data: sessionData } = await supabase.auth.getSession();
  const me = sessionData.session?.user?.id ?? null;

  const rows: BandRow[] = [];
  const PAGE = 500;
  const MAX = 2000;
  for (let start = 0; start < MAX; start += PAGE) {
    const res = await supabase
      .from('raiddominion_bands')
      .select('*')
      .order('name', { ascending: true })
      .range(start, start + PAGE - 1);
    if (res.error) return { ok: false, error: res.error.message };
    const batch = (res.data as BandRow[]) ?? [];
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }

  const bands: PublicBandSummary[] = [];

  for (const b of rows) {
    const isMine = me !== null && b.owner_id === me;
    // RLS ya entregó solo lo que esta sesión puede ver (públicas + propias);
    // aquí se refina el caso propias-privadas sin repetir el filtro en SQL.
    if (!isMine && !b.is_public) continue;
    // Bandas con hide_players: el dueño ve su membresía; el público no.
    if (b.hide_players && !isMine) continue;
    const players = Array.isArray(b.players) ? (b.players as Array<{ name?: string; role?: string }>) : [];
    const meRow = players.find((p) => (p?.name ?? '').trim().toLowerCase() === name);
    if (!meRow) continue;
    bands.push({
      name: b.name,
      slug: b.slug ?? undefined,
      schedule: b.schedule ?? undefined,
      minGS: b.min_gs !== null && b.min_gs !== undefined ? Number(b.min_gs) : undefined,
      role: meRow.role,
      integrated: !!(b.is_rank_integrated && b.guild_id),
      guildId: b.guild_id ?? null,
      ownerId: b.owner_id,
    });
  }
  return { ok: true, bands };
}

// ─── Estadísticas públicas de comunidad (hero) ──────────────────────────

export interface CommunityStats {
  guilds: number;
  characters: number;
}

export async function getPublicStats(): Promise<CommunityStats> {
  const rpc = await supabase.rpc('raiddominion_public_stats');
  if (rpc.error || !rpc.data || !Array.isArray(rpc.data) || rpc.data.length === 0) {
    return { guilds: 0, characters: 0 };
  }
  const row = rpc.data[0] as { guilds: number | string; characters: number | string };
  return { guilds: Number(row.guilds) || 0, characters: Number(row.characters) || 0 };
}
