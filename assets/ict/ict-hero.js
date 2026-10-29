// ICT cinematic hero: Creation of Adam hands, chrome TradingView logo spinning
// between the fingertips, trading places with a chrome ICT coin on every
// edge-on frame, back and forth forever. Sound is on by default and starts at
// the first allowed moment (browsers need one click/tap/key first).
//
// Needs an import map that resolves "three" and "three/addons/":
//   "three": "https://unpkg.com/three@0.160.0/build/three.module.js",
//   "three/addons/": "https://unpkg.com/three@0.160.0/examples/jsm/"
//
// Usage: import { mountIctHero } from './assets/ict/ict-hero.js';
//        const hero = mountIctHero(document.querySelector('#ict-hero'));
//        hero.destroy();   // optional teardown
// Options: { freezeAt: seconds }  renders one fixed frame of the cycle (testing).
//          { onFrame(info) }      called after every rendered frame (testing).
//
// Robustness: the spin is integrated (angle += OMEGA * speed * dt) and the TV/coin
// swap is derived from that angle, so speed changes bend the motion but can never
// make it jump, and every swap lands on an edge-on frame. The sound runs on its own
// clock; the spin is only nudged a few percent toward it, never snapped. A lost
// WebGL context shows a still and rebuilds the scene when the browser restores it.
//
// Scroll: over the first SCROLL_RANGE of the hero's height the hands drift apart
// (CSS, via --ict-scroll), the logo shrinks and fades a little, and scrolling gives
// the spin a small, eased kick that settles back to cruise speed.

import * as THREE from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';

const BASE = new URL('./', import.meta.url).href;

// ---- timeline (seconds) ---------------------------------------------------
const CYCLE = 10; // matches sound.mp3
const TURN = 2.5; // seconds per revolution at cruise speed
const OMEGA = (Math.PI * 2) / TURN;
const FADE_IN = 0.55; // first appearance only, the loop itself never fades
const THIN = 0.22; // seconds (at cruise speed) either side of a swap where the TV thins to coin depth
// The angle starts edge-on at PHASE. Each logo shows for two full turns (SEG), the TV
// first, then the coin, so both swaps and the loop wrap happen on edge-on frames.
const PHASE = Math.PI / 2;
const SEG = Math.PI * 4; // two full turns per logo (5 s at cruise speed)
const LOOP = SEG * 2; // TV + coin: one CYCLE at cruise speed
const THIN_A = THIN * OMEGA; // the same thinning window, in radians

// ---- scroll reaction --------------------------------------------------------
const SCROLL_RANGE = 0.7; // effect runs over the first 70% of the hero's height
const SCROLL_EASE = 7; // 1/s: eased progress follows the page with a soft lag
const SPIN_EASE = 6; // 1/s: spin speed follows its target
const SPIN_GAIN = 0.45; // extra speed per unit of eased progress per second
const SPIN_MAX = 0.5; // the scroll kick never adds more than 50%
const SCROLL_SCALE = 0.14; // logo shrinks by 14% at full progress
const SCROLL_FADE = 0.4; // and fades by 40%

// ---- sound sync -------------------------------------------------------------
// sound.mp3 is ~10.008 s, not exactly CYCLE: never snap to it, only nudge the speed.
const NUDGE_GAIN = 0.8; // speed change per cycle of phase error
const NUDGE_MAX = 0.04; // at most 4%

// ---- layout (band = the 2000x655 hands image) ------------------------------
// The canvas covers band x 30%..71%, full height. 1 world unit = 1 / 0.010545 band px,
// so the TV logo (464 source px) spans ~440 band px of the 548 px gap.
const VIEW_H = 6.91; // world units visible vertically at z = 0
const FOV = 20;
const CAM_Z = VIEW_H / 2 / Math.tan(THREE.MathUtils.degToRad(FOV / 2));
const CENTER_Y = (0.5 - 0.48) * VIEW_H; // fingertip line sits at 48% of band height

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const easeOutCubic = (x) => 1 - Math.pow(1 - clamp01(x), 3);

