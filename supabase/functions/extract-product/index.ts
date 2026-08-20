// Jawa Logistic — Edge Function: lee el link de un producto (Alibaba, 1688,
// AliExpress, Amazon, Mercado Libre) y usa Claude para extraer lo que pueda
// encontrar en la página: título, imagen, FOB, peso y medidas (de producto y
// de embalaje, cuando figuren en la ficha).
//
// Reemplaza al viejo backend de api/server.js (pensado para EasyPanel), que
// solo leía metadatos (OG tags / JSON-LD) y nunca podía traer peso ni
// medidas. Acá, en vez de parsear con selectores fijos, se le pasa el HTML
// limpio a Claude — así puede leer tablas de especificaciones con formatos
// distintos en cada sitio (y en chino, en el caso de 1688) sin que haya que
// mantener un parser por sitio.
//
// LIMITACIÓN REAL: Alibaba y sobre todo 1688 tienen protección anti-bot
// fuerte — un fetch de servidor simple (sin navegador real, sin cookies de
// sesión) recibe una página de captcha/bloqueo en vez del producto, sin
// título, precio, peso ni medidas reales. Para esos dos sitios se usa
// ScraperAPI (Deno.env SCRAPER_API_KEY, opcional) con render=true — navegador
// real detrás de IPs residenciales — como único método que de verdad evade
// ese bloqueo. Si no está configurado el secret, la función sigue andando
// para el resto de los sitios, y Alibaba/1688 devuelven el mismo aviso de
// "cargá a mano" que antes — el frontend siempre tiene que tener el
// formulario manual como respaldo, funcione o no el scraper.
//
// Seguridad: mismo patrón que el resto de las funciones de IA del proyecto
// (despachante-virtual, clasificar-producto) — sin "Enforce JWT
// Verification" a nivel plataforma, así que el chequeo de sesión se hace acá
// adentro a mano. Sin esto, cualquiera con la anon key pública podía pedir
// URLs arbitrarias gratis a costa de la cuenta de Anthropic.

import { createClient } from "npm:@supabase/supabase-js@2";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_MODEL = "claude-opus-5";

const SUPABASE_URL = "https://hthyehsqfrfwdqkbqrwj.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_Dlh15glcRPYtVKmvkytcbw_LGfPqN7F";

// Solo se permite pedir estos dominios — evita que este servicio se use como
// puente para pegarle a URLs internas/arbitrarias (riesgo de seguridad SSRF),
// y evita gastar crédito de Anthropic leyendo páginas que no vamos a poder
// mapear a un producto.
const DOMINIOS_PERMITIDOS = [
  "alibaba.com", "1688.com", "aliexpress.com",
  "amazon.com", "amazon.com.mx", "amazon.com.br",
  "mercadolibre.com", "mercadolibre.com.ar",
];

function dominioPermitido(hostname: string): boolean {
  return DOMINIOS_PERMITIDOS.some((d) => hostname === d || hostname.endsWith("." + d));
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

// x-forwarded-for trae la cadena completa de proxies (cliente, primero) —
// solo nos interesa el primero, la IP real de quien hizo el pedido.
function obtenerIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "desconocida";
}

// Límite anti-abuso: 5 usos por cuenta Y 5 por IP cada 7 días (lo que se
// alcance primero) — ver supabase/migrations/0023_limite_uso_ia.sql. Acá
// importa el doble: esta función gasta crédito de Anthropic Y de ScraperAPI
// (Alibaba/1688), así que sin tope un solo cliente podía comerse ambos
// presupuestos en minutos.
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

// Deja el HTML liviano antes de mandarlo a Claude: saca <head> (metadata
// pura, no tiene datos del producto), scripts, estilos, SVGs inline,
// imágenes/fuentes embebidas en base64 (pesan muchísimo y no aportan nada a
// un modelo de texto) y comentarios. No se usa un parser DOM (cheerio, etc.)
// a propósito — Claude lee HTML crudo perfectamente bien y así no
// dependemos de mantener selectores por sitio.
//
// El límite de caracteres importa en serio con páginas renderizadas por un
// navegador real (ScraperAPI render=true): sin sacar el <head> y los data:
// URIs, el recorte anterior (55.000) se completaba entero con metadata y
// menús ANTES de llegar a la sección real del producto — la IA recibía la
// página "cortada" antes de la tabla de especificaciones. 180.000 con este
// recorte más agresivo deja margen de sobra para llegar al contenido real.
function limpiarHtml(html: string): string {
  return html
    .replace(/<head[\s\S]*?<\/head>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<svg[\s\S]*?<\/svg>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/(src|href|srcset)="data:[^"]*"/gi, '$1="[data-uri omitido]"')
    .replace(/url\(\s*data:[^)]*\)/gi, "url([data-uri omitido])")
    .replace(/[ \t]{2,}/g, " ")
    .slice(0, 180000);
}

