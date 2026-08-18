// ---------- Jawa Logistic — mi-pedido.html: pedido multi-producto + flujo post-compra ----------
// Extraído de js/main.js cuando se sacó el wizard "Armá tu pedido" de la home
// (2026-08-17) para que index.html deje de competir con el registro al HUB.
// Esta página sigue viva para clientes que ya tienen un código de
// confirmación (se lo pasa el staff por WhatsApp) y necesitan desbloquear la
// dirección del depósito, cargar el tracking y avisar el pago — nada de esto
// requiere cuenta, es el mismo flujo de siempre, solo que ya no está en la home.
// Requiere que antes se haya cargado: js/rates.js → js/cotizador-core.js (usa
// avisoLimiteRegimen, definida ahí).

// ---------- Config editable por vos (Jawa Logistic) ----------
// Cambiá estos datos según tus depósitos consolidadores reales.
const TELEFONO_NOTIFICACION = "+54 9 381 331-2280"; // único número visible para el cliente, compartido por los dos orígenes

const DEPOSITOS = {
  china: {
    nombre: "Depósito Jawa Logistic — China",
    direccion: "广州市花都区狮岭镇新扬村第二工业区122号仓库，ARC办公室",
    codigoPostal: "510850",
    contacto: "Sr. Hong (红先生)",
    prefijoCliente: "ROD145",
    codigoConfirmacion: "ROD145", // mismo código que usás para etiquetar cajas en Alibaba
  },
  miami: {
    nombre: "Depósito Jawa Logistic — Miami",
    // ⚠️ Falta cargar la dirección real de tu depósito en Miami.
    direccion: "⚠️ PEGÁ ACÁ LA DIRECCIÓN REAL DEL DEPÓSITO EN MIAMI",
    codigoPostal: "⚠️ PENDIENTE",
    contacto: "⚠️ PENDIENTE",
    prefijoCliente: "ROD145-MIA",
    codigoConfirmacion: "ROD145MIA", // ⚠️ cambiá esto por el código que vayas a usar en Miami
  },
};

let origenPedido = "china";
function depositoActual() { return DEPOSITOS[origenPedido]; }

function generarCodigoCliente() {
  // Código único y fijo para todos los envíos — el mismo que usás con tu logística.
  return depositoActual().prefijoCliente;
}

