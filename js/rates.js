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

// Tarifa de flete que ve el cliente, calculada del lado del servidor a
// partir del costo real de un agente de carga (ej. Aerobox) marcado como
// "tarifa pública" en admin.html — costo × 1,5, redondeado a múltiplo de 5
// hacia arriba (ver obtener_tarifas_publicas_flete(), migración 0018). Cada
// modo es un array de tramos [{hastaKg, tarifaKg}, ...], igual formato que
// usa admin.html — nunca expone el costo real ni el nombre del agente, así
// que es seguro pedirla sin login. Si no hay ningún agente marcado como
// tarifa pública para un modo, queda como array vacío y
// tarifaClientePorPeso() devuelve 0 (los cotizadores ya saben mostrar
// "sin tarifa cargada" cuando la tarifa da 0).
let FLETE_CLIENTE = { aereo: [], maritimo: [] };

// Mismo criterio de selección de tramo que admin.html (elegirTramoAgente):
// el tramo abierto (hastaKg vacío/null) es siempre el más barato y el que
// aplica "de ahí en adelante"; entre los tramos cerrados, el primero cuyo
// límite alcanza el peso del envío.
function tarifaClientePorPeso(tramos, pesoKg) {
  if (!Array.isArray(tramos) || !tramos.length) return 0;
  const abierto = (t) => t.hastaKg === null || t.hastaKg === undefined || t.hastaKg === "";
  const ordenados = [...tramos].sort((a, b) => {
    const aAb = abierto(a), bAb = abierto(b);
    if (aAb && bAb) return 0;
    if (aAb) return 1;
    if (bAb) return -1;
    return Number(a.hastaKg) - Number(b.hastaKg);
  });
  const elegido = ordenados.find((t) => !abierto(t) && pesoKg <= Number(t.hastaKg)) || ordenados[ordenados.length - 1];
  return elegido ? Number(elegido.tarifaKg) || 0 : 0;
}

// Se resuelve cuando las tarifas reales ya están cargadas. El resto del código
// espera este evento antes de habilitar los botones de calcular.
const SUPABASE_READY = (async function cargarConfiguracion() {
  try {
    const [{ data: tarifas, error: e1 }, { data: config, error: e2 }, { data: tarifaPublica, error: e3 }] = await Promise.all([
      supabaseClient.from("tarifas").select("id, valor"),
      supabaseClient.from("configuracion").select("clave, valor"),
      supabaseClient.rpc("obtener_tarifas_publicas_flete"),
    ]);
    if (e1) throw e1;
    if (e2) throw e2;
    // La tarifa pública es "mejor esfuerzo" — si la función todavía no existe
    // (falta pegar la migración 0018) no debe tirar abajo el resto de las
    // tarifas, los cotizadores ya saben mostrar "sin tarifa" con el array vacío.
    if (!e3 && tarifaPublica) {
      FLETE_CLIENTE = { aereo: tarifaPublica.aereo || [], maritimo: tarifaPublica.maritimo || [] };
    } else if (e3) {
      console.error("No se pudo cargar la tarifa pública de flete (¿ya corriste supabase/migrations/0018_tarifa_publica_flete.sql?):", e3);
    }

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
