// ---------- Jawa Logistic — API de extracción de productos ----------
// Lee el link de un producto (Alibaba, 1688, Amazon, MercadoLibre) y devuelve lo que
// pueda encontrar en los metadatos de la página: nombre, imagen y precio.
//
// LIMITACIÓN REAL (no es un bug, es cómo funciona la web): el peso y las medidas del
// producto casi nunca están en la página de un listado, así que este servicio NO los
// devuelve — el cliente los va a tener que cargar a mano en la calculadora, como hasta ahora.
// Algunos sitios (sobre todo Alibaba/1688) renderizan el contenido con JavaScript o
// bloquean pedidos automáticos, así que a veces esto no va a poder traer nada — el
// frontend siempre tiene que tener el formulario manual como respaldo.

const express = require("express");
const cheerio = require("cheerio");

const app = express();
app.use(express.json());

// CORS: restringí ORIGIN_PERMITIDO a tu dominio real una vez que lo tengas.
const ORIGEN_PERMITIDO = process.env.ORIGEN_PERMITIDO || "*";
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", ORIGEN_PERMITIDO);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// Solo se permite pedir estos dominios — evita que este servicio se use como
// puente para pegarle a URLs internas/arbitrarias (riesgo de seguridad SSRF).
const DOMINIOS_PERMITIDOS = [
  "alibaba.com", "1688.com", "aliexpress.com",
  "amazon.com", "amazon.com.mx", "amazon.com.br",
  "mercadolibre.com", "mercadolibre.com.ar", "articulo.mercadolibre.com.ar",
];

function dominioPermitido(hostname) {
  return DOMINIOS_PERMITIDOS.some((d) => hostname === d || hostname.endsWith("." + d));
}

function textoMeta($, selectores) {
  for (const sel of selectores) {
    const val = $(sel).attr("content") || $(sel).text();
    if (val && val.trim()) return val.trim();
  }
  return null;
}

function extraerJsonLd($) {
  let datos = null;
  $('script[type="application/ld+json"]').each((_, el) => {
    if (datos) return;
    try {
      const parsed = JSON.parse($(el).contents().text());
      const items = Array.isArray(parsed) ? parsed : [parsed];
      const producto = items.find((it) => {
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

app.post("/api/extract", async (req, res) => {
  const url = req.body && req.body.url;
  if (!url || typeof url !== "string") {
    return res.status(400).json({ success: false, error: "Falta la URL del producto." });
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    return res.status(400).json({ success: false, error: "La URL no es válida." });
  }
  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    return res.status(400).json({ success: false, error: "Solo se permiten links http/https." });
  }
  if (!dominioPermitido(parsedUrl.hostname)) {
    return res.status(400).json({
      success: false,
      error: "Por ahora solo leemos links de Alibaba, 1688, AliExpress, Amazon o Mercado Libre.",
    });
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
      return res.status(502).json({
        success: false,
        error: `El sitio respondió con error (${resp.status}). Puede que bloquee accesos automáticos — cargá los datos a mano.`,
      });
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

    let precio = null;
    let moneda = null;
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
    res.json({
      success: !!encontroAlgo,
      titulo, imagen,
      precio: precio ? parseFloat(String(precio).replace(",", ".")) : null,
      moneda: moneda || null,
      advertencia: "Peso y medidas no se pueden leer de la página del producto — cargalos a mano.",
      fuente: parsedUrl.hostname,
    });
  } catch (err) {
    const timedOut = err && err.name === "AbortError";
    res.status(504).json({
      success: false,
      error: timedOut
        ? "El sitio tardó demasiado en responder."
        : "No se pudo leer la página (puede que bloquee accesos automáticos). Cargá los datos a mano.",
    });
  }
});

app.get("/api/health", (_req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Jawa Logistic API escuchando en el puerto ${PORT}`));