const EXTRACCION_SCHEMA = {
  type: "object",
  properties: {
    encontrado: { type: "boolean", description: "true si se pudo identificar un producto real en esta página (no una página de error/bloqueo/login)" },
    titulo: { type: ["string", "null"], description: "Nombre del producto, corto y claro. Si está en chino u otro idioma, traducilo al español manteniendo términos técnicos reconocibles." },
    imagenUrl: { type: ["string", "null"], description: "URL absoluta de la foto principal del producto, si se encuentra en el HTML" },
    fobUnitarioUsd: { type: ["number", "null"], description: "Precio por unidad en USD. Si el precio está en otra moneda, convertilo a USD solo si hay una referencia clara en la página; si no, dejalo null y usá el campo moneda." },
    moneda: { type: ["string", "null"], description: "Moneda del precio tal como figura en la página si NO pudiste convertir a USD (ej: CNY, EUR)" },
    moqUnidades: { type: ["number", "null"], description: "Cantidad mínima de pedido (MOQ), si figura" },
    pesoUnidadGramos: { type: ["number", "null"], description: "Peso de UNA sola unidad del producto, en gramos (convertí si figura en kg/lb/oz)" },
    piezasPorCaja: { type: ["number", "null"], description: "Unidades por caja/cartón de embalaje, si figura" },
    cajaLargoCm: { type: ["number", "null"], description: "Largo del embalaje/cartón exterior, en cm (convertí si figura en mm/pulgadas)" },
    cajaAnchoCm: { type: ["number", "null"], description: "Ancho del embalaje/cartón exterior, en cm" },
    cajaAltoCm: { type: ["number", "null"], description: "Alto del embalaje/cartón exterior, en cm" },
    productoLargoCm: { type: ["number", "null"], description: "Largo del producto individual (sin embalaje), en cm" },
    productoAnchoCm: { type: ["number", "null"], description: "Ancho del producto individual, en cm" },
    productoAltoCm: { type: ["number", "null"], description: "Alto del producto individual, en cm" },
    advertencia: { type: ["string", "null"], description: "Aviso breve si hay algo que el usuario deba revisar (ej: el precio varía según cantidad, la página no cargó completa, etc.)" },
  },
  required: [
    "encontrado", "titulo", "imagenUrl", "fobUnitarioUsd", "moneda", "moqUnidades",
    "pesoUnidadGramos", "piezasPorCaja", "cajaLargoCm", "cajaAnchoCm", "cajaAltoCm",
    "productoLargoCm", "productoAnchoCm", "productoAltoCm", "advertencia",
  ],
  additionalProperties: false,
};

const SYSTEM_PROMPT = `Sos un asistente que extrae datos comerciales y logísticos de la ficha de un producto (Alibaba, 1688, AliExpress, Amazon o Mercado Libre) a partir de su HTML crudo, para precargar una calculadora de importación a Argentina.

Reglas importantes:
- Te paso el HTML de la página (puede venir recortado, con ruido, o ser una página de error/verificación si el sitio bloqueó el pedido automático). Si no reconocés un producto real, marcá "encontrado": false y dejá el resto de los campos en null — NO inventes datos.
- El precio de estos sitios suele variar según la cantidad pedida (tabla de "price breaks"). Si ves varios precios, usá el de la cantidad mínima (MOQ) y aclaralo en "advertencia".
- Peso y medidas: buscá específicamente una tabla de "Especificaciones" / "Product specifications" / "包装信息" (info de empaque, en chino) — a veces distinguen "peso neto"/"peso bruto" y "medidas del producto"/"medidas del paquete". Cargá cada uno en su campo correspondiente (producto vs. caja) — no los mezcles.
- Todo campo que no puedas determinar con razonable confianza va en null. Es mejor un campo vacío que un dato inventado, porque esto carga directo una calculadora de costos reales.`;

