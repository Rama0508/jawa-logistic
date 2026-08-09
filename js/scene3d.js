// ---------- Fondo 3D: buque portacontenedores + avión de carga (modelos reales) ----------
// Antes esto dibujaba el barco y el avión con geometría hecha a mano (cajas,
// cápsulas, conos) — el cliente los vio y pidió modelos que se reconozcan como
// un barco y un avión de verdad, no formas abstractas. Así que ahora carga dos
// modelos 3D reales (.glb), con licencia libre para uso comercial con atribución:
//
//   - Buque: "Container Ship" por Alex Safayan (Poly Pizza) — CC-BY 3.0
//     https://poly.pizza/m/3AmDGcCu6Ll
//   - Avión: "Airplane" por Poly by Google (Poly Pizza) — CC-BY
//     https://poly.pizza/m/8ciDd9k8wha
//   (atribución real en footer.html / créditos del sitio — ver index.html)
//
// El modelo del barco trae dos materiales rojos de fábrica (mat14, mat8) —
// se recolorean a la paleta de marca (nunca rojo, regla explícita del cliente)
// sin tocar la geometría real. El avión ya viene blanco/azul, sin rojo.
//
// Esto es un módulo ES (import real de Three.js + su loader de GLTF) en vez de
// scripts clásicos — los ejemplos de Three.js (loaders, etc.) solo se
// distribuyen como módulos en versiones modernas. Si el import de arriba
// falla (sin conexión, CDN caído), el módulo completo no corre — eso no
// afecta al resto del sitio porque main.js/rates.js son scripts aparte.
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";
import { GLTFLoader } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js";

try {
  (function () {
    const canvas = document.getElementById("scene3d-bg");
    if (!canvas) return;

    let gl;
    try {
      gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    } catch (e) {
      gl = null;
    }
    if (!gl) {
      console.error("WebGL no disponible — se omite el fondo 3D.");
      return;
    }

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // ---------- Paleta de marca (sin rojo) ----------
    const COL_GOLD = 0xe8c896;
    const COL_NAVY = 0x2c436f;
    const COL_BG = 0x0d1730;

    // ---------- Escena, cámara, renderer ----------
    const scene = new THREE.Scene();
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

    // ---------- Luces: fuerte y cálida ----------
    scene.add(new THREE.AmbientLight(0xb7c4de, 0.8));
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
    sea.position.y = -1.4;
    scene.add(sea);
    const seaBasePositions = seaGeo.attributes.position.array.slice();

    // ---------- Carga de modelos reales ----------
    // Normaliza cualquier modelo (venga en la escala/unidades que venga) a un
    // tamaño de mundo conocido, y lo centra en su propio pivote — así el resto
    // del código puede animar posición/rotación sin importar cómo vino el .glb.
    function normalizeAndCenter(object3d, targetSize) {
      const box = new THREE.Box3().setFromObject(object3d);
      const size = new THREE.Vector3();
      box.getSize(size);
      const center = new THREE.Vector3();
      box.getCenter(center);
      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      const scale = targetSize / maxDim;
      object3d.position.sub(center);
      const wrapper = new THREE.Group();
      wrapper.add(object3d);
      wrapper.scale.setScalar(scale);
      return wrapper;
    }

    // Recolorea los materiales rojos de fábrica del modelo del barco (regla de
    // marca: nunca rojo) sin tocar la geometría. Por nombre (los conocidos de
    // este modelo puntual) + un chequeo genérico de "es rojizo" por si Poly
    // Pizza actualiza el asset y cambian los nombres.
    const RED_MATERIAL_NAMES = { mat14: COL_GOLD, mat8: COL_NAVY };
    function debrandRed(object3d) {
      object3d.traverse((node) => {
        if (!node.isMesh || !node.material) return;
        const mats = Array.isArray(node.material) ? node.material : [node.material];
        mats.forEach((mat) => {
          if (!mat.color) return;
          if (RED_MATERIAL_NAMES[mat.name] != null) {
            mat.color.set(RED_MATERIAL_NAMES[mat.name]);
            return;
          }
          const c = mat.color;
          const isRedish = c.r > 0.5 && c.g < 0.35 && c.b < 0.35;
          if (isRedish) mat.color.set(COL_GOLD);
        });
      });
    }

    const loader = new GLTFLoader();
    let shipRig = null;
    let planeRig = null;

    loader.load(
      "models/ship.glb",
      (gltf) => {
        debrandRed(gltf.scene);
        shipRig = normalizeAndCenter(gltf.scene, 13);
        scene.add(shipRig);
      },
      undefined,
      (err) => console.error("No se pudo cargar el modelo 3D del buque:", err)
    );

    loader.load(
      "models/plane.glb",
      (gltf) => {
        planeRig = normalizeAndCenter(gltf.scene, 9);
        scene.add(planeRig);
      },
      undefined,
      (err) => console.error("No se pudo cargar el modelo 3D del avión:", err)
    );

    // ---------- Reacción al scroll ----------
    // scrollFrac: 0 al tope de la página, 1 al fondo. Rangos de movimiento
    // cortos y centrados en cámara a propósito — para que el buque y el avión
    // estén SIEMPRE en cuadro, y el scroll los haga derivar en vez de
    // aparecer/desaparecer.
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

      const pos = seaGeo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = seaBasePositions[i * 3];
        const y = seaBasePositions[i * 3 + 1];
        pos.setZ(i, Math.sin(x * 0.25 + t * 0.6) * 0.18 + Math.cos(y * 0.2 + t * 0.4) * 0.14);
      }
      pos.needsUpdate = true;

      if (shipRig) {
        shipRig.position.x = -1.5 + scrollFrac * 3 + Math.sin(t * 0.3) * 0.5;
        shipRig.position.z = 1 + Math.sin(t * 0.22) * 0.3;
        shipRig.rotation.y = 0.5 + Math.sin(t * 0.15) * 0.06;
        shipRig.rotation.z = Math.sin(t * 0.7) * 0.02;
        shipRig.rotation.x = Math.sin(t * 0.5) * 0.015;
        shipRig.position.y = -0.6 + Math.sin(t * 0.9) * 0.1;
      }

      if (planeRig) {
        planeRig.position.x = 4.5 - scrollFrac * 3 + Math.sin(t * 0.25) * 0.4;
        planeRig.position.y = 4.6 + scrollFrac * 1.2 + Math.sin(t * 0.6) * 0.2;
        planeRig.position.z = -3;
        planeRig.rotation.y = 2.4;
        planeRig.rotation.z = Math.sin(t * 0.4) * 0.05;
      }

      renderer.render(scene, camera);
      if (!reduce) requestAnimationFrame(frame);
    }

    if (reduce) frame();
    else requestAnimationFrame(frame);
  })();
} catch (e) {
  console.error("fondo 3D:", e);
}
