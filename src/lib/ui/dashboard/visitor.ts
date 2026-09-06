// Renderers del visor de Registro del dashboard (pestaña Registro).
// Extraídos de src/pages/dashboard.astro — comportamiento idéntico.
// Solo funciones puras (reciben datos, escriben en el DOM por id o por
// contenedor pasado); el estado del closure del dashboard (snapshotGmGuilds,
// updateClaimBanner) lo conecta la capa fina de dashboard.astro.

import { el } from '@/lib/ui/preview';
import { configChip } from '@/lib/ui/dashboard/chips';
import { resolveRankName } from '@/lib/ui/ranks';
import { ui } from '@/lib/ui/design';
import { card, cardTop } from '@/lib/ui/card';
import { renderCharacterCard, type CharacterCardInput } from '@/lib/ui/cards';
import type { ParsedSavedVariables, RegistryGuild } from '@/types/parser';

// Clave normalizada de personaje (name-reino en minúsculas) para deduplicar la
// lista del registro y cruzar con las fichas públicas (slug).
export function characterListKey(name: string, realm?: string | null): string {
  return `${(name ?? '').trim().toLowerCase()}-${(realm ?? '').trim().toLowerCase()}`;
}

// Hermandad del registro normalizada para la ficha del visor.
export interface RegistryGuildCard {
  name: string;
  isGM: boolean;
  ranks: NonNullable<RegistryGuild['ranks']>;
  ownRankIndex: number | undefined;
  ownRank: string | undefined;
  numMembers: number | undefined;
  characters: string[];
}

// Hermandades del registro (registry.*.guild): CIFRAS + jerarquía de rangos,
// sin roster completo. Un jugador puede tener personajes en varias hermandades
// y ser GM de varias. Pura: devuelve las fichas; el dashboard decide el banner.
export function collectRegistryGuilds(d: ParsedSavedVariables): RegistryGuildCard[] {
  const guilds = new Map<string, RegistryGuildCard>();
  const addGuild = (rg: RegistryGuild | null | undefined, charName?: string): void => {
    if (!rg?.name) return;
    const key = rg.name.trim().toLowerCase();
    const cur = guilds.get(key) ?? {
      name: rg.name, isGM: false, ranks: [], ownRankIndex: undefined, ownRank: undefined,
      numMembers: undefined, characters: [],
    };
    if (rg.isGM) cur.isGM = true;
    if (typeof rg.rankIndex === 'number') cur.ownRankIndex = rg.rankIndex;
    if (rg.rank) cur.ownRank = rg.rank;
    if (rg.ranks && rg.ranks.length > 0 && cur.ranks.length === 0) {
      cur.ranks = [...rg.ranks].sort((a, b) => a.index - b.index);
    }
    if (typeof rg.numMembers === 'number') cur.numMembers = rg.numMembers;
    if (charName) cur.characters.push(charName);
    guilds.set(key, cur);
  };
  addGuild(d.registryGuild, d.player?.name);
  d.registries.forEach((r) => addGuild(r.guild, r.player?.name));
  return Array.from(guilds.values());
}

// Renderiza las fichas de hermandad del registro en el contenedor dado.
export function renderRegistryGuildCards(wrap: HTMLElement, guilds: RegistryGuildCard[]): void {
  wrap.innerHTML = '';
  if (guilds.length === 0) {
    wrap.appendChild(el('p', 'text-[11px] text-gray-600 italic', 'Sin hermandad en el registro.'));
    return;
  }
  guilds.forEach((g) => {
    const cardEl = card('p-4');
    cardEl.appendChild(cardTop());
    const head = el('div', 'flex flex-wrap items-center gap-2');
    head.appendChild(el('p', `${ui.gradientTitle} text-sm font-black italic`, g.name));
    if (g.isGM) head.appendChild(el('span', `${ui.badge} ${ui.badgeMd} text-amber-300 bg-amber-950/30 border-amber-500/40`, '★ Maestro'));
    cardEl.appendChild(head);

    // El rango propio se detecta por rankIndex contra la jerarquía; el
    // índice 0 (o isGM) es SIEMPRE el líder.
    const ownIndex = g.isGM ? 0 : g.ownRankIndex;
    const ownRankName = resolveRankName({
      rankIndex: ownIndex,
      rank: g.ownRank,
      ranks: g.ranks,
      isGM: g.isGM,
    });

    const meta = el('div', 'flex flex-wrap gap-2 mt-1.5');
    if (typeof g.numMembers === 'number') meta.appendChild(configChip(`${g.numMembers} miembros`));
    if (g.characters.length > 0) meta.appendChild(configChip(`${g.characters.length} personaje(s)`));
    meta.appendChild(configChip(`Tu rango: ${ownRankName}`, g.isGM));
    cardEl.appendChild(meta);

    // Jerarquía completa de rangos (registry.guild.ranks), ordenada por index
    // (0 = líder). El rango del propio usuario se marca si está disponible.
    if (g.ranks.length > 0) {
      const hier = el('div', 'flex flex-wrap items-center gap-1.5 mt-2');
      hier.appendChild(el('span', 'text-[10px] font-black uppercase tracking-widest text-gray-500', 'Rangos:'));
      g.ranks.forEach((r) => {
        const isMine = ownIndex !== undefined
          ? r.index === ownIndex
          : (!!g.ownRank && r.name.trim().toLowerCase() === g.ownRank.trim().toLowerCase());
        const label = r.name.trim() || (r.index === 0 ? 'Líder' : `Rango ${r.index}`);
        const cls = isMine
          ? 'text-amber-300 border-amber-500/50 bg-amber-900/30'
          : r.index === 0
            ? 'text-amber-200/90 border-amber-600/30 bg-gray-900/60'
            : 'text-gray-400 border-gray-700/40 bg-gray-900/60';
        hier.appendChild(el('span', `text-[10px] px-2 py-0.5 rounded-md border ${cls}`,
          `${r.index}: ${label}${isMine ? ' · tú' : ''}`));
      });
      cardEl.appendChild(hier);
    }
    if (g.characters.length > 0) {
      cardEl.appendChild(el('p', 'text-[11px] text-gray-500 mt-1.5', `Personajes: ${g.characters.join(', ')}`));
    }
    wrap.appendChild(cardEl);
  });
}

