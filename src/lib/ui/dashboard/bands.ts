// Gestión de bandas del dashboard (pestaña Bandas): conteos y detalle con
// visibilidad, hermandad/integración y reglas. Extraído de
// src/pages/dashboard.astro — comportamiento idéntico. El estado del closure
// del dashboard entra por opciones (DI): canPublish, hermandades del usuario,
// catálogo de reglas y refresco del encabezado.

import { el } from '@/lib/ui/preview';
import { ruleKey } from '@/lib/ui/dashboard/format';
import { ui } from '@/lib/ui/design';
import { toast } from '@/lib/ui/toast';
import { card, cardTop } from '@/lib/ui/card';
import {
  setBandVisibility,
  setBandHidePlayers,
  setBandGuild,
  proposeBandIntegration,
  setBandRules,
} from '@/lib/api';
import type { BandRow, GuildRow } from '@/types/database';
import type { ContentItem } from '@/types/parser';

export function bandPlayerCount(b: BandRow): number {
  if (!Array.isArray(b.players)) return 0;
  return b.players.length;
}

export function bandRuleCount(b: BandRow): number {
  if (!Array.isArray(b.rules)) return 0;
  return b.rules.length;
}

export function bandAssignedRules(b: BandRow): ContentItem[] {
  if (!Array.isArray(b.rules)) return [];
  return b.rules as ContentItem[];
}

export interface BandDetailOptions {
  // Gate de publicación: un Visitante sin personajes validados no puede
  // modificar visibilidad ni integración (controles bloqueados).
  blocked: boolean;
  // Hermandades del usuario (para asignar la banda o proponer integración).
  membershipGuilds: GuildRow[];
  // Catálogo global de reglas (origen del select "agregar regla").
  rulesCatalog: ContentItem[];
  // Refresca los indicadores del encabezado tras cambios (refreshHdrBands).
  onHdrRefresh: () => void;
}

