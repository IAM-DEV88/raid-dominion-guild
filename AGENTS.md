# RaidDominion Portal — Guía para Agentes

> Portal comunitario oficial del addon RaidDominion (WoW 3.3.5a, esMX).
> Conversión progresiva de la landing estática `raid-dominion-guild`
> (Astro 4 + Tailwind) en portal con cuentas, upload de SavedVariables,
> dashboards de hermandad y directorio público.

## 1. Stack

- **Framework:** Astro 4 + TypeScript
- **Styling:** Tailwind CSS v3 (tema WoW: ámbar/dorado, fondo oscuro)
- **Backend:** Supabase (JS client v2)
- **Deploy:** Netlify (Node 20)
- **Package Manager:** npm

## 2. Propósito del portal

1. **Descarga del addon**: el portal sirve la versión oficial anterior a la
   del addon dev (más reciente). Rutas locales de ambos repos: SOLO en
   `AGENTS.sections/addon.md` — no las dupliques en otro archivo.
2. **Upload de SavedVariables**: el usuario sube `RaidDominion.lua` y el
   portal lo parsea para mostrar el roster/bandas/roles de su hermandad.
3. **Verificación de maestro de hermandad**: si se confirma maestro, se le
   invita a registrar su hermandad y recibe un portal web gratuito para su guild.
4. **Roles progresivos** (estilo agendalisto): `visitante` → `member` →
   `guild_master` → `moderator` / `admin`. Toda cuenta nueva nace
   `visitante` (trigger `raiddominion_force_visitante`, migración 20260106)
   y valida su personaje subiendo el SV.

## 3. Ecosistema Supabase multi-app (reglas)

Comparte instancia con `lexigo`, `encuentrosvip`, `agendaya`, `guild_portal`.

### Reglas ABSOLUTAS

1. Toda tabla nueva: prefijo `raiddominion_`. Jamás sin prefijo.
2. NUNCA modificar tablas/funciones/triggers/policies de otras apps.
3. NUNCA reescribir `handle_new_user()` — editar solo la canónica en `../supabase-shared/`.
4. NUNCA `DROP TABLE` sin verificar prefijo `raiddominion_`.
5. Siempre `IF EXISTS` / `IF NOT EXISTS` en migraciones.
6. NUNCA confiar en `raw_user_meta_data` sin sanitizar.
7. Cada app externa en `handle_new_user()` envuelta en `BEGIN/EXCEPTION`.
8. NUNCA `DROP TRIGGER on_auth_user_created` sin coordinación cross-app.
9. Mantener sincronizados `raiddominion_profiles.role` y `user_apps.role`.

### Reglas RLS

1. Solo `auth.uid() = user_id` en policies. Sin subconsultas a otras tablas.
2. `raiddominion_profiles` es la única fuente de verdad del rol.
3. Limpiar policies anteriores con `DO $$ ... DROP ALL` en cada migración RLS.
4. `user_apps` NO tiene RLS (compartida).
5. Policies con prefijo `raiddominion_`.

### Flujo de registro

```
signUp → on_auth_user_created → handle_new_user()
  → [bloque raiddominion PENDIENTE en la canónica; mientras tanto]
    getMyProfile() crea la fila al vuelo (policy INSERT propia, 20260105)
  → trigger raiddominion_force_visitante: toda fila nueva nace 'visitante'
  → promoción 'member' al acumular ≥2 personajes registrados (RPC
    raiddominion_try_promote_member, conteo en raiddominion_characters) → audit log
```

### Ecosistema detallado

Para el mapa completo de tablas por app, piezas clave (`auth.users`, `apps`,
`user_apps`, `{app}_profiles`, `handle_new_user()`, `sanitize_signup_role()`,
`ensureUserApp()`) y cómo agregar una app, leer
`AGENTS.sections/supabase-tables.md`.

## 4. Roles y flujo de usuario

### Roles (5 niveles)

Definidos en `src/lib/roles.ts`. Comparar por índice (`ROLES.indexOf`).

