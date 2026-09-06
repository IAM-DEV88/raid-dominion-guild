/**
 * Tokens de UI del portal (convenciones gráficas compartidas).
 *
 * Regla de bordes: salvo círculos inherentes (rounded-full legítimo,
 * p. ej. avatares o botones circulares), `rounded-md` es el radio MÁXIMO
 * permitido. Prohibidos rounded-xl/2xl/3xl en toda la plataforma.
 *
 * Criterio geométrico: elementos CON TEXTO (chips, badges, contadores,
 * botones filtro) usan siempre `rounded-md`. `rounded-full` solo para
 * elementos SIN texto inherentemente píldora/círculo (dots, indicadores,
 * medallones de icono, botones flotantes circulares) o vía el token
 * `ui.sectionRule` (divisor fino h-1, única excepción de divisor).
 *
 * Convenciones v2 (detalle en AGENTS.sections/design.md):
 * R1 monogramas de un glifo en rounded-full · R2 chips con texto
 * siempre rounded-md (usar ui.chip) · R3 paneles de dashboard via
 * ui.panel (+ui.panelHover si interactivo) · R4 dashboards usan
 * h1 + ui.subTitle, nunca SectionHeader · R5 superficie única vía la
 * constante SURFACE · R6 estado semántico vía ui.status.* · R7 transición
 * vía ui.transition · R8 formularios vía ui.form.* con aria-describedby.
 *
 * Cards (2026-08-30): la superficie de CARD es ui.card (misma SURFACE).
 * Interactivas → ui.cardHover (lift+glow). Línea de acento → ui.cardTop
 * (requiere `relative overflow-hidden` en la card). Títulos destacados →
 * ui.gradientTitle; cifras → ui.statValue; etiquetas → ui.eyebrow;
 * medallones → ui.iconTile (R1, un glifo). Uso preferente sobre literales
 * sueltos (regla de oro de design.md §2).
 *
 * Solo strings de clases Tailwind: sin lógica ni render.
 */

// Superficie canónica de paneles/cards: única fuente del literal borde
// ámbar (R3/R5). Cualquier variante nueva comparte esta constante.
const SURFACE = 'bg-gray-900/60 backdrop-blur-sm border border-amber-600/30';

