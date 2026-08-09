// ---------- Tarifas de Jawa Logistic — fuente única ----------
// Este archivo lo cargan tanto la página pública (index.html, cotizador de clientes)
// como el informe interno (admin.html), para que nunca queden desincronizados.
// ⚠️ Reemplazá los valores marcados con ⚠️ por tus tarifas reales.

const FLETE_RATES = {
  sea: { china: 1000, miami: 1000 }, // USD por CBM (metro cúbico) — confirmado
  air: { china: 0, miami: 0 },       // ⚠️ USD por KG — falta confirmar
};

const CBM_MINIMO = 0.5;                 // mínimo a consolidar por envío, en CBM
const DIVISOR_VOLUMETRICO_AEREO = 6000; // estándar IATA: (L×A×H cm) ÷ 6000 = kg volumétrico

// ---------- Solo para el informe interno (admin.html) ----------
const RATE_COURIER_USD_KG = 0; // ⚠️ USD por KG vía courier (régimen simplificado) — falta confirmar

const COURIER_REGIMEN = {
  limitePesoKg: 50,     // peso máximo del envío para calificar al régimen simplificado
  limiteCifUsd: 3000,   // valor CIF máximo para calificar
  alicuota: 0.50,       // % que se cobra sobre el CIF en concepto de impuestos
};
