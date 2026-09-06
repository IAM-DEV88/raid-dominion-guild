/**
 * Fichas comunes (cards) del portal: hermandad, personaje y banda.
 * Fuente ÚNICA del literal de cada card pública — no dupliques en directorios,
 * vistas (Realm/Character/Jugador) ni portales (ver AGENTS.sections/pagina-map.md §2).
 * Cards base (cardLink/cardTitle/iconTile) viven en src/lib/ui/card.ts.
 */
import { supabase } from '@/lib/supabase';
import { getPublicAccountNames, type PublicAccountNames } from '@/lib/api';
import { classColor } from '@/lib/ui/classColors';
import { classIconEl } from '@/lib/ui/classIcon';
import { cardLink, card as cardBox, cardTitle, iconTile, arrowIcon } from '@/lib/ui/card';
import { ui } from '@/lib/ui/design';
import { chip, el } from '@/lib/ui/dom';
import { toast } from '@/lib/ui/toast';
import type { GuildRow, BandRow } from '@/types/database';

// ── Card de hermandad (directorio /hermandades, reino, perfil) ──────────────
export function renderGuildCard(g: GuildRow): HTMLElement {
  const link = cardLink(`/hermandad/${g.slug}`, 'p-5');

  const head = el('div', 'flex items-center gap-3 mb-3');
  head.appendChild(iconTile((g.name[0] || '?').toUpperCase(), 'w-10 h-10', 'text-lg'));
  head.appendChild(cardTitle(g.name, 'text-base', 'truncate min-w-0'));
  link.appendChild(head);

  if (g.description) {
    link.appendChild(el('p', `${ui.text.bodyMuted} italic line-clamp-2 mb-3`, g.description));
  }

  // Chips: facción, servidor (enlaza al directorio de servidores), verificación y Discord
  const chips = el('div', 'flex flex-wrap gap-1.5 mb-3');
  if (g.faction) {
    const faction = el('span', `shrink-0 ${ui.badge} ${ui.badgeSm} ${g.faction === 'Horde' ? 'bg-red-950/40 border-red-700/50 text-red-300' : 'bg-sky-950/40 border-sky-700/50 text-sky-300'}`, g.faction === 'Horde' ? 'Horda' : 'Alianza');
    chips.appendChild(faction);
  }
  if (g.server) {
    const serverChip = el('a', `${ui.badge} ${ui.badgeSm} bg-gray-800/60 border-amber-600/20 text-sky-200 hover:bg-sky-900/30 transition-colors`, g.server) as HTMLAnchorElement;
    serverChip.href = `/servidor/${encodeURIComponent(g.server)}`;
    chips.appendChild(serverChip);
  }
  if (g.claim_status === 'verified') {
    chips.appendChild(el('span', `${ui.badge} ${ui.badgeSm} bg-emerald-950/30 border-emerald-600/40 text-emerald-300`, '✓ Verificada'));
  }
  if (g.discord_link) {
    const discord = el('a', `${ui.badge} ${ui.badgeSm} bg-indigo-950/30 border-indigo-600/40 text-indigo-300 hover:bg-indigo-900/30 transition-colors`, 'Discord') as HTMLAnchorElement;
    discord.href = g.discord_link;
    discord.target = '_blank';
    discord.rel = 'noopener noreferrer';
    discord.title = 'Discord de la hermandad';
    chips.appendChild(discord);
  }
  if (chips.children.length > 0) link.appendChild(chips);

  const meta = el('div', 'flex items-center justify-between mt-auto pt-3 border-t border-amber-600/15');
  meta.appendChild(el('span', 'text-[10px] font-black uppercase tracking-widest text-gray-500', g.realm || 'Reino no especificado'));
  meta.appendChild(el('span', 'text-[10px] font-black uppercase tracking-widest text-amber-400 group-hover:text-amber-300 transition-colors', 'Ver portal →'));
  link.appendChild(meta);

  return link;
}

