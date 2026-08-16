// ---------- Menú mobile ----------
try {
  (function () {
    const toggle = document.getElementById("nav-toggle");
    const links = document.getElementById("nav-links");
    if (!toggle || !links) return;
    toggle.addEventListener("click", () => {
      const open = links.classList.toggle("open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    links.querySelectorAll("a").forEach((a) => {
      a.addEventListener("click", () => {
        links.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
      });
    });
  })();
} catch (e) { console.error("menu mobile:", e); }

// ---------- Submenú "Conocenos" del nav (Nosotros, Cómo funciona, etc.) ----------
try {
  (function () {
    document.querySelectorAll(".nav-dropdown-toggle").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const dropdown = btn.closest(".nav-dropdown");
        const abierto = dropdown.classList.toggle("open");
        btn.setAttribute("aria-expanded", abierto ? "true" : "false");
      });
    });
    document.addEventListener("click", () => {
      document.querySelectorAll(".nav-dropdown.open").forEach((d) => {
        d.classList.remove("open");
        d.querySelector(".nav-dropdown-toggle").setAttribute("aria-expanded", "false");
      });
    });
  })();
} catch (e) { console.error("submenú nav:", e); }

// ---------- Botón flotante de WhatsApp ----------
try {
  (function () {
    var btn = document.getElementById("float-wa");
    var hero = document.getElementById("top");
    if (!btn || !hero) return;
    function check() {
      var show = window.scrollY > hero.offsetHeight * 0.6;
      btn.classList.toggle("show", show);
    }
    window.addEventListener("scroll", check, { passive: true });
    check();
  })();
} catch (e) { console.error("whatsapp flotante:", e); }

// ---------- Reveal on scroll ----------
try {
  (function () {
    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var items = document.querySelectorAll(".reveal");
    if (reduce || !("IntersectionObserver" in window)) {
      return; // .reveal ya es visible por defecto en el CSS
    }
    document.documentElement.classList.add("js-reveal-ready");
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15 });
    items.forEach(function (el) { io.observe(el); });
    // Red de seguridad: si algo falla y nunca se marca visible, mostrar igual a los 2.5s.
    setTimeout(function () {
      items.forEach(function (el) { el.classList.add("is-visible"); });
    }, 2500);
  })();
} catch (e) { console.error("reveal on scroll:", e); }

// ---------- Partículas flotantes del hero ----------
// Animación liviana (sin video, sin librerías): triangulitos que suben
// despacio sobre la foto de fondo, para que el hero no quede del todo
// estático. Se desactiva si el usuario prefiere menos movimiento.
try {
  (function () {
    const canvas = document.getElementById("hero-particles");
    const hero = document.getElementById("top");
    if (!canvas || !hero) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = canvas.getContext("2d");
    let w, h, dpr;
    let particulas = [];

    function crearParticulas() {
      const cantidad = Math.round((w * h) / 45000); // densidad ~ constante según el tamaño del hero
      particulas = Array.from({ length: Math.min(45, Math.max(14, cantidad)) }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: 4 + Math.random() * 7,
        velY: 0.15 + Math.random() * 0.3,
        velX: (Math.random() - 0.5) * 0.15,
        alpha: 0.08 + Math.random() * 0.16,
      }));
    }

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = hero.clientWidth;
      h = hero.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      crearParticulas();
    }

    function dibujarTriangulo(p) {
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - p.r);
      ctx.lineTo(p.x - p.r * 0.87, p.y + p.r * 0.5);
      ctx.lineTo(p.x + p.r * 0.87, p.y + p.r * 0.5);
      ctx.closePath();
      ctx.fillStyle = `rgba(215, 182, 134, ${p.alpha})`;
      ctx.fill();
    }

    function tick() {
      ctx.clearRect(0, 0, w, h);
      particulas.forEach((p) => {
        p.y -= p.velY;
        p.x += p.velX;
        if (p.y < -10) { p.y = h + 10; p.x = Math.random() * w; }
        dibujarTriangulo(p);
      });
      requestAnimationFrame(tick);
    }

    resize();
    window.addEventListener("resize", resize);
    requestAnimationFrame(tick);
  })();
} catch (e) { console.error("partículas del hero:", e); }

// ---------- Config oculta ----------
const FLETE_USD_KG = 80; // tarifa interna, no se muestra en ningún lado

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

