// ---------- Jawa Logistic — Calculadora de flete detallada (sección "ruta") ----------
// Extraído de js/main.js cuando la sección de servicios/ruta se separó del
// home a su propia página (servicios.html) — este bloque solo se carga ahí.
// Requiere que antes se hayan cargado: js/rates.js (tarifas, supabaseClient,
// EXTRACT_PRODUCT_URL) y js/cotizador-core.js (mejorEmpaque, avisoLimiteRegimen).

// ---------- Contadores animados ----------
try {
  (function () {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const nums = document.querySelectorAll("[data-count-to]");
    if (!nums.length) return;

    function animarContador(el) {
      const destino = parseFloat(el.getAttribute("data-count-to"));
      const sufijo = el.getAttribute("data-suffix") || "";
      if (reduce || !("requestAnimationFrame" in window)) {
        el.textContent = destino + sufijo;
        return;
      }
      const duracion = 1400;
      const inicio = performance.now();
      function paso(ahora) {
        const t = Math.min(1, (ahora - inicio) / duracion);
        const eased = 1 - Math.pow(1 - t, 3);
        el.textContent = Math.round(destino * eased) + sufijo;
        if (t < 1) requestAnimationFrame(paso);
      }
      requestAnimationFrame(paso);
    }

    if (!("IntersectionObserver" in window)) {
      nums.forEach(animarContador);
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          animarContador(entry.target);
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.4 });
    nums.forEach((el) => io.observe(el));
  })();
} catch (e) { console.error("contadores animados:", e); }

// ---------- Pegar link del producto (autocompletar) ----------
try {
  (function () {
    const btn = document.getElementById("link-buscar");
    if (!btn) return;
    const input = document.getElementById("link-producto");
    const resultBox = document.getElementById("link-result");
    const errorBox = document.getElementById("link-error");

    btn.addEventListener("click", async () => {
      const url = input.value.trim();
      resultBox.classList.remove("show");
      errorBox.classList.remove("show");

      if (!url) { alert("Pegá primero el link del producto."); return; }

      btn.disabled = true;
      btn.textContent = "Buscando…";
      try {
        const resp = await fetch(EXTRACT_PRODUCT_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": SUPABASE_ANON_KEY,
            "Authorization": "Bearer " + SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ url }),
        });
        const data = await resp.json();

        if (!data.success) {
          errorBox.textContent = "⚠️ " + (data.error || "No pudimos leer ese link. Cargá los datos a mano.");
          errorBox.classList.add("show");
          return;
        }

        if (data.precio) {
          const seaFob = document.getElementById("sea-fob");
          const airFob = document.getElementById("air-fob");
          if (seaFob) seaFob.value = data.precio;
          if (airFob) airFob.value = data.precio;
        }
        if (data.pesoEncontrado && data.pesoKg) {
          const seaW = document.getElementById("sea-weight");
          const airW = document.getElementById("air-weight");
          if (seaW) seaW.value = data.pesoKg.toFixed(2);
          if (airW) airW.value = data.pesoKg.toFixed(2);
        }
        if (data.medidasEncontradas) {
          ["sea", "air"].forEach((pref) => {
            const l = document.getElementById(pref + "-l");
            const w = document.getElementById(pref + "-w");
            const h = document.getElementById(pref + "-h");
            if (l) l.value = data.largoCm.toFixed(1);
            if (w) w.value = data.anchoCm.toFixed(1);
            if (h) h.value = data.altoCm.toFixed(1);
          });
        }

        document.getElementById("link-result-img").src = data.imagen || "";
        document.getElementById("link-result-img").style.display = data.imagen ? "block" : "none";
        document.getElementById("link-result-title").textContent = data.titulo || "Producto encontrado";

        const partes = [];
        partes.push(data.precio ? `Precio: ${data.moneda || "USD"} ${data.precio}` : "Precio: no detectado");
        partes.push(data.pesoEncontrado ? `Peso: ~${data.pesoKg.toFixed(2)}kg (revisar)` : "Peso: no detectado");
        partes.push(data.medidasEncontradas ? `Medidas: ~${data.largoCm.toFixed(0)}×${data.anchoCm.toFixed(0)}×${data.altoCm.toFixed(0)}cm (revisar)` : "Medidas: no detectadas");
        document.getElementById("link-result-price").textContent = partes.join(" · ") + ". Los datos auto-detectados pueden tener errores — revisalos antes de calcular. Solo falta que cargues la cantidad.";
        resultBox.classList.add("show");
      } catch (e) {
        errorBox.textContent = "⚠️ No se pudo conectar con el servicio de lectura de links. Cargá los datos a mano.";
        errorBox.classList.add("show");
      } finally {
        btn.disabled = false;
        btn.textContent = "Autocompletar";
      }
    });
  })();
} catch (e) { console.error("link autocompletar:", e); }

