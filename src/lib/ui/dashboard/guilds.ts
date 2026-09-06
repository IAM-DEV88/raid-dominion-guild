// Gestión de hermandad del dashboard (pestaña Hermandad): cifras, propuestas
// de integración de bandas y ficha con portal/reglas. Extraído de
// src/pages/dashboard.astro — comportamiento idéntico. El estado del closure
// (conteos por hermandad, catálogo de reglas, refresco del encabezado) entra
// por opciones (DI).

import { el } from '@/lib/ui/preview';
import { ui } from '@/lib/ui/design';
import { toast } from '@/lib/ui/toast';
import { card, cardTop } from '@/lib/ui/card';
import { ruleKey, ruleId, escapeHtml } from '@/lib/ui/dashboard/format';
import { supabase } from '@/lib/supabase';
import {
  getGuildSnapshot,
  listGuildPortalBands,
  getGuildRules,
  getGuildBandProposals,
  getGuildBandIntegrationRules,
  setGuildBandIntegrationRules,
  setBandIntegration,
  setGuildRules,
  resolveRules,
} from '@/lib/api';
import type { GuildRow } from '@/types/database';
import type { ContentItem } from '@/types/parser';

export interface SetMsgOpts {
  toast?: boolean;
  title?: string;
}

export function setMsg(el: HTMLElement, ok: boolean, text: string, opts?: SetMsgOpts): void {
  el.textContent = text;
  el.className = `mt-3 text-sm rounded-md px-4 py-2.5 ${ok ? ui.status.success : ui.status.error}`;
  if (opts?.toast === false) return;
  const title = opts?.title ?? 'Operación exitosa';
  if (ok) toast.success(title, text);
  else toast.error(title, text);
}

export interface GuildCardOptions {
  // Catálogo global de reglas (origen del select "agregar regla").
  rulesCatalog: ContentItem[];
  // Refresca los indicadores del encabezado tras cambios (refreshHdrGuild).
  refreshHdrGuild: () => void;
  // Conteos por hermandad (integrantes / bandas integradas / reglas) para los
  // indicadores del encabezado de la ficha seleccionada.
  guildMembersCount: Map<string, number>;
  guildBandsCount: Map<string, number>;
  guildRulesCount: Map<string, number>;
}

// Cifras relevantes de la hermandad para el tab /dashboard#hermandad: número
// de miembros del roster del snapshot, bandas integradas al portal (leídas en
// tiempo real) y reglas del último análisis. Sin roster paginado aquí.
async function loadGuildStats(g: GuildRow, opts: GuildCardOptions): Promise<void> {
  const [res, bandsRes, rulesRes] = await Promise.all([
    getGuildSnapshot(g.id),
    listGuildPortalBands(g.id),
    getGuildRules(g.id),
  ]);
  const members = res.ok && res.snapshot ? res.snapshot.members.length : 0;
  const integrated = bandsRes.ok ? bandsRes.bands?.length ?? 0 : 0;
  // Reglas publicadas = SOLO las que eligió el maestro (el snapshot ya no
  // aporta catálogo desde 2026-09-06; subir un SV no llena reglas).
  const rules = rulesRes.ok && Array.isArray(rulesRes.items)
    ? rulesRes.items.length
    : 0;
  opts.guildMembersCount.set(g.id, members);
  opts.guildBandsCount.set(g.id, integrated);
  opts.guildRulesCount.set(g.id, rules);
  opts.refreshHdrGuild();
}