// ---------- Cotizador rápido (hero) ----------
try {
  (function () {
    const btn = document.getElementById("qq-calcular");
    if (!btn) return;
    esperarTarifasPara(btn, "Cargando…");
    const parseNumQQ = (str) => {
      const n = parseFloat(String(str || "").trim().replace(",", "."));
      return isNaN(n) ? 0 : n;
    };
    const fmtQQ = (n) => (n || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    // Margen fijo de embalaje (caja, papeles, relleno) que se suma al peso
    // total estimado — no es exacto, solo para que la estimación de flete
    // no quede corta por no contar el packaging.
    const EMBALAJE_GRAMOS = 100;

    function pesoTotalEstimadoG() {
      const pesoRaw = parseNumQQ(document.getElementById("qq-peso").value);
      const unidad = document.getElementById("qq-peso-unidad").value;
      const cant = parseNumQQ(document.getElementById("qq-cantidad").value) || 1;
      const pesoUnitG = unidad === "kg" ? pesoRaw * 1000 : pesoRaw;
      if (!pesoUnitG) return 0;
      return pesoUnitG * cant + EMBALAJE_GRAMOS;
    }

    function actualizarPesoTotal() {
      const totalG = pesoTotalEstimadoG();
      const campo = document.getElementById("qq-peso-total");
      if (!totalG) { campo.value = "0 g"; return; }
      campo.value = totalG >= 1000
        ? (totalG / 1000).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " kg"
        : Math.round(totalG) + " g";
    }
    ["qq-peso", "qq-peso-unidad", "qq-cantidad"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener("input", actualizarPesoTotal);
    });
    actualizarPesoTotal();

    btn.addEventListener("click", () => {
      const nombre = document.getElementById("qq-nombre").value.trim();
      const fob = parseNumQQ(document.getElementById("qq-fob").value);
      const pesoRaw = parseNumQQ(document.getElementById("qq-peso").value);
      const unidad = document.getElementById("qq-peso-unidad").value;
      const cant = parseNumQQ(document.getElementById("qq-cantidad").value) || 1;

      if (!fob && !pesoRaw) {
        alert("Cargá al menos el precio FOB o el peso para calcular.");
        return;
      }

      const pesoTotalKg = pesoTotalEstimadoG() / 1000;
      const pagoProveedor = fob * cant;
      const pagoFlete = pesoTotalKg * FLETE_USD_KG;
      const total = pagoProveedor + pagoFlete;

      // Desglosado para que se entienda qué se le paga al proveedor y qué
      // es flete — dos pagos distintos, no un solo número sin explicar.
      document.getElementById("qq-result-proveedor-val").textContent = "U$" + fmtQQ(pagoProveedor);
      document.getElementById("qq-result-flete-val").textContent = "U$" + fmtQQ(pagoFlete);
      document.getElementById("qq-result-val").textContent = "U$" + fmtQQ(total);
      document.getElementById("qq-result").style.display = "flex";

      const texto = `Hola! Quiero cotizar un producto con Jawa Logistic:
${nombre ? `Producto: ${nombre}\n` : ""}FOB unitario: USD ${fmtQQ(fob)}
Peso por unidad: ${pesoRaw || 0} ${unidad}
Cantidad: ${cant}
Peso total estimado: ${document.getElementById("qq-peso-total").value}
Pagás a tu proveedor: U$${fmtQQ(pagoProveedor)}
Pagás de flete: U$${fmtQQ(pagoFlete)}
Total estimado: U$${fmtQQ(total)}`;
      const numero = TELEFONO_NOTIFICACION.replace(/[^\d]/g, "");
      document.getElementById("qq-wa-btn").href = `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
    });
  })();
} catch (e) { console.error("cotizador rápido:", e); }

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
  const costoUnit = fob + pesoKg * FLETE_USD_KG; // flete ya sumado, sin desglosar
  return { ...p, fob, pesoKg, cant, costoUnit, costoTotal: costoUnit * cant };
}

function getCalculados() { return productos.map(calcular); }
function getTotales() {
  return getCalculados().reduce((acc, p) => ({
    items: acc.items + (p.nombre && p.cant > 0 ? 1 : 0),
    unidades: acc.unidades + p.cant,
    total: acc.total + p.costoTotal,
    pesoTotalKg: acc.pesoTotalKg + p.pesoKg * p.cant,
    fobTotal: acc.fobTotal + p.fob * p.cant,
  }), { items: 0, unidades: 0, total: 0, pesoTotalKg: 0, fobTotal: 0 });
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
      <div class="results">
        <span class="lbl">Costo total puesto en Arg.</span>
        <span class="val">$${fmt(c.costoTotal)}</span>
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
try {
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
} catch (e) { console.error("selector de origen:", e); }

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
  return { codigo, nombre, apellido, peso, tracking };
}

function abrirWhatsappConAviso() {
  const d = datosEnvioActuales();
  if (!d.nombre) { alert("Completá tu nombre en \"Tus datos\" arriba antes de enviar el aviso."); return; }
  if (!d.peso || !d.tracking) { alert("Completá peso y tracking number antes de enviar el aviso."); return; }

  const texto = `Aviso de envío — Jawa Logistic
ID de cliente: ${d.codigo}
Nombre: ${d.nombre} ${d.apellido}
Peso del envío: ${d.peso} kg
Tracking number: ${d.tracking}
(adjunto foto del paquete acá mismo)`;

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
    @media print{ button{display:none;} }</style></head><body>
    <button onclick="window.print()" style="margin-bottom:16px;padding:8px 16px;font-size:13px;cursor:pointer;">Imprimir</button>
    <h1>Aviso de envío — Jawa Logistic</h1><p class="sub">${fecha}</p>
    <div class="row"><div class="lbl">ID de cliente</div><div>${d.codigo}</div></div>
    <div class="row"><div class="lbl">Nombre</div><div>${d.nombre} ${d.apellido}</div></div>
    <div class="row"><div class="lbl">Peso del envío</div><div>${d.peso} kg</div></div>
    <div class="row"><div class="lbl">Tracking number</div><div>${d.tracking}</div></div>
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

window.addEventListener("error", (e) => {
  console.error("Error en la calculadora:", e.message, e.filename, e.lineno);
});

render();
renderDatosEnvio();