| Role | Índice | Auto-asignable | Acceso |
|---|---|---|---|
| `visitante` | 0 | ✅ (toda cuenta nueva) | Landing, directorio público, `/upload`, dashboard básico |
| `member` | 1 | ✅ (≥2 personajes registrados, sin importar hermandad) | Todo lo anterior + personaje validado, visibilidad pública |
| `guild_master` | 2 | ✅ (vía RPC: SV con isGM + ≥1 personaje validado) | Dashboard de su hermandad, portal público en `/hermandad/:slug` |
| `moderator` | 3 | ❌ (solo admin) | Revisar claims/verificaciones, moderar públicos |
| `admin` | 4 | ❌ (solo admin, seed manual por email) | Gestión de usuarios, moderación total |

### Flujo principal

```
visitante / member
  ├─ /upload → sube SV (producido con "Registrar" en el addon) → parser → preview
  ├─ /dashboard → toggle perfil público → página viva en /jugador/:slug
  ├─ "Mi Hermandad": SIN formularios. El SV es la única vía:
  │    a) Formato nuevo: registry.guild.isGM=true + Miembro validado
  │       (≥1 personaje validado con SV isGM, regla 20260925) → raiddominion_claim_from_sv al subir (auto GM)
  │    └─ slug autogenerado + dashboard /dashboard/guild
  │         └─ toggle is_public → portal vivo en /hermandad/:slug
  └─ Re-subir SV actualiza roster/bandas del portal
```

> ⚠️ **Anti-falso-positivo (20260825):** `raiddominion_claim_from_sv` descarta
> cualquier candidata cuyo nombre ya esté registrado por OTRO maestro. El
> reclamo manual (`raiddominion_claim_guild`) fue ELIMINADO.

### URLs públicas

- Portal de hermandad: **`/hermandad/:slug`** vía shell `src/pages/hermandad/index.astro`
  + rewrite Netlify `/hermandad/* → /hermandad` (la raíz legacy `/:slug` redirige 301).
- Directorio de hermandades: **`/hermandades`** (`src/pages/hermandades/index.astro`);
  `guilds` (legacy) redirige 301 a `/hermandades`.
- Perfil de jugador: **`/jugador/:slug`** vía `src/pages/jugador.astro` + rewrite Netlify.
- Fichas: **`/personaje/:slug`**, **`/servidor/:server`**, **`/servidor/:server/reino/:realm`**,
  **`/banda/:slug`** vía shells `personaje.astro`/`servidor.astro`/`banda.astro` + rewrites.
- Slugs reservados: `upload`, `login`, `dashboard`, `admin`, `moderate`,
  `guilds`, `api`, `assets`, `_astro`, `portal`, `jugador`, `personajes`,
  `personaje`, `servidor`, `servidores`, `reino`, `hermandad`, `hermandades`,
  `jugadores`, `banda`, `bandas`.

### Detalles de onboarding y evidencia

Para el flujo completo de onboarding visitante → member, unicidad global,
evidencia de membresía (GM v3, legacy, bandas) y helpers de roles, leer
`AGENTS.sections/supabase-tables.md` (sección "Onboarding").

## 5. Formato de SavedVariables

Formato oficial v3.0.0. Parser en `src/lib/parser/savedVariables.ts`.
Especificación completa: `AGENTS.sections/parser.md`.

## 6. Organización de código

```
src/
├── components/      # UI reutilizable (Navigation, Footer, cards, AddonGuidesGrid, ...)
├── layouts/         # Layout.astro (tema global)
├── pages/           # Rutas Astro (/ index, /upload, /login, /dashboard, /hermandad/:slug, /jugador/:slug, /hermandades, fichas)
├── sections/        # Secciones de la landing (GrandLogo, AddonSection, Donaciones, ...)
├── data/            # datos estáticos (features, raids.json, addonGuides.ts)
├── lib/
│   ├── supabase.ts  # cliente tipado
│   ├── roles.ts     # roles y helpers
│   ├── api.ts       # wrappers RPC/queries tipadas
│   ├── routes.ts    # resolver de rutas públicas
│   ├── ui/design.ts # tokens visuales — ver AGENTS.sections/design.md
│   └── parser/      # savedVariables.ts (parser SV)
├── types/           # interfaces TS
└── utils/           # utilidades
```