// ---- geometry --------------------------------------------------------------
// Shape traced from tv-logo-raw.png (source px, y down), centred at (272, 179.5).
function buildTvGeometry() {
  const p = (x, y) => new THREE.Vector2((x - 272) * 0.01, -(y - 179.5) * 0.01);
  const T = new THREE.Shape([
    p(40, 52), p(40, 160), p(138, 160), p(138, 307), p(246, 307), p(246, 52),
  ]);
  const dot = new THREE.Shape();
  const c = p(304, 100);
  dot.absarc(c.x, c.y, 0.5, 0, Math.PI * 2, false);
  const slash = new THREE.Shape([p(382, 52), p(284, 307), p(406, 307), p(504, 52)]);

  const depth = 0.6;
  const bevel = 0.075;
  let geo = new THREE.ExtrudeGeometry([T, dot, slash], {
    depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: 0.045,
    bevelOffset: -0.045, // keep the outer silhouette on the traced outline
    bevelSegments: 7,
    curveSegments: 96,
  });
  geo.translate(0, 0, -depth / 2);
  geo = toCreasedNormals(geo, Math.PI / 5); // smooth bevels, crisp 90° corners
  return geo;
}

const COIN_R = 1.32;
const COIN_HZ = 0.13; // half thickness
const FACE_R = 1.17;

function buildCoinRimGeometry() {
  const pts = [];
  const lipTop = COIN_HZ + 0.055;
  const rr = 0.07; // corner radius
  const half = [];
  half.push([FACE_R, COIN_HZ - 0.004]);
  half.push([FACE_R + 0.012, COIN_HZ + 0.03]);
  half.push([FACE_R + 0.035, lipTop - 0.004]);
  half.push([FACE_R + 0.06, lipTop]);
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI / 2 - (i / 10) * (Math.PI / 2);
    half.push([COIN_R - rr + rr * Math.cos(a), lipTop - rr + rr * Math.sin(a)]);
  }
  // profile runs back face edge -> back lip -> side wall -> front lip -> front face edge,
  // i.e. bottom -> top along the outer wall, so lathe normals face outward
  for (let i = 0; i < half.length; i++) pts.push(new THREE.Vector2(half[i][0], -half[i][1]));
  for (let i = half.length - 1; i >= 0; i--) pts.push(new THREE.Vector2(half[i][0], half[i][1]));
  const geo = new THREE.LatheGeometry(pts, 160);
  geo.rotateX(Math.PI / 2); // lathe axis Y -> Z, +Y (front) -> +Z
  return geo;
}

// ---- studio environment ----------------------------------------------------
// A near-black studio with a few hot softboxes, so the chrome reads with real
// contrast: bright faces, dark falloff, crisp highlights on the bevels.
function buildStudioScene() {
  const s = new THREE.Scene();
  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(30, 48, 24),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0.018, 0.018, 0.02), side: THREE.BackSide }),
  );
  s.add(shell);
  const panel = (w, h, pos, intensity) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(intensity, intensity, intensity), side: THREE.DoubleSide }),
    );
    m.position.set(...pos);
    m.lookAt(0, 0, 0);
    s.add(m);
  };
  // wide soft wrap light behind the camera: faces read light silver at any angle
  for (let i = -2; i <= 2; i++) {
    const a = i * 0.42;
    panel(11, 15, [Math.sin(a) * 24, 4, Math.cos(a) * 24], 0.82 - Math.abs(i) * 0.08);
  }
  panel(34, 5, [0, 24, 4], 3.0); // overhead strip: hot top bevels
  panel(3.5, 26, [-23, 2, 4], 4.2); // left strip: running edge highlight
  panel(3.5, 22, [23, -2, 0], 2.6); // right strip
  panel(18, 10, [0, 2, -24], 0.55); // dim back fill
  return {
    scene: s,
    dispose: () => s.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); }),
  };
}

