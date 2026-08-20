// Jawa Logistic — Edge Function: chat con el "Despachante virtual", un
// asistente de IA para preguntas de comercio exterior/importación a
// Argentina de los clientes del hub. No reemplaza a un despachante de
// aduana matriculado — el propio prompt se lo aclara al usuario.
//
// Seguridad: sin "Enforce JWT Verification" a nivel plataforma (rompía el
// CORS), así que el chequeo de sesión real se hace acá adentro contra el JWT
// que manda hub/despachante-virtual.html — sin esto, cualquiera con la anon
// key pública podía chatear gratis (con adjuntos incluidos) a costa de la
// cuenta de Anthropic.

import { createClient } from "npm:@supabase/supabase-js@2";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_MODEL = "claude-opus-5";
const SUPABASE_URL = "https://hthyehsqfrfwdqkbqrwj.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_Dlh15glcRPYtVKmvkytcbw_LGfPqN7F";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// x-forwarded-for trae la cadena completa de proxies (cliente, primero) —
// solo nos interesa el primero, la IP real de quien hizo el pedido.
function obtenerIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "desconocida";
}

// Límite anti-abuso: 5 usos por cuenta Y 5 por IP cada 7 días (lo que se
// alcance primero) — ver supabase/migrations/0023_limite_uso_ia.sql. Sin
// esto, un cliente (o alguien con varias cuentas desde la misma conexión)
// podía llamar esta función sin tope y comerse el crédito de Anthropic.
async function dentroDelLimite(tipo: string, userId: string, ip: string): Promise<boolean> {
  try {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/chequear_limite_ia`, {
      method: "POST",
      headers: { "content-type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + SUPABASE_ANON_KEY },
      body: JSON.stringify({ p_tipo: tipo, p_user_id: userId, p_ip: ip }),
    });
    if (!resp.ok) return true; // si el chequeo falla, no bloqueamos al usuario por un problema nuestro
    return await resp.json();
  } catch {
    return true;
  }
}

const SYSTEM_PROMPT = `Sos el "Despachante virtual" de Jawa Logistic, un asistente experto en comercio exterior e importación a Argentina que ayuda a los clientes del hub de Jawa.

Reglas importantes:
- Respondé en español, de forma clara y práctica, orientado a alguien que importa mercadería (no a un experto en la jerga aduanera).
- Podés explicar regímenes de importación (courier, simplificado, general), tributos típicos (DIE, IVA, IVA adicional, Ganancias, IIBB, tasa estadística), documentación habitual (factura proforma, packing list, conocimiento de embarque) y cómo funcionan en términos generales — pero tu respuesta es siempre ORIENTATIVA, nunca asesoramiento legal vinculante ni una clasificación arancelaria oficial (no tenés acceso a la base NCM real).
- Para casos concretos, montos grandes, mercadería restringida/regulada o cualquier situación donde el cliente necesite una determinación oficial, aclará que conviene hablar directamente con el equipo de Jawa Logistic o un despachante de aduana matriculado.
- Si te adjuntan una factura proforma o packing list, analizala de mejor esfuerzo (los documentos pueden tener formato irregular) y avisá si algo no se pudo leer bien.
- Sé breve y concreto. No repitas el disclaimer legal en cada mensaje — alcanza con mencionarlo cuando sea relevante (montos importantes, mercadería dudosa, o si el usuario pide algo vinculante).`;

interface HistorialItem { rol: "user" | "assistant"; contenido: string; }

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return jsonResponse({ success: false, error: "Falta iniciar sesión." }, 401);
  const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userError } = await supabaseAuth.auth.getUser();
  if (userError || !user) return jsonResponse({ success: false, error: "Sesión inválida — volvé a iniciar sesión." }, 401);

  const permitido = await dentroDelLimite("despachante_virtual", user.id, obtenerIp(req));
  if (!permitido) {
    return jsonResponse({
      success: false,
      error: "Llegaste al límite de 5 consultas por semana al despachante virtual. Probá de nuevo la semana que viene, o escribinos directamente por WhatsApp.",
    }, 429);
  }

  let mensaje: string | undefined;
  let historial: HistorialItem[] = [];
  let archivoBase64: string | undefined;
  let archivoMediaType: string | undefined;
  let archivoNombre: string | undefined;
  try {
    const body = await req.json();
    mensaje = body?.mensaje;
    historial = Array.isArray(body?.historial) ? body.historial : [];
    archivoBase64 = body?.archivoBase64;
    archivoMediaType = body?.archivoMediaType;
    archivoNombre = body?.archivoNombre;
  } catch {
    return jsonResponse({ success: false, error: "Cuerpo de la petición inválido." }, 400);
  }

  if (!mensaje && !archivoBase64) {
    return jsonResponse({ success: false, error: "Escribí una consulta o adjuntá un archivo." }, 400);
  }

  const apiKey = (Deno.env.get("ANTHROPIC_API_KEY") || "").replace(/[^\x21-\x7E]/g, "");
  if (!apiKey) {
    return jsonResponse({
      success: false,
      error: "El despachante virtual no está configurado todavía (falta ANTHROPIC_API_KEY en el proyecto de Supabase).",
    }, 500);
  }

  const contenido: Record<string, unknown>[] = [];
  if (archivoBase64) {
    const esImagen = (archivoMediaType || "").startsWith("image/");
    contenido.push(
      esImagen
        ? { type: "image", source: { type: "base64", media_type: archivoMediaType || "image/jpeg", data: archivoBase64 } }
        : { type: "document", source: { type: "base64", media_type: archivoMediaType || "application/pdf", data: archivoBase64 } },
    );
    if (archivoNombre) {
      contenido.push({ type: "text", text: `(Archivo adjunto: ${archivoNombre} — la lectura es de mejor esfuerzo, avisá si no se pudo interpretar bien.)` });
    }
  }
  contenido.push({ type: "text", text: mensaje || "Analizá el archivo adjunto." });

  const messages = [
    ...historial.map((h) => ({ role: h.rol, content: h.contenido })),
    { role: "user", content: contenido },
  ];

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55000);
    const resp = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 2048,
        output_config: { effort: "medium" },
        system: SYSTEM_PROMPT,
        messages,
      }),
    });
    clearTimeout(timeout);

    const data = await resp.json();

    if (!resp.ok) {
      console.error("despachante-virtual: Anthropic respondió", resp.status, JSON.stringify(data));
      return jsonResponse({
        success: false,
        error: `El despachante virtual no pudo responder (${resp.status}). Probá de nuevo en un momento.`,
      }, 502);
    }

    if (data.stop_reason === "refusal") {
      return jsonResponse({
        success: false,
        error: "El despachante virtual no pudo procesar esta consulta. Reformulala o escribinos directamente.",
      }, 200);
    }

    const textBlock = (data.content || []).find((b: { type: string }) => b.type === "text");
    if (!textBlock || !textBlock.text) {
      return jsonResponse({ success: false, error: "El despachante virtual no devolvió una respuesta. Probá de nuevo." }, 200);
    }

    return jsonResponse({ success: true, respuesta: textBlock.text });
  } catch (err) {
    console.error("despachante-virtual fetch error:", err instanceof Error ? `${err.name}: ${err.message}` : String(err));
    const timedOut = err instanceof Error && err.name === "AbortError";
    return jsonResponse({
      success: false,
      error: timedOut
        ? "El despachante virtual tardó demasiado en responder. Probá de nuevo."
        : "No se pudo conectar con el despachante virtual.",
    }, 504);
  }
});
