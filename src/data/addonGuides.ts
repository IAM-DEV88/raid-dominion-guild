// Guías del addon RaidDominion v3.0.0.
// Contenido alineado con las features REALES del addon (RD_Constants.lua,
// RD_Init.lua y RD_Utils_Registry.lua). La ruta local del addon dev vive
// SOLO en AGENTS.sections/addon.md (contrato entre repos).

export type GuideCategory =
  | 'Primeros pasos'
  | 'Interfaz'
  | 'Configuración'
  | 'Listas y contenido'
  | 'Bandas'
  | 'Comunicación'
  | 'Raid en vivo'
  | 'Botín'
  | 'Referencia';

export interface GuideSection {
  title: string;
  content: string[];
}

export interface Guide {
  id: string;
  title: string;
  category: GuideCategory;
  description: string;
  icon: string;
  color: 'amber' | 'blue' | 'purple' | 'red' | 'green' | 'orange';
  sections: GuideSection[];
}

export const guideCategories: GuideCategory[] = [
  'Primeros pasos',
  'Interfaz',
  'Configuración',
  'Listas y contenido',
  'Bandas',
  'Comunicación',
  'Raid en vivo',
  'Botín',
  'Referencia',
];

export const colorClasses: Record<Guide['color'], { border: string; hoverBorder: string; shadow: string; iconBg: string; iconBorder: string; iconText: string; btnBg: string; btnText: string; line: string }> = {
  amber: {
    border: 'border-amber-900/30',
    hoverBorder: 'hover:border-amber-700/50',
    shadow: 'hover:shadow-amber-500/10',
    iconBg: 'bg-amber-500/10',
    iconBorder: 'border-amber-500/20',
    iconText: 'text-amber-400',
    btnBg: 'bg-amber-500/10',
    btnText: 'text-amber-300',
    line: 'from-amber-900/0 via-amber-500/80 to-amber-900/0',
  },
  blue: {
    border: 'border-blue-900/30',
    hoverBorder: 'hover:border-blue-700/50',
    shadow: 'hover:shadow-blue-500/10',
    iconBg: 'bg-blue-500/10',
    iconBorder: 'border-blue-500/20',
    iconText: 'text-blue-400',
    btnBg: 'bg-blue-500/10',
    btnText: 'text-blue-300',
    line: 'from-blue-900/0 via-blue-500/80 to-blue-900/0',
  },
  purple: {
    border: 'border-purple-900/30',
    hoverBorder: 'hover:border-purple-700/50',
    shadow: 'hover:shadow-purple-500/10',
    iconBg: 'bg-purple-500/10',
    iconBorder: 'border-purple-500/20',
    iconText: 'text-purple-400',
    btnBg: 'bg-purple-500/10',
    btnText: 'text-purple-300',
    line: 'from-purple-900/0 via-purple-500/80 to-purple-900/0',
  },
  red: {
    border: 'border-red-900/30',
    hoverBorder: 'hover:border-red-700/50',
    shadow: 'hover:shadow-red-500/10',
    iconBg: 'bg-red-500/10',
    iconBorder: 'border-red-500/20',
    iconText: 'text-red-400',
    btnBg: 'bg-red-500/10',
    btnText: 'text-red-300',
    line: 'from-red-900/0 via-red-500/80 to-red-900/0',
  },
  green: {
    border: 'border-green-900/30',
    hoverBorder: 'hover:border-green-700/50',
    shadow: 'hover:shadow-green-500/10',
    iconBg: 'bg-green-500/10',
    iconBorder: 'border-green-500/20',
    iconText: 'text-green-400',
    btnBg: 'bg-green-500/10',
    btnText: 'text-green-300',
    line: 'from-green-900/0 via-green-500/80 to-green-900/0',
  },
  orange: {
    border: 'border-orange-900/30',
    hoverBorder: 'hover:border-orange-700/50',
    shadow: 'hover:shadow-orange-500/10',
    iconBg: 'bg-orange-500/10',
    iconBorder: 'border-orange-500/20',
    iconText: 'text-orange-400',
    btnBg: 'bg-orange-500/10',
    btnText: 'text-orange-300',
    line: 'from-orange-900/0 via-orange-500/80 to-orange-900/0',
  },
};