// ── Card compacta de personaje (directorio /personajes, reino, perfil, ─────
// dashboard) ────────────────────────────────────────────────────────────────
// Modelo de UNA SOLA LÍNEA (mismo lenguaje que el core de banda): a la
// izquierda ícono de clase + nombre (-reino) y, a la derecha, Nivel/ilvl y el
// indicador "Ver ficha →" hacia /personaje/:slug (o "Ver perfil →" /jugador
// cuando el personaje no es público pero el perfil sí).
// Acepta tanto CharacterRow (DB) como datos parseados del SV: el contrato es
// un subconjunto mínimo (CharacterCardInput).
export interface CharacterCardInput {
  name: string;
  realm?: string | null;
  class?: string | null;
  class_file?: string | null;
  level?: number | null;
  avg_ilvl?: number | null;
  sv_is_gm?: boolean;
  slug?: string | null;
  is_public?: boolean;
  user_id?: string | null;
}

interface CharacterCardCtx {
  // Perfil dueño de cada personaje (id → slug) para enlazar /jugador/:slug.
  profiles?: Map<string, { slug: string | null; display_name: string | null; character_name: string | null }>;
  // Nombres públicos por cuenta (reservado para futuros sub-labels).
  names?: Map<string, PublicAccountNames>;
  // Ocultar el chip de reino (vista acotada a un reino).
  hideRealm?: boolean;
  // ── Extras opcionales del dashboard "Mis Personajes" ──────────────────────
  // Chip circular de orden (1, 2, 3…).
  number?: number;
  // Gate de publicación: `false` bloquea el toggle de visibilidad (visitante
  // sin personajes validados). Solo aplica junto a `setVisibility`.
  canPublish?: boolean;
  // Setter de visibilidad (dashboard): al pasarlo la card incluye el toggle
  // "Público". Devuelve `ok` si el cambio se persistió.
  setVisibility?: (visible: boolean) => Promise<{ ok: boolean }>;
  // Se ejecuta tras guardar la visibilidad con éxito (refresco del dashboard).
  onSaved?: () => void;
  // Ocultar Nivel/ilvl (dashboard): el toggle ya ocupa el lado derecho.
  hideStats?: boolean;
  // Sin degradado "Privado": card plana sin enlace (visor interno del
  // dashboard), conserva ícono+nombre+stats y NO muestra la etiqueta.
  forcePlain?: boolean;
  // El personaje NO pertenece a la cuenta (bloqueado por conflicto al subir un
  // SV de otra cuenta): card plana atenuada con chip rojo "No registrado".
  unregistered?: boolean;
}

