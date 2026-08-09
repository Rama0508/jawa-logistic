// Jawa Logistic — Edge Function: lee el link de un producto (Alibaba, 1688,
// AliExpress, Amazon, Mercado Libre) y devuelve nombre, imagen, precio, y un
// intento de "mejor esfuerzo" de peso y medidas.
//
// LIMITACIÓN REAL sobre peso/medidas: no hay un estándar en la web para esto,
// así que se buscan por patrones de texto ("Item weight: 2.5kg", "10 x 5 x 3
// cm", etc.). Cuando el patrón aparece, se devuelve — pero puede equivocarse
// (por ejemplo, tomar el peso de un accesorio incluido en vez del producto
// principal), por eso el frontend siempre lo muestra como "revisar antes de
// calcular", nunca como un dato 100% confiable. Sitios que arman el contenido
// con JavaScript (varios listados de Alibaba/1688) pueden devolver poco o
// nada, porque esto lee el HTML inicial, no ejecuta JavaScript como un navegador.

import * as cheerio from "npm:cheerio@1.0.0";

const DOMINIOS_PERMITIDOS = [
  "alibaba.com", "1688.com", "aliexpress.com",
  "amazon.com", "amazon.com.mx", "amazon.com.br",
  "mercadolibre.com", "mercadolibre.com.ar", "articulo.mercadolibre.com.ar",
];

function dominioPermitido(hostname: string): boolean {
  return DOMINIOS_PERMITIDOS.some((d) => hostname === d || hostname.endsWith("." + d));
}

function textoMeta($: cheerio.CheerioAPI, selectores: string[]): string | null {
  for (const sel of selectores) {
    const val = $(sel).attr("content") || $(sel).text();
    if (val && val.trim()) return val.trim();
  }
  return null;
}

// deno-lint-ignore no-explicit-any
function extraerJsonLd($: cheerio.CheerioAPI): any {
  // deno-lint-ignore no-explicit-any
  let datos: any = null;
  $('script[type="application/ld+json"]').each((_, el) => {
    if (datos) return;
    try {
      const parsed = JSON.parse($(el).contents().text());
      const items = Array.isArray(parsed) ? parsed : [parsed];
      // deno-lint-ignore no-explicit-any
      const producto = items.find((it: any) => {
        const tipo = it && it["@type"];
        return tipo === "Product" || (Array.isArray(tipo) && tipo.includes("Product"));
      });
      if (producto) datos = producto;
    } catch {
      // JSON-LD mal formado — se ignora y se sigue con el resto de las señales
    }
  });
  return datos;
}

