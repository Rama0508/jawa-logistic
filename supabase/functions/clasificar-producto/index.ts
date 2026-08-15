// Jawa Logistic — Edge Function: clasifica un producto (por descripción de
// texto y/o foto) y estima el rubro + las alícuotas del régimen de
// importación argentino (DIE, IVA, IVA adicional, Ganancias, IIBB, Tasa
// estadística) usando la API de Claude.
//
// LIMITACIÓN REAL: no hay acceso a la nomenclatura arancelaria oficial (NCM)
// — no existe esa base de datos en este proyecto. Lo que devuelve esta
// función es una ESTIMACIÓN de la IA a partir del tipo de producto, nunca un
// código NCM real ni un valor verificado. El frontend siempre debe mostrarlo
// como "estimado, confirmar con tu despachante", nunca como dato oficial.

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

const ALICUOTAS_SCHEMA = {
  type: "object",
  properties: {
    nombreProducto: { type: "string", description: "Nombre corto y limpio del producto, en español" },
    rubro: {
      type: "string",
      description: "Descripción en palabras del rubro/categoría arancelaria (NUNCA un código NCM real, no tenemos esa base de datos)",
    },
    confianza: { type: "string", enum: ["alta", "media", "baja"] },
    alicuotas: {
      type: "object",
      properties: {
        die: { type: "number", description: "Derechos de importación extrazona, en % (ej: 16)" },
        iva: { type: "number", description: "IVA general, en % (típicamente 21)" },
        ivaAdicional: { type: "number", description: "Percepción de IVA adicional, en % (típicamente 20 o 0 si el sujeto está inscripto)" },
        ganancias: { type: "number", description: "Percepción de Ganancias, en % (típicamente 6 o 0)" },
        iibb: { type: "number", description: "Percepción de Ingresos Brutos, en % (varía por jurisdicción, a veces 0)" },
        tasaEstadistica: { type: "number", description: "Tasa de estadística, en % (típicamente 3, o 0 si el producto está exento)" },
      },
      required: ["die", "iva", "ivaAdicional", "ganancias", "iibb", "tasaEstadistica"],
      additionalProperties: false,
    },
  },
  required: ["nombreProducto", "rubro", "confianza", "alicuotas"],
  additionalProperties: false,
};

const SYSTEM_PROMPT = `Sos un asistente que ayuda a estimar, de forma orientativa, la clasificación y los tributos de importación de un producto para Argentina.

Reglas importantes:
- NO tenés acceso a la nomenclatura arancelaria oficial (NCM/Mercosur) — nunca inventes ni devuelvas un código NCM real. Describí el rubro en palabras (ej: "Accesorios electrónicos - soportes y montajes").
- Estimá las alícuotas típicas para ese tipo de producto según tu conocimiento general del régimen de importación argentino: DIE (derechos de importación extrazona), IVA (usualmente 21%), IVA adicional (percepción, usualmente 20% para sujetos no inscriptos o 0% si el importador es Responsable Inscripto y no aplica), Ganancias (percepción, usualmente 6% o 0%), IIBB (percepción de Ingresos Brutos, varía mucho, a veces 0%) y Tasa estadística (usualmente 3%, o 0% si el producto está exento por acuerdo).
- Si no tenés información suficiente para estimar con confianza, marcá "confianza": "baja" y usá los valores más típicos/genéricos igual (nunca dejes un campo vacío).
- Tu estimación es orientativa y debe confirmarse siempre con un despachante de aduana antes de una operación real — no estás dando asesoramiento legal ni una clasificación vinculante.`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let descripcion: string | undefined;
  let imagenBase64: string | undefined;
  let imagenMediaType: string | undefined;
  try {
    const body = await req.json();
    descripcion = body?.descripcion;
    imagenBase64 = body?.imagenBase64;
    imagenMediaType = body?.imagenMediaType;
  } catch {
    return jsonResponse({ success: false, error: "Cuerpo de la petición inválido." }, 400);
  }

  if (!descripcion && !imagenBase64) {
    return jsonResponse({ success: false, error: "Cargá una descripción o una foto del producto." }, 400);
  }

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return jsonResponse({
      success: false,
      error: "La clasificación por IA no está configurada todavía (falta ANTHROPIC_API_KEY en el proyecto de Supabase). Cargá los datos a mano mientras tanto.",
    }, 500);
  }

  const contenido: Record<string, unknown>[] = [];
  if (imagenBase64) {
    contenido.push({
      type: "image",
      source: { type: "base64", media_type: imagenMediaType || "image/jpeg", data: imagenBase64 },
    });
  }
  contenido.push({
    type: "text",
    text: descripcion
      ? `Producto: ${descripcion}`
      : "Clasificá el producto de la foto.",
  });

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
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
          format: { type: "json_schema", schema: ALICUOTAS_SCHEMA },
        },
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: contenido }],
      }),
    });
    clearTimeout(timeout);

    const data = await resp.json();

    if (!resp.ok) {
      return jsonResponse({
        success: false,
        error: `La IA no pudo clasificar el producto (${resp.status}). Cargá los datos a mano.`,
      }, 502);
    }

    if (data.stop_reason === "refusal") {
      return jsonResponse({
        success: false,
        error: "La IA no pudo procesar esta clasificación. Cargá los datos a mano.",
      }, 200);
    }

    const textBlock = (data.content || []).find((b: { type: string }) => b.type === "text");
    if (!textBlock || !textBlock.text) {
      return jsonResponse({ success: false, error: "La IA no devolvió una clasificación. Cargá los datos a mano." }, 200);
    }

    let clasificacion: {
      nombreProducto: string; rubro: string; confianza: string;
      alicuotas: { die: number; iva: number; ivaAdicional: number; ganancias: number; iibb: number; tasaEstadistica: number };
    };
    try {
      clasificacion = JSON.parse(textBlock.text);
    } catch {
      return jsonResponse({ success: false, error: "No se pudo interpretar la respuesta de la IA. Cargá los datos a mano." }, 200);
    }

    return jsonResponse({
      success: true,
      ...clasificacion,
      advertencia: "Alícuotas estimadas por IA, sin base NCM oficial — confirmalas con tu despachante antes de una operación real.",
    });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "AbortError";
    return jsonResponse({
      success: false,
      error: timedOut
        ? "La IA tardó demasiado en responder. Cargá los datos a mano."
        : "No se pudo conectar con el servicio de clasificación. Cargá los datos a mano.",
    }, 504);
  }
});
