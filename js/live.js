/* Живые гравюры: один WebGL рисует сцены, которые сейчас на экране, каждую — в свой холст поверх картинки сцены.
   Фон сдвигается по карте глубины, люди — отдельным слоем, вода течёт, ветер гнёт то, что белое на карте ветра,
   туман тянет по ущелью, по небу летят птицы. Камера, прокрутка и наезд — как были, в js/main.js (CSS-трансформы).
   Нет WebGL или просят меньше движения — остаётся обычная картинка. Слои — assets/live.js (data URL: по file://
   WebGL не берёт картинки с диска). */
(function () {
  "use strict";
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  var probe = document.createElement("canvas");
  if (!(probe.getContext("webgl") || probe.getContext("experimental-webgl"))) return;

  // что есть в кадре сверх слоёв: капли (откуда, x-разброс, длина падения в долях кадра), птицы (сколько, куда летят)
  var CFG = [
    // pool: чаша [центр x, y, полуоси] — по ней расходится рябь; drops с отрицательной длиной — брызги вверх от удара струи
    { birds: 3, dir: -1, pool: [0.66, 0.6, 0.1, 0.045], drops: [[0.655, 0.585, 0.06, -0.05], [0.655, 0.585, 0.035, -0.032]] },
    { birds: 2, dir: 1 },
    // капли из ладоней: немного, крупные слезинки, по линии нарисованных капель
    { drops: [[0.674, 0.4, 0.012, 0.24], [0.68, 0.4, 0.008, 0.24]], dropN: 7, dropSize: [9, 5] },
    { birds: 3, dir: -1 },
    { birds: 2, dir: 1 },
    { birds: 3, dir: -1, pool: [0.79, 0.65, 0.095, 0.04], drops: [[0.80, 0.62, 0.045, -0.04], [0.80, 0.62, 0.028, -0.028]] }
  ];

  function load(src, cb) {
    var s = document.createElement("script");
    s.src = src; s.onload = cb;
    document.body.appendChild(s);
  }
  // сначала страница, потом тяжёлое
  // по file:// WebGL не берёт картинки с диска — там слои из assets/live.js (data URL); по http — обычные файлы
  var FILE = location.protocol === "file:";
  var FIG = [false, true, true, true, true, false];
  function start() {
    load("vendor/three.min.js", function () {
      if (FILE) return load("assets/live.js", init);
      window.GI_LIVE = FIG.map(function (f, i) {
        var b = "assets/live/s" + (i + 1);
        return { plate: b + "-plate.webp", aux: b + "-aux.png", fig: f ? b + "-fig.webp" : null };
      });
      init();
    });
  }
  if (document.readyState === "complete") setTimeout(start, 300);
  else window.addEventListener("load", function () { setTimeout(start, 300); });

  function init() {
    var L = window.GI_LIVE;
    if (!L || !window.THREE) return;
    var THREE = window.THREE;
    var IMG = 1672 / 941;
    var renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false });
    var glc = renderer.domElement;
    var scene = new THREE.Scene();
    var cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    var BLANK = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
    BLANK.needsUpdate = true;

    var U = {
      tPlate: { value: BLANK }, tFig: { value: BLANK }, tAux: { value: BLANK },
      uTime: { value: 0 }, uPar: { value: new THREE.Vector2() }, uGust: { value: 0.5 },
      uBirds: { value: 0 }, uDir: { value: 1 }, uSeed: { value: 0 }, uFig: { value: 0 }, uPool: { value: new THREE.Vector4() }
    };
    var COMMON = [
      "uniform float uTime; uniform vec2 uPar; uniform float uGust;",
      "vec4 tx(sampler2D t, vec2 p){ return texture2D(t, vec2(p.x, 1.0 - p.y)); }",
      "float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }",
      "float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);",
      "  return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }",
      "float fbm(vec2 p){ return 0.55*n2(p) + 0.3*n2(p*2.1+3.7) + 0.15*n2(p*4.3+1.3); }",
      "const vec3 PAPER = vec3(0.957, 0.941, 0.902); const vec3 INK = vec3(0.114); const vec3 BLUE = vec3(0.247, 0.435, 0.561);",
      // кадр чуть крупнее холста — запас на сдвиги
      "vec2 base(vec2 s){ return 0.5 + (vec2(s.x, 1.0 - s.y) - 0.5) / 1.035; }",
      // ветер: гнёт по карте ветра (A), сильнее в порыв, волной вдоль кадра
      "vec2 wind(vec2 p, float f){",
      "  float w = uTime * 2.0 + 0.35 * sin(uTime * 0.53) + p.y * 34.0 + p.x * 9.0;",
      "  float run = 0.6 + 0.4 * sin(uTime * 0.9 - p.x * 5.0);",   // порыв бежит по кадру слева направо
      "  return f * (0.0016 + 0.0055 * uGust) * run * vec2(sin(w) * 0.8 - 0.35, 0.35 * cos(w * 0.83 + 1.3)); }",
      // течение: блики бегут по воде вниз
      "vec3 flow(vec3 c, float w, vec2 p, float sp){",
      "  if (w < 0.01) return c;",
      "  float s = n2(vec2(p.x * 220.0, p.y * 30.0 - uTime * sp));",
      "  vec3 o = mix(c, PAPER, smoothstep(0.58, 0.85, s) * 0.8); o = mix(o, BLUE * 0.5, (1.0 - smoothstep(0.12, 0.38, s)) * 0.45);",
      "  return mix(c, o, w); }"
    ].join("\n");
    var VS = "varying vec2 vS; void main(){ vS = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }";

    var bg = new THREE.ShaderMaterial({
      uniforms: U, vertexShader: VS, fragmentShader: [
        "uniform sampler2D tPlate; uniform sampler2D tAux; uniform float uBirds; uniform float uDir; uniform float uSeed; uniform vec4 uPool; varying vec2 vS;", COMMON,
        // штрих, который сужается от wa к wb, как резец гравёра
        "float stroke(vec2 p, vec2 a, vec2 b, float wa, float wb){ vec2 pa = p - a, ba = b - a;",
        "  float t = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); float w = mix(wa, wb, t);",
        "  return 1.0 - smoothstep(w - 0.00035, w + 0.00035, length(pa - ba * t)); }",
        "float bird(vec2 p, float k){",
        "  float sp = 0.006 + 0.004 * h(vec2(k, uSeed));",
        "  float x = fract(h(vec2(k + 3.1, uSeed)) + uTime * sp * uDir);",
        "  vec2 c = vec2(mix(-0.08, 1.08, x), 0.07 + 0.16 * h(vec2(k + 7.7, uSeed)) + 0.012 * sin(uTime * 0.4 + k * 2.0));",
        "  float sz = 0.007 + 0.005 * h(vec2(k + 1.3, uSeed));",
        // парит, урывками машет: крыло с изломом (как чайка), при взмахе кончики уходят вверх, при ударе — вниз
        "  float f = smoothstep(0.25, 0.65, sin(uTime * 0.31 + k * 2.4)) * sin(uTime * 6.5 + k * 1.7);",
        "  vec2 q = (p - c) * vec2(1.0, 0.5628); q.x = abs(q.x);",
        "  vec2 el = vec2(0.42, -0.24 - 0.16 * f) * sz;",
        "  vec2 tp = vec2(1.0, 0.06 - 0.55 * f) * sz;",
        "  float w0 = 0.0013 * sz / 0.009;",
        // крыло: передний край штрихом, под ним перо — второй штрих чуть ниже и короче, к кончику сходятся
        "  vec2 dn = vec2(0.0, 0.07 * sz);",
        "  float s = max(stroke(q, vec2(0.0, 0.0), el, w0, w0 * 0.8), stroke(q, el, tp, w0 * 0.8, w0 * 0.15));",
        "  s = max(s, stroke(q, dn, el + dn * 0.8, w0 * 1.1, w0 * 0.7));",
        "  s = max(s, stroke(q, el + dn * 0.8, mix(el, tp, 0.7) + dn * 0.3, w0 * 0.7, w0 * 0.2));",
        "  s = max(s, 1.0 - smoothstep(0.8, 1.2, length((q - vec2(0.0, 0.03 * sz)) / vec2(0.1 * sz, 0.14 * sz))));",   // тельце
        "  s = max(s, stroke(q, vec2(0.0, 0.12 * sz), vec2(0.0, 0.24 * sz), w0 * 0.9, w0 * 0.4));",                   // хвост
        "  return s; }",
        "void main(){",
        "  vec2 p = base(vS);",
        "  vec4 a0 = tx(tAux, p);",
        "  p -= uPar * (a0.r - 0.35);",                                  // дальнее почти стоит, ближнее едет
        "  p.x -= (0.004 * sin(uTime * 0.07 + uSeed) + 0.0015 * uGust) * (1.0 - smoothstep(0.0, 0.12, a0.r));",   // облака
        "  p += wind(p, tx(tAux, p).a);",
        "  vec4 a = tx(tAux, p);",
        "  vec3 c = tx(tPlate, p).rgb;",
        "  c = flow(c, a.g, p, 4.5);",
        // рябь в чаше: круги расходятся от места, куда бьёт струя
        "  if (uPool.z > 0.0) {",
        "    float r = length((p - uPool.xy) / uPool.zw);",
        "    float ring = sin(r * 26.0 - uTime * 3.2) * (1.0 - smoothstep(0.6, 1.1, r));",
        "    c = mix(c, mix(BLUE * 0.6, PAPER, step(0.0, ring)), abs(ring) * 0.22 * a.g);",
        "  }",
        "  float band = smoothstep(0.3, 0.45, a.r) * (1.0 - smoothstep(0.52, 0.66, a.r)) * smoothstep(0.35, 0.75, p.y);",
        "  float m = fbm(vec2(p.x * 3.0 - uTime * 0.03, p.y * 7.0 - uTime * 0.012));",
        "  c = mix(c, PAPER, band * smoothstep(0.35, 0.78, m) * 0.6);",
        "  float b = 0.0; vec2 sp = base(vS);",
        "  for (int k = 0; k < 3; k++) if (float(k) < uBirds) b = max(b, bird(sp, float(k)));",
        "  c = mix(c, INK, b * (1.0 - smoothstep(0.4, 0.62, a.r)));",
        "  gl_FragColor = vec4(c, 1.0); }"
      ].join("\n")
    });
    var fg = new THREE.ShaderMaterial({
      uniforms: U, transparent: true, vertexShader: VS, fragmentShader: [
        "uniform sampler2D tFig; uniform sampler2D tAux; uniform float uFig; varying vec2 vS;", COMMON,
        "void main(){",
        "  if (uFig < 0.5) discard;",
        "  vec2 p = base(vS) - uPar * 0.65;",
        "  p += wind(p, tx(tAux, p).a);",
        "  vec4 f = tx(tFig, p);",
        "  gl_FragColor = vec4(flow(f.rgb, tx(tAux, p).b, p, 1.6), f.a); }"
      ].join("\n")
    });
    var quad = new THREE.PlaneGeometry(2, 2);
    scene.add(new THREE.Mesh(quad, bg));
    scene.add(new THREE.Mesh(quad, fg));

    // капли: позиция по времени прямо в шейдере
    var N = 30, seed = new Float32Array(N * 3);
    for (var i = 0; i < N; i++) { seed[i * 3] = Math.random(); seed[i * 3 + 1] = Math.random(); seed[i * 3 + 2] = Math.random(); }
    var pg = new THREE.BufferGeometry();
    pg.setAttribute("position", new THREE.BufferAttribute(seed, 3));
    var DU = { uTime: U.uTime, uPar: U.uPar, uA: { value: new THREE.Vector4() }, uB: { value: new THREE.Vector4() }, uPx: { value: 1 }, uN: { value: 1 }, uSz: { value: new THREE.Vector2(2, 2.5) } };
    var drops = new THREE.Points(pg, new THREE.ShaderMaterial({
      uniforms: DU, transparent: true, depthTest: false,
      vertexShader: [
        "uniform float uTime; uniform vec2 uPar; uniform vec4 uA; uniform vec4 uB; uniform float uPx; uniform float uN; uniform vec2 uSz; varying float vA;",
        "void main(){",
        "  float life = fract(uTime * (0.45 + position.y * 0.35) + position.x);",
        "  vec4 s = position.z < 0.7 ? uA : uB;",
        "  vec2 p = s.w > 0.0 ? s.xy + vec2((position.y - 0.5) * s.z + (position.x - 0.5) * 0.012 * life, s.w * life * life)",
        "                     : s.xy + vec2((position.y - 0.5) * s.z * life * 2.0, s.w * 4.0 * (life - life * life) * (0.6 + position.x));",   // брызги: вверх и вниз
        "  p += uPar * 0.65;",
        "  vec2 q = (p - 0.5) * 1.035 + 0.5;",
        "  gl_Position = vec4(q.x * 2.0 - 1.0, 1.0 - q.y * 2.0, 0.0, 1.0);",
        "  vA = smoothstep(0.0, 0.08, life) * (1.0 - smoothstep(0.6, 1.0, life)) * step(position.z * 30.0, uN);",   // uN — сколько капель из 30 видно
        "  gl_PointSize = (uSz.x + position.y * uSz.y) * uPx; }"
      ].join("\n"),
      fragmentShader: [
        "varying float vA;",
        // слезинка: круглое дно, острый верх, тёмный край и блик — как нарисованные капли гравюры
        "void main(){ vec2 q = gl_PointCoord - 0.5;",
        "  float w = q.y > 0.12 ? sqrt(max(0.0, 0.1 - (q.y - 0.12) * (q.y - 0.12))) * 0.95 : 0.3 * sqrt(clamp((q.y + 0.46) / 0.58, 0.0, 1.0));",
        "  float inside = 1.0 - smoothstep(w - 0.06, w, abs(q.x));",
        "  if (inside < 0.01) discard;",
        "  float edge = smoothstep(w - 0.13, w - 0.05, abs(q.x)) + smoothstep(0.36, 0.42, q.y);",
        "  vec3 c = mix(vec3(0.33, 0.55, 0.7), vec3(0.12, 0.22, 0.32), clamp(edge, 0.0, 1.0));",
        "  c = mix(c, vec3(0.96), (1.0 - smoothstep(0.03, 0.08, length(q - vec2(-0.07, 0.16)))) * 0.9);",
        "  gl_FragColor = vec4(c, inside * vA); }"
      ].join("\n")
    }));
    drops.frustumCulled = false;
    scene.add(drops);

    // частицы в воздухе: пыльца и семена летят по ветру; ближние крупнее и быстрее; у воды — холодная водяная пыль
    var NM = 28, ms = new Float32Array(NM * 3);
    for (var j = 0; j < NM; j++) { ms[j * 3] = Math.random(); ms[j * 3 + 1] = Math.random(); ms[j * 3 + 2] = Math.random(); }
    var mg = new THREE.BufferGeometry();
    mg.setAttribute("position", new THREE.BufferAttribute(ms, 3));
    var motes = new THREE.Points(mg, new THREE.ShaderMaterial({
      uniforms: { uTime: U.uTime, uGust: U.uGust, uPar: U.uPar, uPx: DU.uPx }, transparent: true, depthTest: false,
      vertexShader: [
        "uniform float uTime; uniform float uGust; uniform vec2 uPar; uniform float uPx; varying float vA; varying float vAng;",
        "void main(){",
        "  float z = position.z;",                                   // 0 далеко .. 1 близко
        "  float sp = 0.012 + 0.03 * z;",
        "  float x = fract(position.x - uTime * sp * (0.6 + 0.8 * uGust));",   // ветер справа налево, как облака
        "  float y = fract(position.y + 0.08 * sin(uTime * (0.3 + z) + position.x * 20.0) + uTime * 0.004);",
        "  vec2 p = vec2(x, y) - uPar * z;",
        "  gl_Position = vec4(p.x * 2.0 - 1.0, 1.0 - p.y * 2.0, 0.0, 1.0);",
        "  vA = smoothstep(0.0, 0.05, x) * (1.0 - smoothstep(0.95, 1.0, x)) * (0.3 + 0.35 * z);",
        "  vAng = uTime * (1.0 + 3.0 * position.x) + position.y * 6.28;",
        "  gl_PointSize = (2.5 + 6.0 * z * z) * uPx; }"
      ].join("\n"),
      fragmentShader: [
        "varying float vA; varying float vAng;",
        // крошечный штрих тушью, крутится в полёте
        "void main(){ vec2 q = gl_PointCoord - 0.5; float c = cos(vAng), s = sin(vAng); q = vec2(c * q.x - s * q.y, s * q.x + c * q.y);",
        "  float d = 1.0 - smoothstep(0.08, 0.16, abs(q.y)) ; d *= 1.0 - smoothstep(0.32, 0.45, abs(q.x));",
        "  gl_FragColor = vec4(0.114, 0.114, 0.114, d * vA); }"
      ].join("\n")
    }));
    motes.frustumCulled = false;
    scene.add(motes);

    // сцены сайта: холст поверх картинки, текстуры грузим, когда сцена рядом
    var items = Array.prototype.map.call(document.querySelectorAll(".scene"), function (el, i) {
      var c = document.createElement("canvas");
      c.className = "stage__live";
      c.setAttribute("aria-hidden", "true");
      var img = el.querySelector(".stage__img");
      img.parentNode.insertBefore(c, img.nextSibling);
      var n = +(img.getAttribute("src").match(/scene-0(\d)/) || [0, i + 1])[1] - 1;   // кадр scene-0N, порядок сцен на странице может отличаться
      return { el: el, i: n, c: c, ctx: c.getContext("2d"), d: L[n], t: null, cfg: CFG[n] || {}, ready: false, bottle: el.querySelector(".scene__bottle") };
    });
    // слои: картинки распаковываются заранее в фоне (decode), в видеокарту — по одной за кадр, пока смотрят соседнюю
    // сцену. Иначе на подходе к каждой сцене кадр замирал на 60–100 мс (распаковка и загрузка трёх больших картинок).
    var queue = [];
    function want(it) {
      if (it.t) return;
      var keys = it.d.fig ? ["plate", "aux", "fig"] : ["plate", "aux"];
      it.t = { plate: BLANK, aux: BLANK, fig: BLANK }; it.left = keys.length;
      keys.forEach(function (k) {
        // Image + decode(): работает и с файлом, и с data URL, без fetch (его режет CSP страницы артефакта)
        var im = new Image();
        im.decoding = "async";
        im.src = it.d[k];
        (im.decode ? im.decode() : new Promise(function (r) { im.onload = r; }))
          .then(function () { return window.createImageBitmap ? createImageBitmap(im, { imageOrientation: "flipY", premultiplyAlpha: "none" }) : im; })
          .catch(function () { return im; })
          .then(function (bm) { queue.push([it, k, bm]); });
      });
    }
    function upload() {                                  // одна картинка за кадр
      var job = queue.shift();
      if (!job) return;
      var it = job[0], x = new THREE.Texture(job[2]);
      x.minFilter = THREE.LinearFilter; x.generateMipmaps = false; x.needsUpdate = true;
      if (job[2] instanceof window.ImageBitmap) x.flipY = false;   // уже перевёрнут при распаковке
      renderer.initTexture(x);
      it.t[job[1]] = x;
      if (--it.left === 0) it.ready = true;
    }
    function free(it) {                                  // далёкая сцена на телефоне — отдаём видеопамять
      if (!it.t || it.left > 0) return;
      [it.t.plate, it.t.aux, it.t.fig].forEach(function (x) { if (x !== BLANK) x.dispose(); });
      it.t = null; it.ready = false;
    }

    var W = 0, H = 0;
    function size() {
      // размер по раскладке (clientWidth не меняется от наезда камеры), на телефоне — скромнее
      var phone = innerWidth < 700;
      var k = Math.min(window.devicePixelRatio || 1, phone ? 1 : 1.25);
      var w = Math.min(Math.round(items[0].c.clientWidth * k), phone ? 1100 : 1672);   // больше исходного кадра рисовать незачем — только нагрузка
      var h = Math.round(w / IMG);
      if (w === W && h === H) return;
      W = w; H = h;
      renderer.setPixelRatio(1);
      renderer.setSize(W, H, false);
      DU.uPx.value = W / 1440;
      items.forEach(function (it) { it.c.width = W; it.c.height = H; });
    }

    var mx = 0, my = 0, sx = 0, sy = 0;
    window.addEventListener("pointermove", function (e) { mx = e.clientX / innerWidth - 0.5; my = e.clientY / innerHeight - 0.5; }, { passive: true });

    function frame(now) {
      if (lost) return;
      requestAnimationFrame(frame);
      if (document.hidden) return;
      size();
      var t = now / 1000, vh = innerHeight;
      sx += (mx - sx) * 0.05; sy += (my - sy) * 0.05;
      U.uTime.value = t;
      U.uGust.value = 0.25 + 0.75 * Math.max(0, Math.min(1, (Math.sin(t * 0.53) * 0.6 + Math.sin(t * 1.31 + 1.7) * 0.4 + 0.2) / 1.2));
      var phone = innerWidth < 700;
      upload();
      for (var i = 0; i < items.length; i++) {
        var it = items[i], r = it.el.getBoundingClientRect();
        // готовим заранее: две следующие сцены (компьютер держит загруженное, телефон отпускает далёкое)
        if (r.top < vh * 5 && r.bottom > -vh * 3) want(it); else if (phone) free(it);
        if (r.bottom < -vh || r.top > vh * 1.5) continue;
        if (!it.ready || it.el.classList.contains("is-gone") || r.top > vh) continue;
        var e = Math.max(0, Math.min(1, -r.top / vh + 1));      // въезд и задержка: 0..1+
        var cfg = it.cfg;
        U.tPlate.value = it.t.plate; U.tAux.value = it.t.aux; U.tFig.value = it.t.fig;
        U.uFig.value = it.d.fig ? 1 : 0;
        if (cfg.pool) U.uPool.value.fromArray(cfg.pool); else U.uPool.value.set(0, 0, 0, 0);
        U.uBirds.value = cfg.birds || 0; U.uDir.value = cfg.dir || 1; U.uSeed.value = it.i * 1.7;
        U.uPar.value.set(0.01 * sx + 0.006 * (e - 1), 0.005 * sy);   // в покое (e=1, мышь в центре) сдвига нет — совпадает со статичной картинкой
        if (it.bottle) it.bottle.style.translate = (U.uPar.value.x * 0.65 * 1.035 * it.c.clientWidth).toFixed(1) + "px " + (U.uPar.value.y * 0.65 * 1.035 * it.c.clientHeight).toFixed(1) + "px";
        drops.visible = !!cfg.drops;
        if (cfg.drops) { DU.uA.value.fromArray(cfg.drops[0]); DU.uB.value.fromArray(cfg.drops[1] || cfg.drops[0]); DU.uN.value = cfg.dropN || 30; DU.uSz.value.fromArray(cfg.dropSize || [2, 2.5]); }
        renderer.render(scene, cam);
        it.ctx.drawImage(glc, 0, 0);
        if (!it.on) { it.on = true; it.el.classList.add("is-live"); }
      }
    }
    var lost = false;
    glc.addEventListener("webglcontextlost", function (e) {   // WebGL отвалился — назад к обычным картинкам
      e.preventDefault(); lost = true;
      items.forEach(function (it) { it.el.classList.remove("is-live"); it.on = false; });
    });
    requestAnimationFrame(frame);
  }
})();
