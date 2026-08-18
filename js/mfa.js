// ---------- Jawa Logistic — 2FA (TOTP) obligatorio para cuentas de staff ----------
// Se llama desde mostrarSegunSesion() en admin.html / admin-hub.html /
// admin-tienda.html, justo después de confirmar que la cuenta es staff y
// ANTES de mostrar el panel — así ninguna de las 3 herramientas internas
// se puede ver sin pasar el segundo factor, aunque alguien tenga la
// contraseña. Usa la API nativa de Supabase Auth (auth.mfa.*): no hace
// falta ninguna tabla ni secret propio, Supabase guarda los factores TOTP
// por usuario. El modal se pinta con estilos inline a propósito — así se
// ve igual sin importar si la página host carga css/styles.css (admin.html)
// o css/hub.css (admin-hub.html, admin-tienda.html).

async function exigirMFA(supabaseClient) {
  const { data: nivel, error: errNivel } = await supabaseClient.auth.mfa.getAuthenticatorAssuranceLevel();
  if (errNivel) { console.error("MFA: no se pudo leer el nivel de verificación:", errNivel); return; }

  if (nivel.currentLevel === "aal2") return; // ya verificado en esta sesión

  if (nivel.nextLevel === "aal2") {
    await mostrarModalMFA(supabaseClient, "challenge");
  } else {
    await mostrarModalMFA(supabaseClient, "enroll");
  }
}

