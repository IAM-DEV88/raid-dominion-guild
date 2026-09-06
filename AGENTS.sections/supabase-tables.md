# Ecosistema Supabase multi-app — Detalles

> Este archivo complementa `AGENTS.md` §3. Solo leerlo cuando se trabaja con
> Supabase (migraciones, RLS, perfiles, guilds, RPCs).

## Piezas clave (no reinventar)

- `auth.users` — identidad. `raw_user_meta_data` NO es confiable (sanitizar).
- `apps` — catálogo documental.
- `user_apps` — matriz de membresía {usuario, app}. Sin RLS.
- `{app}_profiles` — datos por app. `raiddominion_profiles.role` es la ÚNICA
  fuente de verdad del rol. Nunca tocar perfiles de otras apps.
- `handle_new_user()` — canónico en `../supabase-shared/handle_new_user.sql`.
  **NUNCA redefinirlo.** Al añadir la app `raiddominion`, editar SOLO la
  canónica (coordinando con las 5 apps).
- `sanitize_signup_role()` — canónico en `../supabase-shared/`. Para
  raiddominion el rol efectivo lo fuerza el trigger de perfiles
  (`raiddominion_force_visitante`: toda fila nueva nace `visitante`);
  `guild_master` se asigna vía RPC seguro al reclamar hermandad
  (con verificación), NUNCA desde el cliente.
- ⚠️ La canónica `handle_new_user()` aún NO tiene bloque `raiddominion`
  (verificado 2026-08-23). Mitigación vigente: el perfil se crea al vuelo
  vía policy INSERT propia (20260105). Coordinar el bloque con las otras
  apps antes de añadirlo (backlog P0 en priorities.md).
- `ensureUserApp()` — RPC anti-huérfanos (`../supabase-shared/ensure_user_app.sql`).

## Mapa de tablas por app

| App | Prefijo | Tablas |
|---|---|---|
| `lexigo` | `lexigo_` | `profiles`, `courses`, `lessons`, ... |
| `encuentrosvip` | `encuentrosvip_` | `profiles`, `media`, `reviews`, ... |
| `agendaya` | `agendaya_` | `profiles`, `businesses`, `services`, ... |
| `guild_portal` | `guild_portal_` | `config`, `guides`, `roster_players`, ... |
| `raiddominion` | `raiddominion_` | `profiles`, `characters`, `roster_evidence`, `guilds`, `guild_members`, `saved_variables`, `guild_config`, `audit_log` |
| Compartidas | — | `apps`, `user_apps`, `auth.users` |

## Cómo agregar una app al ecosistema

1. `INSERT INTO apps (slug, name) VALUES ('raiddominion', 'RaidDominion Portal')`
2. Crear tablas con prefijo `raiddominion_`
3. Añadir bloque en `handle_new_user()` (canónica, supabase-shared)
4. Crear policies RLS

## Onboarding visitante → member (anti-falsoo)

1. Usuario sube SV → parser extrae `registry.player` → `raiddominion_upsert_character`.
2. **Unicidad global** `(lower(name), lower(realm))`: si el personaje ya está vinculado a
   OTRA cuenta → `conflict` con mensaje claro (contactar moderador para liberarlo).
3. Evidencia de membresía en `raiddominion_roster_evidence` (sirve para validar
   a OTROS miembros), en orden de fiabilidad:
   a) `registry.*.guild.memberList` — roster GM del formato v3 (el que el
      addon escribe hoy; sin notas por diseño).
   b) `Guild.memberList` — sección legacy v2 (archivos antiguos).
   c) Jugadores de `bands[].players` (curados in-game por el líder).
4. Promoción a `member` (regla 20260830) por **conteo acumulado** en
   `raiddominion_characters` (`raiddominion_try_promote_member`): con ≥2 personajes
   registrados (sin importar hermandad) valida TODOS y promueve si está en visitante.
   Con SV que acredite `isGM` basta ≥1 (regla 20260925).
   Los personajes que entren después heredan el validado. Jamás degrada.
5. Reclamo de hermandad (`raiddominion_claim_from_sv`) exige SV con `isGM` Y ≥1
   personaje validado (regla 20260925: el SV maestro valida con uno); un
   `guild_master` ya verificado re-verifica/reclama sin esa restricción. Guard:
   si el personaje principal del SV pertenece a otra cuenta, no se reclama.

Helpers: `canAccessGuildDashboard()`, `canManageGuild()`, `isStaff()`.

## URLs públicas (detalles)

- Portal de hermandad: **`/hermandad/:slug`** vía shell `src/pages/hermandad/index.astro`
  + rewrite Netlify `/hermandad/* → /hermandad` (la raíz legacy `/:slug` redirige 301).
  Resuelve client-side contra `raiddominion_guilds` (RLS: públicas o propias del
  owner, con banner de vista previa); mensaje "no encontrado" si no existe.
- Perfil de jugador: **`/jugador/:slug`** vía shell `src/pages/jugador.astro` +
  rewrite Netlify `/jugador/* → /jugador`. Requiere migración `20260103_public_pages.sql`
  ejecutada (columna `raiddominion_profiles.slug`, RPC `raiddominion_ensure_profile_slug`,
  lectura pública si `is_public`).
- Snapshot público del portal (roster/bandas/reglas) vive en
  `raiddominion_guild_config.config_key='portal_snapshot'`; el dashboard lo
  sincroniza desde el análisis más reciente al guardar la ficha.