// Personajes del registro: fusión de registry.player + personajes de la cuenta
// (characters) + registros por personaje (registries), deduplicados por
// name-reino y renderizados con la card de personaje estandarizada.
// `slugs` (opcional) cruza con las fichas públicas: si el personaje tiene
// ficha pública, la card enlaza a /personaje/:slug (flecha); si no, card plana.
// `owned` (opcional) son los personajes REALES de la cuenta en BD: los
// personajes del archivo que NO están entre ellos se marcan como "No
// registrado · otra cuenta" (p. ej. tras subir un SV de otra cuenta). Con
// `undefined` (sin referencia) no se marca nada; con array vacío se marca todo.
export function renderCharactersMerged(
  d: ParsedSavedVariables,
  slugs?: Map<string, string>,
  owned?: Array<{ name: string; realm?: string | null }>,
): void {
  const wrap = document.getElementById('viewer-characters') as HTMLElement;
  const cnt = document.getElementById('cnt-viewer-chars') as HTMLElement;
  wrap.innerHTML = '';

  const isOwned = (name: string, realm?: string | null): boolean => {
    if (owned === undefined) return true;
    if (owned.length === 0) return false;
    const n = name.trim().toLowerCase();
    const r = (realm ?? '').trim().toLowerCase();
    return owned.some((o) => {
      const on = (o.name ?? '').trim().toLowerCase();
      const or = (o.realm ?? '').trim().toLowerCase();
      if (on !== n) return false;
      return r === '' || or === '' || r === or;
    });
  };

  const byKey = new Map<string, CharacterCardInput>();
  const add = (patch: Partial<CharacterCardInput>): void => {
    const name = patch.name?.trim();
    if (!name) return;
    const key = characterListKey(name, patch.realm);
    const merged: CharacterCardInput = { name, ...byKey.get(key), ...patch };
    if (!merged.slug && slugs) merged.slug = slugs.get(key) ?? null;
    byKey.set(key, merged);
  };

  // Config compartida de la cuenta (characters): NO se tiene en cuenta como
  // fuente de registro (regla 20260925): solo registries/player muestran
  // personajes en el visor.

  // Snapshots por personaje (registries): equipamiento y hermandad.
  d.registries.forEach((reg) => {
    const p = reg.player;
    if (p) {
      add({
        name: p.name,
        realm: p.realm ?? null,
        class: p.class,
        class_file: p.classFile,
        level: p.level,
        avg_ilvl: p.avgIlvl,
        sv_is_gm: reg.guild?.isGM === true,
      });
      return;
    }
    // Sin snapshot de jugador: se deriva del key "Nombre-Reino".
    const lastDash = reg.key.lastIndexOf('-');
    const name = lastDash > 0 ? reg.key.slice(0, lastDash) : reg.key;
    const realm = lastDash > 0 ? reg.key.slice(lastDash + 1) : undefined;
    add({ name, realm, sv_is_gm: reg.guild?.isGM === true });
  });

  // Personaje propio del archivo (registry.player): fuente principal.
  const tp = d.player;
  if (tp) {
    add({
      name: tp.name,
      realm: tp.realm ?? null,
      class: tp.class,
      class_file: tp.classFile,
      level: tp.level,
      avg_ilvl: tp.avgIlvl,
      sv_is_gm: d.registryGuild?.isGM === true,
    });
  }

  cnt.textContent = `(${byKey.size})`;
  const items = Array.from(byKey.values());
  if (items.length === 0) {
    wrap.appendChild(el('p', 'text-[11px] text-gray-600 italic', 'Sin personajes en el registro.'));
    return;
  }
  items.forEach((c) =>
    wrap.appendChild(
      renderCharacterCard(c, { forcePlain: true, unregistered: !isOwned(c.name, c.realm) }),
    ),
  );
}