function mostrarModalMFA(supabaseClient, modo) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed; inset:0; background:rgba(15,20,35,0.72); z-index:99999; display:flex; align-items:center; justify-content:center; padding:20px; font-family:-apple-system,'Segoe UI',Roboto,sans-serif;";
    const card = document.createElement("div");
    card.style.cssText = "background:#fff; border-radius:14px; max-width:380px; width:100%; padding:26px 24px; box-shadow:0 30px 70px rgba(0,0,0,0.45);";
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    function render(html) { card.innerHTML = html; }
    function el(sel) { return card.querySelector(sel); }

    function cerrarSesionBtn() {
      return `<button id="mfa-cerrar-sesion" type="button" style="width:100%; background:none; border:none; color:#888; font-size:11.5px; margin-top:14px; cursor:pointer; font-family:inherit;">Cerrar sesión</button>`;
    }
    function bindCerrarSesion() {
      el("#mfa-cerrar-sesion").addEventListener("click", () => supabaseClient.auth.signOut());
    }

    async function iniciarEnroll() {
      render(`<p style="font-size:13px; color:#666; text-align:center;">Preparando verificación en dos pasos…</p>`);

      // Si quedó un factor sin terminar de verificar de un intento anterior
      // (ej: se cerró la pestaña antes de escanear el QR), Supabase rechaza
      // dar de alta uno nuevo con el mismo nombre — se limpia antes de pedir uno.
      const { data: previos } = await supabaseClient.auth.mfa.listFactors();
      const sinVerificar = ((previos && previos.all) || []).filter((f) => f.status !== "verified");
      for (const f of sinVerificar) {
        await supabaseClient.auth.mfa.unenroll({ factorId: f.id });
      }

      const { data, error } = await supabaseClient.auth.mfa.enroll({ factorType: "totp" });
      if (error) {
        render(`
          <p style="color:#b3261e; font-size:13px; text-align:center;">No se pudo iniciar el alta de 2FA: ${error.message}</p>
          <button id="mfa-reintentar" type="button" style="width:100%; margin-top:10px; background:#c9502e; color:#fff; border:none; border-radius:8px; padding:11px; font-size:13px; font-weight:800; cursor:pointer; font-family:inherit;">Reintentar</button>
          ${cerrarSesionBtn()}
        `);
        el("#mfa-reintentar").addEventListener("click", iniciarEnroll);
        bindCerrarSesion();
        return;
      }
      const factorId = data.id;
      render(`
        <div style="text-align:center; font-weight:800; font-size:15px; margin-bottom:4px; color:#16223d;">Activá la verificación en dos pasos</div>
        <p style="font-size:12.5px; color:#666; text-align:center; margin:0 0 16px;">Es obligatoria para cuentas de staff. Escaneá este código con Google Authenticator, Authy o similar.</p>
        <div style="display:flex; justify-content:center; margin-bottom:14px;"><img id="mfa-qr-img" width="200" height="200" alt="Código QR para activar 2FA" /></div>
        <p style="font-size:10px; color:#888; text-align:center; word-break:break-all; margin:0 0 14px;">¿No podés escanear? Cargá esta clave a mano: <b>${data.totp.secret}</b></p>
        <input id="mfa-codigo" type="text" inputmode="numeric" maxlength="6" placeholder="Código de 6 dígitos" style="width:100%; box-sizing:border-box; padding:11px 12px; border:1px solid #dde1e8; border-radius:8px; font-size:16px; text-align:center; letter-spacing:.25em; margin-bottom:10px; font-family:inherit;" />
        <button id="mfa-confirmar" type="button" style="width:100%; background:#c9502e; color:#fff; border:none; border-radius:8px; padding:11px; font-size:13px; font-weight:800; cursor:pointer; font-family:inherit;">Confirmar y activar</button>
        <div id="mfa-error" style="color:#b3261e; font-size:12px; margin-top:10px; text-align:center; min-height:14px;"></div>
        ${cerrarSesionBtn()}
      `);
      // Asignado como propiedad de JS, no interpolado en el HTML: el data
      // URI del QR trae comillas dobles adentro (es un <svg ...> con sus
      // propios atributos) que rompen el atributo src="" si se arma como
      // texto — así queda a prueba de eso.
      el("#mfa-qr-img").src = data.totp.qr_code;
      el("#mfa-codigo").focus();
      el("#mfa-confirmar").addEventListener("click", async () => {
        const codigo = el("#mfa-codigo").value.trim();
        if (!/^\d{6}$/.test(codigo)) { el("#mfa-error").textContent = "Ingresá los 6 dígitos."; return; }
        const { data: ch, error: errCh } = await supabaseClient.auth.mfa.challenge({ factorId });
        if (errCh) { el("#mfa-error").textContent = errCh.message; return; }
        const { error: errVer } = await supabaseClient.auth.mfa.verify({ factorId, challengeId: ch.id, code: codigo });
        if (errVer) { el("#mfa-error").textContent = "Código incorrecto. Probá de nuevo."; return; }
        document.body.removeChild(overlay);
        resolve();
      });
      bindCerrarSesion();
    }

    async function iniciarChallenge() {
      const { data: factores, error: errList } = await supabaseClient.auth.mfa.listFactors();
      const factor = (!errList && factores && factores.totp && factores.totp[0]) || null;
      if (!factor) { iniciarEnroll(); return; }
      render(`
        <div style="text-align:center; font-weight:800; font-size:15px; margin-bottom:4px; color:#16223d;">Verificación en dos pasos</div>
        <p style="font-size:12.5px; color:#666; text-align:center; margin:0 0 16px;">Ingresá el código de tu app autenticadora para entrar.</p>
        <input id="mfa-codigo" type="text" inputmode="numeric" maxlength="6" placeholder="Código de 6 dígitos" style="width:100%; box-sizing:border-box; padding:11px 12px; border:1px solid #dde1e8; border-radius:8px; font-size:16px; text-align:center; letter-spacing:.25em; margin-bottom:10px; font-family:inherit;" />
        <button id="mfa-confirmar" type="button" style="width:100%; background:#c9502e; color:#fff; border:none; border-radius:8px; padding:11px; font-size:13px; font-weight:800; cursor:pointer; font-family:inherit;">Verificar</button>
        <div id="mfa-error" style="color:#b3261e; font-size:12px; margin-top:10px; text-align:center; min-height:14px;"></div>
        ${cerrarSesionBtn()}
      `);
      el("#mfa-codigo").focus();
      el("#mfa-confirmar").addEventListener("click", verificar);
      el("#mfa-codigo").addEventListener("keydown", (e) => { if (e.key === "Enter") verificar(); });
      async function verificar() {
        const codigo = el("#mfa-codigo").value.trim();
        if (!/^\d{6}$/.test(codigo)) { el("#mfa-error").textContent = "Ingresá los 6 dígitos."; return; }
        const { data: ch, error: errCh } = await supabaseClient.auth.mfa.challenge({ factorId: factor.id });
        if (errCh) { el("#mfa-error").textContent = errCh.message; return; }
        const { error: errVer } = await supabaseClient.auth.mfa.verify({ factorId: factor.id, challengeId: ch.id, code: codigo });
        if (errVer) { el("#mfa-error").textContent = "Código incorrecto. Probá de nuevo."; return; }
        document.body.removeChild(overlay);
        resolve();
      }
      bindCerrarSesion();
    }

    if (modo === "enroll") iniciarEnroll(); else iniciarChallenge();
  });
}