> 🗺️ **Guías**: el contenido de las guías del addon vive en
> `src/data/addonGuides.ts` y se muestra en la sección Addon de la landing
> (`AddonSection.astro` → `AddonGuidesGrid.astro`). NO existen páginas
> `/guides` independientes. Deep-link vía hash `#guide-<id>`.

## 7. Convenciones de código

- TypeScript estricto (`astro/tsconfigs/strict`). Sin `any` en código nuevo.
- Nombres de archivos: PascalCase para componentes, camelCase para utilidades.
- Comentarios en español, solo cuando aportan (NO comentarios triviales).
- Tailwind exclusivamente; no CSS modules.
- Preferir editar archivos existentes sobre crear nuevos.
- **Contrato único de tabs**: los nombres/ids/hashes de las pestañas del
  dashboard viven SOLO en `src/lib/ui/tabs.ts` (`DASHBOARD_TABS`, `PANELS`,
  `panelFromHash`). `dashboard.astro` y `Navigation.astro` los importan; jamás
  escribir ids/labels/hashes sueltos en esas páginas.
- **Contrato único visual**: cualquier clase Tailwind que se repita 2+ veces
  se convierte en token de `src/lib/ui/design.ts` antes de seguir usándose
  suelta. Reglas y razones completas en `AGENTS.sections/design.md`.
- `build` real: `astro build`. Para verificación usar SIEMPRE
  `scripts/verifica.sh` (ver §8).

## 8. Build, Deploy y Migraciones

```bash
npm install
npm run dev         # servidor dev (localhost:4321)
scripts/verifica.sh # verificación de build (sandbox ext4 nativo)
npm run preview     # previsualizar build
```

- **Acceso LAN (celular)**: el dev server escucha en `0.0.0.0` (`host: true` en
  `astro.config.mjs`). WSL2 NAT requiere port proxy manual: `~/.local/bin/wsl-portforward`
  se ejecuta una vez por sesión de WSL (via `.bashrc`) y crea un `netsh interface portproxy`
  de `192.168.1.101:4321 → WSL_IP:4321`. Firewall restringido a `192.168.1.0/24`.
- Deploy Netlify (Node 20). Redirects SPA en `netlify.toml` si se añaden rutas.
- Variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
- ⚠️ El proyecto reside en `/mnt/d/` (DrvFs/WSL2): `astro check` puede tardar;
  se acepta como costo conocido, no se persigue optimizar más allá del
  sandbox ext4 de `verifica.sh`.

### Build (sandbox ext4)

`verifica.sh` sincroniza el árbol a un sandbox nativo (`~/rd-build`, `node_modules`
propio) y construye ahí; si el build es OK, sincroniza `dist/` de vuelta al worktree.

```bash
scripts/verifica.sh            # rápido: astro build (sin astro check)
scripts/verifica.sh --check    # completo: astro check && astro build
scripts/verifica.sh --async    # background; resultado en ~/rd-build/.build-status/
scripts/verifica.sh --ci       # gate de build (uso interno)
```

### Migraciones Supabase — política vigente: aplicación manual, sin CLI

Decisión deliberada (2026-08-30): el proyecto NO usa el CLI de Supabase.
Las migraciones se redactan en `supabase/migrations/` siguiendo P003 de
`patrones.md`, pero **se aplican a mano vía el SQL Editor del dashboard de
Supabase, exclusivamente por el usuario** — ningún agente ejecuta SQL contra
la base de datos remota, aunque tenga `bash: allow`.

Checklist al aplicar una migración manualmente:
1. Verificar en el header del dashboard que el proyecto activo es el de
   RaidDominion (se comparte instancia con `lexigo`/`encuentrosvip`/
   `agendaya`/`guild_portal` — aplicar en el proyecto equivocado es el
   riesgo real de este flujo, no el SQL en sí).
2. Ejecutar el `.sql`.
3. Registrar la aplicación en `.opencode/improve/ciclos.json` →
   `migraciones_aplicadas` (archivo, fecha, `project_ref_verificado: true`)
   inmediatamente — no dejarlo para después (ver `frallas.md` F012).

