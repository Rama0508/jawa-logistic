// ---------- Fondo 3D: buque portacontenedores + avión de carga ----------
// Escena Three.js estilizada (no fotorrealista) fija detrás de toda la página,
// reactiva al scroll: el buque avanza y el avión gana altura a medida que el
// usuario recorre el sitio. Todo geometría procedural (cajas/cilindros/planos),
// sin modelos 3D externos que descargar.
//
// IMPORTANTE — por qué se ve grande y con contraste, no como una marca de agua:
// una primera versión de esto usaba cámara lejana, niebla agresiva y colores
// casi idénticos al fondo (navy sobre navy) — el resultado era casi invisible.
// Ahora la cámara está cerca, la niebla empieza mucho más lejos de los objetos,
// y el casco/contenedores usan tonos claros y dorados que contrastan fuerte
// contra el fondo oscuro — igual que un modelo 3D bien iluminado debe verse.
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

    // ---------- Paleta de marca (sin rojo) — tonos CLAROS para contraste ----------
    const COL_HULL = 0x4a6088;   // navy claro: contrasta contra el fondo oscuro, a diferencia del navy oscuro original
    const COL_DECK = 0x2c436f;
    const COL_GOLD = 0xe8c896;
    const COL_GOLD_DEEP = 0xc9a468;
    const COL_PAPER = 0xf3f5fa;
    const COL_BG = 0x0d1730;

    // ---------- Escena, cámara, renderer ----------
    const scene = new THREE.Scene();
    // Niebla lejos de los objetos a propósito: en la primera versión el barco
    // estaba casi a la distancia donde empezaba la niebla y se desvanecía.
    scene.fog = new THREE.Fog(COL_BG, 34, 70);

    const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 200);
    camera.position.set(0, 3.4, 15.5);
    camera.lookAt(0, 1.6, 0);

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

    // ---------- Luces: fuerte y cálida, como el "glow" dorado de referencia ----------
    scene.add(new THREE.AmbientLight(0xb7c4de, 0.75));
    const sun = new THREE.DirectionalLight(COL_GOLD, 2.1);
    sun.position.set(10, 16, 12);
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0x8fa8d6, 0.7);
    fill.position.set(-8, 5, 6);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(COL_GOLD, 0.9);
    rim.position.set(-6, 4, -10);
    scene.add(rim);

    // ---------- Mar: plano con oleaje sutil (desplazamiento de vértices) ----------
    const seaGeo = new THREE.PlaneGeometry(140, 140, 48, 48);
    const seaMat = new THREE.MeshStandardMaterial({
      color: 0x16264a, metalness: 0.2, roughness: 0.6, flatShading: true,
    });
    const sea = new THREE.Mesh(seaGeo, seaMat);
    sea.rotation.x = -Math.PI / 2;
    sea.position.y = -1.1;
    scene.add(sea);
    const seaBasePositions = seaGeo.attributes.position.array.slice();

    // ---------- Buque portacontenedores (grupo procedural) ----------
    const ship = new THREE.Group();

    const hullMat = new THREE.MeshStandardMaterial({ color: COL_HULL, flatShading: true, roughness: 0.5, metalness: 0.25 });
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
    // Sin rotación: el largo del casco (eje X) ya coincide con el eje sobre el
    // que se reparten los contenedores más abajo — rotarlo los desalinearía.
    const hull = new THREE.Mesh(hullGeo, hullMat);
    ship.add(hull);

    const deckMat = new THREE.MeshStandardMaterial({ color: COL_DECK, flatShading: true, roughness: 0.5 });
    const deckhouse = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.4, 2.6), deckMat);
    deckhouse.position.set(-5.6, 2.1, 0);
    ship.add(deckhouse);
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.7, 2), new THREE.MeshStandardMaterial({ color: COL_PAPER, flatShading: true }));
    bridge.position.set(-5.6, 3.6, 0);
    ship.add(bridge);

    const containerColors = [COL_GOLD, COL_PAPER, COL_GOLD_DEEP, COL_DECK];
    const containerGeo = new THREE.BoxGeometry(1.15, 1, 2.1);
    let ci = 0;
    for (let row = 0; row < 3; row++) {
      for (let col = -4; col <= 3; col++) {
        const mat = new THREE.MeshStandardMaterial({
          color: containerColors[ci % containerColors.length],
          flatShading: true,
          roughness: 0.6,
        });
        ci++;
        const box = new THREE.Mesh(containerGeo, mat);
        box.position.set(col * 1.25, 1.35 + row * 1.05, 0);
        ship.add(box);
      }
    }

    ship.scale.setScalar(1.05);
    scene.add(ship);

    // ---------- Avión de carga (grupo procedural) ----------
    const plane = new THREE.Group();
    const planeMat = new THREE.MeshStandardMaterial({ color: COL_PAPER, flatShading: true, roughness: 0.4, metalness: 0.1 });
    const planeAccentMat = new THREE.MeshStandardMaterial({ color: COL_GOLD, flatShading: true, roughness: 0.45 });

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

    plane.scale.setScalar(1.15);
    scene.add(plane);

    // ---------- Reacción al scroll ----------
    // scrollFrac: 0 al tope de la página, 1 al fondo. IMPORTANTE: los rangos de
    // movimiento son cortos a propósito y centrados en cámara — en la primera
    // versión el buque arrancaba fuera de pantalla (x=-16) y solo se veía
    // después de scrollear bastante. Ahora siempre está en cuadro, y el scroll
    // lo hace derivar de un lado al otro en vez de aparecer/desaparecer.
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

      // Buque: siempre visible, cerca del centro, con leve deriva por scroll y
      // balanceo constante como si estuviera sobre el agua.
      ship.position.x = -1.5 + scrollFrac * 3 + Math.sin(t * 0.3) * 0.5;
      ship.position.z = 1 + Math.sin(t * 0.22) * 0.3;
      // Un giro leve (no 90°) para ver de 3/4 y que se note el volumen del
      // casco y los contenedores, sin perder el perfil largo del buque.
      ship.rotation.y = 0.28 + Math.sin(t * 0.15) * 0.06;
      ship.rotation.z = Math.sin(t * 0.7) * 0.02;
      ship.rotation.x = Math.sin(t * 0.5) * 0.015;
      ship.position.y = -0.3 + Math.sin(t * 0.9) * 0.1;

      // Avión: siempre en cuadro arriba a la derecha, gana altura y deriva
      // según el scroll, con leve balanceo.
      plane.position.x = 4.5 - scrollFrac * 3 + Math.sin(t * 0.25) * 0.4;
      plane.position.y = 4.6 + scrollFrac * 1.2 + Math.sin(t * 0.6) * 0.2;
      plane.position.z = -3;
      plane.rotation.y = -0.5;
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