export function renderBandDetail(b: BandRow, opts: BandDetailOptions): HTMLElement {
  const cardEl = card('p-5');
  cardEl.appendChild(cardTop());
  const blocked = opts.blocked;

  // ── Visibilidad: switches tipo pill ────────────────────────────────────
  // Interruptor on/off con knob deslizante (Tailwind peer). El label lleva
  // el checkbox sr-only; el track usa after: para el knob animado.
  const makeSwitch = (
    checked: boolean,
    text: string,
    on: (input: HTMLInputElement, status: HTMLElement) => Promise<void>,
  ): HTMLElement => {
    const label = document.createElement('label');
    label.className = 'flex items-center gap-2.5 cursor-pointer select-none text-xs text-gray-400';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.className = 'peer sr-only';
    input.checked = checked;
    const track = el('span', 'relative w-9 h-5 rounded-full bg-gray-700/80 border border-gray-600/60 transition-colors after:content-[""] after:absolute after:top-0.5 after:left-0.5 after:w-4 after:h-4 after:rounded-full after:bg-gray-300 after:shadow after:transition-transform after:duration-200 peer-checked:bg-amber-600/70 peer-checked:border-amber-500/60 peer-checked:after:translate-x-4 peer-checked:after:bg-white');
    const textEl = el('span', '', text);
    const status = el('span', 'text-[10px] font-bold uppercase tracking-widest', '');
    label.append(input, track, textEl, status);
    if (blocked) {
      input.disabled = true;
      track.classList.add('opacity-40');
      label.classList.add('opacity-70', 'cursor-not-allowed');
      label.title = 'Requiere cuenta Miembro validada (2+ personajes).';
      status.textContent = 'bloqueado';
      status.className = 'text-[10px] font-bold uppercase tracking-widest text-gray-500';
    } else {
      input.addEventListener('change', () => void on(input, status));
    }
    return label;
  };

  const visBox = el('div', 'space-y-3');
  visBox.appendChild(el('p', `${ui.eyebrow}`, 'Visibilidad pública'));
  const toggles = el('div', 'flex flex-wrap gap-5');
  toggles.appendChild(makeSwitch(b.is_public, 'Pública', async (input, status) => {
    input.disabled = true;
    status.textContent = 'guardando…';
    status.className = 'text-[10px] font-bold uppercase tracking-widest text-amber-300';
    const res = await setBandVisibility(b.id, input.checked);
    input.disabled = false;
    if (res.ok) {
      b.is_public = input.checked;
      opts.onHdrRefresh();
      status.textContent = input.checked ? '✓ pública' : '✓ privada';
      status.className = 'text-[10px] font-bold uppercase tracking-widest text-emerald-400';
      toast.success(
        input.checked ? 'Banda publicada' : 'Banda ocultada',
        `"${b.name}" ahora ${input.checked ? 'es visible en el directorio' : 'no aparece en el directorio'}.`,
      );
    } else {
      input.checked = !input.checked;
      status.textContent = '✗ error';
      status.className = 'text-[10px] font-bold uppercase tracking-widest text-red-400';
      toast.error('No se pudo actualizar la banda', res.error || 'Error desconocido');
    }
    window.setTimeout(() => { status.textContent = ''; }, 2500);
  }));
  toggles.appendChild(makeSwitch(b.hide_players, 'Ocultar jugadores', async (input, status) => {
    input.disabled = true;
    status.textContent = 'guardando…';
    status.className = 'text-[10px] font-bold uppercase tracking-widest text-amber-300';
    const res = await setBandHidePlayers(b.id, input.checked);
    input.disabled = false;
    if (res.ok) {
      b.hide_players = input.checked;
      status.textContent = input.checked ? '✓ ocultos' : '✓ visibles';
      status.className = 'text-[10px] font-bold uppercase tracking-widest text-emerald-400';
      toast.success(
        input.checked ? 'Jugadores ocultos' : 'Jugadores visibles',
        input.checked
          ? `Los nombres/jugadores de "${b.name}" ya no se ven en el público.`
          : `Los nombres/jugadores de "${b.name}" aparecen en el portal.`,
      );
    } else {
      input.checked = !input.checked;
      status.textContent = '✗ error';
      status.className = 'text-[10px] font-bold uppercase tracking-widest text-red-400';
      toast.error('No se pudo actualizar la banda', res.error || 'Error desconocido');
    }
    window.setTimeout(() => { status.textContent = ''; }, 2500);
  }));
  visBox.appendChild(toggles);
  cardEl.appendChild(visBox);

  // ── Hermandad: asignación (1:N) + propuesta de integración ─────────────
  const assign = el('div', 'mt-4 border-t border-gray-700/50 pt-3 space-y-3');
  assign.appendChild(el('p', `${ui.eyebrow}`, 'Hermandad'));

  // El texto de la propuesta muestra el maestro destino (la hermandad del
  // select): la solicitud va al GM de esa guild, no a otra. El select fija
  // el DESTINO (integration_target_guild_id); la atribución real (guild_id)
  // ocurre solo cuando el GM la aprueba.
  const effGuild = b.integration_target_guild_id ?? b.guild_id;
  let propTarget: Text | null = null;
  const refreshPropTarget = (): void => {
    if (!propTarget) return;
    const g = opts.membershipGuilds.find((x) => x.id === (b.integration_target_guild_id ?? b.guild_id));
    propTarget.textContent = g
      ? `Enviar solicitud de integración al maestro de ${g.name}`
      : 'Proponer integración al maestro';
  };

  const gRow = el('div', 'flex flex-wrap items-center gap-2');
  const select = document.createElement('select');
  select.className = 'flex-1 min-w-[200px] px-3 py-2 rounded-md bg-gray-950/70 border border-gray-700 text-sm text-gray-200 focus:border-amber-600/60 focus:outline-none';
  const personalOpt = document.createElement('option');
  personalOpt.value = '';
  personalOpt.textContent = 'Sin hermandad (personal)';
  select.appendChild(personalOpt);
  opts.membershipGuilds.forEach((g) => {
    const opt = document.createElement('option');
    opt.value = g.id;
    opt.textContent = g.name;
    if (effGuild === g.id) opt.selected = true;
    select.appendChild(opt);
  });
  if (!effGuild) personalOpt.selected = true;
  const gStatus = el('span', 'text-[10px] font-bold uppercase tracking-widest', '');
  const gErr = el('span', 'text-[10px] font-bold uppercase tracking-widest text-red-400', '');
  if (blocked) {
    select.disabled = true;
    select.className += ' opacity-40';
    gStatus.textContent = 'bloqueado';
    gStatus.className = 'text-[10px] font-bold uppercase tracking-widest text-gray-500';
  } else {
    select.addEventListener('change', async () => {
      select.disabled = true;
      gStatus.textContent = 'guardando…';
      gStatus.className = 'text-[10px] font-bold uppercase tracking-widest text-amber-300';
      gErr.textContent = '';
      const gid = select.value === '' ? null : select.value;
      const res = await setBandGuild(b.id, gid);
      select.disabled = false;
      if (res.ok) {
        // El select fija el DESTINO de la propuesta; la atribución (guild_id)
        // solo la concede el GM al aprobar. Al cambiar de hermandad (o a
        // personal) la banda sale del portal y vuelve a 'none' en espera.
        const prevEff = b.integration_target_guild_id ?? b.guild_id;
        b.integration_target_guild_id = gid;
        if (gid !== prevEff) {
          b.guild_id = null;
          b.integration_status = 'none';
          b.is_rank_integrated = false;
          b.integration_proposed_by = null;
          b.integration_proposed_at = null;
          b.integration_decided_at = null;
        }
        opts.onHdrRefresh();
        prop.checked = false;
        refreshPropose();
        refreshPropTarget();
        gStatus.textContent = '✓';
        gStatus.className = 'text-[10px] font-bold uppercase tracking-widest text-emerald-400';
      } else {
        select.value = b.integration_target_guild_id ?? b.guild_id ?? '';
        gStatus.textContent = '';
        gErr.textContent = res.error || 'error';
      }
      window.setTimeout(() => { gStatus.textContent = ''; }, 2500);
    });
  }
  gRow.append(select, gStatus, gErr);
  assign.appendChild(gRow);

  // Checkbox "proponer integración" — solo si la banda está asignada a una
  // hermandad y aún no está integrada/aprobada. El maestro la valida.
  const propLabel = document.createElement('label');
  propLabel.className = 'flex items-center gap-2 cursor-pointer select-none text-xs text-gray-400';
  const prop = document.createElement('input');
  prop.type = 'checkbox';
  prop.className = 'w-4 h-4 accent-amber-500';
  prop.checked = b.integration_status === 'pending';
  const propStatus = el('span', 'ml-1 text-[10px] font-bold uppercase tracking-widest', '');
  // Estado del control de propuesta: reactivo al DESTINO (target) y al estado
  // de integración. Se evalúa al renderizar y se re-evalúa al cambiar la
  // hermandad (elegir una guild habilita el check, "Sin hermandad" lo deshabilita).
  const refreshPropose = (): void => {
    const effG = b.integration_target_guild_id ?? b.guild_id;
    const canPropose = !blocked && !!effG && b.integration_status !== 'approved';
    const baseLabelCls = 'flex items-center gap-2 cursor-pointer select-none text-xs text-gray-400';
    if (!canPropose) {
      prop.disabled = true;
      prop.className = 'w-4 h-4 accent-amber-500 opacity-40';
      propLabel.className = baseLabelCls + ' opacity-60 cursor-not-allowed';
      propLabel.title = !effG
        ? 'Asigna la banda a una hermandad para proponer su integración.'
        : (b.integration_status === 'approved' ? 'Esta banda ya está integrada al portal.' : 'Requiere cuenta Miembro validada.');
    } else {
      prop.disabled = false;
      prop.className = 'w-4 h-4 accent-amber-500';
      propLabel.className = baseLabelCls;
      propLabel.title = '';
    }
  };
  refreshPropose();
  prop.addEventListener('change', async () => {
    if (!prop.checked) return; // retirar propuesta = el GM decide; aquí no se despropone
    prop.disabled = true;
    propStatus.textContent = 'proponiendo…';
    propStatus.className = 'ml-1 text-[10px] font-bold uppercase tracking-widest text-sky-300';
    const res = await proposeBandIntegration(b.id);
    prop.disabled = false;
    if (res.ok) {
      b.integration_status = 'pending';
      prop.checked = true;
      propStatus.textContent = '✓ propuesta enviada al maestro';
      propStatus.className = 'ml-1 text-[10px] font-bold uppercase tracking-widest text-sky-300';
      opts.onHdrRefresh();
    } else {
      prop.checked = false;
      propStatus.textContent = '✗ ' + (res.error || 'error');
      propStatus.className = 'ml-1 text-[10px] font-bold uppercase tracking-widest text-red-400';
    }
    window.setTimeout(() => { propStatus.textContent = ''; }, 3500);
  });
  propTarget = document.createTextNode('');
  refreshPropTarget();
  propLabel.append(prop, document.createTextNode(' '), propTarget, propStatus);
  assign.appendChild(propLabel);
  cardEl.appendChild(assign);

  // ── Reglas: tags removibles + select de agregar ────────────────────────
  const rulesBox = el('div', 'mt-4 border-t border-gray-700/50 pt-3 space-y-2');
  const rulesHead = el('div', 'flex flex-wrap items-center justify-between gap-2');
  rulesHead.appendChild(el('span', `${ui.eyebrow}`, 'Reglas de esta banda'));
  const rulesStatus = el('span', 'text-[10px] font-bold uppercase tracking-widest', '');
  rulesHead.appendChild(rulesStatus);
  rulesBox.appendChild(rulesHead);
  // Jerarquía: si la banda está destinada (target) o integrada (guild_id) a
  // una hermandad, la publicación final la decide el maestro en su visor:
  // estas reglas son el CONTENIDO que el GM activa/desactiva.
  const genderJ = b.integration_target_guild_id || b.guild_id;
  if (genderJ) {
    rulesBox.appendChild(el('p', 'text-[10px] text-gray-500 italic', 'Integrada a una hermandad: el maestro decide cuáles de estas reglas se publican en el portal (visor "Bandas propuestas"). Aquí solo editas el contenido del catálogo.'));
  }

  const tagsWrap = el('div', 'flex flex-wrap gap-2');
  rulesBox.appendChild(tagsWrap);

  const renderTags = (): void => {
    tagsWrap.innerHTML = '';
    const assigned = bandAssignedRules(b);
    if (assigned.length === 0) {
      tagsWrap.appendChild(el('p', 'text-[11px] text-gray-500 italic', 'Sin reglas asignadas a esta banda.'));
      return;
    }
    assigned.forEach((r) => {
      const tag = el('span', 'inline-flex items-center gap-1.5 text-[11px] text-amber-100 bg-amber-950/40 border border-amber-600/40 rounded-md pl-2.5 pr-1 py-1');
      const full = r.content && r.content !== r.title ? r.content : undefined;
      tag.title = full ?? '';
      tag.appendChild(el('span', '', r.title ?? r.content ?? 'Regla'));
      if (!blocked) {
        const rm = document.createElement('button');
        rm.type = 'button';
        rm.className = 'w-4 h-4 shrink-0 rounded-md text-amber-200/70 hover:text-red-300 hover:bg-red-950/40 flex items-center justify-center transition-colors';
        rm.textContent = '×';
        rm.title = 'Quitar regla';
        rm.addEventListener('click', () => {
          const prev = bandAssignedRules(b).slice();
          const next = prev.filter((a) => ruleKey(a) !== ruleKey(r));
          if (next.length === prev.length) return;
          b.rules = next as unknown as BandRow['rules'];
          renderTags();
          rebuildAddSelect();
          void saveRules(next, prev);
        });
        tag.appendChild(rm);
      }
      tagsWrap.appendChild(tag);
    });
  };
  renderTags();

  // Select "agregar regla": lista SOLO las reglas del catálogo aún no
  // asignadas a esta banda; elegir una la añade como tag y persiste.
  const addRow = el('div', 'flex flex-wrap items-center gap-2');
  const addSelect = document.createElement('select');
  addSelect.className = 'flex-1 min-w-[220px] px-3 py-2 rounded-md bg-gray-950/70 border border-gray-700 text-sm text-gray-200 focus:border-amber-600/60 focus:outline-none';
  const rebuildAddSelect = (): void => {
    addSelect.innerHTML = '';
    const assigned = bandAssignedRules(b);
    const assignedKeys = new Set(assigned.map(ruleKey));
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.disabled = true;
    placeholder.selected = true;
    placeholder.textContent = assignedKeys.size === opts.rulesCatalog.length
      ? 'No quedan reglas del catálogo por agregar'
      : '+ Agregar regla del catálogo…';
    addSelect.appendChild(placeholder);
    opts.rulesCatalog.forEach((r) => {
      if (assignedKeys.has(ruleKey(r))) return;
      const opt = document.createElement('option');
      opt.value = ruleKey(r);
      opt.textContent = r.title ?? r.content ?? 'Regla sin texto';
      addSelect.appendChild(opt);
    });
    addSelect.disabled = blocked || opts.rulesCatalog.length === 0;
    if (addSelect.disabled) addSelect.classList.add('opacity-40');
    else addSelect.classList.remove('opacity-40');
  };
  rebuildAddSelect();
  addSelect.addEventListener('change', async () => {
    const key = addSelect.value;
    if (!key) return;
    const r = opts.rulesCatalog.find((x) => ruleKey(x) === key);
    if (!r) return;
    const prev = bandAssignedRules(b).slice();
    const next = bandAssignedRules(b);
    if (!next.some((a) => ruleKey(a) === key)) next.push(r);
    b.rules = next as unknown as BandRow['rules'];
    renderTags();
    rebuildAddSelect();
    addSelect.value = '';
    void saveRules(next, prev);
  });

  const saveRules = async (next: ContentItem[], prev: ContentItem[]): Promise<void> => {
    rulesStatus.textContent = 'guardando…';
    rulesStatus.className = 'text-[10px] font-bold uppercase tracking-widest text-amber-300';
    const res = await setBandRules(b.id, next);
    if (res.ok) {
      b.rules = next as unknown as BandRow['rules'];
      rulesStatus.textContent = '✓';
      rulesStatus.className = 'text-[10px] font-bold uppercase tracking-widest text-emerald-400';
    } else {
      b.rules = prev as unknown as BandRow['rules'];
      rulesStatus.textContent = '✗ ' + (res.error || 'error');
      rulesStatus.className = 'text-[10px] font-bold uppercase tracking-widest text-red-400';
    }
    renderTags();
    rebuildAddSelect();
    window.setTimeout(() => { rulesStatus.textContent = ''; }, 2500);
  };

  rulesBox.appendChild(addRow);
  addRow.appendChild(el('span', `${ui.eyebrow} shrink-0`, 'Agregar'));
  addRow.appendChild(addSelect);
  if (opts.rulesCatalog.length === 0) {
    addSelect.classList.add('hidden');
    addRow.appendChild(el('span', 'text-[11px] text-gray-500 italic', 'Sin reglas disponibles: sube un SavedVariables con reglas para asignarlas a esta banda.'));
  }
  cardEl.appendChild(rulesBox);

  cardEl.appendChild(el('p', 'mt-3 text-[11px] text-gray-500 italic', 'Jugadores y horario se actualizan re-subiendo tu SavedVariables; las reglas de esta banda las eliges tú aquí.'));

  return cardEl;
}