Sin CLI no hay tabla de tracking automática; `ciclos.json` es la única
fuente de verdad de qué se aplicó y cuándo. Si en algún momento se decide
adoptar el CLI (uso recomendado: solo diagnóstico de solo-lectura,
`migration list`/`db diff`, sin pasar a `db push` salvo decisión explícita
posterior), instalar como dev dependency (`npm install -D supabase`) desde
la misma terminal WSL que se use siempre para el proyecto — el binario
descargado es específico de plataforma y no es intercambiable entre WSL y
Windows nativo sobre la misma carpeta.

## 9. Trabajar con un agente (opencode)

### Modelo de sesión (vigente 2026-08-30)

Una sola sesión de edición (**Zeus**, WSL bash) + servidor local
(`npm run dev`), ambos auto-arrancados en el editor. No hay sesión
secundaria editando en paralelo. Esto reemplaza el modelo anterior de
varias sesiones simultáneas — ver `priorities.md` → "Histórico" para el
conflicto de merge que motivó el cambio, y no repetir ese patrón si se
reactiva un modelo multi-sesión en el futuro.

### Permisos que requieren confirmación explícita antes de ejecutar

- **Commits**: antes de commit, presentar resumen de cambios + checklist +
  preguntar explícitamente. No commitear sin autorización.
- **Migraciones**: el agente redacta el `.sql`; la aplicación es SIEMPRE
  manual y exclusiva del usuario (§8). El agente nunca ejecuta SQL contra
  Supabase, con o sin `bash: allow`.

### Checklist de cambios

1. `scripts/verifica.sh` — sin errores nuevos.
2. `git diff --stat` — solo archivos previstos.
3. Sin secretos/claves en el diff.
4. Comportamiento esperado verificado (navegación, parseo, roles).
5. Mensaje descriptivo en español, un cambio lógico por commit.

- Leer archivos antes de editar. Entender convenciones antes de escribir.
- Recordar: tablas `raiddominion_` NO `profiles`/`guilds` genéricos.

## 10. Sistema de agentes de mejora

Agentes en `.opencode/agents/`, registro en `.opencode/opencode.json`,
prioridades en `.opencode/improve/priorities.md`, convenciones visuales en
`AGENTS.sections/design.md`, fallas conocidas en `.opencode/improve/frallas.md`,
patrones validados en `.opencode/improve/patrones.md`. Cualquier agente DEBE:

1. Leer `.opencode/improve/priorities.md` y `.opencode/improve/frallas.md`
   antes de cambios estructurales.
2. Ejecutar `scripts/verifica.sh` después de cada cambio (o
   `scripts/verifica.sh --check` si el cambio es de tipos).
3. NO modificar archivos de otras apps del ecosistema.
4. NO modificar `../supabase-shared/` (salvo el bloque raiddominion coordinado).
5. NO aplicar migraciones SQL — solo redactarlas (§8).

| Agente | Rol | Secciones extra |
|---|---|---|
| `ui-ux` | Accesibilidad, responsive, tema WoW, i18n, personalidad visual, motion | `design.md` |
| `product` | Features de comunidad, flujo member→guild_master, conversión, métricas | `supabase-tables.md`, `frallas.md`, `patrones.md` |
| `development` | Supabase, parser SV, dashboards, rutas | `supabase-tables.md`, `parser.md`, `addon.md`, `design.md` |
| `refactorer` | Refactor seguro que preserva comportamiento | — |
| `qa` | Types, build, RLS, reglas multi-app, parser, gate mínimo de accesibilidad | `supabase-tables.md`, `parser.md`, `design.md`, `frallas.md` |

Flujo: `product` define (con métrica) → `development`/`ui-ux` implementan →
`refactorer` mantiene → `qa` aprueba antes de commit.

## 11. Addon RaidDominion (contrato entre repos)

Rutas locales del addon dev y del repo del portal: SOLO en
`AGENTS.sections/addon.md` — no las repitas en `development.md`, `product.md`
ni ningún otro archivo; si cambian, se actualizan en un solo lugar.
Contrato completo: `AGENTS.sections/addon.md`.

## 12. Discord y chat con IA (Netlify Functions)

El portal es un build estático; la lógica serverless vive en **Netlify
Functions** (`netlify/functions/`, bundler esbuild). NO usar API routes de
Astro ni adapters. Las funciones **NO dependen de `@supabase/supabase-js`**:
usan REST directo (PostgREST, `_shared/supabase.ts`) porque supabase-js
v2.112+ exige WebSocket nativo (Node 22) y Netlify ejecuta funciones en
Node 20. `env()` (`_shared/env.ts`) lee `process.env` en deploy e
`import.meta.env` en dev (astro dev).