// ---- textures --------------------------------------------------------------
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// fractal-circle.png: circle centre (476, 446), radius ~400, white outside.
function buildFractalMaps(img, anisotropy) {
  const N = 1024;
  const cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#000';
  g.fillRect(0, 0, N, N);
  g.save();
  g.beginPath();
  g.arc(N / 2, N / 2, N / 2 - 2, 0, Math.PI * 2);
  g.clip();
  g.drawImage(img, 476 - 398, 446 - 398, 796, 796, 0, 0, N, N);
  g.restore();
  const src = g.getImageData(0, 0, N, N).data;

  const mk = () => new ImageData(N, N);
  const col = mk();
  const rough = mk();
  const bump = mk();
  for (let i = 0; i < src.length; i += 4) {
    const l = smooth(0.3, 0.7, (src[i] * 0.299 + src[i + 1] * 0.587 + src[i + 2] * 0.114) / 255);
    const c = 52 + l * (250 - 52); // dark polished metal -> bright chrome
    col.data[i] = c;
    col.data[i + 1] = c;
    col.data[i + 2] = c * 1.01;
    col.data[i + 3] = 255;
    const r = (0.3 - l * 0.22) * 255; // black areas a touch satin
    rough.data[i] = rough.data[i + 1] = rough.data[i + 2] = r;
    rough.data[i + 3] = 255;
    bump.data[i] = bump.data[i + 1] = bump.data[i + 2] = l * 255;
    bump.data[i + 3] = 255;
  }
  const toTex = (data, srgb) => {
    const c2 = document.createElement('canvas');
    c2.width = c2.height = N;
    c2.getContext('2d').putImageData(data, 0, 0);
    const t = new THREE.CanvasTexture(c2);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = anisotropy;
    return t;
  };
  return { map: toTex(col, true), roughnessMap: toTex(rough, false), bumpMap: toTex(bump, false) };
}

// ---- DOM -------------------------------------------------------------------
function buildDom(el) {
  el.classList.add('ict-hero');
  el.innerHTML = `
    <div class="ict-hero__band" role="img"
      aria-label="Michelangelo's Creation of Adam hands with a spinning chrome TradingView logo between the fingertips that turns into the ICT inner circle coin">
      <img class="ict-hero__hands ict-hero__hands--l" src="${BASE}hands-band-clean.png" width="2000" height="655" alt="" decoding="async" fetchpriority="high">
      <img class="ict-hero__hands ict-hero__hands--r" src="${BASE}hands-band-clean.png" width="2000" height="655" alt="" decoding="async" aria-hidden="true">
      <div class="ict-hero__halo" aria-hidden="true"></div>
      <canvas class="ict-hero__canvas" aria-hidden="true"></canvas>
    </div>
    <button class="ict-hero__sound" type="button" aria-pressed="false" aria-label="Turn sound on">
      <span class="ict-hero__eq" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
      <span class="ict-hero__sound-label">Sound on</span>
    </button>`;
  return {
    band: el.querySelector('.ict-hero__band'),
    hands: [...el.querySelectorAll('.ict-hero__hands')], // left and right copies of the band
    halo: el.querySelector('.ict-hero__halo'),
    canvas: el.querySelector('.ict-hero__canvas'),
    button: el.querySelector('.ict-hero__sound'),
    label: el.querySelector('.ict-hero__sound-label'),
  };
}

