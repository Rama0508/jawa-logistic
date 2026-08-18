// Jawa Logistic — Edge Function: a partir del nombre/descripción de un
// producto, estima de forma orientativa qué papeles, permisos o
// certificaciones suele necesitar para importarlo a Argentina. Herramienta
// del HUB (hub/requisitos-importacion.html) — no el cotizador.
//
// LIMITACIÓN REAL, igual que clasificar-producto: no hay acceso a la
// nomenclatura arancelaria oficial (NCM) ni a normativa vigente en tiempo
// real — nunca se inventa un código NCM, número de resolución o norma real.
// Lo que devuelve esta función es una ESTIMACIÓN orientativa según el tipo
// de producto, siempre presentada como tal, nunca como dictamen oficial.
//
// Seguridad: el comentario original decía "pensada para la home pública sin
// login", pero esta herramienta se terminó moviendo al HUB, que ya exige
// sesión — así que, igual que clasificar-producto y despachante-virtual, se
// exige acá un JWT real de cliente logueado. Sin esto, cualquiera con la
// anon key pública podía llamarla sin límite y generar cargos reales en la
// cuenta de Anthropic.

import { createClient } from "npm:@supabase/supabase-js@2";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_MODEL = "claude-opus-5";

const SUPABASE_URL = "https://hthyehsqfrfwdqkbqrwj.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_Dlh15glcRPYtVKmvkytcbw_LGfPqN7F";

// Busca coincidencias en la biblioteca interna de códigos HS/NCM ya
// confirmados por el despachante matriculado en operaciones reales (ver
// supabase/migrations/0012_biblioteca_ncm.sql). Es "best effort": si falla
// por lo que sea, no rompe el análisis por IA, sigue sin ese contexto.
async function buscarBiblioteca(termino: string): Promise<{ producto_nombre: string; categoria: string | null; codigo_hs: string }[]> {
  try {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/buscar_ncm_biblioteca`, {
      method: "POST",
      headers: { "content-type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + SUPABASE_ANON_KEY },
      body: JSON.stringify({ termino }),
    });
    if (!resp.ok) return [];
    const data = await resp.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

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
    estadoAceptacion: {
      type: "string",
      enum: ["sin_restricciones_tipicas", "con_permisos_especiales", "prohibido_o_muy_restringido"],
      description: "Si el producto típicamente entra en alguna categoría prohibida o muy restringida para importar a Argentina (usados, armas/réplicas, residuos peligrosos, especies protegidas/CITES, falsificaciones, estupefacientes/precursores sin RENPRE, neumáticos usados, etc.), marcá 'prohibido_o_muy_restringido'. Si necesita licencia no automática u otro permiso especial pero no está prohibido, 'con_permisos_especiales'. Si no hay indicios de restricción, 'sin_restricciones_tipicas'. Ante la duda, preferí la opción más cautelosa (no asegures 'sin_restricciones_tipicas' sin base)."
    },
    notaAceptacion: { type: "string", description: "1-2 frases explicando el estadoAceptacion, en criollo" },
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
  required: ["nombreProducto", "categoria", "confianza", "resumen", "complejidad", "estadoAceptacion", "notaAceptacion", "requisitos"],
  additionalProperties: false,
};

const SYSTEM_PROMPT = `Sos un asistente que ayuda a estimar, de forma orientativa, qué papeles/permisos/certificaciones suele necesitar un producto para importarse a Argentina.

Reglas importantes:
- NO tenés acceso a la nomenclatura arancelaria oficial (NCM/Mercosur) ni a la normativa vigente en tiempo real — nunca inventes un código NCM, un número de resolución, una ley o norma real. Hablá siempre en términos generales de qué TIPO de organismo o trámite suele intervenir.
- Basate en tu conocimiento general de qué organismos suelen intervenir según el rubro: ANMAT (cosmética, alimentos, dispositivos médicos, suplementos), SENASA (productos de origen animal o vegetal, agroquímicos), ENACOM (equipos de telecomunicaciones o radiofrecuencia, ej. con bluetooth/wifi), certificación de seguridad eléctrica tipo INTI (electrónica y electrodomésticos), licencias no automáticas (rubros como textil, calzado, juguetes, neumáticos, autopartes), RENPRE (precursores químicos). Si el producto es de un rubro sin restricciones típicas conocidas (ej: un llavero de metal, un accesorio simple), decilo con tranquilidad — no inventes trámites que no aplican.
- Para "estadoAceptacion": marcá "prohibido_o_muy_restringido" cuando el producto típicamente entra en categorías generalmente prohibidas o con restricción muy fuerte para importar a Argentina: mercadería USADA o de segunda mano (regla general, con pocas excepciones para bienes de capital específicos), armas de fuego/municiones/réplicas sin autorización de ANMaC, residuos peligrosos, especies protegidas o productos de fauna/flora silvestre (CITES), mercadería falsificada o que infringe marcas registradas, estupefacientes o precursores químicos sin registro RENPRE, neumáticos usados. Marcá "con_permisos_especiales" cuando necesita licencia no automática, intervención previa u otro trámite especial pero no está prohibido en sí. Marcá "sin_restricciones_tipicas" para el resto. Ante la duda entre categorías, elegí siempre la más cautelosa — nunca asegures "sin_restricciones_tipicas" sin una base razonable, es preferible pecar de prudente y sugerir consultar antes de comprar.
- Si no tenés información suficiente para estimar con confianza, marcá "confianza": "baja" pero igual devolvé la mejor estimación general (nunca dejes los campos vacíos).
- Tu respuesta es siempre orientativa, para que la persona entienda en general con qué se puede llegar a encontrar — nunca es un dictamen oficial ni asesoramiento legal vinculante. La clasificación y el trámite real los confirma Jawa Logistic con su despachante de aduana matriculado.
- Mantené el resumen y los detalles cortos, en un tono claro y directo, como si se lo explicaras a alguien que nunca importó en su vida.`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return jsonResponse({ success: false, error: "Falta iniciar sesión." }, 401);
  const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userError } = await supabaseAuth.auth.getUser();
  if (userError || !user) return jsonResponse({ success: false, error: "Sesión inválida — volvé a iniciar sesión." }, 401);

  let descripcion: string | undefined;
  let codigoHS: string | undefined;
  try {
    const body = await req.json();
    descripcion = body?.descripcion;
    codigoHS = body?.codigoHS;
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

  const coincidenciasBiblioteca = await buscarBiblioteca(descripcion);
  const contextoBiblioteca = coincidenciasBiblioteca.length
    ? `\n\nProductos similares ya confirmados en la biblioteca interna de Jawa Logistic (historial propio, NO es una base oficial): ${coincidenciasBiblioteca.map((c) => `"${c.producto_nombre}" (${c.categoria || "sin categoría"}) → código ${c.codigo_hs}`).join("; ")}. Si tu estimación es consistente con alguno de estos, podés usarlo como referencia; si no aplica al producto consultado, ignoralo.`
    : "";
  const contextoCodigoUsuario = codigoHS && codigoHS.trim()
    ? `\n\nLa persona ya conoce (o cree conocer) este código HS/NCM para su producto: "${codigoHS.trim()}". Tenelo en cuenta como contexto adicional, pero no asumas que es necesariamente correcto.`
    : "";

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
        messages: [{ role: "user", content: `Producto: ${descripcion}${contextoCodigoUsuario}${contextoBiblioteca}` }],
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
      ...(coincidenciasBiblioteca[0] ? { codigoHSSugerido: coincidenciasBiblioteca[0].codigo_hs, fuenteSugerencia: "biblioteca_interna" } : {}),
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