// ---------- Cotizador marítimo / aéreo ----------
// Tarifas cargadas desde rates.js (fuente única, compartida con admin.html).
// mejorEmpaque() y avisoLimiteRegimen() viven en js/cotizador-core.js (debe
// cargarse antes que este archivo) — compartidas con hub/cotizador.html para
// no duplicar la lógica de negocio del cálculo de flete.

try {
  (function () {
    const tabSea = document.getElementById("fc-tab-sea");
    const tabAir = document.getElementById("fc-tab-air");
    const panelSea = document.getElementById("fc-panel-sea");
    const panelAir = document.getElementById("fc-panel-air");
    if (!tabSea || !tabAir) return;

    esperarTarifasPara(document.getElementById("fc-calc-sea"), "Cargando tarifas…");
    esperarTarifasPara(document.getElementById("fc-calc-air"), "Cargando tarifas…");

    tabSea.addEventListener("click", () => {
      tabSea.classList.add("active"); tabAir.classList.remove("active");
      panelSea.style.display = "block"; panelAir.style.display = "none";
    });
    tabAir.addEventListener("click", () => {
      tabAir.classList.add("active"); tabSea.classList.remove("active");
      panelAir.style.display = "block"; panelSea.style.display = "none";
    });

    let origenSea = "china";
    let origenAir = "china";
    document.querySelectorAll("#fc-origin-sea .fc-origin-btn").forEach((b) => {
      b.addEventListener("click", () => {
        document.querySelectorAll("#fc-origin-sea .fc-origin-btn").forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
        origenSea = b.getAttribute("data-origin");
      });
    });
    document.querySelectorAll("#fc-origin-air .fc-origin-btn").forEach((b) => {
      b.addEventListener("click", () => {
        document.querySelectorAll("#fc-origin-air .fc-origin-btn").forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
        origenAir = b.getAttribute("data-origin");
      });
    });

    const pNum = (id) => {
      const el = document.getElementById(id);
      const n = parseFloat(String(el && el.value || "").trim().replace(",", "."));
      return isNaN(n) ? 0 : n;
    };
    const fmt = (n) => (n || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const origenLabel = (o) => (o === "miami" ? "🇺🇸 Miami" : "🇨🇳 China");

    document.getElementById("fc-calc-sea").addEventListener("click", () => {
      const l = pNum("sea-l"), w = pNum("sea-w"), h = pNum("sea-h");
      const qty = pNum("sea-qty") || 1;
      const pesoKg = pNum("sea-weight");
      const fob = pNum("sea-fob");
      const pl = pNum("sea-pl"), pw = pNum("sea-pw"), ph = pNum("sea-ph");
      const unidadesManual = pNum("sea-punits");

      // El peso ahora es obligatorio (antes no lo era): el flete marítimo se
      // cobra por kilo, no por m³ — sin peso no hay con qué calcular el costo.
      if (!l || !w || !h || !pesoKg) { alert("Cargá largo, ancho, alto y el peso de cada bulto."); return; }

      // Volumen del bulto: cm³ → m³ se divide por 1.000.000 (100cm × 100cm × 100cm = 1 m³)
      // El CBM se sigue mostrando como referencia (bultos, espacio que ocupa),
      // pero el flete que paga el cliente se cobra por KILO, no por m³ — la
      // tarifa pública sale del costo real del forwarder (Aerobox), que
      // cotiza así (ver js/rates.js: FLETE_CLIENTE, tarifaClientePorPeso).
      const cbmPorBulto = (l * w * h) / 1000000;
      const cbmTotal = cbmPorBulto * qty;
      const toneladas = pesoKg / 1000;
      const cbmCobrable = Math.max(cbmTotal, toneladas, CBM_MINIMO);
      const rate = tarifaClientePorPeso(FLETE_CLIENTE.maritimo, pesoKg);
      const costoFlete = pesoKg * rate;
      const total = costoFlete + fob;

      // Guarda el lead aunque el cliente no llegue a mandar el WhatsApp (no bloquea la UI).
      if (supabaseClient) {
        supabaseClient.from("cotizaciones").insert({
          origen: origenSea, modo: "maritimo", fob, peso: pesoKg, cbm: cbmCobrable, total_estimado: total,
        }).then(() => {}, () => {});
      }

      // Unidades por caja: si el usuario lo completó a mano, se respeta ese número.
      // Si no, se prueba cada orientación posible del producto dentro de la caja
      // (división entera eje por eje) y se toma la que más unidades permite.
      let unidadesPorCaja = 0;
      let empaque = null;
      if (unidadesManual > 0) {
        unidadesPorCaja = Math.floor(unidadesManual);
      } else if (pl > 0 && pw > 0 && ph > 0) {
        empaque = mejorEmpaque(l, w, h, pl, pw, ph);
        unidadesPorCaja = empaque ? empaque.total : 0;
      }
      const unidadesTotales = unidadesPorCaja * qty;

      const sinTarifa = !rate;
      let html = `
        <div class="fc-result-row math">${l}cm × ${w}cm × ${h}cm = ${(l*w*h).toLocaleString("es-AR")}cm³ ÷ 1.000.000 = ${cbmPorBulto.toFixed(3)} m³ por bulto</div>
        <div class="fc-result-row"><span>CBM real del envío (${qty} bulto${qty === 1 ? "" : "s"})</span><span class="v">${cbmTotal.toFixed(3)} m³</span></div>
        <div class="fc-result-row"><span>Equivalente en peso</span><span class="v">${toneladas.toFixed(3)} ton</span></div>
        <div class="fc-result-row"><span>Peso a cobrar</span><span class="v">${fmt(pesoKg)} kg</span></div>
        <div class="fc-result-row math">${fmt(pesoKg)} kg × $${fmt(rate)}/kg (${origenLabel(origenSea)}) = $${fmt(costoFlete)}</div>
        ${sinTarifa ? `<div class="fc-result-row warn">⚠️ Tarifa no configurada todavía para este origen</div>` : ""}
        ${avisoLimiteRegimen(pesoKg, fob, unidadesTotales)}
        <div class="fc-result-total"><span class="lbl">Total estimado (flete + FOB)</span><span class="val">$${fmt(total)}</span></div>
      `;

      if (unidadesTotales > 0) {
        html += `<div class="fc-subtitle" style="margin-top:18px;">Costo por producto</div>`;
        if (empaque) {
          html += `
          <div class="fc-result-row math">${empaque.lados[0]}cm ÷ ${empaque.medidas[0]}cm = ${empaque.conteos[0]} &nbsp;|&nbsp; ${empaque.lados[1]}cm ÷ ${empaque.medidas[1]}cm = ${empaque.conteos[1]} &nbsp;|&nbsp; ${empaque.lados[2]}cm ÷ ${empaque.medidas[2]}cm = ${empaque.conteos[2]}</div>
          <div class="fc-result-row math">${empaque.conteos[0]} × ${empaque.conteos[1]} × ${empaque.conteos[2]} = ${empaque.total} unidades por caja (mejor orientación)</div>
          `;
        }
        html += `
        <div class="fc-result-row"><span>Unidades por caja${unidadesManual > 0 ? "" : " (estimado)"}</span><span class="v">${unidadesPorCaja}</span></div>
        <div class="fc-result-row"><span>Unidades totales (${qty} caja${qty === 1 ? "" : "s"})</span><span class="v">${unidadesTotales}</span></div>
        <div class="fc-result-total"><span class="lbl">Flete + FOB por unidad</span><span class="val">$${fmt(total / unidadesTotales)}</span></div>
        `;
      } else if (pl > 0 && pw > 0 && ph > 0) {
        html += `<div class="fc-result-row warn">⚠️ El producto no entra en la caja con esas medidas — revisá los datos.</div>`;
      }

      document.getElementById("fc-result-sea").innerHTML = html;
      document.getElementById("fc-result-sea").classList.add("show");
    });

    document.getElementById("fc-calc-air").addEventListener("click", () => {
      const l = pNum("air-l"), w = pNum("air-w"), h = pNum("air-h");
      const qty = pNum("air-qty") || 1;
      const pesoReal = pNum("air-weight");
      const fob = pNum("air-fob");
      const pl = pNum("air-pl"), pw = pNum("air-pw"), ph = pNum("air-ph");
      const unidadesManual = pNum("air-punits");

      if (!pesoReal && (!l || !w || !h)) { alert("Cargá el peso real o las dimensiones del bulto."); return; }

      const pesoVolPorBulto = (l * w * h) / DIVISOR_VOLUMETRICO_AEREO;
      const pesoVolTotal = pesoVolPorBulto * qty;
      const pesoCobrable = Math.max(pesoReal, pesoVolTotal);
      const rate = tarifaClientePorPeso(FLETE_CLIENTE.aereo, pesoCobrable);
      const costoFlete = pesoCobrable * rate;
      const total = costoFlete + fob;

      if (supabaseClient) {
        supabaseClient.from("cotizaciones").insert({
          origen: origenAir, modo: "aereo", fob, peso: pesoCobrable, total_estimado: total,
        }).then(() => {}, () => {});
      }

      // Mismo criterio que en marítimo: si el usuario carga las medidas del
      // producto, probamos cada orientación posible dentro del bulto y nos
      // quedamos con la que más unidades permite (ver mejorEmpaque arriba).
      let unidadesPorCaja = 0;
      let empaque = null;
      if (unidadesManual > 0) {
        unidadesPorCaja = Math.floor(unidadesManual);
      } else if (pl > 0 && pw > 0 && ph > 0) {
        empaque = mejorEmpaque(l, w, h, pl, pw, ph);
        unidadesPorCaja = empaque ? empaque.total : 0;
      }
      const unidadesTotales = unidadesPorCaja * qty;

      const sinTarifa = !rate;
      let html = `
        <div class="fc-result-row"><span>Peso real</span><span class="v">${pesoReal.toFixed(2)} kg</span></div>
        <div class="fc-result-row"><span>Peso volumétrico</span><span class="v">${pesoVolTotal.toFixed(2)} kg</span></div>
        <div class="fc-result-row"><span>Peso a cobrar (el mayor)</span><span class="v">${pesoCobrable.toFixed(2)} kg</span></div>
        <div class="fc-result-row"><span>Tarifa (${origenLabel(origenAir)})</span><span class="v">$${fmt(rate)} / kg</span></div>
        ${sinTarifa ? `<div class="fc-result-row warn">⚠️ Tarifa no configurada todavía para este origen</div>` : ""}
        ${avisoLimiteRegimen(pesoCobrable, fob, qty)}
        <div class="fc-result-total"><span class="lbl">Total estimado (flete + FOB)</span><span class="val">$${fmt(total)}</span></div>
      `;

      if (unidadesTotales > 0) {
        html += `<div class="fc-subtitle" style="margin-top:18px;">Costo por producto</div>`;
        if (empaque) {
          html += `
          <div class="fc-result-row math">${empaque.lados[0]}cm ÷ ${empaque.medidas[0]}cm = ${empaque.conteos[0]} &nbsp;|&nbsp; ${empaque.lados[1]}cm ÷ ${empaque.medidas[1]}cm = ${empaque.conteos[1]} &nbsp;|&nbsp; ${empaque.lados[2]}cm ÷ ${empaque.medidas[2]}cm = ${empaque.conteos[2]}</div>
          <div class="fc-result-row math">${empaque.conteos[0]} × ${empaque.conteos[1]} × ${empaque.conteos[2]} = ${empaque.total} unidades por caja (mejor orientación)</div>
          `;
        }
        html += `
        <div class="fc-result-row"><span>Unidades por caja${unidadesManual > 0 ? "" : " (estimado)"}</span><span class="v">${unidadesPorCaja}</span></div>
        <div class="fc-result-row"><span>Unidades totales (${qty} caja${qty === 1 ? "" : "s"})</span><span class="v">${unidadesTotales}</span></div>
        <div class="fc-result-total"><span class="lbl">Flete + FOB por unidad</span><span class="val">$${fmt(total / unidadesTotales)}</span></div>
        `;
      } else if (pl > 0 && pw > 0 && ph > 0) {
        html += `<div class="fc-result-row warn">⚠️ El producto no entra en la caja con esas medidas — revisá los datos.</div>`;
      }

      document.getElementById("fc-result-air").innerHTML = html;
      document.getElementById("fc-result-air").classList.add("show");
    });
  })();
} catch (e) { console.error("cotizador marítimo/aéreo:", e); }