// Busca peso y medidas en el texto visible de la página por patrones comunes.
// Es heurístico "mejor esfuerzo": puede no encontrar nada, o encontrar un dato
// que no corresponde al producto principal — nunca se trata como 100% confiable.
function extraerPesoYMedidas(texto: string): {
  pesoKg: number | null; largoCm: number | null; anchoCm: number | null; altoCm: number | null;
} {
  let pesoKg: number | null = null;
  let largoCm: number | null = null, anchoCm: number | null = null, altoCm: number | null = null;

  const pesoRegex = /(?:item\s*weight|net\s*weight|gross\s*weight|package\s*weight|product\s*weight|peso\s*neto|peso\s*del\s*producto|peso)\s*[:\-]?\s*([\d]+(?:[.,]\d+)?)\s*(kilograms?|kilogramos?|kgs?|grams?|gramos?|grs?|g\b|lbs?|libras?|pounds?|oz|onzas?)/i;
  const pesoMatch = texto.match(pesoRegex);
  if (pesoMatch) {
    const valor = parseFloat(pesoMatch[1].replace(",", "."));
    const unidad = pesoMatch[2].toLowerCase();
    if (/^ki?lo/.test(unidad) || /^kg/.test(unidad)) pesoKg = valor;
    else if (/^(g|gr|gram)/.test(unidad)) pesoKg = valor / 1000;
    else if (/^(lb|libra|pound)/.test(unidad)) pesoKg = valor * 0.453592;
    else if (/^(oz|onza)/.test(unidad)) pesoKg = valor * 0.0283495;
  }

  const medidasRegex = /(\d+(?:[.,]\d+)?)\s*(cm|mm|in|inch|")?\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(cm|mm|in|inch|")?\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(cm|mm|in|inch|")?/i;
  const medidasMatch = texto.match(medidasRegex);
  if (medidasMatch) {
    const unidadTexto = (medidasMatch[2] || medidasMatch[4] || medidasMatch[6] || "cm").toLowerCase();
    const factor = unidadTexto.startsWith("mm") ? 0.1 : (unidadTexto.startsWith("in") || unidadTexto === '"') ? 2.54 : 1;
    largoCm = parseFloat(medidasMatch[1].replace(",", ".")) * factor;
    anchoCm = parseFloat(medidasMatch[3].replace(",", ".")) * factor;
    altoCm = parseFloat(medidasMatch[5].replace(",", ".")) * factor;
  }

  return { pesoKg, largoCm, anchoCm, altoCm };
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

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

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    const resp = await fetch(parsedUrl.toString(), {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        "Accept-Language": "es-AR,es;q=0.9,en;q=0.8",
      },
    });
    clearTimeout(timeout);

    if (!resp.ok) {
      return jsonResponse({
        success: false,
        error: `El sitio respondió con error (${resp.status}). Puede que bloquee accesos automáticos — cargá los datos a mano.`,
      }, 502);
    }

    const html = await resp.text();
    const $ = cheerio.load(html);
    const jsonLd = extraerJsonLd($);

    const titulo = (jsonLd && jsonLd.name)
      || textoMeta($, ['meta[property="og:title"]', 'meta[name="twitter:title"]'])
      || $("title").text().trim()
      || null;

    const imagen = (jsonLd && jsonLd.image && (Array.isArray(jsonLd.image) ? jsonLd.image[0] : jsonLd.image))
      || textoMeta($, ['meta[property="og:image"]', 'meta[name="twitter:image"]'])
      || null;

    // deno-lint-ignore no-explicit-any
    let precio: any = null;
    let moneda: string | null = null;
    if (jsonLd && jsonLd.offers) {
      const offer = Array.isArray(jsonLd.offers) ? jsonLd.offers[0] : jsonLd.offers;
      if (offer) {
        precio = offer.price || offer.lowPrice || null;
        moneda = offer.priceCurrency || null;
      }
    }
    if (!precio) {
      precio = textoMeta($, ['meta[property="product:price:amount"]', 'meta[property="og:price:amount"]']);
      moneda = moneda || textoMeta($, ['meta[property="product:price:currency"]', 'meta[property="og:price:currency"]']);
    }

    // Peso/medidas: primero se busca en JSON-LD (si el sitio lo declara ahí),
    // si no aparece se busca por patrones en el texto visible de la página.
    let pesoKg: number | null = jsonLd?.weight?.value ? Number(jsonLd.weight.value) : null;
    const textoVisible = $("body").text().replace(/\s+/g, " ");
    const heuristica = extraerPesoYMedidas(textoVisible);
    if (pesoKg == null) pesoKg = heuristica.pesoKg;
    const { largoCm, anchoCm, altoCm } = heuristica;
    const medidasEncontradas = largoCm != null && anchoCm != null && altoCm != null;

    const encontroAlgo = titulo || imagen || precio;
    return jsonResponse({
      success: !!encontroAlgo,
      titulo, imagen,
      precio: precio ? parseFloat(String(precio).replace(",", ".")) : null,
      moneda: moneda || null,
      pesoKg, largoCm, anchoCm, altoCm,
      pesoEncontrado: pesoKg != null,
      medidasEncontradas,
      advertencia: "Peso y medidas detectados automáticamente (si aparecen) son un intento de mejor esfuerzo — revisalos siempre antes de calcular.",
      fuente: parsedUrl.hostname,
    });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "AbortError";
    return jsonResponse({
      success: false,
      error: timedOut
        ? "El sitio tardó demasiado en responder."
        : "No se pudo leer la página (puede que bloquee accesos automáticos). Cargá los datos a mano.",
    }, 504);
  }
});
