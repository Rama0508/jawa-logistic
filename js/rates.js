// ---------- Jawa Logistic — Tarifas y configuración (Supabase) ----------
// Esto carga la configuración EN VIVO desde Supabase. Cualquier cambio de
// tarifa hecho desde el panel interno (admin.html) se refleja al instante en
// todo el sitio, sin tocar código ni hacer un nuevo deploy.
//
// Requiere que antes de este archivo se cargue el cliente de Supabase:
// <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>

// Escapa texto que viene de la base (nombre de producto, descripción,
// dirección de envío, etc.) antes de meterlo en un template de innerHTML —
// sin esto, un dato cargado por staff (o, en el carrito/checkout, texto que
// terminó en la orden) con HTML/JS adentro se ejecuta en la sesión de quien
// lo lee. Vive acá (no en un archivo de tienda/hub puntual) porque rates.js
// es el único script que cargan todas las páginas del sitio.
function escHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

const SUPABASE_URL = "https://hthyehsqfrfwdqkbqrwj.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_Dlh15glcRPYtVKmvkytcbw_LGfPqN7F"; // key pública, segura para el navegador

// Si el script del CDN no cargó (sin conexión, bloqueado por el navegador, etc.)
// esto no debe tirar abajo el resto de la página — se degrada sin tarifas en vivo.
let supabaseClient = null;
if (window.supabase && typeof window.supabase.createClient === "function") {
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} else {
  console.error("No se pudo cargar el cliente de Supabase (¿sin conexión o bloqueado?). Tarifas en vivo y autocompletado de links no van a funcionar hasta recargar la página.");
}

// URL de la función que lee links de productos (reemplaza el backend de EasyPanel)
const EXTRACT_PRODUCT_URL = `${SUPABASE_URL}/functions/v1/extract-product`;

// Valores por defecto mientras se cargan los reales (o si falla la conexión) —
// a propósito en $0, para que la calculadora nunca muestre un precio inventado.
let FLETE_RATES = {
  sea: { china: 0, miami: 0 },
  air: { china: 0, miami: 0 },
};
let CBM_MINIMO = 0.5;
let DIVISOR_VOLUMETRICO_AEREO = 6000;
let RATE_COURIER_USD_KG = 0;
let COURIER_REGIMEN = { limitePesoKg: 50, limiteCifUsd: 3000, alicuota: 0.5, maxUnidadesMismaEspecie: 3 };

// Se resuelve cuando las tarifas reales ya están cargadas. El resto del código
// espera este evento antes de habilitar los botones de calcular.
const SUPABASE_READY = (async function cargarConfiguracion() {
  try {
    const [{ data: tarifas, error: e1 }, { data: config, error: e2 }] = await Promise.all([
      supabaseClient.from("tarifas").select("id, valor"),
      supabaseClient.from("configuracion").select("clave, valor"),
    ]);
    if (e1) throw e1;
    if (e2) throw e2;

    const t = Object.fromEntries((tarifas || []).map((r) => [r.id, Number(r.valor)]));
    FLETE_RATES = {
      sea: { china: t.sea_china || 0, miami: t.sea_miami || 0 },
      air: { china: t.air_china || 0, miami: t.air_miami || 0 },
    };
    RATE_COURIER_USD_KG = t.courier || 0;

    const c = Object.fromEntries((config || []).map((r) => [r.clave, r.valor]));
    if (c.cbm_minimo != null) CBM_MINIMO = Number(c.cbm_minimo);
    if (c.divisor_volumetrico_aereo != null) DIVISOR_VOLUMETRICO_AEREO = Number(c.divisor_volumetrico_aereo);
    if (c.courier_regimen) COURIER_REGIMEN = c.courier_regimen;
  } catch (err) {
    console.error("No se pudieron cargar las tarifas desde Supabase (¿ya corriste supabase/migrations/0001_init.sql?):", err);
  }
  document.dispatchEvent(new Event("tarifas-listas"));
})();

// Deshabilita un botón hasta que las tarifas reales estén cargadas, mostrando
// un texto de carga mientras tanto. Se usa en index.html y admin.html.
function esperarTarifasPara(boton, textoCargando) {
  if (!boton) return;
  const textoOriginal = boton.textContent;
  boton.disabled = true;
  boton.textContent = textoCargando || "Cargando tarifas…";
  SUPABASE_READY.then(() => {
    boton.disabled = false;
    boton.textContent = textoOriginal;
  });
}
