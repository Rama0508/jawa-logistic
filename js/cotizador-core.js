// ---------- Jawa Logistic — Motor de cálculo del cotizador (puro) ----------
// Extraído de js/main.js para que el cotizador público (index.html) y el
// cotizador del hub (hub/cotizador.html) usen exactamente la misma lógica
// de negocio — CBM, peso volumétrico, régimen simplificado de courier — sin
// duplicarla. Si mañana cambia el divisor volumétrico o el tope del
// régimen, se toca acá una sola vez y ambos cotizadores quedan al día.
//
// Requiere que js/rates.js ya haya corrido antes (usa CBM_MINIMO,
// DIVISOR_VOLUMETRICO_AEREO y COURIER_REGIMEN, cargados ahí desde
// Supabase). No toca el DOM — solo recibe números y devuelve
// números/strings, para poder usarse desde cualquier página.

// Cuántas unidades de un producto entran en una caja: prueba las orientaciones
// posibles (qué medida del producto va en cada lado de la caja) y se queda con
// la que mejor aprovecha el espacio, dividiendo eje por eje (no por volumen total,
// porque el volumen total sobreestima: los productos no se pueden "licuar" para
// llenar los huecos, se acomodan en filas enteras por lado).
function mejorEmpaque(cajaL, cajaW, cajaH, prodL, prodW, prodH) {
  const caja = [cajaL, cajaW, cajaH];
  const prod = [prodL, prodW, prodH];
  const permutaciones = [
    [0, 1, 2], [0, 2, 1], [1, 0, 2],
    [1, 2, 0], [2, 0, 1], [2, 1, 0],
  ];
  let mejor = null;
  permutaciones.forEach((p) => {
    const conteos = [0, 1, 2].map((i) => Math.floor(caja[i] / prod[p[i]]));
    if (conteos.some((c) => c === 0)) return;
    const total = conteos[0] * conteos[1] * conteos[2];
    if (!mejor || total > mejor.total) {
      mejor = { total, conteos, lados: [0, 1, 2].map((i) => caja[i]), medidas: [0, 1, 2].map((i) => prod[p[i]]) };
    }
  });
  return mejor;
}

// Volumen cobrable de un envío marítimo: el mayor entre el CBM real, el
// equivalente en toneladas (regla marítima estándar: 1 tonelada = 1 CBM
// cobrable como piso) y el mínimo facturable del origen.
function cbmCobrableMaritimo(cbmTotal, pesoKg) {
  const toneladas = pesoKg / 1000;
  return Math.max(cbmTotal, toneladas, CBM_MINIMO);
}

// Peso cobrable de un envío aéreo: el mayor entre el peso real y el peso
// volumétrico (dimensiones ÷ divisor volumétrico) — estándar de la industria
// aérea, evita que bultos grandes pero livianos paguen de menos.
function pesoCobrableAereo(pesoVolTotal, pesoReal) {
  return Math.max(pesoReal, pesoVolTotal);
}

// Avisa si el pedido se pasa de los topes del régimen simplificado de envíos
// courier (peso, valor FOB o unidades de la misma especie por envío). Pasarse
// de estos límites no es un problema de nuestro precio — es que el envío deja
// de calificar para este régimen y pasa a trámite formal con despachante de
// aduana, un proceso distinto. Mejor avisar antes de que el cliente confirme.
function avisoLimiteRegimen(pesoKg, fobTotal, unidades) {
  const motivos = [];
  if (pesoKg > COURIER_REGIMEN.limitePesoKg) {
    motivos.push(`el peso (${pesoKg.toFixed(1)}kg) supera el máximo de ${COURIER_REGIMEN.limitePesoKg}kg`);
  }
  if (fobTotal > COURIER_REGIMEN.limiteCifUsd) {
    motivos.push(`el valor FOB (USD ${fobTotal.toFixed(2)}) supera el máximo de USD ${COURIER_REGIMEN.limiteCifUsd}`);
  }
  if (unidades && unidades > COURIER_REGIMEN.maxUnidadesMismaEspecie) {
    motivos.push(`la cantidad (${unidades} unidades) supera el máximo de ${COURIER_REGIMEN.maxUnidadesMismaEspecie} unidades de la misma especie`);
  }
  if (!motivos.length) return "";
  return `<div class="fc-result-row warn">⚠️ Este pedido no entra en el régimen simplificado: ${motivos.join("; ")}. Pasa a trámite formal con despachante de aduana — <a href="#contacto">escribinos</a> antes de confirmar para coordinarlo.</div>`;
}

// Excede el régimen simplificado (misma regla que avisoLimiteRegimen, pero
// como booleano) — lo usa el hub para decidir si el modo "courier" queda
// habilitado en la cotización persistida.
function excedeRegimenSimplificado(pesoKg, fobTotal, unidades) {
  return (
    pesoKg > COURIER_REGIMEN.limitePesoKg ||
    fobTotal > COURIER_REGIMEN.limiteCifUsd ||
    (unidades && unidades > COURIER_REGIMEN.maxUnidadesMismaEspecie)
  );
}