- **`netlify/functions/chat.ts`** — chat con IA contextualizado. Recibe
  `POST /api/chat` con `{ messages: [{ role, content }] }` (redirect Netlify
  `/api/chat → /.netlify/functions/chat`). El system prompt se arma en cada
  llamada con `_shared/context.ts` (fotografía pública de `raiddominion_guilds`,
  `raiddominion_characters`, `raiddominion_bands` y stats). UI en el **widget
  flotante global** `src/components/features/ChatWidget.astro` (anclado
  abajo-izquierda, incluido en `Layout.astro` → disponible en TODAS las
  páginas). No hay página `/chat`.
- **`netlify/functions/discord-daily.ts`** — Scheduled Function (cron de
  disparo horario UTC `0 * * * *`): usa el **motor de mercadeo**
  (`_shared/marketing`) para generar un mensaje dinámico enfocado a conversión
  y publicarlo en el webhook público de Discord. La **periodicidad real** se
  controla con la env `DISCORD_DAILY_HOURS` (horas UTC separadas por coma en
  las que sí publica; por defecto `6,10,14,18,22` ≈ 00‑17 esMX — es decir, 5
  envíos al día, el disparo horario descarta el resto de horas). Cambiar la
  cadencia = tocar la env, sin tocar código ni redeployar.
  **Idempotencia anti-duplicados (migración 20260925):** antes de evaluar y
  enviar, la función reclama el slot de su ventana horaria
  (`raiddominion_cron_claim_slot`, clave `YYYYMMDD-HH` UTC sobre
  `raiddominion_cron_slots` con `INSERT ... ON CONFLICT DO NOTHING`, atómico).
  Si otro disparo o un reintento de Netlify (las Scheduled Functions son
  at-least-once) ya tomó el slot, responde `skipped` y NO envía → solo un
  mensaje por ventana. Envs:
  `DISCORD_WEBHOOK_URL` / `DISCORD_PUBLIC_WEBHOOK_URL`; sin webhook, avisa y
  omite (no falla).
- **`netlify/functions/_shared/marketing.ts`** — motor de mercadeo inteligente
  (MISMO para cron y panel admin). Está orientado a generar NUEVOS USUARIOS
  del addon y CONTENIDO (subidas de SV, personajes validados, bandas y
  hermandades registradas), no solo visibilidad. Flujo por invocación:
  ① lee el snapshot de métricas (`raiddominion_marketing_stats`) → ② evalúa
  objetivos contra el histórico en `raiddominion_marketing`
  (`raiddominion_marketing_evaluate`): tendencia (up/hold/down) + `focus_boost`
  (objetivo bajo a priorizar) → ③ Groq redacta un mensaje de conversión con
  data real priorizando el foco; si se pasa `goalKey`, se focaliza en ese
  objetivo y el **eje** (bandas/hermandades/jugadores) se deriva de él
  (`ejeForGoal`) → ④ lo publica según **canal** (`test`/`prod`) vía
  `sendContent()`. NO persiste mensajes, solo estado de objetivos.
- **`netlify/functions/discord-send.ts`** — envío manual de un OBJETIVO a
  Discord desde el panel admin ("cuando quiera"). Recibe `POST /api/discord-send`
  con `{ goal_key, canal: 'test' | 'prod' }` (redirect `/api/discord-send →
  /.netlify/functions/discord-send`): el motor focaliza el mensaje en ese
  objetivo y lo publica. NO persiste nada. Cada tarjeta de objetivo del panel
  tiene sus dos botones (pruebas / público); el canal `test` usa
  `DISCORD_WEBHOOK_URL` (webhook privado/admin, SIN @everyone, CON logo,
  con IP/UA de quien lanzó la prueba en el pie del embed) y `prod` al público
  (con @everyone y logo). Solo alcanzable desde `/admin` (rol admin).