try {
  (function () {

// ---------- Estado ----------
function uid() { return Math.random().toString(36).slice(2, 9); }
function nuevoProducto() {
  return { id: uid(), nombre: "", fob: "", peso: "", pesoUnidad: "g", cantidad: "" };
}
function parseNum(str) {
  if (typeof str !== "string") return parseFloat(str) || 0;
  const n = parseFloat(str.trim().replace(",", "."));
  return isNaN(n) ? 0 : n;
}
function fmt(n) {
  return (n || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

let productos = [nuevoProducto()];

function calcular(p) {
  const fob = parseNum(p.fob);
  const pesoRaw = parseNum(p.peso);
  const pesoKg = p.pesoUnidad === "kg" ? pesoRaw : pesoRaw / 1000;
  const cant = parseNum(p.cantidad);
  const fobTotal = fob * cant;
  const pesoTotalKg = pesoKg * cant;
  const rateAereo = tarifaClientePorPeso(FLETE_CLIENTE.aereo, pesoTotalKg);
  const fleteTotal = pesoTotalKg * rateAereo;
  const costoUnit = fob + pesoKg * rateAereo; // flete ya sumado, sin desglosar
  return { ...p, fob, pesoKg, cant, costoUnit, costoTotal: costoUnit * cant, fobTotal, pesoTotalKg, fleteTotal };
}

function getCalculados() { return productos.map(calcular); }
function getTotales() {
  return getCalculados().reduce((acc, p) => ({
    items: acc.items + (p.nombre && p.cant > 0 ? 1 : 0),
    unidades: acc.unidades + p.cant,
    total: acc.total + p.costoTotal,
    pesoTotalKg: acc.pesoTotalKg + p.pesoTotalKg,
    fobTotal: acc.fobTotal + p.fobTotal,
    fleteTotal: acc.fleteTotal + p.fleteTotal,
  }), { items: 0, unidades: 0, total: 0, pesoTotalKg: 0, fobTotal: 0, fleteTotal: 0 });
}

// ---------- Render ----------
function render() {
  const cont = document.getElementById("productos-container");
  cont.innerHTML = "";
  const calc = getCalculados();

  productos.forEach((p, i) => {
    const c = calc[i];
    const div = document.createElement("div");
    div.className = "prod-card";
    div.innerHTML = `
      <div class="prod-row1">
        <input type="text" placeholder="Ej: auriculares bluetooth" data-field="nombre" data-id="${p.id}" value="${p.nombre.replace(/"/g,'&quot;')}" />
        <button class="del-btn" data-del="${p.id}">✕</button>
      </div>
      <div class="field-grid">
        <div class="field">
          <label>FOB unitario (USD)</label>
          <input type="text" inputmode="decimal" placeholder="0.00" data-field="fob" data-id="${p.id}" value="${p.fob}" />
        </div>
        <div class="field">
          <label>Peso</label>
          <div class="peso-row">
            <input type="text" inputmode="decimal" placeholder="0" data-field="peso" data-id="${p.id}" value="${p.peso}" />
            <select data-field="pesoUnidad" data-id="${p.id}">
              <option value="g" ${p.pesoUnidad==="g"?"selected":""}>g</option>
              <option value="kg" ${p.pesoUnidad==="kg"?"selected":""}>kg</option>
            </select>
          </div>
        </div>
        <div class="field">
          <label>Cantidad</label>
          <input type="text" inputmode="decimal" placeholder="0" data-field="cantidad" data-id="${p.id}" value="${p.cantidad}" />
        </div>
      </div>
      <div class="results" style="margin-bottom:6px;">
        <span class="lbl">Costo unitario (producto + envío)</span>
        <span class="val">$${fmt(c.costoUnit)} / u.</span>
      </div>
      <div class="results" style="margin-bottom:6px;">
        <span class="lbl">Pagás a tu proveedor (${p.fob || 0} × ${c.cant || 0} u.)</span>
        <span class="val">$${fmt(c.fobTotal)}</span>
      </div>
      <div class="results">
        <span class="lbl">Total de carga (${fmt(c.pesoTotalKg)} kg — se abona cuando llega)</span>
        <span class="val">$${fmt(c.fleteTotal)}</span>
      </div>
    `;
    cont.appendChild(div);
  });

  const t = getTotales();
  document.getElementById("resumen-container").innerHTML = `
    <div class="resumen-row"><span>Productos cargados</span><span>${t.items}</span></div>
    <div class="resumen-row"><span>Unidades totales</span><span>${t.unidades}</span></div>
    <div class="resumen-row total"><span>Total del pedido</span><span class="val">$${fmt(t.total)}</span></div>
    ${avisoLimiteRegimen(t.pesoTotalKg, t.fobTotal, t.unidades)}
  `;
}

// ---------- Stepper visual ----------
function setStep(n) {
  const dots = document.querySelectorAll(".step-dot");
  const fill = document.getElementById("step-fill");
  dots.forEach((d) => {
    const step = parseInt(d.getAttribute("data-step"), 10);
    d.classList.remove("active", "done");
    if (step < n) d.classList.add("done");
    else if (step === n) d.classList.add("active");
  });
  if (fill) fill.style.width = ((n - 1) / (dots.length - 1)) * 88 + "%";
}

// ---------- Selector de origen del pedido ----------
document.querySelectorAll("#origen-pedido-options .fc-origin-btn").forEach((b) => {
  b.addEventListener("click", () => {
    document.querySelectorAll("#origen-pedido-options .fc-origin-btn").forEach((x) => x.classList.remove("active"));
    b.classList.add("active");
    origenPedido = b.getAttribute("data-origen");
    // Si ya estaba desbloqueado con el otro origen, hay que volver a confirmar con el código de este.
    if (desbloqueado) {
      desbloqueado = false;
      document.getElementById("confirmacion-gate").style.display = "block";
      document.getElementById("post-confirmacion").style.display = "none";
      document.getElementById("codigo-confirmacion").value = "";
      setStep(1);
    }
  });
});

// ---------- Gate de confirmación ----------
let desbloqueado = false;

function actualizarInfoConfirmada() {
  if (!desbloqueado) return;
  document.getElementById("direccion-texto").textContent = depositoActual().direccion;
  document.getElementById("cp-texto").textContent = depositoActual().codigoPostal;
  document.getElementById("id-cliente-texto").textContent = generarCodigoCliente();
}

document.getElementById("desbloquear-btn").addEventListener("click", () => {
  const valor = document.getElementById("codigo-confirmacion").value.trim();
  const error = document.getElementById("confirmacion-error");

  if (valor.toUpperCase() !== depositoActual().codigoConfirmacion.toUpperCase()) {
    error.style.display = "block";
    return;
  }

  error.style.display = "none";
  desbloqueado = true;
  document.getElementById("confirmacion-gate").style.display = "none";
  document.getElementById("post-confirmacion").style.display = "block";
  actualizarInfoConfirmada();
  renderDatosEnvio();
  setStep(2);

  // Aviso automático a Jawa Logistic: el cliente ya desbloqueó su código
  const cliNombre = document.getElementById("cli-nombre").value.trim();
  const cliApellido = document.getElementById("cli-apellido").value.trim();
  const cliTelefono = document.getElementById("cli-telefono").value.trim();
  const textoAviso = `✅ Cliente desbloqueó su código — Jawa Logistic
Nombre: ${cliNombre || "-"} ${cliApellido || ""}
Teléfono: ${cliTelefono || "-"}
Ya tiene la dirección y su ID (${generarCodigoCliente()}) para comprarle a su proveedor.`;
  const numero = TELEFONO_NOTIFICACION.replace(/[^\d]/g, "");
  const urlAviso = `https://wa.me/${numero}?text=${encodeURIComponent(textoAviso)}`;
  window.open(urlAviso, "_blank");
});

function renderDatosEnvio() {
  if (!desbloqueado) return;
  const tracking = document.getElementById("trigger-tracking").value.trim();
  const box = document.getElementById("datos-envio");
  box.style.display = tracking ? "block" : "none";
  setStep(tracking ? 3 : 2);
}

// ---------- Paso 2: aviso de envío ----------
function datosEnvioActuales() {
  const codigo = generarCodigoCliente();
  const nombre = document.getElementById("cli-nombre").value.trim();
  const apellido = document.getElementById("cli-apellido").value.trim();
  const peso = document.getElementById("envio-peso").value.trim();
  const tracking = document.getElementById("trigger-tracking").value.trim();
  const pesoNum = parseNum(peso);
  const total = pesoNum * tarifaClientePorPeso(FLETE_CLIENTE.aereo, pesoNum);
  return { codigo, nombre, apellido, peso, tracking, total };
}

document.getElementById("envio-peso").addEventListener("input", () => {
  const peso = parseNum(document.getElementById("envio-peso").value);
  const box = document.getElementById("total-a-pagar");
  const valor = document.getElementById("total-a-pagar-valor");
  if (peso > 0) {
    box.style.display = "flex";
    valor.textContent = `$${fmt(peso * tarifaClientePorPeso(FLETE_CLIENTE.aereo, peso))}`;
  } else {
    box.style.display = "none";
  }
});

function abrirWhatsappConAviso() {
  const d = datosEnvioActuales();
  if (!d.nombre) { alert("Completá tu nombre en \"Tus datos\" arriba antes de enviar el aviso."); return; }
  if (!d.peso || !d.tracking) { alert("Completá peso y tracking number antes de enviar el aviso."); return; }

  const texto = `Aviso de envío — Jawa Logistic
ID de cliente: ${d.codigo}
Nombre: ${d.nombre} ${d.apellido}
Peso del envío: ${d.peso} kg
Tracking number: ${d.tracking}
TOTAL A PAGAR: $${fmt(d.total)}
(adjunto foto del paquete acá mismo)

📌 Recordatorio: la carga se entrega en Argentina una vez confirmado el pago del total de arriba, con comprobante compartido.`;

  const numero = TELEFONO_NOTIFICACION.replace(/[^\d]/g, "");
  const url = `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
  window.open(url, "_blank");
  setStep(4);
}

document.getElementById("whatsapp-btn").addEventListener("click", abrirWhatsappConAviso);

document.getElementById("descargar-comprobante-btn").addEventListener("click", () => {
  const d = datosEnvioActuales();
  if (!d.codigo) { alert("Completá tu DNI arriba primero para generar tu ID de cliente."); return; }
  const fecha = new Date().toLocaleDateString("es-AR");
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Aviso de envío</title>
    <style>body{font-family:ui-monospace,Menlo,monospace;color:#111;padding:24px;}
    h1{font-size:18px;margin:0 0 2px;} p.sub{font-size:12px;color:#666;margin:0 0 18px;}
    .row{padding:6px 0;border-bottom:1px solid #eee;} .lbl{color:#666;font-size:11px;text-transform:uppercase;}
    .total{margin-top:14px;font-size:17px;font-weight:700;text-align:right;}
    @media print{ button{display:none;} }</style></head><body>
    <button onclick="window.print()" style="margin-bottom:16px;padding:8px 16px;font-size:13px;cursor:pointer;">Imprimir</button>
    <h1>Aviso de envío — Jawa Logistic</h1><p class="sub">${fecha}</p>
    <div class="row"><div class="lbl">ID de cliente</div><div>${d.codigo}</div></div>
    <div class="row"><div class="lbl">Nombre</div><div>${d.nombre} ${d.apellido}</div></div>
    <div class="row"><div class="lbl">Peso del envío</div><div>${d.peso} kg</div></div>
    <div class="row"><div class="lbl">Tracking number</div><div>${d.tracking}</div></div>
    <div class="total">Total a pagar: $${fmt(d.total)}</div>
    <div style="margin-top:10px; padding:10px; background:#f0f7f2; border-radius:6px; font-size:11.5px; color:#333;">📌 La carga se entrega en Argentina una vez confirmado el pago de este total, con comprobante compartido.</div>
    <div style="margin-top:14px; font-size:12px; color:#a05a00;">La foto del paquete se manda por separado, directo en el chat de WhatsApp.</div>
    </body></html>`;
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `aviso-envio-${d.codigo}.html`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
});

document.getElementById("trigger-tracking").addEventListener("input", renderDatosEnvio);

document.getElementById("productos-container").addEventListener("input", (e) => {
  const id = e.target.getAttribute("data-id");
  const field = e.target.getAttribute("data-field");
  if (!id || !field) return;
  const p = productos.find(x => x.id === id);
  if (!p) return;
  p[field] = e.target.value;
  render();
  const el = document.querySelector(`[data-id="${id}"][data-field="${field}"]`);
  if (el) { el.focus(); const v = el.value; if (el.setSelectionRange) el.setSelectionRange(v.length, v.length); }
});

document.getElementById("productos-container").addEventListener("change", (e) => {
  if (e.target.getAttribute("data-field") === "pesoUnidad") {
    const id = e.target.getAttribute("data-id");
    const p = productos.find(x => x.id === id);
    if (p) { p.pesoUnidad = e.target.value; render(); }
  }
});

document.getElementById("productos-container").addEventListener("click", (e) => {
  const delId = e.target.getAttribute("data-del");
  if (delId && productos.length > 1) {
    productos = productos.filter(p => p.id !== delId);
    render();
  }
});

document.getElementById("add-btn").addEventListener("click", () => {
  productos.push(nuevoProducto());
  render();
});

document.getElementById("whatsapp-pedido-btn").addEventListener("click", () => {
  const calc = getCalculados().filter(p => p.nombre && p.cant > 0);
  const t = getTotales();

  if (!calc.length) { alert("Cargá al menos un producto antes de enviar el pedido."); return; }

  const cliNombre = document.getElementById("cli-nombre").value.trim();
  const cliApellido = document.getElementById("cli-apellido").value.trim();
  const cliDni = document.getElementById("cli-dni").value.trim();
  const cliTelefono = document.getElementById("cli-telefono").value.trim();
  const codigoCliente = desbloqueado ? generarCodigoCliente() : null;

  const lineas = calc.map(p => `• ${p.nombre} — ${p.cant} u. — $${fmt(p.costoTotal)}`).join("\n");

  const texto = `Pedido — Jawa Logistic
${codigoCliente ? `ID de cliente: ${codigoCliente}\n` : ""}Nombre: ${cliNombre} ${cliApellido}
${cliTelefono ? `Teléfono: ${cliTelefono}\n` : ""}
Productos:
${lineas}

Unidades totales: ${t.unidades}
TOTAL DEL PEDIDO: $${fmt(t.total)}`;

  const numero = TELEFONO_NOTIFICACION.replace(/[^\d]/g, "");
  const url = `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
  window.open(url, "_blank");
});

document.getElementById("descargar-btn").addEventListener("click", () => {
  const calc = getCalculados().filter(p => p.nombre && p.cant > 0);
  const t = getTotales();
  const fecha = new Date().toLocaleDateString("es-AR");

  const cliNombre = document.getElementById("cli-nombre").value.trim();
  const cliApellido = document.getElementById("cli-apellido").value.trim();
  const cliDni = document.getElementById("cli-dni").value.trim();
  const cliTelefono = document.getElementById("cli-telefono").value.trim();
  const cliEmail = document.getElementById("cli-email").value.trim();
  const codigoCliente = desbloqueado ? generarCodigoCliente() : null;

  const datosClienteHtml = `
    <div style="margin-bottom:14px;padding:12px;background:#f5f5f5;border-radius:6px;font-size:13px;">
      <div style="font-weight:700;margin-bottom:6px;">Datos del cliente</div>
      <div>Nombre y apellido: ${cliNombre || "-"} ${cliApellido || ""}</div>
      <div>DNI: ${cliDni || "-"}</div>
      <div>Teléfono: ${cliTelefono || "-"}</div>
      <div>Email: ${cliEmail || "-"}</div>
    </div>
    ${codigoCliente ? `
    <div style="margin-bottom:18px;padding:12px;background:#fff4e0;border-radius:6px;font-size:13px;border:1px solid #e0a758;">
      <div style="font-weight:700;margin-bottom:6px;">Datos para el proveedor en China</div>
      <div><b>ID de cliente:</b> ${codigoCliente}</div>
      <div><b>Depósito:</b> ${depositoActual().nombre}</div>
      <div><b>Dirección:</b> ${depositoActual().direccion}</div>
      <div><b>Código postal:</b> ${depositoActual().codigoPostal}</div>
        <div style="margin-top:4px;color:#a05a00;">Incluir el ID ${codigoCliente} en el envío.</div>
    </div>` : `
    <div style="margin-bottom:18px;padding:10px;background:#f0f0f0;border-radius:6px;font-size:12px;color:#666;">
      Esta es una cotización tentativa. Los datos de envío al proveedor se comparten una vez confirmado el pedido.
    </div>`}
  `;

  const filasHtml = calc.map(p => `<tr>
      <td style="padding:7px 8px;border-bottom:1px solid #ddd;">${p.nombre}</td>
      <td style="text-align:right;padding:7px 8px;border-bottom:1px solid #ddd;">${p.cant}</td>
      <td style="text-align:right;padding:7px 8px;border-bottom:1px solid #ddd;">$${fmt(p.costoTotal)}</td>
    </tr>`).join("");
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Mi pedido</title>
    <style>body{font-family:ui-monospace,Menlo,monospace;color:#111;padding:24px;}
    h1{font-size:18px;margin:0 0 2px;} p.sub{font-size:12px;color:#666;margin:0 0 18px;}
    table{width:100%;border-collapse:collapse;font-size:13px;}
    th{text-align:left;padding:6px 8px;border-bottom:1px solid #999;font-size:11px;text-transform:uppercase;color:#555;}
    @media print{ button{display:none;} }</style></head><body>
    <button onclick="window.print()" style="margin-bottom:16px;padding:8px 16px;font-size:13px;cursor:pointer;">Imprimir</button>
    <h1>Mi pedido — Jawa Logistic</h1><p class="sub">${fecha}</p>
    ${datosClienteHtml}
    <table><thead><tr><th>Producto</th><th style="text-align:right;">Cant.</th><th style="text-align:right;">Total</th></tr></thead>
    <tbody>${filasHtml}</tbody></table>
    <div style="margin-top:16px;font-size:16px;font-weight:700;text-align:right;">Total del pedido: $${fmt(t.total)}</div>
    </body></html>`;
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "mi-pedido-jawa.html";
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
});

document.getElementById("anio-actual").textContent = new Date().getFullYear();

render();

  })();
} catch (e) { console.error("mi pedido:", e); }