export function renderCharacterCard(c: CharacterCardInput, ctx: CharacterCardCtx = {}): HTMLElement {
  const profile = c.user_id ? ctx.profiles?.get(c.user_id) : undefined;
  const charHref = c.slug ? `/personaje/${c.slug}` : null;
  const profHref = profile?.slug ? `/jugador/${profile.slug}` : null;
  const href = ctx.unregistered ? null : (charHref ?? profHref);
  const color = classColor(c.class, c.class_file);
  const link: HTMLElement = href
    ? cardLink(href, 'px-4 py-3 group')
    : cardBox(ctx.forcePlain || ctx.unregistered ? 'px-4 py-3' : 'px-4 py-3 opacity-80');
  if (!href && !ctx.forcePlain && !ctx.unregistered) link.title = 'El jugador mantiene su perfil privado';
  if (ctx.unregistered) link.title = 'Pertenece a otra cuenta o no se registró en tu historial';

  const accent = el('div', 'absolute top-0 left-0 w-1 h-full');
  accent.style.backgroundColor = color;
  link.appendChild(accent);

  const row = el('div', 'flex items-center justify-between gap-3 min-w-0');
  const left = el('div', 'flex items-center gap-2.5 min-w-0');
  if (ctx.number) {
    const num = document.createElement('span');
    num.className = 'shrink-0 w-6 h-6 rounded-full bg-amber-900/40 border border-amber-500/40 text-amber-200 text-xs font-black flex items-center justify-center';
    num.textContent = String(ctx.number);
    left.appendChild(num);
  }
  left.appendChild(classIconEl(c.class, c.class_file, 'w-7 h-7 rounded-md shrink-0 shadow border border-gray-700/50 object-cover'));
  const name = el('span', 'font-black italic truncate text-sm');
  name.style.color = color;
  name.textContent = `${c.name}${c.realm && !ctx.hideRealm ? '-' + c.realm : ''}`;
  left.appendChild(name);
  if (c.sv_is_gm) {
    const star = el('span', 'shrink-0 text-fuchsia-400 text-sm', '★');
    star.title = 'Maestro de hermandad';
    left.appendChild(star);
  }
  row.appendChild(left);

  const right = el('div', 'flex items-center gap-2.5 shrink-0');
  if (ctx.setVisibility) {
    // Toggle "Público" del dashboard con gate de publicación.
    const visLabel = document.createElement('label');
    visLabel.className = 'flex items-center gap-1.5 cursor-pointer select-none text-[10px] font-bold uppercase tracking-widest text-gray-400';
    // La card es un <a>: el clic en el toggle debe cambiar visibilidad y NO
    // navegar a la ficha.
    visLabel.addEventListener('click', (ev) => ev.stopPropagation());
    const visCheck = document.createElement('input');
    visCheck.type = 'checkbox';
    visCheck.checked = !!c.is_public;
    visCheck.className = 'w-3.5 h-3.5 accent-amber-500 shrink-0';
    const visStatus = document.createElement('span');
    if (ctx.canPublish === false) {
      visCheck.disabled = true;
      visCheck.checked = false;
      visCheck.className += ' opacity-40';
      visLabel.className += ' opacity-70 cursor-not-allowed';
      visLabel.title = 'Requiere cuenta Miembro validada (2+ personajes).';
      visStatus.textContent = 'bloqueado';
      visStatus.className = 'text-gray-500';
    } else {
      visCheck.addEventListener('change', async () => {
        visCheck.disabled = true;
        visStatus.textContent = '· guardando…';
        visStatus.className = 'text-amber-300';
        const res = await ctx.setVisibility!(visCheck.checked);
        visCheck.disabled = false;
        if (res.ok) {
          c.is_public = visCheck.checked;
          visStatus.textContent = '✓ guardado';
          visStatus.className = 'text-emerald-400';
          toast.success(
            visCheck.checked ? 'Personaje publicado' : 'Personaje ocultado',
            visCheck.checked
              ? `${c.name} ahora es visible en el directorio público.`
              : `${c.name} ya no aparece en el directorio público.`,
          );
          ctx.onSaved?.();
        } else {
          visCheck.checked = !visCheck.checked;
          visStatus.textContent = '✗ error';
          visStatus.className = 'text-red-400';
          toast.error('No se pudo actualizar la visibilidad', 'Reintenta o recarga el portal.');
        }
        window.setTimeout(() => { visStatus.textContent = ''; }, 2500);
      });
    }
    visLabel.append(visCheck, document.createTextNode('Público'), visStatus);
    right.appendChild(visLabel);
  }
  if (!ctx.hideStats) {
    if (typeof c.level === 'number') right.appendChild(el('span', 'text-[10px] text-gray-400', `Nivel ${c.level}`));
    if (c.avg_ilvl !== null && c.avg_ilvl !== undefined) {
      right.appendChild(el('span', 'text-[10px] text-amber-300', `ilvl ${c.avg_ilvl}`));
    }
  }
  if (href) {
    // Indicador con ICONO (no texto): la card ya enlaza, la flecha lo hace
    // explícito (mismo lenguaje que el core de banda).
    right.appendChild(arrowIcon());
  } else if (ctx.unregistered) {
    right.appendChild(chip('No registrado · otra cuenta', '!text-red-300 !border-red-500/40'));
  } else if (!ctx.forcePlain) {
    right.appendChild(el('span', 'text-[10px] text-gray-600', 'Privado'));
  }
  row.appendChild(right);

  link.appendChild(row);
  return link;
}

// ── Card de banda (directorio /bandas, reino, portal, perfil) ──────────────
// Ícono + nombre + chips (horario/GS/jugadores/dueño) + pie con atribución.
export interface BandCardInput {
  slug: string;
  name: string;
  schedule?: string | null;
  min_gs?: number | null;
  hide_players?: boolean;
  // ¿Pertenece a una hermandad? `null` = banda personal conocida (chip
  // "Personal" si no hay dueño); `undefined` = se desconoce (no se infiere).
  guildId?: string | null;
}

