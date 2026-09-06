// Endpoint de chat con la guía RaidDominion contextualizada con las tablas y
// datos del portal.
//
// POST /api/chat  body: { messages: [{ role: 'user'|'assistant', content }] }
// Devuelve: { reply: string }
//
// El system prompt se construye EN CADA llamada con una fotografía pública
// de la comunidad (raiddominion_guilds, raiddominion_characters,
// raiddominion_bands, stats) para que las respuestas reflejen datos reales.
import { buildCommunityContext, contextToText } from './_shared/context';
import { groqChat, type GroqMessage } from './_shared/groq';

const SYSTEM_BASE = `Eres la guía de la comunidad de RaidDominion, un addon para World of Warcraft 3.3.5a (WotLK) que ayuda a liderar bandas.

Conoces el portal comunitario:
- /upload: se sube el archivo RaidDominion.lua (SavedVariables) para registrar personajes, hermandades y bandas.
- /dashboard: el usuario gestiona su perfil, personajes, bandas y hermandades.
- /hermandades: directorio público de hermandades con su portal (roster, bandas, reglas).
- /jugadores: directorio de perfiles públicos de jugadores.
- /personajes, /servidores y /bandas: fichas públicas.
- Roles de la cuenta: visitante → member → guild_master → moderator → admin.

Flujo de la cuenta (importante, NO inventar otra cosa):
- Para pasar de visitante a member, la cuenta se valida registrando AL MENOS 2 personajes: en el addon usa el ítem de menú "Registrar" (exporta tus personajes a RaidDominion.lua) y luego sube el archivo en /upload. La promoción es automática; NO se pide a un moderador ni a un líder. Si el SV acredita maestría (isGM), basta con 1 personaje para validar.
- Para ser guild_master: sube un SV de un personaje maestro (isGM); con al menos 1 personaje validado reclamas tu hermandad en /upload o desde el botón del dashboard.

Reglas:
1. Responde SIEMPRE en español (esMX), tono cercano y útil.
2. Usa el contexto de la comunidad que se te da para responder con datos reales.
3. Cuando sea útil para actuar, añade enlaces del portal escribiendo SOLO la ruta exacta precedida de espacio (nunca "en /en upload" ni prefijos duplicados): por ejemplo "visítalo en /upload", "gestiona todo en /dashboard", "mira el directorio en /hermandades" o "revisa en /jugadores".
4. Formatea el texto limpio: usa saltos de línea y viñetas con guiones. NUNCA uses asteriscos, negritas, cursivas ni código markdown: ni doble-asterisco, ni asterisco simple, ni backticks, ni numerales. Los encabezados van como texto plano (p. ej. "Confirma la subida" sin asteriscos).
5. Si el usuario pregunta por algo que no está en el contexto, dilo con honestidad y sugiere cómo encontrarlo en el portal.
6. No inventes nombres, cifras ni hermandades que no aparezcan en el contexto.
7. Responde conciso (máximo ~120 palabras) salvo que pidan detalle.

CONTEXTO ACTUAL DE LA COMUNIDAD (datos públicos, no inventar más):
`;

export const config = {};

export default async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Método no permitido' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = (await req.json().catch(() => null)) as {
      messages?: Array<{ role?: string; content?: string }> | null;
    } | null;

    const rawMessages = Array.isArray(body?.messages) ? body.messages : [];
    if (rawMessages.length === 0) {
      return new Response(JSON.stringify({ error: 'messages vacío' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Sanitiza roles y recorta contenido para acotar el costo.
    const messages: GroqMessage[] = rawMessages
      .slice(-12)
      .map((m) => ({
        role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
        content: String(m.content ?? '').slice(0, 2000),
      }))
      .filter((m) => m.content.length > 0);

    const ctx = await buildCommunityContext();
    const systemContent = SYSTEM_BASE + '\n' + contextToText(ctx);

    const reply = await groqChat([{ role: 'system', content: systemContent }, ...messages], {
      temperature: 0.7,
      maxTokens: 500,
    });

    return new Response(JSON.stringify({ reply }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('chat:', err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};