// Propuestas de integración de bandas de los miembros: el GM (owner) ve las
// bandas de su hermandad propuestas por miembros con rango autorizado. Las
// reglas provienen SIEMPRE de la banda del proponente: el GM las TOGGLEA
// (cuáles se publican) sin borrarlas ni grabarlas en su propia data; la
// selección se guarda en guild_config('band_integration_rules'). Las
// RE-APROBADAS permanecen en la lista (se pueden re-chazar después); las
// RECHAZADAS salen de la lista.
export async function loadBandProposals(g: GuildRow, body: HTMLElement): Promise<void> {
  const sec = body.closest<HTMLElement>('[data-prop-sec]');
  const countEl = sec?.querySelector<HTMLElement>('[data-prop-count]') ?? null;

  const [res, rulesRes] = await Promise.all([
    getGuildBandProposals(g.id),
    getGuildBandIntegrationRules(g.id),
  ]);
  if (!res.ok) {
    body.innerHTML = '<p class="text-sm text-gray-400 italic">No se pudieron cargar las propuestas: ' + (res.error || '') + '</p>';
    if (countEl) countEl.textContent = '0 pendientes';
    return;
  }
  // Las bandas rechazadas salen de la lista (solo pendientes y aprobadas).
  const items = (res.items ?? []).filter((bp) => bp.integration_status !== 'rejected');
  // Selección vigente del GM por banda (claves de regla activas). Ninguna
  // regla nace activa: la autoridad ES la selección explícita del visor —
  // el GM activa/desactiva las que quiere PUBLICAR de la banda integrada
  // (las del proponente nunca salen solas por defecto).
  const selection: Record<string, Set<string>> = {};
  if (rulesRes.ok && rulesRes.selection) {
    Object.entries(rulesRes.selection).forEach(([bid, keys]) => {
      selection[bid] = new Set(keys ?? []);
    });
  }
  let pending = items.filter((bp) => bp.integration_status === 'pending').length;
  const renderCount = (): void => {
    if (countEl) countEl.textContent = `${pending} pendiente${pending === 1 ? '' : 's'}`;
  };
  renderCount();

  if (items.length === 0) {
    body.innerHTML = '<p class="text-sm text-gray-400 italic">Aún no hay bandas propuestas por tus miembros.</p>';
    return;
  }

  body.innerHTML = '';
  items.forEach((bp, i) => {
    const row = el('div', 'bg-gray-900/40 border border-amber-600/15 rounded-md px-3 py-2.5');
    const head = el('div', 'flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center md:gap-2');
    const num = el('span', 'shrink-0 w-6 h-6 rounded-full bg-amber-900/40 border border-amber-500/40 text-amber-200 text-xs font-black flex items-center justify-center', String(i + 1));
    head.appendChild(num);
    const info = el('div', 'min-w-0 flex-1');
    info.appendChild(el('p', 'font-bold text-white text-sm break-words', bp.name));
    // Personaje que propone: se muestra con las reglas para atribuir cada
    // regla al proponente (nunca al aprobante).
    const who = (bp.proposer?.character_name || bp.proposer?.display_name || (bp.proposer?.slug ? `@${bp.proposer.slug.replace(/^perfil-/, '').slice(0, 8)}` : null)) ?? 'cuenta';
    const sub = el('p', 'text-[11px] text-gray-500');
    const stateChip = el('span', `${ui.badge} ${ui.badgeSm} mt-1 hidden`);
    const refreshState = (): void => {
      if (bp.integration_status === 'pending') {
        sub.textContent = `Propuesta por ${who}${bp.integration_proposed_at ? ' · ' + new Date(bp.integration_proposed_at).toLocaleDateString('es') : ''}`;
        stateChip.classList.add('hidden');
        return;
      }
      const approved = bp.integration_status === 'approved';
      sub.textContent = '';
      stateChip.textContent = approved ? '✓ Aprobada' : '✗ Rechazada';
      stateChip.className = `${ui.badge} ${ui.badgeSm} mt-1 ` +
        (approved ? 'bg-emerald-950/30 border-emerald-600/40 text-emerald-300' : 'bg-red-950/30 border-red-600/40 text-red-300');
      stateChip.appendChild(document.createTextNode(bp.integration_decided_at ? ' · ' + new Date(bp.integration_decided_at).toLocaleDateString('es') : ''));
      stateChip.classList.remove('hidden');
    };
    info.appendChild(sub);
    info.appendChild(stateChip);
    head.appendChild(info);

    const act = el('div', 'flex flex-col gap-2 sm:flex-row shrink-0 w-full sm:w-auto');
    const approve = document.createElement('button');
    approve.type = 'button';
    approve.className = 'px-3 py-1.5 rounded-md text-[10px] font-black uppercase tracking-widest border border-emerald-600/40 bg-emerald-950/30 text-emerald-300 hover:bg-emerald-900/40 transition-all w-full sm:w-auto';
    approve.textContent = 'Aprobar';
    const reject = document.createElement('button');
    reject.type = 'button';
    reject.className = 'px-3 py-1.5 rounded-md text-[10px] font-black uppercase tracking-widest border border-red-600/40 bg-red-950/30 text-red-300 hover:bg-red-900/40 transition-all w-full sm:w-auto';
    reject.textContent = 'Rechazar';
    const saving = el('span', 'text-[10px] font-bold uppercase tracking-widest', '');
    act.append(approve, reject, saving);
    // El GM puede re-decidir en cualquier momento: los botones NUNCA se
    // ocultan; solo se desactiva el de la decisión ya aplicada (p. ej. una
    // banda aprobada sigue pudiendo rechazarse).
    const renderActions = (): void => {
      approve.disabled = bp.integration_status === 'approved';
      reject.disabled = bp.integration_status === 'rejected';
      approve.title = approve.disabled ? 'Ya está aprobada' : 'Aprobar esta banda';
      reject.title = reject.disabled ? 'Ya está rechazada' : 'Rechazar esta banda';
    };
    renderActions();
    head.appendChild(act);
    row.appendChild(head);

    // Reglas de la banda propuesta (SIEMPRE desde el proponente): el GM las
    // TOGGLEA como tags — las activas son las que se publican. Nunca se
    // elimina una regla de la data del proponente (se guarda la selección).
    // Normalizadas por nombre: mismo título = misma regla (primera gana).
    const proposed = resolveRules(Array.isArray(bp.rules) ? (bp.rules as ContentItem[]) : []);
    // La selección guardada es la AUTORIDAD y nace vacía: el GM ACTIVA cada
    // regla que quiere publicar. Ninguna regla del proponente se publica
    // sola por defecto (ni en pendientes ni en integradas).
    const keyFor = (r: ContentItem): string => ruleId(r);
    const ruleSelected = (keys: Set<string>, r: ContentItem): boolean =>
      keys.has(ruleId(r)) || keys.has(`${(r.title ?? '').trim()}|${(r.content ?? '').trim()}`);
    const baseSelection = (): Set<string> => selection[bp.id] ?? new Set();
    const isOn = (r: ContentItem): boolean => ruleSelected(baseSelection(), r);
    const rulesBox = el('div', 'mt-3 border-t border-amber-600/20 pt-2.5 space-y-2');
    const rulesHead = el('div', 'flex flex-wrap items-center justify-between gap-2');
    rulesHead.appendChild(el('span', `${ui.eyebrow}`, 'Reglas propuestas por ' + (escapeHtml(who) || 'el jugador')));
    rulesHead.appendChild(el('span', 'text-[11px] text-gray-500 italic', 'ACTÍVALAS para publicarlas; las que dejes apagadas no salen del proponente al portal. Si apruebas sin activar, la banda se integra sin reglas.'));
    rulesBox.appendChild(rulesHead);
    const tagsWrap = el('div', 'flex flex-wrap gap-2');
    rulesBox.appendChild(tagsWrap);
    let savingRules = false;
    const persistSelection = async (): Promise<void> => {
      if (savingRules) return;
      savingRules = true;
      const map: Record<string, string[]> = {};
      Object.entries(selection).forEach(([bid, keys]) => { map[bid] = Array.from(keys); });
      const saved = await setGuildBandIntegrationRules(g.id, map);
      savingRules = false;
      saving.textContent = saved.ok ? '✓' : '✗ ' + (saved.error || 'error');
      saving.className = 'text-[10px] font-bold uppercase tracking-widest ' + (saved.ok ? 'text-emerald-400' : 'text-red-400');
      window.setTimeout(() => { saving.textContent = ''; }, 1800);
    };
    const renderTags = (): void => {
      tagsWrap.innerHTML = '';
      if (proposed.length === 0) {
        tagsWrap.appendChild(el('p', 'text-[11px] text-gray-500 italic', 'Esta banda no trae reglas propuestas: se integrará sin reglas publicadas.'));
        return;
      }
      proposed.forEach((r) => {
        const on = isOn(r);
        const tag = document.createElement('button');
        tag.type = 'button';
        const label = `${r.title ?? r.content ?? 'Regla'} · ${who}`;
        tag.className = 'inline-flex items-center gap-1.5 text-[11px] rounded-md pl-2.5 pr-2 py-1 border transition-all ' +
          (on
            ? 'text-amber-100 bg-amber-950/40 border-amber-600/40 hover:bg-amber-900/50'
            : 'text-gray-400 bg-gray-900/60 border-gray-700/60 hover:border-gray-500/60');
        tag.title = `Regla de ${who}: ${r.content ?? r.title ?? ''}`;
        tag.appendChild(el('span', '', label));
        const dot = el('span', 'w-1.5 h-1.5 rounded-full ' + (on ? 'bg-amber-400' : 'bg-gray-600'), '');
        tag.appendChild(dot);
        tag.setAttribute('aria-pressed', String(on));
        if (tag.title) tag.title = `Regla de ${who}: ${r.content ?? r.title ?? ''}`;
        tag.addEventListener('click', () => {
          const keys = baseSelection();
          const k = keyFor(r);
          const legacyK = `${(r.title ?? '').trim()}|${(r.content ?? '').trim()}`;
          if (ruleSelected(keys, r)) {
            keys.delete(k);
            keys.delete(legacyK);
          } else {
            keys.delete(legacyK);
            keys.add(k);
          }
          selection[bp.id] = keys;
          renderTags();
          void persistSelection();
        });
        tagsWrap.appendChild(tag);
      });
    };
    renderTags();
    row.appendChild(rulesBox);

    const decide = async (status: 'approved' | 'rejected'): Promise<void> => {
      approve.disabled = true; reject.disabled = true;
      saving.textContent = 'guardando…';
      saving.className = 'text-[10px] font-bold uppercase tracking-widest text-amber-300';
      // Persistir la selección de esta banda SIEMPRE al aprobar (aunque quede
      // vacía): la selección guardada es la autoridad de lo que se publica
      // en la página de banda. Las reglas del proponente NO se tocan.
      if (status === 'approved') {
        const keys = baseSelection();
        selection[bp.id] = keys;
        const map: Record<string, string[]> = {};
        Object.entries(selection).forEach(([bid, ks]) => { map[bid] = Array.from(ks); });
        await setGuildBandIntegrationRules(g.id, map);
      }
      const r = await setBandIntegration(bp.id, status);
      approve.disabled = false; reject.disabled = false;
      if (r.ok) {
        const prevStatus = bp.integration_status;
        bp.integration_status = status;
        bp.integration_decided_at = new Date().toISOString();
        if (prevStatus === 'pending') pending -= 1;
        if (status === 'rejected') {
          // Las rechazadas SALEN de la lista; las aprobadas permanecen
          // (re-decidibles en cualquier momento).
          toast.success('Banda rechazada', `"${bp.name}" fue rechazada y retirada de la lista.`);
          row.remove();
          renderCount();
          if (body.querySelectorAll('div[data-prop-row]').length === 0) {
            body.innerHTML = '<p class="text-sm text-gray-400 italic">Aún no hay bandas propuestas por tus miembros.</p>';
          }
        } else {
          toast.success('Banda aprobada', `"${bp.name}" fue aprobada e integrada al portal.`);
          refreshState();
          renderActions();
          renderCount();
          row.classList.add('border-amber-700/40');
        }
      } else {
        toast.error('No se pudo decidir la banda', r.error || 'Error desconocido');
        saving.textContent = '✗ error';
        saving.className = 'text-[10px] font-bold uppercase tracking-widest text-red-400';
        window.setTimeout(() => { saving.textContent = ''; }, 2500);
      }
    };
    approve.addEventListener('click', () => void decide('approved'));
    reject.addEventListener('click', () => void decide('rejected'));
    refreshState();
    row.setAttribute('data-prop-row', '');
    body.appendChild(row);
  });
}