interface Extraccion {
  encontrado: boolean;
  titulo: string | null;
  imagenUrl: string | null;
  fobUnitarioUsd: number | null;
  moneda: string | null;
  moqUnidades: number | null;
  pesoUnidadGramos: number | null;
  piezasPorCaja: number | null;
  cajaLargoCm: number | null;
  cajaAnchoCm: number | null;
  cajaAltoCm: number | null;
  productoLargoCm: number | null;
  productoAnchoCm: number | null;
  productoAltoCm: number | null;
  advertencia: string | null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return jsonResponse({ success: false, error: "Falta iniciar sesión." }, 401);
  const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userError } = await supabaseAuth.auth.getUser();
  if (userError || !user) return jsonResponse({ success: false, error: "Sesión inválida — volvé a iniciar sesión." }, 401);

  const permitido = await dentroDelLimite("extract_product", user.id, obtenerIp(req));
  if (!permitido) {
    return jsonResponse({
      success: false,
      error: "Llegaste al límite de 5 links por semana. Probá de nuevo la semana que viene, o cargá los datos a mano.",
    }, 429);
  }

  let url: string | undefined;
  try {
    const body = await req.json();
    url = body?.url;
  } catch {
    return jsonResponse({ success: false, error: "Cuerpo de la petición inválido." }, 400);
  }
  if (!url || typeof url !== "string") {
    return jsonResponse({ success: false, error: "Falta la URL del producto." }, 400);
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return jsonResponse({ success: false, error: "La URL no es válida." }, 400);
  }
  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    return jsonResponse({ success: false, error: "Solo se permiten links http/https." }, 400);
  }
  if (!dominioPermitido(parsedUrl.hostname)) {
    return jsonResponse({
      success: false,
      error: "Por ahora solo leemos links de Alibaba, 1688, AliExpress, Amazon o Mercado Libre.",
    }, 400);
  }

  const apiKey = (Deno.env.get("ANTHROPIC_API_KEY") || "").replace(/[^\x21-\x7E]/g, "");
  if (!apiKey) {
    return jsonResponse({
      success: false,
      error: "La lectura de links no está configurada todavía (falta ANTHROPIC_API_KEY en el proyecto de Supabase). Cargá los datos a mano.",
    }, 500);
  }

  const esSitioDificil = parsedUrl.hostname.endsWith("1688.com") || parsedUrl.hostname.endsWith("alibaba.com");
  const scraperApiKey = (Deno.env.get("SCRAPER_API_KEY") || "").trim();

  // Fetch directo: rápido y gratis, funciona para la mayoría de los sitios
  // (Amazon, Mercado Libre, AliExpress casi siempre sirven el HTML con los
  // datos ya adentro). No sirve para Alibaba/1688, que devuelven una página
  // de captcha/bloqueo a cualquier pedido sin navegador real.
  async function fetchDirecto(): Promise<string> {
    const controllerPagina = new AbortController();
    const timeoutPagina = setTimeout(() => controllerPagina.abort(), 15000);
    try {
      const resp = await fetch(parsedUrl.toString(), {
        redirect: "follow",
        signal: controllerPagina.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
          "Accept-Language": "es-AR,es;q=0.9,en;q=0.8,zh;q=0.7",
        },
      });
      if (!resp.ok) throw new Error(`status ${resp.status}`);
      return await resp.text();
    } finally {
      clearTimeout(timeoutPagina);
    }
  }

  // Fetch vía ScraperAPI: usa un navegador real (render=true, ejecuta el
  // JavaScript de la página) detrás de IPs residenciales, así evita el
  // bloqueo anti-bot de Alibaba/1688 y trae también la tabla de
  // especificaciones (peso/medidas) que esos sitios cargan dinámicamente.
  // country_code=us fuerza precios en USD (sin esto, Alibaba geolocaliza el
  // tráfico "genérico" y a veces muestra otra moneda, ej. reales brasileños).
  async function fetchViaScraperApi(): Promise<string> {
    const controllerScraper = new AbortController();
    // render=true (navegador real) en sitios pesados como Alibaba puede
    // tardar bastante más que un fetch normal — 45s resultó insuficiente en
    // la práctica (se abortaba antes de que ScraperAPI terminara de
    // renderizar). 75s deja margen y todavía entra cómodo junto con el
    // timeout de Anthropic (55s) dentro del límite de wall-clock de la
    // Edge Function.
    const timeoutScraper = setTimeout(() => controllerScraper.abort(), 75000);
    try {
      const scraperUrl = `https://api.scraperapi.com/?api_key=${encodeURIComponent(scraperApiKey)}&url=${encodeURIComponent(parsedUrl.toString())}&render=true&country_code=us`;
      const resp = await fetch(scraperUrl, { signal: controllerScraper.signal });
      if (!resp.ok) throw new Error(`status ${resp.status}`);
      return await resp.text();
    } finally {
      clearTimeout(timeoutScraper);
    }
  }

  let html: string;
  try {
    if (esSitioDificil && scraperApiKey) {
      html = await fetchViaScraperApi();
    } else {
      try {
        html = await fetchDirecto();
      } catch (errDirecto) {
        // Si el fetch directo falla (bloqueo, 403, etc.) y hay un scraper
        // configurado, se reintenta una sola vez a través de él antes de
        // rendirse — igual que Alibaba/1688, cualquier sitio puede empezar a
        // bloquear pedidos automáticos en cualquier momento.
        if (!scraperApiKey) throw errDirecto;
        html = await fetchViaScraperApi();
      }
    }
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "AbortError";
    return jsonResponse({
      success: false,
      error: timedOut
        ? "El sitio tardó demasiado en responder. Cargá los datos a mano."
        : `No se pudo leer la página.${esSitioDificil && !scraperApiKey ? " Alibaba/1688 suelen bloquear accesos automáticos — no hay un servicio de scraping configurado (falta SCRAPER_API_KEY)." : ""} Cargá los datos a mano.`,
    }, 504);
  }
  html = limpiarHtml(html);

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
        max_tokens: 1200,
        thinking: { type: "disabled" },
        output_config: {
          effort: "medium",
          format: { type: "json_schema", schema: EXTRACCION_SCHEMA },
        },
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: `URL: ${parsedUrl.toString()}\n\nHTML de la página:\n${html}` }],
      }),
    });
    clearTimeout(timeout);

    const data = await resp.json();

    if (!resp.ok) {
      console.error("extract-product: Anthropic respondió", resp.status, JSON.stringify(data));
      return jsonResponse({ success: false, error: `La IA no pudo leer el producto (${resp.status}). Cargá los datos a mano.` }, 502);
    }
    if (data.stop_reason === "refusal") {
      return jsonResponse({ success: false, error: "La IA no pudo procesar este link. Cargá los datos a mano." }, 200);
    }

    const textBlock = (data.content || []).find((b: { type: string }) => b.type === "text");
    if (!textBlock || !textBlock.text) {
      return jsonResponse({ success: false, error: "La IA no devolvió datos del producto. Cargá los datos a mano." }, 200);
    }

    let ext: Extraccion;
    try {
      ext = JSON.parse(textBlock.text);
    } catch {
      return jsonResponse({ success: false, error: "No se pudo interpretar la respuesta de la IA. Cargá los datos a mano." }, 200);
    }

    if (!ext.encontrado) {
      return jsonResponse({
        success: false,
        error: `No pudimos identificar el producto en ese link.${esSitioDificil ? " Alibaba/1688 suelen bloquear accesos automáticos — es esperable que a veces pase." : ""} Cargá los datos a mano.`,
      }, 200);
    }

    // Medidas "de referencia" para compatibilidad con el contrato viejo
    // (js/ruta-calc.js, ya cableado a esta función esperando largoCm/anchoCm/
    // altoCm planos): se prioriza la caja/embalaje porque esa calculadora
    // pide las medidas del BULTO a enviar, no del producto suelto.
    const largoCm = ext.cajaLargoCm ?? ext.productoLargoCm ?? null;
    const anchoCm = ext.cajaAnchoCm ?? ext.productoAnchoCm ?? null;
    const altoCm = ext.cajaAltoCm ?? ext.productoAltoCm ?? null;

    return jsonResponse({
      success: true,
      fuente: parsedUrl.hostname,
      titulo: ext.titulo,
      imagen: ext.imagenUrl,
      precio: ext.fobUnitarioUsd,
      moneda: ext.moneda || (ext.fobUnitarioUsd ? "USD" : null),
      pesoEncontrado: ext.pesoUnidadGramos != null,
      pesoKg: ext.pesoUnidadGramos != null ? ext.pesoUnidadGramos / 1000 : null,
      medidasEncontradas: largoCm != null && anchoCm != null && altoCm != null,
      largoCm, anchoCm, altoCm,
      advertencia: ext.advertencia || "Datos leídos automáticamente — revisalos antes de calcular, pueden tener errores.",
      producto: {
        titulo: ext.titulo,
        imagenUrl: ext.imagenUrl,
        fobUnitarioUsd: ext.fobUnitarioUsd,
        moneda: ext.moneda,
        moqUnidades: ext.moqUnidades,
        pesoUnidadGramos: ext.pesoUnidadGramos,
        piezasPorCaja: ext.piezasPorCaja,
        caja: { largoCm: ext.cajaLargoCm, anchoCm: ext.cajaAnchoCm, altoCm: ext.cajaAltoCm },
        unidad: { largoCm: ext.productoLargoCm, anchoCm: ext.productoAnchoCm, altoCm: ext.productoAltoCm },
      },
    });
  } catch (err) {
    console.error("extract-product fetch error:", err instanceof Error ? `${err.name}: ${err.message}` : String(err));
    const timedOut = err instanceof Error && err.name === "AbortError";
    return jsonResponse({
      success: false,
      error: timedOut ? "La IA tardó demasiado en responder. Cargá los datos a mano." : "No se pudo conectar con el servicio de lectura de links.",
    }, 504);
  }
});
