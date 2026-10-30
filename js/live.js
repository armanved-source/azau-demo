/* Живой путь в гору: один WebGL рисует кадры, которые сейчас в камере (js/main.js, window.GI_TOWER), и облака на
   стыках. Фон сдвигается по карте глубины, люди — отдельным слоем, вода течёт, ветер гнёт то, что белое на карте
   ветра, туман тянет по ущелью, по небу летят птицы, облака на стыках плывут и при подъёме обгоняют гору.
   Нет WebGL или просят меньше движения — остаются картинки, их двигает main.js. Слои — assets/live/ (по file:// —
   assets/live.js с data URL: WebGL не берёт картинки с диска). */
(function () {
  "use strict";
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  var probe = document.createElement("canvas");
  if (!(probe.getContext("webgl") || probe.getContext("experimental-webgl"))) return;
  var tower = document.querySelector(".tower");
  if (!tower || !window.GI_TOWER) return;

  // что есть в кадре scene-0N сверх слоёв (индекс N-1): капли (откуда, x-разброс, длина падения в долях кадра), птицы
  var CFG = [
    // pool: чаша [центр x, y, полуоси] — по ней расходится рябь; drops с отрицательной длиной — брызги вверх от удара струи
    { birds: 3, dir: -1, pool: [0.66, 0.6, 0.1, 0.045], drops: [[0.655, 0.585, 0.06, -0.05], [0.655, 0.585, 0.035, -0.032]] },
    { birds: 2, dir: 1 },
    // капли из ладоней: немного, крупные слезинки, по линии нарисованных капель
    { drops: [[0.674, 0.4, 0.012, 0.17], [0.68, 0.4, 0.008, 0.17]], dropN: 7, dropSize: [9, 5], pool: [0.735, 0.585, 0.085, 0.03] },   // капли падают в ту же чашу, что у источника наверху; по ней круги
    { birds: 3, dir: -1 },
    { birds: 2, dir: 1 },
    { birds: 3, dir: -1, pool: [0.79, 0.65, 0.095, 0.04], drops: [[0.80, 0.62, 0.045, -0.04], [0.80, 0.62, 0.028, -0.028]] }
  ];
  var FIG = [false, true, true, true, true, false];

  function load(src, cb) {
    var s = document.createElement("script");
    s.src = src; s.onload = cb;
    document.body.appendChild(s);
  }
  // сначала страница, потом тяжёлое
  var FILE = location.protocol === "file:";
  function start() {
    load("vendor/three.min.js", function () {
      if (FILE) return load("assets/live.js", init);
      // компьютер — чёткие кадры (~3040×1710), телефон — лёгкие 1672×941 из assets/live/m/ (видеопамять)
      var m = window.GI_TOWER.narrow.matches ? "m/" : "";
      window.GI_LIVE = FIG.map(function (f, i) {
        var b = "assets/live/" + m + "s" + (i + 1);
        return { plate: b + "-plate.webp", aux: "assets/live/s" + (i + 1) + "-aux.png", fig: f ? b + "-fig.webp" : null };
      });
      window.GI_CLOUDS = {};
      window.GI_TOWER.CLOUDS.forEach(function (c) { window.GI_CLOUDS[c.src] = "assets/" + c.src + ".webp"; });
      init();
    });
  }
  if (document.readyState === "complete") setTimeout(start, 300);
  else window.addEventListener("load", function () { setTimeout(start, 300); });

  function init() {
    var L = window.GI_LIVE, LC = window.GI_CLOUDS || {};
    if (!L || !window.THREE) return;
    var THREE = window.THREE;
    var T = window.GI_TOWER, cam = T.cam, FH = T.FH;
    var glc = tower.querySelector(".tower__live");
    var renderer = new THREE.WebGLRenderer({ canvas: glc, antialias: false, alpha: true });
    renderer.setClearColor(0x000000, 0);
    var scene = new THREE.Scene();
    var ocam = new THREE.OrthographicCamera(0, 1, 1, 0, -10, 10);
    var BLANK = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
    BLANK.needsUpdate = true;

    var G = { uTime: { value: 0 }, uGust: { value: 0.5 }, uPar: { value: new THREE.Vector2() } };   // общее для всех кадров
    var COMMON = [
      "uniform float uTime; uniform vec2 uPar; uniform float uGust;",
      "vec4 tx(sampler2D t, vec2 p){ return texture2D(t, vec2(p.x, 1.0 - p.y)); }",
      "float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }",
      "float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);",
      "  return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }",
      "float fbm(vec2 p){ return 0.55*n2(p) + 0.3*n2(p*2.1+3.7) + 0.15*n2(p*4.3+1.3); }",
      "const vec3 PAPER = vec3(0.957, 0.941, 0.902); const vec3 INK = vec3(0.114); const vec3 BLUE = vec3(0.247, 0.435, 0.561);",
      "vec2 base(vec2 s){ return vec2(s.x, 1.0 - s.y); }",   // uv кадра -> доли кадра, y вниз
      "float edge(vec2 s){ float a = 0.035 + 0.035 * n2(vec2(s.x * 11.0, 1.7)) + 0.012 * n2(vec2(s.x * 57.0, 4.1));",
      "  float b = 0.035 + 0.035 * n2(vec2(s.x * 13.0, 8.3)) + 0.012 * n2(vec2(s.x * 61.0, 2.9));",
      "  return smoothstep(0.0, a, 1.0 - s.y) * smoothstep(0.0, b, s.y); }",
      // ветер: гнёт по карте ветра (A), сильнее в порыв, волной вдоль кадра
      "vec2 wind(vec2 p, float f){",
      "  float w = uTime * 2.0 + 0.35 * sin(uTime * 0.53) + p.y * 34.0 + p.x * 9.0;",
      "  float run = 0.6 + 0.4 * sin(uTime * 0.9 - p.x * 5.0);",
      "  return f * (0.0016 + 0.0055 * uGust) * run * vec2(sin(w) * 0.8 - 0.35, 0.35 * cos(w * 0.83 + 1.3)); }",
      // течение: блики бегут по воде вниз
      "vec3 flow(vec3 c, float w, vec2 p, float sp){",
      "  if (w < 0.01) return c;",
      "  float s = n2(vec2(p.x * 220.0, p.y * 30.0 - uTime * sp));",
      "  vec3 o = mix(c, PAPER, smoothstep(0.58, 0.85, s) * 0.8); o = mix(o, BLUE * 0.5, (1.0 - smoothstep(0.12, 0.38, s)) * 0.45);",
      "  return mix(c, o, w); }"
    ].join("\n");
    var VS = "varying vec2 vS; void main(){ vS = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }";
    var BG = [
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
      "  vec2 dn = vec2(0.0, 0.07 * sz);",
      "  float s = max(stroke(q, vec2(0.0, 0.0), el, w0, w0 * 0.8), stroke(q, el, tp, w0 * 0.8, w0 * 0.15));",
      "  s = max(s, stroke(q, dn, el + dn * 0.8, w0 * 1.1, w0 * 0.7));",
      "  s = max(s, stroke(q, el + dn * 0.8, mix(el, tp, 0.7) + dn * 0.3, w0 * 0.7, w0 * 0.2));",
      "  s = max(s, 1.0 - smoothstep(0.8, 1.2, length((q - vec2(0.0, 0.03 * sz)) / vec2(0.1 * sz, 0.14 * sz))));",
      "  s = max(s, stroke(q, vec2(0.0, 0.12 * sz), vec2(0.0, 0.24 * sz), w0 * 0.9, w0 * 0.4));",
      "  return s; }",
      "void main(){",
      "  vec2 p = base(vS);",
      "  vec4 a0 = tx(tAux, p);",
      "  p -= uPar * (a0.r - 0.35);",                                  // дальнее почти стоит, ближнее едет
      "  p.x -= (0.004 * sin(uTime * 0.07 + uSeed) + 0.0015 * uGust) * (1.0 - smoothstep(0.0, 0.12, a0.r));",   // облака
      "  p += wind(p, tx(tAux, p).a);",
      "  p = clamp(p, 0.0005, 0.9995);",
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
      "  gl_FragColor = vec4(c, edge(vS)); }"
    ].join("\n");
    var FG = [
      "uniform sampler2D tFig; uniform sampler2D tAux; varying vec2 vS;", COMMON,
      "void main(){",
      "  vec2 p = base(vS) - uPar * 0.65;",
      "  p += wind(p, tx(tAux, p).a);",
      "  vec4 f = tx(tFig, p);",
      "  if (f.a < 0.004) discard;",
      "  gl_FragColor = vec4(flow(f.rgb, tx(tAux, p).b, p, 1.6), f.a * edge(vS)); }"
    ].join("\n");
    // капли: позиция по времени прямо в шейдере; координаты кадра -> мир
    var DVS = [
      "uniform float uTime; uniform vec2 uPar; uniform vec4 uA; uniform vec4 uB; uniform float uPx; uniform float uN; uniform vec2 uSz; uniform float uY0; uniform float uFH; varying float vA;",
      "void main(){",
      "  float life = fract(uTime * (0.45 + position.y * 0.35) + position.x);",
      "  vec4 s = position.z < 0.7 ? uA : uB;",
      "  vec2 p = s.w > 0.0 ? s.xy + vec2((position.y - 0.5) * s.z + (position.x - 0.5) * 0.012 * life, s.w * life * life)",
      "                     : s.xy + vec2((position.y - 0.5) * s.z * life * 2.0, s.w * 4.0 * (life - life * life) * (0.6 + position.x));",   // брызги: вверх и вниз
      "  p += uPar * 0.65;",
      "  gl_Position = projectionMatrix * viewMatrix * vec4(p.x, uY0 + (1.0 - p.y) * uFH, 0.3, 1.0);",
      "  vA = smoothstep(0.0, 0.08, life) * (1.0 - smoothstep(0.6, 1.0, life)) * step(position.z * 30.0, uN);",   // uN — сколько капель из 30 видно
      "  gl_PointSize = (uSz.x + position.y * uSz.y) * uPx; }"
    ].join("\n");
    var DFS = [
      "varying float vA;",
      // слезинка: круглое дно, острый верх, тёмный край и блик — как нарисованные капли гравюры
      "void main(){ if (vA < 0.01) discard; vec2 q = gl_PointCoord - 0.5;",
      "  float w = q.y > 0.12 ? sqrt(max(0.0, 0.1 - (q.y - 0.12) * (q.y - 0.12))) * 0.95 : 0.3 * sqrt(clamp((q.y + 0.46) / 0.58, 0.0, 1.0));",
      "  float inside = 1.0 - smoothstep(w - 0.06, w, abs(q.x));",
      "  if (inside < 0.01) discard;",
      "  float edge = smoothstep(w - 0.13, w - 0.05, abs(q.x)) + smoothstep(0.36, 0.42, q.y);",
      "  vec3 c = mix(vec3(0.33, 0.55, 0.7), vec3(0.12, 0.22, 0.32), clamp(edge, 0.0, 1.0));",
      "  c = mix(c, vec3(0.96), (1.0 - smoothstep(0.03, 0.08, length(q - vec2(-0.07, 0.16)))) * 0.9);",
      "  gl_FragColor = vec4(c, inside * vA); }"
    ].join("\n");
    var N = 30, seed = new Float32Array(N * 3);
    for (var i = 0; i < N; i++) { seed[i * 3] = Math.random(); seed[i * 3 + 1] = Math.random(); seed[i * 3 + 2] = Math.random(); }
    var pg = new THREE.BufferGeometry();
    pg.setAttribute("position", new THREE.BufferAttribute(seed, 3));
    var PX = { value: 1 };

    // кадры мира: фон, люди, капли — у каждого свои слои и настройки
    var quad = new THREE.PlaneGeometry(1, FH);
    var frames = T.FRAMES.map(function (f) {
      var n = f.n - 1, cfg = CFG[n] || {}, d = L[n];
      var u = {
        uTime: G.uTime, uGust: G.uGust, uPar: G.uPar,
        tPlate: { value: BLANK }, tAux: { value: BLANK }, tFig: { value: BLANK },
        uBirds: { value: cfg.birds || 0 }, uDir: { value: cfg.dir || 1 }, uSeed: { value: n * 1.7 },
        uPool: { value: new THREE.Vector4().fromArray(cfg.pool || [0, 0, 0, 0]) }
      };
      var bg = new THREE.Mesh(quad, new THREE.ShaderMaterial({ uniforms: u, vertexShader: VS, fragmentShader: BG, transparent: true }));
      bg.position.set(0.5, f.y + FH / 2, 0);
      var it = { f: f, d: d, u: u, bg: bg, fg: null, drops: null, t: null, ready: false };
      if (d.fig) {
        it.fg = new THREE.Mesh(quad, new THREE.ShaderMaterial({ uniforms: u, vertexShader: VS, fragmentShader: FG, transparent: true }));
        it.fg.position.set(0.5, f.y + FH / 2, 0.1);
      }
      if (cfg.drops) {
        var du = {
          uTime: G.uTime, uPar: G.uPar, uPx: PX, uY0: { value: f.y }, uFH: { value: FH },
          uA: { value: new THREE.Vector4().fromArray(cfg.drops[0]) }, uB: { value: new THREE.Vector4().fromArray(cfg.drops[1] || cfg.drops[0]) },
          uN: { value: cfg.dropN || 30 }, uSz: { value: new THREE.Vector2().fromArray(cfg.dropSize || [2, 2.5]) }
        };
        it.drops = new THREE.Points(pg, new THREE.ShaderMaterial({ uniforms: du, vertexShader: DVS, fragmentShader: DFS, transparent: true, depthTest: false }));
        it.drops.frustumCulled = false;
      }
      [it.bg, it.fg, it.drops].forEach(function (m) { if (m) { m.visible = false; scene.add(m); } });
      return it;
    });

    // облака на стыках: выше всего, плывут и при подъёме камеры едут быстрее горы (они ближе)
    var cloudGeo = new THREE.PlaneGeometry(1, 1);
    // полоса стыка; у водопада по синему бегут блики вниз, как у воды в кадрах
    var SEAM = [
      "uniform sampler2D tMap; uniform float uTime; uniform float uFlow; varying vec2 vS;",
      "float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }",
      "float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);",
      "  return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }",
      "void main(){ vec4 c = texture2D(tMap, vS);",
      "  c.a *= smoothstep(0.0, 0.07, vS.y) * smoothstep(1.0, 0.93, vS.y) * smoothstep(0.0, 0.03, vS.x) * smoothstep(1.0, 0.97, vS.x);",
      "  if (uFlow > 0.5) {",
      "    float w = smoothstep(0.08, 0.2, c.b - c.r) * c.a;",
      "    float s = n2(vec2(vS.x * 260.0, vS.y * 22.0 + uTime * 3.5));",
      "    c.rgb = mix(c.rgb, mix(c.rgb, vec3(0.96), smoothstep(0.55, 0.85, s) * 0.85), w);",
      "  }",
      "  gl_FragColor = c; }"
    ].join("\n");
    var clouds = T.CLOUDS.map(function (c) {
      var m = new THREE.Mesh(cloudGeo, new THREE.ShaderMaterial({
        uniforms: { tMap: { value: BLANK }, uTime: G.uTime, uFlow: { value: c.flow ? 1 : 0 } },
        transparent: true, depthTest: false, vertexShader: VS, fragmentShader: SEAM
      }));
      m.scale.set(c.flip ? -c.w : c.w, c.h, 1);
      m.position.set(0.5 + (c.dx || 0), c.y, 0.5);
      m.renderOrder = 2; m.visible = false;
      scene.add(m);
      return { c: c, m: m, ready: false };
    });

    // частицы в воздухе: пыльца и семена летят по ветру; при подъёме ближние сильнее уходят вниз
    var NM = 28, ms = new Float32Array(NM * 3);
    for (var j = 0; j < NM; j++) { ms[j * 3] = Math.random(); ms[j * 3 + 1] = Math.random(); ms[j * 3 + 2] = Math.random(); }
    var mg = new THREE.BufferGeometry();
    mg.setAttribute("position", new THREE.BufferAttribute(ms, 3));
    var MU = { uTime: G.uTime, uGust: G.uGust, uPx: PX, uRun: { value: 0 } };
    var motes = new THREE.Points(mg, new THREE.ShaderMaterial({
      uniforms: MU, transparent: true, depthTest: false,
      vertexShader: [
        "uniform float uTime; uniform float uGust; uniform float uPx; uniform float uRun; varying float vA; varying float vAng;",
        "void main(){",
        "  float z = position.z;",                                   // 0 далеко .. 1 близко
        "  float sp = 0.012 + 0.03 * z;",
        "  float x = fract(position.x - uTime * sp * (0.6 + 0.8 * uGust));",
        "  float y = fract(position.y + 0.08 * sin(uTime * (0.3 + z) + position.x * 20.0) + uTime * 0.004 + uRun * (0.6 + 0.9 * z));",
        "  gl_Position = vec4(x * 2.0 - 1.0, 1.0 - y * 2.0, 0.0, 1.0);",
        "  vA = smoothstep(0.0, 0.05, x) * (1.0 - smoothstep(0.95, 1.0, x)) * (0.3 + 0.35 * z);",
        "  vAng = uTime * (1.0 + 3.0 * position.x) + position.y * 6.28;",
        "  gl_PointSize = (2.5 + 6.0 * z * z) * uPx * 0.9; }"
      ].join("\n"),
      fragmentShader: [
        "varying float vA; varying float vAng;",
        // крошечный штрих тушью, крутится в полёте
        "void main(){ vec2 q = gl_PointCoord - 0.5; float c = cos(vAng), s = sin(vAng); q = vec2(c * q.x - s * q.y, s * q.x + c * q.y);",
        "  float d = 1.0 - smoothstep(0.08, 0.16, abs(q.y)) ; d *= 1.0 - smoothstep(0.32, 0.45, abs(q.x));",
        "  gl_FragColor = vec4(0.114, 0.114, 0.114, d * vA); }"
      ].join("\n")
    }));
    motes.frustumCulled = false; motes.renderOrder = 3;
    scene.add(motes);

    // картинки распаковываются заранее в фоне (decode), в видеокарту — по одной за кадр
    var queue = [];
    function pic(src, cb) {
      // Image + decode(): работает и с файлом, и с data URL, без fetch (его режет CSP страницы артефакта)
      var im = new Image();
      im.decoding = "async";
      im.src = src;
      (im.decode ? im.decode() : new Promise(function (r, e) { im.onload = r; im.onerror = e; }))
        .then(function () { return BITMAP ? createImageBitmap(im, { imageOrientation: "flipY", premultiplyAlpha: "none" }).catch(function () { return im; }) : im; })
        .catch(function () { return null; })                 // не загрузилась — не рисуем чёрный кадр, попробуем снова
        .then(function (bm) { queue.push([cb, bm]); });
    }
    // Safari и старый Firefox не умеют параметры createImageBitmap (кадр лёг бы вверх ногами) — им обычная картинка
    var ff = navigator.userAgent.match(/Firefox\/(\d+)/);
    var BITMAP = !!window.createImageBitmap && !/^((?!chrome|android).)*safari/i.test(navigator.userAgent) && !(ff && +ff[1] < 98);
    function tex(bm) {
      var x = new THREE.Texture(bm);
      x.minFilter = THREE.LinearFilter; x.generateMipmaps = false; x.needsUpdate = true;
      var isBm = window.ImageBitmap && bm instanceof window.ImageBitmap;
      if (isBm) x.flipY = false;                         // уже перевёрнут при распаковке
      renderer.initTexture(x);
      if (isBm && bm.close) { bm.close(); x.image = { width: bm.width, height: bm.height }; }   // в видеокарте — копию в памяти отпускаем
      return x;
    }
    function want(it, now) {
      if (it.t || now < (it.retryAt || 0)) return;
      var keys = it.d.fig ? ["plate", "aux", "fig"] : ["plate", "aux"];
      var gen = it.gen = (it.gen || 0) + 1;
      it.t = {}; it.left = keys.length;
      keys.forEach(function (k) {
        pic(it.d[k], function (bm) {
          if (it.gen !== gen || !it.t) { if (bm && bm.close) bm.close(); return; }   // ответ отменённой попытки
          if (!bm) {                                     // сеть подвела — пауза и заново
            it.fails = (it.fails || 0) + 1; it.retryAt = performance.now() + 1000 * Math.min(8, Math.pow(2, it.fails));
            if (it.f.img && !it.f.img.src) it.f.img.src = it.f.src;   // пока WebGL не смог — видна обычная картинка
            free(it, true); return;
          }
          if (it.t[k]) it.t[k].dispose();
          it.t[k] = tex(bm);
          if (--it.left > 0) return;
          it.u.tPlate.value = it.t.plate; it.u.tAux.value = it.t.aux; it.u.tFig.value = it.t.fig || BLANK;
          it.ready = true;
          if (it.f.img) it.f.img.style.visibility = "hidden";   // под холстом DOM-кадр больше не нужен
        });
      });
    }
    function free(it, force) {                           // далёкий кадр — отдаём видеопамять
      if (!it.t || (it.left > 0 && !force)) return;
      it.gen = (it.gen || 0) + 1;                        // ответы, что ещё в пути, — уже не к этому кадру
      ["plate", "aux", "fig"].forEach(function (k) { if (it.t[k]) it.t[k].dispose(); });
      it.t = null; it.ready = false;
      if (it.f.img) it.f.img.style.visibility = "";
    }
    clouds.forEach(function (o) {
      var src = LC[o.c.src];
      if (src) o.load = function () {
        o.req = true;
        pic(src, function (bm) {
        if (!bm) { if (o.c.img && !o.c.img.src) o.c.img.src = o.c.url; return; }   // не загрузилось — запасная картинка
        o.m.material.uniforms.tMap.value = tex(bm); o.ready = true;
        if (o.c.img) o.c.img.style.visibility = "hidden";   // иначе DOM-облако просвечивает рядом, контур двоится
        });
      };
    });

    var W = 0, H = 0;
    function size() {
      var phone = T.narrow.matches;
      var k = Math.min(window.devicePixelRatio || 1, 1.5);   // кадры чёткие — рисуем плотнее, но не в полный ретина-размер (нагрузка)
      var w = Math.min(Math.round(glc.clientWidth * k), phone ? 1100 : 2560);
      var h = Math.round(w * glc.clientHeight / Math.max(1, glc.clientWidth));
      if (w === W && h === H) return;
      W = w; H = h;
      renderer.setPixelRatio(1);
      renderer.setSize(W, H, false);
    }

    var mx = 0, my = 0, sx = 0, sy = 0, run = 0, py = cam.y, on = false;
    window.addEventListener("pointermove", function (e) {   // только мышь: касание пальцем не должно дёргать слои
      if (e.pointerType && e.pointerType !== "mouse") return;
      mx = e.clientX / innerWidth - 0.5; my = e.clientY / innerHeight - 0.5;
    }, { passive: true });
    var finalEl = tower.querySelector(".final");

    function frame(now) {
      if (lost) return;
      requestAnimationFrame(frame);
      if (document.hidden) return;
      if (tower.getBoundingClientRect().bottom < 0) return;
      var job = queue.shift();                           // одна картинка в видеокарту за кадр
      if (job) job[0](job[1]);
      T.ext = true;                                      // камеру двигаем отсюда, в одном кадре с холстом
      T.step(now);
      size();
      var t = now / 1000, phone = T.narrow.matches;
      sx += (mx - sx) * 0.05; sy += (my - sy) * 0.05;
      G.uTime.value = t;
      G.uGust.value = 0.25 + 0.75 * Math.max(0, Math.min(1, (Math.sin(t * 0.53) * 0.6 + Math.sin(t * 1.31 + 1.7) * 0.4 + 0.2) / 1.2));
      // глубина: мышь чуть сдвигает ближнее; пока камера поднимается, ближнее уходит вниз быстрее дальнего
      G.uPar.value.set(0.01 * sx, 0.005 * sy + Math.max(-0.012, Math.min(0.012, cam.vy * 0.02)));
      ocam.left = cam.x - cam.w / 2; ocam.right = cam.x + cam.w / 2;
      ocam.bottom = cam.y - cam.h / 2; ocam.top = cam.y + cam.h / 2;
      ocam.updateProjectionMatrix();
      PX.value = H / cam.h / 1440;
      run += (cam.y - py) / cam.h; py = cam.y;
      MU.uRun.value = run;
      var any = false;
      frames.forEach(function (it) {
        var d = Math.abs(it.f.y + FH / 2 - cam.y);       // от центра кадра до камеры
        if (d < FH + 0.3) want(it, now); else if (d > 2 * (FH + 0.2)) free(it);   // держим текущий кадр и соседей
        var vis = it.ready && d < FH + cam.h / 2;
        it.bg.visible = vis;
        if (it.fg) it.fg.visible = vis;
        if (it.drops) it.drops.visible = vis;
        any = any || vis;
      });
      clouds.forEach(function (o) {
        if (!o.req && o.load && Math.abs(o.c.y - cam.y) < 1.5) o.load();   // облака — по мере подъёма, не все сразу
        o.m.visible = o.ready && Math.abs(o.c.y - cam.y) < cam.h + o.c.h;
        o.m.position.y = o.c.y - (cam.y - o.c.y) * o.c.par;   // ближе горы: при подъёме уходит вниз быстрее
        if (o.c.src.indexOf("cloud") === 0) o.m.position.x = 0.5 + 0.015 * Math.sin(t * 0.05);   // облако плывёт, скала стоит
      });
      motes.visible = any;
      if (finalEl.classList.contains("is-in") && Math.abs(cam.vy) < 1e-4) return;   // под финалом и камера стоит — не рисуем зря
      renderer.render(scene, ocam);
      if (!on && any) { on = true; tower.classList.add("is-live"); }
    }
    var lost = false;
    glc.addEventListener("webglcontextlost", function (e) {   // WebGL отвалился — назад к обычным картинкам
      e.preventDefault(); lost = true; T.ext = false;
      tower.classList.remove("is-live");
      frames.forEach(function (it) { if (it.f.img) it.f.img.style.visibility = ""; });
      clouds.forEach(function (o) { if (o.c.img) o.c.img.style.visibility = ""; });
    });
    requestAnimationFrame(frame);
  }
})();