export const ui = {
  container: 'max-w-6xl mx-auto',
  // Contenedor de navegación de ancho completo (Navigation, Footer):
  // conserva su propio max-w-7xl por estar anclado al borde.
  containerNav: 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8',
  // Materiales (src/styles/material.css): rd-metal forja paneles, rd-card
  // da piedra/energía a las cards, rd-cut bisela esquinas (clip-path).
  panel: `${SURFACE} rd-metal rounded-md`,
  panelHover: 'hover:border-amber-500/50 transition-all duration-300',
  // Ventana estilo terminal del dashboard: cabecera + cuerpo contiguos, sin
  // radio en la junta, esquina inferior cuadrada y esquina sup-derecha RECTA
  // (la sup-izquierda la corta el clip-path de ui.cutTop). Van SIEMPRE en
  // pares: sectionHead (barra de título, gradiente aparte) + sectionBody
  // (cuerpo) como hermanos consecutivos; el border-b del head hace de divisor
  // único y el body no repite borde superior (border-t-0), contiguos sin gap.
  sectionHead: `${SURFACE} rd-metal rounded-tl-md rounded-tr-none rounded-b-none p-4 sm:p-6`,
  sectionBody: `${SURFACE} rd-metal rd-no-seam rd-no-rivet border-t-0 rounded-none p-4 sm:p-6`,
  // Cuerpo de panel sin el remache esquinero del ::before (sectionBody) — el
  // rivet queda SOLO en el encabezado (sectionHead).
  noRivet: 'rd-no-rivet',
  // Colapsables de filtros (patrón <details>/<summary> tipo guía): contenedor
  // + resumen clicable con acento lateral + cuerpo. Cerrados por defecto.
  disclosure: 'group bg-gray-800/50 border border-amber-600/30 rounded-md overflow-hidden',
  disclosureSummary:
    'cursor-pointer list-none px-4 py-3 flex items-center justify-between gap-3 text-amber-200 font-bold text-sm hover:bg-amber-900/10 group-open:bg-amber-900/20 border-l-2 border-l-amber-500/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-400 transition-all',
  disclosureBody: 'px-4 py-3',
  btnBase:
    `rd-btn inline-flex items-center justify-center gap-2 font-semibold rounded-md transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400`,
  btnPrimary:
    'bg-gradient-to-r from-amber-600 to-amber-700 text-white hover:from-amber-500 hover:to-amber-600 shadow-lg shadow-amber-500/25 hover:shadow-amber-500/40 hover:-translate-y-0.5',
  btnSecondary:
    'border border-amber-500/50 text-amber-200 bg-gray-900/60 hover:bg-amber-900/30 hover:border-amber-400 hover:-translate-y-0.5',
  btnGhost: 'text-gray-300 hover:text-amber-200 hover:border-amber-500/40',
  btnSizes: { sm: 'px-4 py-2 text-sm', md: 'px-6 py-3 text-base', lg: 'px-8 py-4 text-lg' },
  badge:
    'inline-flex items-center gap-1.5 rounded-md border font-black uppercase tracking-widest',
  // Tamaños de badge: sm para chips de cards, md para badges de rol/estado
  // en headers y tablas. Componer siempre con la base ui.badge.
  badgeSm: 'px-2 py-0.5 text-[9px]',
  badgeMd: 'px-2.5 py-1 text-[10px]',
  // Chip de cifra clave-valor (stat del header/visor): etiqueta + valor.
  badgeStat:
    'inline-flex items-baseline gap-1.5 px-2.5 py-1 rounded-md border border-amber-700/30 bg-gray-950/50 text-[10px] font-black uppercase tracking-widest text-gray-500',
  // Superficie de color del badge de rol (única fuente; la consumen
  // dashboard, admin y perfiles). El layout lo aporta ui.badge + ui.badgeMd.
  badgeRole: {
    visitante: 'bg-stone-800/70 border-stone-600 text-stone-300',
    member: 'bg-gray-800/70 border-gray-600 text-gray-300',
    guild_master: 'bg-amber-900/40 border-amber-500/60 text-amber-200',
    moderator: 'bg-sky-900/30 border-sky-600/50 text-sky-200',
    admin: 'bg-red-900/30 border-red-600/50 text-red-200',
  } as const,
  sectionTitle: 'text-3xl font-bold text-amber-400',
  sectionRule: 'mt-4 h-1 w-24 rounded-full bg-amber-500 mx-auto',
  // Subtítulo de bloque dentro de un panel (visores, fichas, listas)
  subTitle: 'text-xs font-bold uppercase tracking-widest text-amber-300/90 mb-2',
  // Chip de categoría/etiqueta (CON texto → rounded-md obligatorio); el color lo aporta colorClasses
  chip: 'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[10px] font-bold uppercase tracking-widest',
  // Comando/ruta estilo tecla para material de referencia
  kbd: 'inline-block font-mono text-[11px] leading-none bg-gray-800/80 border border-amber-600/20 rounded px-1.5 py-0.5 text-amber-200',

  // ── Tipografía (design.md §4, F009) ──────────────────────────────────────
  // Escala única: hero (landing), h1-h3 (jerarquía de sección, SIN color:
  // lo aporta el contexto), body/bodyMuted/caption (con color calibrado).
  text: {
    hero: 'text-3xl md:text-4xl font-bold',
    h1: 'text-2xl md:text-3xl font-bold',
    h2: 'text-lg font-bold',
    h3: 'text-base font-bold',
    body: 'text-sm text-gray-300',
    bodyMuted: 'text-sm text-gray-400',
    caption: 'text-xs text-gray-500',
  },
  // H1 de PÁGINA con gradiente de marca: título hero con degradado ámbar y
  // tracking amplio (directorios, upload, login, admin, moderate). ÚNICA
  // fuente del literal del gradiente de h1 (antes duplicado en 8 páginas).
  titleHero:
    'text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-amber-300 to-amber-500 tracking-wider uppercase',
  // H1 de FICHA/VISTA (personaje, servidor, reino, banda, jugador, portal de
  // hermandad): tamaño grande en itálico, SIN color (lo aporta ui.gradientTitle
  // o un literal de gradiente propio de la vista). Solo base tipográfica.
  titleFicha: 'text-3xl md:text-5xl font-black italic leading-[1.3]',

  // ── Estado semántico (design.md R6, F006) ───────────────────────────────
  // SUPERFICIE DE COLOR de mensajes error/éxito/advertencia/info. El layout
  // (padding, radio, tamaño) lo aporta el contexto (chip/badge/alert-box);
  // el color NUNCA va suelto (prohibido red-500/green-500 fuera de aquí).
  status: {
    success: 'text-emerald-300 bg-emerald-950/30 border border-emerald-600/40',
    warning: 'text-amber-300 bg-amber-950/30 border border-amber-500/40',
    error: 'text-red-300 bg-red-950/40 border border-red-600/40',
    info: 'text-sky-200 bg-gray-900/60 border border-sky-600/30',
  },

  // ── Switch ON/OFF tipo pill (toggles de visibilidad/estado) ─────────────
  // Patrón replicado del dashboard (bands.ts makeSwitch): input peer sr-only
  // + track con knob deslizante vía after:. El label provee layout
  // (flex/gap/cursor/texto); aquí van SOLO las clases del track y su knob.
  // Uso: label → input.checkbox.peer.sr-only + span con toggleTrack.
  toggleTrack:
    'relative w-9 h-5 rounded-full bg-gray-700/80 border border-gray-600/60 transition-colors after:content-[""] after:absolute after:top-0.5 after:left-0.5 after:w-4 after:h-4 after:rounded-full after:bg-gray-300 after:shadow after:transition-transform after:duration-200 peer-checked:bg-amber-600/70 peer-checked:border-amber-500/60 peer-checked:after:translate-x-4 peer-checked:after:bg-white',
  // Label estándar de un toggle pill (layout + cursor).
  toggleLabel: 'flex items-center gap-2.5 cursor-pointer select-none text-xs text-gray-400',

  // ── Formularios (design.md §5/R8, P011) ─────────────────────────────────
  // label: siempre <label for> con este estilo; jamás placeholder-como-label.
  // input: base; en error sumar inputError (importante para vencer a input)
  // y asociar el mensaje por aria-describedby → errorText.
  // helperText: ayuda opcional (aria-describedby opcional); errorText: error.
  form: {
    label: 'block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1.5',
    input:
      'w-full px-3 py-2.5 rounded-md bg-gray-800/70 border border-gray-700 focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 outline-none text-gray-100 text-sm placeholder:text-gray-500 transition-colors',
    inputError: '!border-red-500/70 focus:!border-red-500 focus:!ring-red-500/30',
    helperText: 'mt-1.5 text-[11px] text-gray-500 italic',
    errorText: 'mt-1.5 text-[11px] text-red-300',
  },

  // ── Loading / feedback async (design.md §6, F010) ───────────────────────
  // skeleton: placeholder de contenido (roster/bandas). spinner: acción
  // puntual (submit/upload). liveText: texto de estado en aria-live.
  loading: {
    skeleton: 'animate-pulse rounded-md bg-gray-800/60',
    spinner: 'inline-block w-4 h-4 border-2 border-amber-500/30 border-t-amber-300 rounded-full animate-spin',
    liveText: 'text-sm text-gray-400',
  },

  // ── Interacción (design.md §5/P011) ─────────────────────────────────────
  // Foco visible para todo elemento interactivo sin foco propio ya definido.
  focusRing: 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400',
  // Transición única (design.md R7): duración custom solo si se documenta.
  transition: 'transition-all duration-300',

  // ── Cards y superficies enriquecidas (2026-08-30, rediseño UI/UX) ───────
  // Lenguaje de cards de la plataforma: superficie de marca (SURFACE) +
  // línea de acento superior (cardTop) + glow/lift al hover (cardHover).
  // Uso: card como base, cardHover solo en elementos interactivos (links).
  card: `${SURFACE} rd-card rounded-md`,
  // Línea de acento superior: gradiente ámbar sobre la card (apéndice visual;
  // no lleva el foco, solo decoración). Va ABSOLUTA: la card necesita
  // `relative overflow-hidden`.
  cardTop: 'absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-amber-500/60 to-transparent',
  // Hover de card interactiva: rd-lift (material.css) eleva con peso y enciende
  // un borde energético; el borde Tailwind solo cambia de color.
  cardHover: 'rd-lift hover:border-amber-500/60',
  // Fila de card (roster, núcleos, listas): superficie tenue, hover de borde.
  cardRow: 'rounded-md border border-gray-700/40 bg-gray-800/40 hover:border-amber-500/30 transition-colors',
  // Eyebrow: etiqueta superior de sección/card (texto, tracking amplio).
  eyebrow: 'rd-eyebrow text-[10px] font-black uppercase tracking-[0.18em] text-amber-400/80',
  // Título con degradado de marca (hero, h1/h2 de sección destacada).
  // leading despejado + padding inferior: evita que el itálico y las
  // descendentes (g, y, p) se recorten bajo bg-clip-text.
  gradientTitle: 'text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-amber-400 to-amber-600 leading-[1.3] pb-[0.1em]',
  // Cifra destacada (stats, contadores): degradado vertical + tabular.
  // Mismo cuidado tipográfico que gradientTitle (descendentes + itálico).
  statValue: 'font-black italic tabular-nums text-transparent bg-clip-text bg-gradient-to-b from-amber-200 to-amber-500 leading-[1.4] pb-[0.15em]',
  // Medallón de icono/inicial (R1): cuadrado rounded-md, gradiente interior.
  iconTile: 'flex items-center justify-center rounded-md bg-gradient-to-br from-amber-500/25 via-amber-600/10 to-gray-950/40 border border-amber-500/30 text-amber-300 shadow-[inset_0_1px_0_0_rgba(251,191,36,0.25)] shrink-0',
  // Separador interno sutil (contenido de cards).
  divider: 'h-px w-full bg-gradient-to-r from-amber-500/40 via-amber-600/20 to-transparent',
  // Versiones del separador desvanecido para la página (excepto index):
  //   dividerFadeBoth — debajo del ENCABEZADO de la página, se desvanece a ambos lados.
  //   dividerFadeLeft — tras el contenido principal, se desvanece hacia la izquierda.
  // El borde inferior de la navegación de tabs es parte del diseño de la barra
  // (rd-tabbar::after en material.css, fade a la derecha); no usa token.
  dividerFadeBoth: 'rd-divider-both w-full',
  dividerFadeLeft: 'rd-divider-left w-full',

  // ── Materiales y ornamentación (2026-08-30, material.css) ───────────────
  // Corte diagonal único en la esquina superior izquierda (clip-path, no
  // border-radius) para contenedores ceremoniales (paneles destacados, marcos
  // de misión); el resto de bordes quedan rectos (rounded-md base).
  cut: 'rd-cut',
  // Corte sup-izq de la cabecera de un panel contiguo (modelo dashboard).
  cutTop: 'rd-cut-t',
  // Estado "seleccionado": borde energético ámbar (tabs, ítems activos).
  active: 'rd-active',
  // Pulso mágico lento para elementos importantes (energía).
  glow: 'rd-glow',
  // Título ceremonial con ornamentos (doble línea + diamante): añadir a
  // títulos TIER 1/2 destacados.
  ornament: 'rd-title rd-ornament',
  // Ítem de navegación tipo barra de habilidades (estados por CSS).
  navItem: 'rd-nav-item',
} as const;