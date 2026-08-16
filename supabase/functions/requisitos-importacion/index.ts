// Jawa Logistic — Edge Function: a partir del nombre/descripción de un
// producto, estima de forma orientativa qué papeles, permisos o
// certificaciones suele necesitar para importarlo a Argentina. Pensada para
// la home pública (sin login) — es una herramienta de captación, no el
// cotizador.
//
// LIMITACIÓN REAL, igual que clasificar-producto: no hay acceso a la
// nomenclatura arancelaria oficial (NCM) ni a normativa vigente en tiempo
// real — nunca se inventa un código NCM, número de resolución o norma real.
// Lo que devuelve esta función es una ESTIMACIÓN orientativa según el tipo
// de producto, siempre presentada como tal, nunca como dictamen oficial.

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_MODEL = "claude-opus-5";

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

const REQUISITOS_SCHEMA = {
  type: "object",
  properties: {
    nombreProducto: { type: "string", description: "Nombre corto y limpio del producto, en español" },
    categoria: {
      type: "string",
      description: "Descripción en palabras del rubro/categoría (NUNCA un código NCM real, no tenemos esa base de datos)",
    },
    confianza: { type: "string", enum: ["alta", "media", "baja"] },
    resumen: { type: "string", description: "1-2 frases en criollo explicando en general qué implica importar este tipo de producto" },
    complejidad: { type: "string", enum: ["baja", "media", "alta"], description: "Qué tan trabado suele ser el trámite para este tipo de producto en términos generales" },
    requisitos: {
      type: "array",
      description: "Entre 1 y 5 items. Si el producto típicamente no tiene requisitos especiales más allá del trámite de importación estándar, devolver un solo item que lo aclare.",
      items: {
        type: "object",
        properties: {
          organismo: { type: "string", description: "Organismo o tipo de trámite involucrado (ej: ANMAT, SENASA, ENACOM, certificación de seguridad eléctrica, licencia no automática) — en palabras generales, no cites números de resolución" },
          tramite: { type: "string", description: "Nombre corto del trámite o requisito" },
          detalle: { type: "string", description: "1 frase explicando de qué se trata, en criollo" },
        },
        required: ["organismo", "tramite", "detalle"],
        additionalProperties: false,
      },
    },
  },
  required: ["nombreProducto", "categoria", "confianza", "resumen", "complejidad", "requisitos"],
  additionalProperties: false,
};

const SYSTEM_PROMPT = `Sos un asistente que ayuda a estimar, de forma orientativa, qué papeles/permisos/certificaciones suele necesitar un producto para importarse a Argentina.

Reglas importantes:
- NO tenés acceso a la nomenclatura arancelaria oficial (NCM/Mercosur) ni a la normativa vigente en tiempo real — nunca inventes un código NCM, un número de resolución, una ley o norma real. Hablá siempre en términos generales de qué TIPO de organismo o trámite suele intervenir.
- Basate en tu conocimiento general de qué organismos suelen intervenir según el rubro: ANMAT (cosmética, alimentos, dispositivos médicos, suplementos), SENASA (productos de origen animal o vegetal, agroquímicos), ENACOM (equipos de telecomunicaciones o radiofrecuencia, ej. con bluetooth/wifi), certificación de seguridad eléctrica tipo INTI (electrónica y electrodomésticos), licencias no automáticas (rubros como textil, calzado, juguetes, neumáticos, autopartes), RENPRE (precursores químicos). Si el producto es de un rubro sin restricciones típicas conocidas (ej: un llavero de metal, un accesorio simple), decilo con tranquilidad — no inventes trámites que no aplican.
- Si no tenés información suficiente para estimar con confianza, marcá "confianza": "baja" pero igual devolvé la mejor estimación general (nunca dejes los campos vacíos).
- Tu respuesta es siempre orientativa, para que la persona entienda en general con qué se puede llegar a encontrar — nunca es un dictamen oficial ni asesoramiento legal vinculante. La clasificación y el trámite real los confirma Jawa Logistic con su despachante de aduana matriculado.
- Mantené el resumen y los detalles cortos, en un tono claro y directo, como si se lo explicaras a alguien que nunca importó en su vida.`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let descripcion: string | undefined;
  try {
    const body = await req.json();
    descripcion = body?.descripcion;
  } catch {
    return jsonResponse({ success: false, error: "Cuerpo de la petición inválido." }, 400);
  }

  if (!descripcion || !descripcion.trim()) {
    return jsonResponse({ success: false, error: "Contanos qué producto querés importar." }, 400);
  }

  const apiKey = (Deno.env.get("ANTHROPIC_API_KEY") || "").replace(/[^\x21-\x7E]/g, "");
  if (!apiKey) {
    return jsonResponse({
      success: false,
      error: "Este análisis todavía no está configurado. Escribinos por WhatsApp y te asesoramos directamente.",
    }, 500);
  }

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
        max_tokens: 1024,
        thinking: { type: "disabled" },
        output_config: {
          effort: "low",
          format: { type: "json_schema", schema: REQUISITOS_SCHEMA },
        },
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: `Producto: ${descripcion}` }],
      }),
    });
    clearTimeout(timeout);

    const data = await resp.json();

    if (!resp.ok) {
      console.error("requisitos-importacion: Anthropic respondió", resp.status, JSON.stringify(data));
      return jsonResponse({
        success: false,
        error: "No pudimos analizar este producto en este momento. Escribinos por WhatsApp y te asesoramos directamente.",
      }, 502);
    }

    if (data.stop_reason === "refusal") {
      return jsonResponse({
        success: false,
        error: "No pudimos analizar este producto. Escribinos por WhatsApp y te asesoramos directamente.",
      }, 200);
    }

    const textBlock = (data.content || []).find((b: { type: string }) => b.type === "text");
    if (!textBlock || !textBlock.text) {
      return jsonResponse({ success: false, error: "No pudimos analizar este producto. Escribinos por WhatsApp y te asesoramos directamente." }, 200);
    }

    let analisis: {
      nombreProducto: string; categoria: string; confianza: string; resumen: string;
      complejidad: string; requisitos: { organismo: string; tramite: string; detalle: string }[];
    };
    try {
      analisis = JSON.parse(textBlock.text);
    } catch {
      return jsonResponse({ success: false, error: "No pudimos interpretar el análisis. Escribinos por WhatsApp y te asesoramos directamente." }, 200);
    }

    return jsonResponse({
      success: true,
      ...analisis,
      advertencia: "Estimación orientativa, sin base normativa oficial — Jawa Logistic la confirma con despachante de aduana matriculado antes de tu operación.",
    });
  } catch (err) {
    console.error("requisitos-importacion fetch error:", err instanceof Error ? `${err.name}: ${err.message}` : String(err));
    const timedOut = err instanceof Error && err.name === "AbortError";
    return jsonResponse({
      success: false,
      error: timedOut
        ? "El análisis tardó demasiado. Escribinos por WhatsApp y te asesoramos directamente."
        : "No pudimos conectar con el servicio de análisis. Escribinos por WhatsApp y te asesoramos directamente.",
    }, 504);
  }
});