- **`netlify/functions/visit.ts`** — registro de visitas estilo guild-portal.
  El beacon de `Layout.astro` hace `POST /api/visit` con `{ path, page,
  visitorId }` en cada carga de página (redirect `/api/visit →
  /.netlify/functions/visit`). La función **excluye el tráfico local** —
  loopback, IPs privadas/RFC1918 y link-local (`isLocalIp`) y las IPs de la
  env `RD_IGNORED_IPS` (tu IP para no contarte a ti mismo ni en producción) —
  y registra el resto en `raiddominion_visits` vía el RPC SECURITY DEFINER
  `raiddominion_register_visit` (única vía de escritura; RLS bloquea el acceso
  directo) y, si es la 1ª visita de ese visitante a esa sección en 60 min
  (dedupe del RPC), avisa al **canal admin** de Discord
  (`DISCORD_WEBHOOK_URL`, `https://discord.com/api/webhooks/1475343307210100758/...`)
  con un embed **SIN logo** que presenta la **IP**, visitante,
  navegador (UA), origen (referrer), sección y ruta. La guardia de tráfico
  local existe en DOS capas: el endpoint (`isLocalIp` + `RD_IGNORED_IPS`,
  respuesta `skipped:true`) y el propio RPC (rechaza y NO inserta IPs
  loopback/RFC1918/link-local — por eso jamás aparecen en "Visitas a la web
  (7 días)"). Sin webhook, omite: nunca falla la página. Migraciones:
  `20260915_visits.sql` (tabla + RPC) y `20260920_visits_ip_cleanup.sql`
  (columna `ip`, limpieza de datos dev/test previos y rechazo local en el RPC).

Env adicionales (migración `20260920`): con `p_ip` al RPC, las visitas
registran la IP de cada visitante.
- **`_shared/`** — helpers comunes: `supabase.ts` (REST PostgREST con anon-key
  y `Accept-Profile: public`, RLS activa: solo lee datos públicos), `env.ts`
  (envs deploy/dev), `groq.ts` (`groq/compound`), `discord.ts`
  (webhooks), `context.ts` (contexto de comunidad), `marketing.ts` (motor).

### Migración de mercadeo (20260913_marketing_goals.sql)

Define/afina el sistema de mercadeo:

- Tabla `raiddominion_marketing` (objetivos de conversión + tendencia
  up/hold/down + `focus_boost` + target/current/previous).
- RPC `raiddominion_marketing_stats()` (snapshot de métricas, solo conteos,
  SECURITY DEFINER, GRANT anon/authenticated). **Atención:** si ya existía una
  versión anterior con distinta forma, el archivo hace `DROP FUNCTION IF EXISTS`
  antes del `CREATE OR REPLACE` (evita error 42P13).
- RPC `raiddominion_marketing_evaluate(p_stats jsonb)` (única vía de escritura
  al estado; calcula tendencia/foco, persiste y devuelve los objetivos).

> ⚠️ **Mensajes fijados (fuera de alcance, 2026-09-04):** la versión inicial de
> esta migración incluía `raiddominion_marketing_messages` + RPCs CRUD admin
> (`*_messages_admin`, `*_message_upsert`, `*_message_delete`). Se eliminaron del
> alcance: el panel de /admin solo envía los objetivos. Si la base llegó a
> recibirlos, aplicar `20260913_marketing_remove_messages.sql` para limpiarlos.

Si la base aún no la tiene, aplicarla a mano en el SQL Editor del proyecto
RaidDominion y registrarla en `ciclos.json`; si ya está aplicada, no hace
falta re-aplicarla.

### Migración de regeneración de metas (20260922_marketing_target_regrowth.sql)

Modifica `raiddominion_marketing_evaluate` para que **al cumplirse una meta
(`current >= target`) el objetivo "renazca" con una meta nueva más exigente**:
`new_target = GREATEST(target + 1, ceil(target × 1.5))` (ej. 1→2, 3→5, 8→12,
10→15, 30→45). Sin esta migración, un objetivo cumplido quedaba fuera de
`focus_boost` para siempre; con ella, si se estanca bajo la nueva meta vuelve
a priorizarse. Aplicarla manualmente en el SQL Editor y registrarla en
`ciclos.json`.

### Migración de tráfico orgánico (20260918_marketing_traffic.sql)

Ampliación del sistema de mercadeo con estadísticas de **visitas**
(`raiddominion_visits`, migración 20260915): 4 objetivos nuevos
(`visits_weekly`, `visitors_30d`, `visits_upload_7d`, `visits_directory_7d`)
y `raiddominion_marketing_stats()` ampliado con esas métricas (DROP + CREATE
OR REPLACE por cambio de tipo de retorno). Aplicarla manualmente en el SQL
Editor del proyecto RaidDominion y registrarla en `ciclos.json`.

Env adicionales: `GROQ_API_KEY` (Groq), `DISCORD_WEBHOOK_URL` (webhook
privado/admin: test de mercadeo y avisos de visitas),
`DISCORD_PUBLIC_WEBHOOK_URL` (canal público),
`DISCORD_DAILY_HOURS` (periodicidad del cron, ver `discord-daily.ts`),
`SITE_URL` (sobreescribe la URL canónica del portal; por defecto
`https://raid-dominion.netlify.app`). El `.env` local está en `.gitignore`;
configurar las mismas vars en Netlify.

Formato de los mensajes de mercadeo (cron y panel, ambos usan el MISMO motor):
- **Canal público (`prod`)**: una CAPTURA del addon como imagen del embed
  (`embed image`, desde `public/images/addon/*.jpg`), rotada de forma
  **balanceada según el eje del mensaje** (bandas/hermandades/jugadores) vía
  RPC `raiddominion_marketing_pick_image` (tabla `raiddominion_marketing_images`,
  migración 20260925; fallback determinista en `_shared/addonImages.ts` si el
  RPC no está aplicado) + logo como thumbnail + @everyone + CTA.
- **Canal admin/pruebas (`test`)**: MISMO embed con captura + CTA y logo
  thumbnail, SIN @everyone; es un preview de monitoreo con la **IP** y UA de
  quien lanzó la prueba en el pie del embed.
- **Solo los avisos de VISITAS (`visit.ts`) van SIN captura** (embed con IP y
  datos del visitante), también al canal admin.
- **Enlace útil de la plataforma con CTA** en ambos (título clicable del
  embed + línea markdown `➜ **<label>**: <url>` según eje): `/upload`,
  `/hermandades`, `/bandas`.
- **Formato balanceado y atractivo**: negritas en cifras/paso clave, máx. 3
  viñetas, entre 1 y 3 emojis colocados con mesura, CTA final. El prompt
  instruye NO incluir URLs (las agrega el código de forma determinística).

Canales del Discord comunitario (solo referencia; el envío usa el webhook URL
completo, Configurados en `.env`/Netlify):
- **Admin / pruebas y visitas** `1475343307210100758` → `DISCORD_WEBHOOK_URL`
  (webhook privado: botón "Pruebas" de cada objetivo y avisos de visitas;
  mensajes SIN @everyone).
- **Público / chat general y cron** `1475350391960109108` →
  `DISCORD_PUBLIC_WEBHOOK_URL` (canal público: cron `discord-daily` y botón
  "Público" de cada objetivo; con @everyone y captura del addon).

## 13. Changelog de este archivo

- **2026-08-30 (rutas)**: canonicalización del mapa de rutas en español —
  portal de hermandad de raíz `/:slug` → **`/hermandad/:slug`** (shell
  `src/pages/hermandad/index.astro` + rewrite `/hermandad/*`; raíz legacy 301);
  directorio `guilds` → **`/hermandades`** (canónico, `guilds` legacy 301);
  fichas fuera del shell `/detalle` → páginas dedicadas
  `personaje.astro`/`servidor.astro`/`banda.astro` (+`DetailShell.astro`);
  perfil de jugador única ruta `/jugador/:slug` (se eliminó `/p/:slug` y el
  modo 'character' muerto de JugadorProfile). Eliminados `/detalle` y `/p`.
- **2026-08-30**: separadas las convenciones visuales a
  `AGENTS.sections/design.md` (antes mezcladas en `priorities.md`);
  documentado el modelo de sesión única (Zeus + servidor); formalizada la
  política de migraciones manuales sin CLI con checklist y ledger en
  `ciclos.json`; unificadas las rutas locales del addon en un solo archivo
  de referencia; agregado gate mínimo de accesibilidad a `qa.md`.