export const guides: Guide[] = [
  {
    id: 'primeros-pasos',
    title: 'Primeros pasos',
    category: 'Primeros pasos',
    description: 'Instalación, primera carga, registrar tu personaje (RaidDominion > Registrar) y los beneficios del portal para jugadores y hermandades.',
    icon: '🚀',
    color: 'amber',
    sections: [
      {
        title: 'Instalación y primeras pasos',
        content: [
          'Descarga el addon con el botón "Descargar Ahora" del sitio y descomprime la carpeta en Interface\\AddOns\\. Reinicia World of Warcraft para activarlo.',
          'Al entrar verás el menú flotante (si "Mostrar menú al iniciar" está activo). Clic izquierdo elige o ejecuta un ítem y clic derecho retrocede.',
          'Arrastra el menú para moverlo (el addon recuerda dónde lo dejaste). Usa /rd para mostrarlo u ocultarlo.',
        ],
      },
      {
        title: 'Registra y sube tu personaje',
        content: [
          'Abre el menú con /rd y entra en RaidDominion > Registrar: el addon guarda una ficha de tu personaje (equipamiento, iLvl, bandas y hermandad).',
          'Registra el personaje que usas en raid y repite el paso por cada uno que quieras incluir.',
          'Sube tu ficha en /upload y el portal la carga al instante: tu perfil, bandas y hermandad quedan listos.',
          'Re-subir tu ficha mantiene todo al día sin volver a configurar nada.',
        ],
      },
      {
        title: 'Beneficios del portal',
        content: [
          'Perfil público en /jugador/:slug con tu personaje validado — se activa desde /dashboard para aparecer en el [directorio de personajes](/personajes).',
          'Si diriges tu hermandad, tendrás tu dashboard de hermandad con roster, bandas, Discord y reglas.',
          'Portal web gratuito en /hermandad/:slug con tu roster y bandas siempre sincronizados y visibles en el [directorio de hermandades](/hermandades). Sin formularios: todo llega desde el addon.',
        ],
      },
    ],
  },
  {
    id: 'menu-flotante',
    title: 'Menú flotante',
    category: 'Interfaz',
    description: 'El corazón del addon: menú flotante, submenú RaidDominion y acceso rápido desde el minimapa.',
    icon: '🧭',
    color: 'blue',
    sections: [
      {
        title: 'Estructura del menú',
        content: [
          'El menú agrupa: Habilidades, Roles, Buffs, Auras, Mecánicas, Reglas, Banda y RaidDominion.',
          'Los ítems de roles, habilidades, buffs y auras se asignan y anuncian por el canal (detalle en la [guía "Listas y contenido"](#guide-listas-y-contenido)).',
        ],
      },
      {
        title: 'Submenú RaidDominion y barra de raid',
        content: [
          'El submenú RaidDominion reúne Registrar, Configuración, Ayuda, Recargar y Ocultar (ver la [guía "Primeros pasos"](#guide-primeros-pasos)).',
          'La barra inferior reúne las acciones de raid en vivo (ver la [guía "Barra de acciones"](#guide-barra-acciones)).',
        ],
      },
      {
        title: 'Botón del minimapa',
        content: [
          'Clic izquierdo abre o cierra el menú flotante; clic derecho abre un menú contextual (Configuración, Gestor de botín, Recoger items, Spamear reglas/banda, Mover, Recargar UI).',
          'Mantén Alt y arrastra para moverlo alrededor del minimapa.',
        ],
      },
    ],
  },
  {
    id: 'configuracion',
    title: 'Configuración',
    category: 'Configuración',
    description: 'Abre la ventana de configuración, se organiza en pestañas y se renderiza según lo que tengas seteado.',
    icon: '⚙️',
    color: 'purple',
    sections: [
      {
        title: 'Abrir la configuración',
        content: [
          'Ábrela con /rdc, desde el submenú RaidDominion > Configuración o desde la barra de acciones.',
        ],
      },
      {
        title: 'Pestañas de ajustes',
        content: [
          'Se organiza en pestañas: General, [Bandas](#guide-bandas-jugadores), Roles, Habilidades, Buffs, Auras, Mecánicas, Reglas y Ayuda.',
          'Cada pestaña edita el contenido que se muestra en el menú flotante (roles, habilidades, buffs, etc.).',
        ],
      },
      {
        title: 'Restablecer valores',
        content: [
          'El botón "Restablecer valores por defecto" (pestaña General) restaura toda la configuración.',
        ],
      },
    ],
  },
  {
    id: 'listas-y-contenido',
    title: 'Listas y contenido',
    category: 'Listas y contenido',
    description: 'Roles, habilidades, buffs y auras asignables a jugadores; mecánicas y reglas que se anuncian al canal de la banda.',
    icon: '🎛️',
    color: 'orange',
    sections: [
      {
        title: 'Listas asignables',
        content: [
          'Roles, habilidades, buffs y auras son listas configurables y asignables: selecciona un objetivo y pulsa el icono del ítem para asignárselo (o desasignarlo); el clic en el texto lo anuncia por el canal configurado.',
          '"Obtener" pide la lista al líder; "Reiniciar" la restaura al estado por defecto.',
        ],
      },
      {
        title: 'Editar y ocultar ítems',
        content: [
          'Se editan en la pestaña de [Configuración](#guide-configuracion) correspondiente: añade o quita ítems con nombre e icono.',
          'La visibilidad de cada ítem en el menú se controla con el botón-ojo.',
        ],
      },
      {
        title: 'Listas de contenido',
        content: [
          'Mecánicas y reglas son listas de contenido (título, icono y texto).',
          'Al pulsar una mecánica o regla en el menú se envía su contenido al canal configurado (se trocea solo si es largo).',
          'Se editan en Configuración > Mecánicas / Reglas.',
        ],
      },
    ],
  },
  {
    id: 'bandas-jugadores',
    title: 'Bandas y jugadores',
    category: 'Bandas',
    description: 'Crea y gestiona bandas: nombre, gearscore mínimo, horario, jugadores y roles.',
    icon: '👥',
    color: 'green',
    sections: [
      {
        title: 'Bandas',
        content: [
          'Crea, edita o elimina bandas en Configuración > Bandas (nombre, gearscore mínimo y horario).',
        ],
      },
      {
        title: 'Gestor de jugadores',
        content: [
          'Desde el menú > Banda, el clic en el texto anuncia la banda y el clic en el icono abre su gestor de jugadores.',
          'Cada jugador tiene rol, dual, clase, gearscore, líder, asistencia y sanción.',
          'Cada jugador tiene botones para invitarlo y susurrarle una plantilla de invitación; para reclutar en el canal usa el [spammer de banda](#guide-comunicacion).',
        ],
      },
      {
        title: 'Bandas vivas',
        content: [
          'Cada banda guarda su nombre, horario, gearscore mínimo y sus jugadores con rol y puntos. Se sincroniza con el portal al subir tu ficha: tu roster aparece en el [directorio de hermandades](/hermandades).',
          'Rol del jugador: T (Tanque), H (Healer), R (Rango), M (Melee).',
          'Dual: marca si el jugador tiene doble rol.',
          'Gearscore: el nivel de objeto del jugador; la banda puede exigir un mínimo.',
          'Líder: No, Sí o Ayudante.',
          'Asistencia y puntos: los botones + / - del gestor ajustan los puntos del jugador; miden su compromiso y fidelidad con la banda (se acumulan por banda).',
          'Sanción: lag, abandono, rendimiento, baneo, equipamiento (Equip.) o engemado (Eng/Enc).',
        ],
      },
    ],
  },
  {
    id: 'comunicacion',
    title: 'Comunicación y spammers',
    category: 'Comunicación',
    description: 'Pide y comparte asignaciones, reglas, mecánicas y bandas; emite bucles de reclutamiento y rotación de reglas por canal.',
    icon: '📢',
    color: 'blue',
    sections: [
      {
        title: 'Solicitar y compartir datos',
        content: [
          'Estando en grupo o banda puedes pedir al líder las asignaciones, reglas, mecánicas o bandas (botón "Obtener" o clic derecho en "Modo de raid").',
          'El líder puede compartir las asignaciones y listas con el resto de jugadores que usen el addon.',
        ],
      },
      {
        title: 'Spammer de banda',
        content: [
          'Compone el mensaje de reclutamiento de una banda: prefijo, nombre, sufijo, duración (60 s por defecto) y composición por roles (tanque, healer, melee, ranged).',
          'Configura el separador del mensaje (//, |, ;, ", " o ") y los canales (RAID activado por defecto); incluye vista previa y contador (máx. 255 caracteres).',
          'El spammer vive EN BANDA: se abre desde el submenú Bandas > Spamear banda y recluta mientras raidias. Requiere al menos una [banda registrada](#guide-bandas-jugadores).',
          'Inicia o detiene el bucle de spam.',
        ],
      },
      {
        title: 'Spammer de reglas',
        content: [
          'Rota el mensaje de una regla por canal: elige la regla, la duración y los canales, con vista previa y contador de caracteres.',
          'Se abre desde Configuración > Reglas > Spamear.',
        ],
      },
    ],
  },
  {
    id: 'barra-acciones',
    title: 'Barra de acciones',
    category: 'Raid en vivo',
    description: 'Botones inferiores del menú flotante para acciones de raid en vivo.',
    icon: '⚡',
    color: 'orange',
    sections: [
      {
        title: 'Organización y raid',
        content: [
          'Son acciones de raid EN VIVO: se ejecutan dentro de la banda. Son el corazón del addon, no del portal.',
          'Modo de raid: configurar la dificultad y [pedir asignaciones al líder](#guide-comunicacion).',
          'Iniciar Check: ready check y reportar ausentes.',
          'Iniciar Pull: cuenta regresiva antes de enganchar.',
          'Configuración: acceso rápido a la ventana de ajustes.',
        ],
      },
      {
        title: 'Marcado y objetivos',
        content: [
          'Nombrar objetivo: señalar / ver la info del objetivo.',
          'Marcar principales: poner iconos de raid sobre los principales · der. limpiar.',
        ],
      },
      {
        title: 'Comunicación y botín',
        content: [
          'Indicar discord: enviar o editar el link de tu canal de voz.',
          'Susurrar asignaciones: manda privados a los jugadores con su tarea.',
          'Cambiar botín: ajustar el método de botín · der. maestro despojador (ver el [gestor de botín](#guide-gestor-botin)).',
        ],
      },
    ],
  },
  {
    id: 'gestor-botin',
    title: 'Gestor de botín',
    category: 'Botín',
    description: 'Sorteo de ítems con dados, historial por ítem y desempates.',
    icon: '💰',
    color: 'amber',
    sections: [
      {
        title: 'Abrir el gestor',
        content: [
          'Se abre con /rdloot, desde el menú (submenú Bandas > Gestor de botín) o la [barra de acciones](#guide-barra-acciones).',
        ],
      },
      {
        title: 'Sorteo con dados',
        content: [
          'Arrastra un ítem de la bolsa o haz clic con uno en el cursor.',
          'Tira dados (Main/Dual/Enchant) con límite de tiempo y elige ganador al hacer clic en un dado.',
          'Si hay empate en el dado más alto, puedes desempatar: solo tiran los empatados.',
        ],
      },
      {
        title: 'Historial y recogida',
        content: [
          'El historial queda agrupado por ítem para llevar el control de cada botín.',
          'También puedes spamear el botín y recoger los ítems hacia el maestro despojador.',
        ],
      },
    ],
  },
  {
    id: 'comandos',
    title: 'Comandos',
    category: 'Referencia',
    description: 'Todos los comandos de chat del addon.',
    icon: '⌨️',
    color: 'red',
    sections: [
      {
        title: 'Comandos principales',
        content: [
          '/rd — muestra u oculta el menú flotante.',
          '/rdc — abre la configuración.',
          '/rdh — muestra la ayuda en el chat.',
          '/rdloot — abre el gestor de botín.',
        ],
      },
      {
        title: 'Subcomandos de /rd',
        content: [
          '/rd c (o config) — igual que /rdc.',
          '/rd loot (o botin) — abre el gestor de botín.',
          '/rd help (o h) — muestra la ayuda.',
        ],
      },
      {
        title: '¿Por dónde empezar?',
        content: [
          'Si empiezas ahora, sigue la [guía de primeros pasos](#guide-primeros-pasos): instala, registra tu personaje y sube tu ficha en /upload.',
        ],
      },
    ],
  },
];

export function getGuide(id: string): Guide | undefined {
  return guides.find((g) => g.id === id);
}