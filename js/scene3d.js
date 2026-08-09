// ---------- Fondo 3D: buque portacontenedores + avión de carga ----------
// Escena Three.js estilizada (no fotorrealista) fija detrás de toda la página,
// reactiva al scroll: el buque avanza y el avión gana altura a medida que el
// usuario recorre el sitio. Todo geometría procedural (cajas/cilindros/planos),
// sin modelos 3D externos que descargar.
//
// Igual que el resto del sitio: envuelto en try/catch y con salida silenciosa
// si WebGL no está disponible — nunca debe romper el resto de la página.
try {
  (function () {
    if (typeof THREE === "undefined") {
      console.error("Three.js no cargó — se omite el fondo 3D.");
      return;
    }
    const canvas = document.getElementById("scene3d-bg");
    if (!canvas) return;

    let gl;
    try {
      gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    } catch (e) {
      gl = null;
    }
    if (!gl) {
      console.error("WebGL no disponible — se omite el fondo 3D.");
      return;
    }

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // ---------- Paleta de marca (sin rojo) ----------
    const COL_NAVY = 0x16223d;
    const COL_NAVY_2 = 0x2c436f;
    const COL_GOLD = 0xd7b686;
    const COL_GOLD_DEEP = 0xa9885a;
    const COL_PAPER = 0xe9ecf3;
    const COL_SEA = 0x0e1830;

    // ---------- Escena, cámara, renderer ----------
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(COL_SEA, 22, 68);

    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
    camera.position.set(0, 5.2, 26);
    camera.lookAt(0, 2, 0);

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    function resize() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    resize();
    let resizeTimer;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(resize, 150);
    });

    // ---------- Luces ----------
    scene.add(new THREE.AmbientLight(0x9fb0d0, 0.65));
    const sun = new THREE.DirectionalLight(COL_GOLD, 1.1);
    sun.position.set(12, 18, 10);
    scene.add(sun);
    const rim = new THREE.DirectionalLight(COL_NAVY_2, 0.5);
    rim.position.set(-10, 6, -8);
    scene.add(rim);

    // ---------- Mar: plano con oleaje sutil (desplazamiento de vértices) ----------
    const seaGeo = new THREE.PlaneGeometry(140, 140, 48, 48);
    const seaMat = new THREE.MeshStandardMaterial({
      color: COL_SEA, metalness: 0.15, roughness: 0.75, flatShading: true,
    });
    const sea = new THREE.Mesh(seaGeo, seaMat);
    sea.rotation.x = -Math.PI / 2;
    sea.position.y = -0.4;
    scene.add(sea);
    const seaBasePositions = seaGeo.attributes.position.array.slice();

    // ---------- Buque portacontenedores (grupo procedural) ----------
    const ship = new THREE.Group();

    const hullMat = new THREE.MeshStandardMaterial({ color: COL_NAVY, flatShading: true, roughness: 0.6 });
    const hullShape = new THREE.Shape();
    hullShape.moveTo(-6.5, 0);
    hullShape.lineTo(6, 0);
    hullShape.lineTo(7.2, 0.9);
    hullShape.lineTo(6, 1.7);
    hullShape.lineTo(-6.5, 1.7);
    hullShape.lineTo(-7.4, 0.85);
    hullShape.closePath();
    const hullGeo = new THREE.ExtrudeGeometry(hullShape, { depth: 3.2, bevelEnabled: false });
    hullGeo.center();
    const hull = new THREE.Mesh(hullGeo, hullMat);
    hull.rotation.y = Math.PI / 2;
    ship.add(hull);

    const deckMat = new THREE.MeshStandardMaterial({ color: COL_NAVY_2, flatShading: true, roughness: 0.55 });
    const deckhouse = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.4, 2.6), deckMat);
    deckhouse.position.set(-5.6, 2.1, 0);
    ship.add(deckhouse);
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.7, 2), new THREE.MeshStandardMaterial({ color: COL_PAPER, flatShading: true }));
    bridge.position.set(-5.6, 3.6, 0);
    ship.add(bridge);

    const containerColors = [COL_GOLD, COL_GOLD_DEEP, COL_NAVY_2, COL_PAPER];
    const containerGeo = new THREE.BoxGeometry(1.15, 1, 2.1);
    let ci = 0;
    for (let row = 0; row < 3; row++) {
      for (let col = -4; col <= 3; col++) {
        const mat = new THREE.MeshStandardMaterial({
          color: containerColors[ci % containerColors.length],
          flatShading: true,
          roughness: 0.7,
        });
        ci++;
        const box = new THREE.Mesh(containerGeo, mat);
        box.position.set(col * 1.25, 1.35 + row * 1.05, 0);
        ship.add(box);
      }
    }

    ship.position.set(-2, 0.4, 2);
    ship.scale.setScalar(0.62);
    scene.add(ship);

    // ---------- Avión de carga (grupo procedural) ----------
    const plane = new THREE.Group();
    const planeMat = new THREE.MeshStandardMaterial({ color: COL_PAPER, flatShading: true, roughness: 0.45 });
    const planeAccentMat = new THREE.MeshStandardMaterial({ color: COL_GOLD, flatShading: true, roughness: 0.5 });

    const fuselage = new THREE.Mesh(new THREE.CapsuleGeometry(0.55, 4.2, 4, 8), planeMat);
    fuselage.rotation.z = Math.PI / 2;
    plane.add(fuselage);

    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.1, 8), planeMat);
    nose.rotation.z = -Math.PI / 2;
    nose.position.x = 2.9;
    plane.add(nose);

    const wing = new THREE.Mesh(new THREE.BoxGeometry(0.18, 5.6, 1.5), planeAccentMat);
    wing.position.set(-0.2, 0, 0);
    plane.add(wing);

    const tailFin = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.2, 0.9), planeAccentMat);
    tailFin.position.set(-2, 0.7, 0);
    plane.add(tailFin);
    const tailWing = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.8, 0.6), planeAccentMat);
    tailWing.position.set(-2, 0.15, 0);
    plane.add(tailWing);

    plane.scale.setScalar(0.8);
    plane.position.set(8, 8, -6);
    plane.rotation.y = -0.5;
    scene.add(plane);

    // ---------- Reacción al scroll ----------
    // scrollFrac: 0 al tope de la página, 1 al fondo. Mueve el buque en X (cruza
    // la escena de punta a punta) y hace ganar altura al avión — sensación de
    // "todo está en movimiento constante" ligada a cuánto recorriste la página.
    let scrollFrac = 0;
    function readScroll() {
      const doc = document.documentElement;
      const max = doc.scrollHeight - doc.clientHeight;
      scrollFrac = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
    }
    readScroll();
    let scrollTicking = false;
    window.addEventListener("scroll", () => {
      if (scrollTicking) return;
      scrollTicking = true;
      requestAnimationFrame(() => {
        readScroll();
        scrollTicking = false;
      });
    }, { passive: true });

    // ---------- Loop de animación ----------
    const clock = new THREE.Clock();
    function frame() {
      const t = clock.getElapsedTime();

      // Oleaje: desplaza cada vértice del mar con una onda dependiente de su posición.
      const pos = seaGeo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = seaBasePositions[i * 3];
        const y = seaBasePositions[i * 3 + 1];
        pos.setZ(i, Math.sin(x * 0.25 + t * 0.6) * 0.18 + Math.cos(y * 0.2 + t * 0.4) * 0.14);
      }
      pos.needsUpdate = true;

      // Buque: cruza la pantalla de izquierda a derecha según el scroll, con un
      // leve balanceo constante como si estuviera sobre el agua.
      ship.position.x = -16 + scrollFrac * 26 + Math.sin(t * 0.35) * 0.4;
      ship.rotation.z = Math.sin(t * 0.7) * 0.02;
      ship.rotation.x = Math.sin(t * 0.5) * 0.015;
      ship.position.y = 0.4 + Math.sin(t * 0.9) * 0.08;

      // Avión: gana altura y avanza a medida que se hace scroll, con leve deriva.
      plane.position.x = 8 - scrollFrac * 20 + Math.sin(t * 0.25) * 0.6;
      plane.position.y = 7.5 + scrollFrac * 3.5 + Math.sin(t * 0.6) * 0.25;
      plane.rotation.z = Math.sin(t * 0.4) * 0.05;

      renderer.render(scene, camera);
      if (!reduce) requestAnimationFrame(frame);
    }

    if (reduce) frame();
    else requestAnimationFrame(frame);
  })();
} catch (e) {
  console.error("fondo 3D:", e);
}