export interface BandCardOpts {
  // Fuente de la integración (character_name de un miembro): badge "Integrada".
  source?: string | null;
  // ¿Banda integrada a una hermandad (guild_id + is_rank_integrated)?
  integrated?: boolean;
  // Conteo de jugadores YA fusionado; si viene undefined se omite el chip.
  playerCount?: number;
  // Dueño visible (guild pública o perfil/jugador público).
  owner?: { href?: string; label?: string; kind?: 'guild' | 'player' } | null;
  // ¿La banda pertenece a una hermandad? Duplica el `guildId` de BandCardInput
  // para callers que pasan una BandRow cruda (cuyo campo es `guild_id`).
  // `null` = banda personal (chip "Personal" si no hay dueño).
  guildId?: string | null;
}

export function renderBandCard(band: BandCardInput, opts?: BandCardOpts): HTMLElement {
  const link = cardLink(`/banda/${encodeURIComponent(band.slug)}`, 'p-5');

  const head = el('div', 'flex items-center gap-3 mb-3');
  head.appendChild(iconTile((band.name[0] || '?').toUpperCase(), 'w-10 h-10', 'text-lg'));
  head.appendChild(el('h3', 'font-black italic text-base leading-[1.3] text-white group-hover:text-amber-200 transition-colors', band.name));
  link.appendChild(head);

  const meta = el('div', 'flex flex-wrap gap-1.5');
  if (band.schedule) meta.appendChild(chip(band.schedule));
  if (typeof band.min_gs === 'number' && band.min_gs > 0) meta.appendChild(chip(`GS ${band.min_gs}`, '!text-amber-300 !border-amber-500/40'));
  if (band.hide_players) {
    meta.appendChild(chip('jugadores ocultos', '!text-gray-500'));
  } else if (typeof opts?.playerCount === 'number') {
    meta.appendChild(chip(`${opts.playerCount} jugador${opts.playerCount === 1 ? '' : 'es'}`));
  }
  if (opts?.owner?.href && opts.owner.label) {
    meta.appendChild(chip(opts.owner.label, '!text-sky-200 !border-sky-600/30'));
  } else if ((opts?.guildId ?? band.guildId) === null) {
    // Banda personal conocida y sin dueño visible → atribución propia.
    meta.appendChild(chip('Personal', '!text-sky-200 !border-sky-600/30'));
  }
  if (opts?.source || opts?.integrated) {
    meta.appendChild(chip('Integrada', '!text-emerald-300 !border-emerald-500/40'));
  }
  link.appendChild(meta);

  const foot = el('p', 'text-xs text-gray-500 mt-4 flex items-center justify-between');
  // La banda se atribuye al jugador (cuenta), a su perfil/hermandad, o al
  // personaje PRINCIPAL del dueño; a falta de principal público, queda el
  // handle @hex (resolveBandOwners).
  if (opts?.owner?.href && opts.owner.label) {
    foot.appendChild(el('span', 'text-sky-300 hover:text-sky-200 transition-colors', opts.owner.kind === 'guild' ? opts.owner.label : `Por ${opts.owner.label}`));
    foot.appendChild(document.createTextNode('Ver banda →'));
  } else {
    foot.appendChild(el('span', 'text-amber-300/80 group-hover:text-amber-200 transition-colors', 'Ver banda →'));
  }
  link.appendChild(foot);

  return link;
}

// ── Helpers de datos compartidos (directorio y vistas) ─────────────────────
// Perfil dueño de una lista de personajes (id → slug/display/character_name).
export async function loadCharacterProfiles(userIds: string[]): Promise<Map<string, { slug: string | null; display_name: string | null; character_name: string | null }>> {
  const map = new Map<string, { slug: string | null; display_name: string | null; character_name: string | null }>();
  if (userIds.length === 0) return map;
  const res = await supabase.from('raiddominion_profiles').select('id, slug, display_name, character_name').in('id', userIds);
  if (!res.error) {
    (res.data as Array<{ id: string; slug: string | null; display_name: string | null; character_name: string | null }>).forEach((p) => map.set(p.id, p));
  }
  return map;
}