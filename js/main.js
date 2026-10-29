/* Конфиг бренда — единственное место, где задано имя. Сменить здесь — сменится по всей странице. */
window.GI_BRAND = {
  name: "АЯРА",
  product: "Питьевая вода «АЯРА»"
};

(function () {
  "use strict";

  var DEFAULT_BRAND = "АЯРА"; // то, что написано в HTML для без-JS
  var BRAND = window.GI_BRAND;
  var A = window.GI_ASSETS || {}; // assets/assets.js; может отсутствовать
  var root = document.documentElement;
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  root.classList.add("js");

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function r3(n) { return Math.round(n * 1000) / 1000; }

  /* ---------- бренд ---------- */
  function applyBrand() {
    var i, els = document.querySelectorAll("[data-brand]");
    for (i = 0; i < els.length; i++) els[i].textContent = BRAND.name;
    els = document.querySelectorAll("[data-product]");
    for (i = 0; i < els.length; i++) els[i].textContent = BRAND.product;
    if (BRAND.name === DEFAULT_BRAND) return;
    document.title = document.title.split(DEFAULT_BRAND).join(BRAND.name);
    els = document.querySelectorAll("[alt],[aria-label],meta[content]");
    for (i = 0; i < els.length; i++) {
      ["alt", "aria-label", "content"].forEach(function (attr) {
        var v = els[i].getAttribute(attr);
        if (v && v.indexOf(DEFAULT_BRAND) > -1) els[i].setAttribute(attr, v.split(DEFAULT_BRAND).join(BRAND.name));
      });
    }
  }

  /* ---------- путь в гору: кадры друг над другом, камера поднимается по прокрутке ---------- */
  // мир в долях ширины кадра: x 0..1 слева направо, y снизу вверх. Кадры снизу вверх, на стыках облака.
  var FH = 941 / 1672, GAP = 0.12;
  var FRAMES = [2, 4, 3, 5, 6].map(function (n, i) { return { n: n, y: i * (FH + GAP) }; });   // y — низ кадра
  var TH = FRAMES.length * FH + (FRAMES.length - 1) * GAP;
  var CLOUDS = FRAMES.slice(1).map(function (f, i) {         // на стыке: центр, ширина с запасом за края
    return { y: f.y - GAP / 2, w: 1.24, h: 1.24 / 3 * 0.8, k: i % 3, flip: i % 2 === 1 };
  });
  // остановки: f — кадр, x, y — точка кадра в центре экрана (доли, y сверху), h — сколько высоты мира в кадре;
  // k — подпись и врезка (data-key), 0 — первый экран. Между остановками камера идёт сквозь облака, не стоит.
  var KEYS = [
    { f: 0, x: 0.44, y: 0.5, h: FH, k: 0 },
    { f: 0, x: 0.56, y: 0.42, h: 0.46, k: 1 },
    { f: 1, x: 0.57, y: 0.45, h: 0.5, k: 2 },
    { f: 2, x: 0.56, y: 0.45, h: 0.47, k: 3 },
    { f: 3, x: 0.55, y: 0.52, h: 0.5, k: 4 },
    { f: 4, x: 0.5, y: 0.5, h: FH, k: 5 }
  ];
  var KEYS_PHONE = [
    { f: 0, x: 0.55, y: 0.5, h: 0.54, k: 0 },
    { f: 0, x: 0.58, y: 0.42, h: 0.46, k: 1 },
    { f: 1, x: 0.63, y: 0.45, h: 0.5, k: 2 },
    { f: 2, x: 0.47, y: 0.36, h: 0.5, k: 3 },
    { f: 3, x: 0.55, y: 0.55, h: 0.52, k: 4 },
    { f: 4, x: 0.38, y: 0.6, h: 0.52, k: 5 }
  ];
  var STEP = 1.3;                                       // экранов прокрутки между остановками
  var U = 1000;                                         // px на единицу мира в DOM-слое (дальше масштабирует transform)
  var tower = document.querySelector(".tower");
  var stick = tower.querySelector(".tower__stick");
  var worlds = tower.querySelectorAll(".tower__world");
  var hero = tower.querySelector(".hero");
  var hint = tower.querySelector(".scroll-hint");
  var caps = Array.prototype.slice.call(tower.querySelectorAll(".cap[data-key], .inset[data-key]"));
  var insets = Array.prototype.slice.call(tower.querySelectorAll(".inset"));
  var narrow = window.matchMedia("(max-width: 700px)");
  var cam = { x: 0.5, y: FH / 2, h: FH, w: 1, vy: 0 };
  var shown = -1, last = 0;

  // DOM-мир: кадры и облака картинками — видны, пока не готов WebGL, и если его нет
  function top(y) { return (TH - y) * U; }              // y мира (снизу) -> px сверху
  FRAMES.forEach(function (f, i) {
    var im = document.createElement("img");
    im.className = "tower__img";
    im.src = "assets/scene-0" + f.n + ".webp"; im.alt = ""; im.decoding = "async";
    if (i > 1) im.loading = "lazy";
    im.style.cssText = "left:0;top:" + top(f.y + FH) + "px;width:" + U + "px;height:" + FH * U + "px";
    worlds[0].appendChild(im);
  });
  CLOUDS.forEach(function (c) {
    var im = document.createElement("img");
    im.className = "tower__cloud";
    im.src = "assets/cloud-" + (c.k + 1) + ".webp"; im.alt = ""; im.decoding = "async";
    im.style.cssText = "left:" + (0.5 - c.w / 2) * U + "px;top:" + top(c.y + c.h / 2) + "px;width:" + c.w * U + "px;height:" + c.h * U + "px" + (c.flip ? ";transform:scaleX(-1)" : "");
    worlds[0].appendChild(im);
  });
  for (var wi = 0; wi < worlds.length; wi++) { worlds[wi].style.width = U + "px"; worlds[wi].style.height = TH * U + "px"; }
  // бутылка на уступе верхнего кадра
  var bp = A.bottle6 || [0.33, 0.785, 0.42], sb = tower.querySelector(".scene__bottle"), fb = FRAMES[FRAMES.length - 1];
  sb.style.setProperty("--bot-x", bp[0]);
  sb.style.setProperty("--bot-y", top(fb.y + (1 - bp[1]) * FH) / (TH * U));
  sb.style.setProperty("--bot-h", bp[2] * FH / TH);

  // Катмулл — Ром по точкам с равным шагом: через каждую остановку камера проходит плавно, без излома
  function cr(a, b, c, d, t) {
    return b + 0.5 * t * (c - a + t * (2 * a - 5 * b + 4 * c - d + t * (3 * (b - c) + d - a)));
  }
  function world(k) { var f = FRAMES[k.f]; return { x: k.x, y: f.y + (1 - k.y) * FH, h: k.h }; }
  function target(keys, f) {                            // f — 0..n-1, место в прокрутке в «остановках»
    var n = keys.length, i = clamp(Math.floor(f), 0, n - 2), t = clamp(f - i, 0, 1);
    t = t + 0.35 * (t * t * (3 - 2 * t) - t);           // у подписи чуть медленнее, но не стоп
    var a = world(keys[Math.max(i - 1, 0)]), b = world(keys[i]), c = world(keys[i + 1]), d = world(keys[Math.min(i + 2, n - 1)]);
    return { x: cr(a.x, b.x, c.x, d.x, t), y: cr(a.y, b.y, c.y, d.y, t), h: cr(a.h, b.h, c.h, d.h, t) };
  }

  function layout() {
    var n = (narrow.matches ? KEYS_PHONE : KEYS).length;
    tower.style.height = "calc(100svh + " + ((n - 1) * STEP * 100) + "svh)";
    // врезки: картинка кадра крупно, нужная точка — в центре рамки
    insets.forEach(function (el) {
      var at = el.getAttribute("data-at").split(",").map(Number), i = el.firstChild;
      var w = el.clientWidth, h = el.clientHeight, iw = w * at[2], ih = iw * FH;
      i.style.backgroundImage = "url(" + el.getAttribute("data-src") + ")";
      i.style.width = iw + "px"; i.style.height = ih + "px";
      i.style.left = clamp(w / 2 - at[0] * iw, w - iw, 0) + "px";
      i.style.top = clamp(h / 2 - at[1] * ih, h - ih, 0) + "px";
    });
  }

  // один шаг камеры; js/live.js зовёт его сам перед отрисовкой (иначе холст и бутылка разъезжаются на кадр)
  function step(now) {
    var keys = narrow.matches ? KEYS_PHONE : KEYS, n = keys.length;
    var W = stick.clientWidth, H = stick.clientHeight;
    if (!W || !H) return cam;                           // ещё не разложено
    var r = tower.getBoundingClientRect();
    var p = clamp(-r.top / Math.max(1, r.height - H), 0, 1);
    var f = p * (n - 1);
    var g = target(keys, f);
    var dt = Math.min(0.1, Math.max(0, (now - last) / 1000)); last = now;
    var k = reduce || !dt ? 1 : 1 - Math.exp(-dt * 7);  // инерция: камера догоняет прокрутку мягко
    var oy = cam.y;
    cam.x += (g.x - cam.x) * k; cam.y += (g.y - cam.y) * k; cam.h += (g.h - cam.h) * k;
    // кадр не шире мира и не выходит за его края
    var h = Math.min(cam.h, H / W), w = h * W / H;
    cam.x = clamp(cam.x, w / 2, 1 - w / 2);
    cam.y = clamp(cam.y, h / 2, TH - h / 2);
    cam.h = h; cam.w = w;
    cam.vy = dt ? (cam.y - oy) / dt : 0;
    var z = W / (w * U);
    var tf = "translate3d(" + (W / 2 - cam.x * U * z).toFixed(1) + "px," + (H / 2 - top(cam.y) * z).toFixed(1) + "px,0) scale(" + z.toFixed(5) + ")";
    for (var i = 0; i < worlds.length; i++) worlds[i].style.transform = tf;
    // подписи и врезки: видны те, у чьей остановки сейчас камера
    var near = Math.round(f), on = Math.abs(f - near) < 0.34 ? keys[near].k : -1;
    if (on !== shown) {
      shown = on;
      caps.forEach(function (c) { c.classList.toggle("is-in", +c.getAttribute("data-key") === on); });
      hero.classList.toggle("is-out", on !== 0);
      if (hint) hint.classList.toggle("is-out", on !== 0);
    }
    return cam;
  }
  window.GI_TOWER = { step: step, cam: cam, FRAMES: FRAMES, CLOUDS: CLOUDS, FH: FH, TH: TH, ext: false };
  function loop(now) {
    requestAnimationFrame(loop);
    if (window.GI_TOWER.ext) return;                    // рисует js/live.js
    if (tower.getBoundingClientRect().bottom < 0) return;
    step(now);
  }

  /* ---------- финал появляется по мере прокрутки ---------- */
  function setupReveal() {
    if (!final) return;
    if (reduce || !("IntersectionObserver" in window)) { final.classList.add("is-in"); return; }
    var io = new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) { final.classList.add("is-in"); io.disconnect(); }
    }, { threshold: 0.4 });
    io.observe(final);
  }
  var final = document.querySelector(".final");

  /* ---------- шапка: бумажная после первого экрана, прячется при прокрутке вниз ---------- */
  var bar = document.querySelector(".topbar"), lastY = window.scrollY;
  function topbar() {
    var y = window.scrollY, vh = window.innerHeight;
    bar.classList.toggle("is-solid", y > vh * 0.6);
    if (Math.abs(y - lastY) < 6) return;
    // вниз — прячем (кроме самого верха), вверх — показываем; фокус внутри шапки не даёт ей спрятаться
    bar.classList.toggle("is-hidden", y > lastY && y > vh * 0.6 && !bar.contains(document.activeElement));
    lastY = y;
  }

  /* ---------- бутылка: надпись бренда кладётся HTML-слоем на этикетку ---------- */
  function setupBottle(b) {
    var img = b.querySelector(".bottle__img");
    var label = b.querySelector(".bottle__label");
    var box = A.labelBox || [0.3, 0.45, 0.4, 0.2];
    function ok() {
      b.style.setProperty("--bar", String(img.naturalWidth / img.naturalHeight));
      label.style.left = box[0] * 100 + "%";
      label.style.top = box[1] * 100 + "%";
      label.style.width = box[2] * 100 + "%";
      label.style.height = box[3] * 100 + "%";
      b.classList.add("is-img");
    }
    if (img.complete && img.naturalWidth) ok();
    else img.addEventListener("load", ok, { once: true });
  }

  /* ---------- запуск ---------- */
  applyBrand();
  Array.prototype.forEach.call(document.querySelectorAll(".bottle"), setupBottle);
  setupReveal();
  layout();
  step(performance.now());                              // первый экран сразу на месте, не ждём кадра
  narrow.addEventListener ? narrow.addEventListener("change", layout) : narrow.addListener(layout);
  window.addEventListener("resize", layout);
  if (bar) window.addEventListener("scroll", topbar, { passive: true });
  requestAnimationFrame(loop);
})();