// ---- main ------------------------------------------------------------------
export function mountIctHero(el, opts = {}) {
  if (!el) throw new Error('mountIctHero: no element');
  const dom = buildDom(el);
  const freezeAt = Number.isFinite(opts.freezeAt) ? opts.freezeAt % CYCLE : null;
  const onFrame = typeof opts.onFrame === 'function' ? opts.onFrame : null;
  const reducedMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reduced = reducedMQ.matches;

  // hands fade in once both copies are decoded so nothing pops
  let handsPending = dom.hands.length;
  const handsReady = () => {
    handsPending -= 1;
    if (handsPending <= 0) el.classList.add('is-hands-ready');
  };
  dom.hands.forEach((img) => {
    if (img.complete && img.naturalWidth) handsReady();
    else img.addEventListener('load', handsReady, { once: true });
  });

  // ---- renderer ----
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas: dom.canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    });
  } catch (err) {
    el.classList.add('is-fallback', 'is-ready');
    const img = document.createElement('img');
    img.className = 'ict-hero__fallback';
    img.src = `${BASE}tv-logo-raw.png`;
    img.alt = '';
    dom.band.appendChild(img);
    dom.canvas.remove();
    dom.button.remove(); // no renderer, so no sound loop to toggle
    return { destroy() { el.innerHTML = ''; } };
  }
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new THREE.Scene();
  // The environment lives in a GPU render target, so it is rebuilt after a context loss.
  let pmrem = null;
  let envTex = null;
  function buildEnvironment() {
    pmrem = new THREE.PMREMGenerator(renderer);
    const studio = buildStudioScene();
    envTex = pmrem.fromScene(studio.scene, 0.02).texture;
    studio.dispose();
    scene.environment = envTex;
  }
  buildEnvironment();

  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);
  camera.position.set(0, 0, CAM_Z);
  camera.lookAt(0, 0, 0);

  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(-4, 6, 8);
  const fill = new THREE.DirectionalLight(0xdfe6ff, 0.7);
  fill.position.set(6, -2, 4);
  scene.add(key, fill);

  const stage = new THREE.Group();
  stage.position.y = CENTER_Y;
  scene.add(stage);

  const chrome = new THREE.MeshPhysicalMaterial({
    color: 0xf1f2f4,
    metalness: 1,
    roughness: 0.13,
    envMapIntensity: 1.05,
  });
  const tvGeo = buildTvGeometry();
  const tv = new THREE.Mesh(tvGeo, chrome);
  stage.add(tv);

  const coin = new THREE.Group();
  const rimGeo = buildCoinRimGeometry();
  const rimMat = new THREE.MeshPhysicalMaterial({
    color: 0xf3f4f6,
    metalness: 1,
    roughness: 0.1,
    envMapIntensity: 1.2,
  });
  coin.add(new THREE.Mesh(rimGeo, rimMat));
  const faceGeo = new THREE.CircleGeometry(FACE_R + 0.02, 160);
  const faceMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 1,
    roughness: 0.2,
    envMapIntensity: 1.5,
  });
  const front = new THREE.Mesh(faceGeo, faceMat);
  front.position.z = COIN_HZ;
  const back = new THREE.Mesh(faceGeo, faceMat);
  back.position.z = -COIN_HZ;
  back.rotation.y = Math.PI;
  coin.add(front, back);
  coin.visible = false;
  stage.add(coin);

  // ---- state ----
  let ready = false;
  let lost = false; // WebGL context lost (mobile Safari backgrounding, GPU reset)
  let raf = 0;
  let last = 0;
  let elapsed = 0; // total animated time, drives the one-off fade-in
  // The spin is integrated, never computed from a clock times a factor, so changing
  // the speed bends the motion but can't make the logo jump.
  let angle = freezeAt === null ? PHASE : PHASE + OMEGA * freezeAt;
  let speed = 1;
  let inView = true;
  let soundWanted = true; // on by default
  let blocked = false; // browser refused autoplay; retry on the first gesture
  let lastOpacity = -1;

  // scroll: the page sets scrollTarget, frames ease scrollEased toward it
  const scrollFx = freezeAt === null; // test frames stay deterministic
  let scrollTarget = 0;
  let scrollEased = 0;
  let scrollPainted = -1;
  let scrollRaf = 0;
  let heroTop = 0;
  let heroH = 1;

  const audio = new Audio();
  audio.src = `${BASE}sound.mp3`;
  audio.loop = true;
  audio.preload = 'metadata'; // the mp3 loads when sound actually starts
  audio.addEventListener('error', () => { dom.button.hidden = true; });

  function resize() {
    const w = dom.canvas.clientWidth;
    const h = dom.canvas.clientHeight;
    if (!w || !h) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    measure();
    if (!raf) render();
  }

  // Which logo shows, how thin the TV is and the gentle bob all derive from the
  // integrated angle, so every swap lands exactly on an edge-on frame whatever the
  // speed has been doing, and the loop is seamless forever.
  function pose() {
    const k = freezeAt === null ? easeOutCubic(elapsed / FADE_IN) : 1;
    const s = scrollFx ? smooth(0, 1, scrollEased) : 0;

    const a = angle - PHASE; // 0 on the first edge-on frame
    const seg = Math.floor(a / SEG);
    const showCoin = (seg & 1) === 1; // TV on even segments, coin on odd
    tv.visible = !showCoin;
    coin.visible = showCoin;
    if (!showCoin) {
      tv.rotation.y = angle;
      // thin the TV toward coin thickness near both edge-on swaps, so they're seamless
      const local = a - seg * SEG;
      const edge = Math.min(local, SEG - local); // radians to the nearest swap
      tv.scale.z = 1 - 0.5 * (1 - smooth(0, THIN_A, edge));
    } else {
      coin.rotation.y = angle;
    }

    stage.rotation.x = 0.06;
    stage.position.y = CENTER_Y + 0.035 * Math.sin(a / 2); // one bob per logo
    stage.scale.setScalar((0.94 + 0.06 * k) * (1 - SCROLL_SCALE * s));
    return { opacity: k * (1 - SCROLL_FADE * s) };
  }

  function staticPose() {
    tv.visible = true;
    coin.visible = false;
    tv.rotation.y = -0.5;
    tv.scale.z = 1;
    stage.rotation.x = 0.06;
    stage.position.y = CENTER_Y;
    stage.scale.setScalar(1);
    return { opacity: 1 };
  }

  function apply({ opacity }) {
    const o = Math.round(opacity * 1000) / 1000;
    if (o !== lastOpacity) {
      dom.canvas.style.opacity = o;
      dom.halo.style.opacity = o;
      lastOpacity = o;
    }
  }

  function render() {
    if (!ready || lost) return;
    const state = reduced ? staticPose() : pose();
    apply(state);
    renderer.render(scene, camera);
    if (onFrame) {
      onFrame({
        angle,
        speed,
        tv: tv.visible,
        coin: coin.visible,
        opacity: state.opacity,
        scale: stage.scale.x,
        scroll: scrollEased,
        gl: renderer.getContext(),
      });
    }
  }

  // position in the 10 s cycle (0..1) according to the spin
  function cyclePhase() {
    const p = (angle - PHASE) / LOOP;
    return p - Math.floor(p);
  }

  // While the sound plays, steer the speed a few percent toward its phase. No snaps.
  function audioNudge() {
    if (audio.paused || !soundWanted || blocked) return 0;
    const dur = audio.duration;
    if (!(dur > 0) || !Number.isFinite(dur)) return 0;
    let err = audio.currentTime / dur - cyclePhase();
    err -= Math.round(err); // shortest way round, -0.5..0.5 cycles
    return Math.max(-NUDGE_MAX, Math.min(NUDGE_MAX, err * NUDGE_GAIN));
  }

  function step(dt) {
    if (dt <= 0) return;
    let kick = 0;
    if (scrollFx) {
      const before = scrollEased;
      scrollEased += (scrollTarget - scrollEased) * (1 - Math.exp(-dt * SCROLL_EASE));
      if (Math.abs(scrollTarget - scrollEased) < 1e-4) scrollEased = scrollTarget;
      kick = Math.min(SPIN_MAX, (Math.abs(scrollEased - before) / dt) * SPIN_GAIN);
      paintScroll();
    }
    const target = (1 + kick) * (1 + audioNudge());
    speed += (target - speed) * (1 - Math.exp(-dt * SPIN_EASE));
    angle += OMEGA * speed * dt;
    if (angle - PHASE >= LOOP) angle -= LOOP; // whole cycles only: same pose, no drift in precision
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    // dt is clamped, and `last` is reset whenever the loop restarts (tab hidden,
    // hero offscreen, context restored), so resuming never jumps.
    const dt = last ? Math.min(Math.max((now - last) / 1000, 0), 0.1) : 0;
    last = now;
    elapsed += dt;
    step(dt);
    render();
  }

  function shouldRun() {
    return ready && !lost && inView && !document.hidden && !reduced && freezeAt === null;
  }

  // ---- scroll progress (rAF-throttled) ----
  function measure() {
    const r = el.getBoundingClientRect();
    heroTop = r.top + window.scrollY;
    heroH = r.height || 1;
  }

  function paintScroll() {
    const v = reduced || !scrollFx ? 0 : Math.round(smooth(0, 1, scrollEased) * 1e4) / 1e4;
    if (v !== scrollPainted) {
      el.style.setProperty('--ict-scroll', String(v));
      scrollPainted = v;
    }
  }

  function readScroll() {
    scrollRaf = 0;
    // a hero in the first screen starts reacting at once; a lower one when it scrolls in
    const start = Math.max(0, heroTop - window.innerHeight);
    scrollTarget = reduced ? 0 : clamp01((window.scrollY - start) / (heroH * SCROLL_RANGE));
    if (!raf) {
      // nothing is animating (loading, offscreen, reduced motion): follow directly
      scrollEased = scrollTarget;
      paintScroll();
    }
  }

  const onScroll = () => {
    if (!scrollRaf) scrollRaf = requestAnimationFrame(readScroll);
  };

  function update() {
    if (shouldRun()) {
      if (!raf) {
        last = 0;
        raf = requestAnimationFrame(frame);
      }
    } else if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
      render();
    }
    syncAudio();
  }

  function syncAudio() {
    const audible = soundWanted && !blocked && inView && !document.hidden;
    if (audible && audio.paused) {
      // start the sound at the spin's phase; after that the spin is only nudged toward it
      const seek = () => {
        try {
          if (!reduced && audio.duration > 0 && Number.isFinite(audio.duration)) {
            audio.currentTime = cyclePhase() * audio.duration;
          }
        } catch (_) { /* seeking before metadata in some browsers */ }
      };
      if (Number.isFinite(audio.duration || NaN)) seek();
      else if (!reduced) audio.addEventListener('loadedmetadata', seek, { once: true });
      audio.play().catch(() => {
        // autoplay refused: stay "on" and start at the first click / tap / key
        blocked = true;
        paintButton();
      });
    } else if (!audible && !audio.paused) {
      audio.pause();
    }
  }

  function paintButton() {
    const on = soundWanted && !blocked;
    dom.button.setAttribute('aria-pressed', String(on));
    dom.button.setAttribute('aria-label', on ? 'Turn sound off' : 'Turn sound on');
    dom.label.textContent = on ? 'Sound off' : 'Sound on';
    el.classList.toggle('is-sound-on', on);
  }

  function unblock() {
    blocked = false;
    paintButton();
    syncAudio();
  }

  function onToggle() {
    if (blocked) return unblock();
    soundWanted = !soundWanted;
    paintButton();
    syncAudio();
  }
  dom.button.addEventListener('click', onToggle);

  // Taps and clicks only: a Tab or screen-reader key press must not start the soundtrack.
  const GESTURES = ['pointerup', 'touchend', 'click'];
  const onGesture = (e) => {
    if (blocked && soundWanted && !dom.button.contains(e.target)) unblock();
  };
  GESTURES.forEach((type) => document.addEventListener(type, onGesture, { capture: true, passive: true }));
  paintButton();

  const ro = new ResizeObserver(resize);
  ro.observe(dom.canvas);

  const io = new IntersectionObserver((entries) => {
    inView = entries[entries.length - 1].isIntersecting;
    update();
  }, { threshold: 0 });
  io.observe(el);

  const onVis = () => update();
  document.addEventListener('visibilitychange', onVis);
  const onMotion = (e) => {
    reduced = e.matches;
    el.classList.toggle('is-reduced', reduced);
    speed = 1;
    readScroll();
    scrollEased = scrollTarget;
    paintScroll();
    update();
    render();
  };
  reducedMQ.addEventListener('change', onMotion);
  el.classList.toggle('is-reduced', reduced);

  const onWinResize = () => {
    measure();
    onScroll();
  };
  if (scrollFx) {
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onWinResize, { passive: true });
    measure();
    readScroll();
  }

  // ---- WebGL context loss ----
  // three.js already calls preventDefault (so the browser may restore the context) and
  // skips rendering while it's lost. Show a still meanwhile, rebuild the GPU-only
  // environment on restore, and stay on the still if it never comes back.
  let still = null;
  const onContextLost = (e) => {
    e.preventDefault();
    lost = true;
    if (!still) {
      still = document.createElement('img');
      still.className = 'ict-hero__fallback ict-hero__still';
      still.src = `${BASE}tv-logo-raw.png`;
      still.alt = '';
      dom.band.appendChild(still);
    }
    el.classList.add('is-context-lost');
    update();
  };
  const onContextRestored = () => {
    try {
      buildEnvironment();
      tv.visible = coin.visible = true;
      renderer.compile(scene, camera);
      lost = false;
      lastOpacity = -1;
      el.classList.remove('is-context-lost');
      still?.remove();
      still = null;
      resize();
    } catch (err) {
      lost = true; // keep the still
    }
    update();
  };
  dom.canvas.addEventListener('webglcontextlost', onContextLost);
  dom.canvas.addEventListener('webglcontextrestored', onContextRestored);

  // ---- async assets, warm-up, reveal ----
  let destroyed = false;
  loadImage(`${BASE}fractal-circle.png`)
    .then((img) => {
      if (destroyed) return;
      const maps = buildFractalMaps(img, renderer.capabilities.getMaxAnisotropy());
      Object.assign(faceMat, maps, { roughness: 1, bumpScale: 1.6 });
      faceMat.needsUpdate = true;
      for (const tex of Object.values(maps)) renderer.initTexture(tex);
    })
    .catch(() => { /* coin keeps plain chrome face */ })
    .finally(() => {
      if (destroyed) return;
      resize();
      // compile both objects up front so the swap never hitches
      tv.visible = coin.visible = true;
      if (!lost) renderer.compile(scene, camera); // a restore compiles again
      ready = true;
      render();
      el.classList.add('is-ready');
      update();
    });

  return {
    /** Eased scroll progress through the hero's first SCROLL_RANGE, 0..1. */
    get scrollProgress() {
      return scrollEased;
    },
    destroy() {
      destroyed = true;
      cancelAnimationFrame(raf);
      raf = 0;
      cancelAnimationFrame(scrollRaf);
      scrollRaf = 0;
      ro.disconnect();
      io.disconnect();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onWinResize);
      dom.canvas.removeEventListener('webglcontextlost', onContextLost);
      dom.canvas.removeEventListener('webglcontextrestored', onContextRestored);
      el.style.removeProperty('--ict-scroll');
      document.removeEventListener('visibilitychange', onVis);
      GESTURES.forEach((type) => document.removeEventListener(type, onGesture, { capture: true }));
      reducedMQ.removeEventListener('change', onMotion);
      audio.pause();
      audio.src = '';
      tvGeo.dispose();
      rimGeo.dispose();
      faceGeo.dispose();
      [chrome, rimMat, faceMat].forEach((m) => {
        ['map', 'roughnessMap', 'bumpMap'].forEach((k) => m[k]?.dispose?.());
        m.dispose();
      });
      envTex.dispose();
      pmrem.dispose();
      renderer.dispose();
      el.innerHTML = '';
      el.classList.remove('ict-hero', 'is-ready', 'is-hands-ready', 'is-sound-on', 'is-reduced', 'is-context-lost');
    },
  };
}
