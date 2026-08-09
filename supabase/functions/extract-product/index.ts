// Jawa Logistic — Edge Function: lee el link de un producto (Alibaba, 1688,
// AliExpress, Amazon, Mercado Libre) y devuelve nombre, imagen y precio si la
// página los expone en metadatos.
//
// LIMITACIÓN REAL: el peso y las medidas casi nunca están en la página de un
// producto, así que esta función NUNCA los devuelve — eso lo sigue cargando
// el cliente a mano. Sitios que arman el contenido con JavaScript (varios
// listados de Alibaba/1688) pueden devolver poco o nada, porque esto lee el
// HTML inicial, no ejecuta JavaScript como un navegador.

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

    const encontroAlgo = titulo || imagen || precio;
    return jsonResponse({
      success: !!encontroAlgo,
      titulo, imagen,
      precio: precio ? parseFloat(String(precio).replace(",", ".")) : null,
      moneda: moneda || null,
      advertencia: "Peso y medidas no se pueden leer de la página del producto — cargalos a mano.",
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