export function renderGuildCard(g: GuildRow, opts: GuildCardOptions): HTMLElement {
  const cardEl = card('p-4 sm:p-6');
  cardEl.appendChild(cardTop());

  // Cifras de la hermandad en el encabezado (integrantes, bandas integradas,
  // reglas): miembros, bandas y reglas del último análisis del portal.
  void loadGuildStats(g, opts);

  // Portal (abre la ficha; el resto de secciones llevan separador propio)
  const url = `${window.location.origin}/hermandad/${g.slug}`;
  const portal = el('div', '');
  portal.appendChild(el('p', `${ui.eyebrow} mb-1.5`, 'Dirección de tu portal'));
  const urlRow = el('div', 'flex flex-wrap items-center gap-2');
  const code = el('code', 'flex-1 min-w-[240px] px-3 py-2.5 rounded-md bg-gray-950/70 border border-gray-700 text-amber-300 text-sm truncate', url);
  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'px-4 py-2.5 rounded-md border border-amber-600/30 bg-gray-800/80 text-amber-200 hover:bg-amber-900/40 hover:text-white transition-all text-xs font-black uppercase tracking-widest';
  copyBtn.textContent = 'Copiar';
  const openLink = document.createElement('a');
  openLink.href = url; openLink.target = '_blank'; openLink.rel = 'noopener';
  openLink.className = 'hidden px-4 py-2.5 rounded-md border border-emerald-600/40 bg-emerald-950/30 text-emerald-300 hover:bg-emerald-900/40 transition-all text-xs font-black uppercase tracking-widest';
  openLink.textContent = 'Ver portal →';
  urlRow.append(code, copyBtn, openLink);
  portal.appendChild(urlRow);

  const label = document.createElement('label');
  label.className = 'mt-5 flex items-start gap-3 cursor-pointer select-none border border-gray-700/60 hover:border-amber-600/40 rounded-md p-4 transition-colors';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.className = 'mt-0.5 w-4 h-4 accent-amber-500';
  input.checked = g.is_public;
  const span = document.createElement('span');
  span.className = 'text-sm text-gray-300 font-medium';
  span.innerHTML = 'Publicar portal de la hermandad <span class="block text-xs text-gray-500 italic mt-0.5">Visible para toda la comunidad con roster, bandas y reglas de tu último análisis verificado.</span>';
  label.append(input, span);
  portal.appendChild(label);
  const msg = document.createElement('p');
  msg.className = 'hidden mt-3 text-sm rounded-md px-4 py-2.5';
  msg.setAttribute('role', 'status');
  portal.appendChild(msg);
  cardEl.appendChild(portal);

  // ── Reglas del portal: el catálogo proviene del SV pero la selección la
  // hace el maestro aquí (mismo patrón que el panel de bandas). Se guarda
  // en su propia fila guild_rules: un re-upload NO pisa esta elección.
  const reglasBox = el('div', 'mt-4 border-t border-gray-700/50 pt-3 space-y-2');
  const reglasHead = el('div', 'flex flex-wrap items-center justify-between gap-2');
  reglasHead.appendChild(el('span', `${ui.eyebrow}`, 'Reglas que aplican a tu portal'));
  const reglasStatus = el('span', 'text-[10px] font-bold uppercase tracking-widest', '');
  reglasHead.appendChild(reglasStatus);
  reglasBox.appendChild(reglasHead);

  const reglasTags = el('div', 'flex flex-wrap gap-2');
  reglasBox.appendChild(reglasTags);

  // Selección vigente: la manual del maestro; si aún no eligió (sin fila
  // guild_rules), se parte del catálogo publicado en el último análisis.
  let guildRules: ContentItem[] = [];
  let guildRulesReady = false;
  let noCatalogHint: HTMLElement | null = null;
  const renderReglasTags = (): void => {
    reglasTags.innerHTML = '';
    if (!guildRulesReady) {
      reglasTags.appendChild(el('p', 'text-[11px] text-gray-500 italic', 'Cargando reglas…'));
      return;
    }
    if (guildRules.length === 0) {
      reglasTags.appendChild(el('p', 'text-[11px] text-gray-500 italic', 'Sin reglas asignadas: tu portal no mostrará sección de reglas.'));
      return;
    }
    guildRules.forEach((r) => {
      const tag = el('span', 'inline-flex items-center gap-1.5 text-[11px] text-amber-100 bg-amber-950/40 border border-amber-600/40 rounded-md pl-2.5 pr-1 py-1');
      const full = r.content && r.content !== r.title ? r.content : undefined;
      tag.title = full ?? '';
      tag.appendChild(el('span', '', r.title ?? r.content ?? 'Regla'));
      const rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'w-4 h-4 shrink-0 rounded-md text-amber-200/70 hover:text-red-300 hover:bg-red-950/40 flex items-center justify-center transition-colors';
      rm.textContent = '×';
      rm.title = 'Quitar regla';
      rm.addEventListener('click', () => {
        const prev = guildRules.slice();
        const next = prev.filter((a) => ruleKey(a) !== ruleKey(r));
        if (next.length === prev.length) return;
        guildRules = next;
        renderReglasTags();
        rebuildReglasSelect();
        void saveGuildReglas(next, prev);
      });
      tag.appendChild(rm);
      reglasTags.appendChild(tag);
    });
  };
  renderReglasTags();

  const reglasAddRow = el('div', 'flex flex-wrap items-center gap-2');
  const reglasAdd = document.createElement('select');
  reglasAdd.className = 'flex-1 min-w-[220px] px-3 py-2 rounded-md bg-gray-950/70 border border-gray-700 text-sm text-gray-200 focus:border-amber-600/60 focus:outline-none';
  const rebuildReglasSelect = (): void => {
    reglasAdd.innerHTML = '';
    const assigned = new Set(guildRules.map(ruleKey));
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.disabled = true;
    placeholder.selected = true;
    placeholder.textContent = assigned.size === opts.rulesCatalog.length
      ? 'No quedan reglas del catálogo por agregar'
      : '+ Agregar regla del catálogo…';
    reglasAdd.appendChild(placeholder);
    opts.rulesCatalog.forEach((r) => {
      if (assigned.has(ruleKey(r))) return;
      const opt = document.createElement('option');
      opt.value = ruleKey(r);
      opt.textContent = r.title ?? r.content ?? 'Regla sin texto';
      reglasAdd.appendChild(opt);
    });
    reglasAdd.disabled = !guildRulesReady || opts.rulesCatalog.length === 0;
    if (reglasAdd.disabled) reglasAdd.classList.add('opacity-40');
    else reglasAdd.classList.remove('opacity-40');
    // Aviso cuando el SV aún no aporta catálogo (se reconcilia al cargar).
    reglasAdd.classList.toggle('hidden', opts.rulesCatalog.length === 0);
    if (opts.rulesCatalog.length === 0) {
      if (!noCatalogHint) {
        noCatalogHint = el('span', 'text-[11px] text-gray-500 italic', 'Sin reglas disponibles: sube un SavedVariables con reglas para asignarlas a tu portal.');
        reglasAddRow.appendChild(noCatalogHint);
      }
    } else if (noCatalogHint) {
      noCatalogHint.remove();
      noCatalogHint = null;
    }
  };
  rebuildReglasSelect();
  reglasAdd.addEventListener('change', async () => {
    const key = reglasAdd.value;
    if (!key) return;
    const r = opts.rulesCatalog.find((x) => ruleKey(x) === key);
    if (!r) return;
    const prev = guildRules.slice();
    const next = guildRules;
    if (!next.some((a) => ruleKey(a) === key)) next.push(r);
    guildRules = next;
    renderReglasTags();
    rebuildReglasSelect();
    reglasAdd.value = '';
    void saveGuildReglas(next, prev);
  });

  const saveGuildReglas = async (next: ContentItem[], prev: ContentItem[]): Promise<void> => {
    reglasStatus.textContent = 'guardando…';
    reglasStatus.className = 'text-[10px] font-bold uppercase tracking-widest text-amber-300';
    const res = await setGuildRules(g.id, next);
    if (res.ok) {
      guildRules = next;
      reglasStatus.textContent = '✓';
      reglasStatus.className = 'text-[10px] font-bold uppercase tracking-widest text-emerald-400';
      toast.success('Reglas actualizadas', 'Las reglas de tu portal se guardaron correctamente.');
    } else {
      guildRules = prev;
      reglasStatus.textContent = '✗ ' + (res.error || 'error');
      reglasStatus.className = 'text-[10px] font-bold uppercase tracking-widest text-red-400';
      toast.error('No se pudieron guardar las reglas', res.error || 'Error desconocido');
    }
    renderReglasTags();
    rebuildReglasSelect();
    window.setTimeout(() => { reglasStatus.textContent = ''; }, 2500);
  };

  reglasBox.appendChild(reglasAddRow);
  reglasAddRow.appendChild(el('span', `${ui.eyebrow} shrink-0`, 'Agregar'));
  reglasAddRow.appendChild(reglasAdd);
  reglasBox.appendChild(el('p', 'mt-2 text-[11px] text-gray-500 italic', 'El catálogo proviene de tu SavedVariables (re-subir el SV lo actualiza sin tocar esta selección); tú decides qué reglas publica tu portal.'));
  cardEl.appendChild(reglasBox);

  // Carga inicial: la selección manual del maestro. Sin selección → el
  // portal no muestra reglas (el SV no llena reglas al subir).
  void (async () => {
    const rulesRes = await getGuildRules(g.id);
    if (rulesRes.ok && Array.isArray(rulesRes.items)) {
      // Normaliza la selección del maestro contra el catálogo (registry =
      // fuente más actualizada): mismo nombre = misma regla; el contenido del
      // SV más reciente gana. Evita duplicados y refresca el contenido.
      guildRules = resolveRules(rulesRes.items, opts.rulesCatalog);
    }
    guildRulesReady = true;
    renderReglasTags();
    rebuildReglasSelect();
  })();

  // Propuestas de integración de bandas de los miembros (solo el GM owner).
  // El GM aprueba o rechaza; las aprobadas salen en el portal si son públicas.
  const propSec = el('div', 'mt-4 border-t border-gray-700/50 pt-4');
  propSec.setAttribute('data-prop-sec', '');
  propSec.appendChild(el('p', `${ui.eyebrow} mb-1`, 'Integración de miembros'));
  const propHead = el('div', 'flex flex-wrap items-center justify-between gap-2 mb-2');
  propHead.appendChild(el('h4', 'text-sm font-bold text-amber-200', 'Bandas propuestas por tus miembros'));
  const propCount = document.createElement('span');
  propCount.className = `${ui.badge} ${ui.badgeSm} text-amber-300 bg-amber-950/30 border-amber-600/40`;
  propCount.setAttribute('data-prop-count', '');
  propCount.textContent = '0 pendientes';
  propHead.appendChild(propCount);
  propSec.appendChild(propHead);
  const propShell = card('p-4');
  propShell.appendChild(cardTop());
  const propBody = el('div', 'space-y-2');
  propBody.innerHTML = '<p class="text-sm text-gray-400 italic">Cargando propuestas…</p>';
  propShell.appendChild(propBody);
  propSec.appendChild(propShell);
  cardEl.appendChild(propSec);
  void loadBandProposals(g, propBody);

  // Eventos
  input.addEventListener('change', async () => {
    input.disabled = true;
    const { error } = await supabase
      .from('raiddominion_guilds')
      .update({ is_public: input.checked })
      .eq('id', g.id);
    input.disabled = false;
    if (error) {
      input.checked = !input.checked;
      setMsg(msg, false, 'No se pudo cambiar la publicación del portal.', {
        title: 'Publicación del portal',
      });
      return;
    }
    openLink.classList.toggle('hidden', !input.checked);
    g.is_public = input.checked;
    opts.refreshHdrGuild();
    setMsg(
      msg,
      true,
      input.checked
        ? 'Portal publicado: ya es visible en /hermandad/' + g.slug
        : 'Portal oculto: solo tú puedes verlo.',
      { title: input.checked ? 'Portal publicado' : 'Portal oculto' },
    );
  });
  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(url);
      setMsg(msg, true, 'Enlace copiado al portapapeles.', {
        title: 'Enlace copiado',
      });
    } catch {
      setMsg(msg, false, 'No se pudo copiar automáticamente.', {
        title: 'Portapapeles',
      });
    }
  });
  if (g.is_public) openLink.classList.remove('hidden');

  return cardEl;
}