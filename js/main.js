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
  var FH = 941 / 1672, GAP = 0.28;
  var FRAMES = [2, 4, 3, 5, 6].map(function (n, i) { return { n: n, y: i * (FH + GAP) }; });   // y — низ кадра
  var SKY = 0.75;                                       // чистое небо над источником — там финал
  var TH = FRAMES.length * FH + (FRAMES.length - 1) * GAP + SKY;
  // на стыках разные переходы (нарисовал Кодекс): скала с тропой, туман, скала, скала с водопадом от источника;
  // над источником — облако, за ним небо с финалом. par — насколько быстрее горы едет при подъёме (ближе к камере)
  var SEAMS = ["seam-1", "seam-2", "seam-3", "seam-4"];
  var CLOUDS = FRAMES.slice(1).map(function (f, i) {
    var h = 1.12 / 3 * (i === 1 ? 0.7 : i === 2 ? 1.2 : 0.9);   // туман ниже; скала над питьём выше — закрывает и папаху снизу, и край кадра сверху
    return { y: f.y - GAP + h / 2 - (i === 2 ? 0.05 : 0.01), w: 1.12, h: h, src: SEAMS[i], par: i === 1 ? 0.12 : 0.05, flow: i === 3, dx: i === 3 ? -0.025 : 0 };   // водопад — под сток источника
  });
  CLOUDS.push({ y: FRAMES[FRAMES.length - 1].y + FH + 0.04, w: 1.24, h: 1.24 / 3 * 0.8, src: "cloud-2", par: 0.18, flip: true });   // вход в небо
  // остановки: f — кадр, x, y — точка кадра в центре экрана (доли, y сверху), h — сколько высоты мира в кадре;
  // k — подпись и врезка (data-key), 0 — первый экран. Между остановками камера идёт сквозь облака, не стоит.
  var KEYS = [
    { f: 0, x: 0.44, y: 0.5, h: FH, k: 0 },
    { f: 0, x: 0.56, y: 0.42, h: 0.46, k: 1 },
    { f: 1, x: 0.57, y: 0.45, h: 0.5, k: 2 },
    { f: 2, x: 0.56, y: 0.45, h: 0.47, k: 3 },
    { f: 3, x: 0.55, y: 0.44, h: 0.54, k: 4 },   // голова уходящего в кадре уже на подходе
    { f: 4, x: 0.5, y: 0.5, h: FH, k: 5 },
    { sky: 1, k: 6 }
  ];
  var KEYS_PHONE = [
    { f: 0, x: 0.55, y: 0.36, h: 0.62, k: 0 },
    { f: 0, x: 0.58, y: 0.42, h: 0.46, k: 1 },
    { f: 1, x: 0.57, y: 0.45, h: 0.74, k: 2 },
    { f: 2, x: 0.6, y: 0.42, h: 0.58, k: 3 },
    { f: 3, x: 0.45, y: 0.55, h: 0.72, k: 4 },
    { f: 4, x: 0.4, y: 0.56, h: 0.75, k: 5 },
    { f: 4, x: 0.8, y: 0.48, h: 0.75, k: 5 },     // телефон: чаша и посох у скалы — то, о чём подпись
    { sky: 1, k: 6 }
  ];
  var STEP = [1.05, 1.1, 1.25, 1.6, 1.15, 1.0, 1.0];   // экранов прокрутки на участок между остановками (глоток — дольше; последний — только у телефона)
  var U = 1000;                                         // px на единицу мира в DOM-слое (дальше масштабирует transform)
  var tower = document.querySelector(".tower");
  var stick = tower.querySelector(".tower__stick");
  var worlds = tower.querySelectorAll(".tower__world");
  var hero = tower.querySelector(".hero");
  var hint = tower.querySelector(".scroll-hint");
  var caps = Array.prototype.slice.call(tower.querySelectorAll(".cap[data-key], .inset[data-key], .final[data-key]"));
  var insets = Array.prototype.slice.call(tower.querySelectorAll(".inset"));
  var narrow = window.matchMedia("(max-width: 700px)");
  var cam = { x: 0.5, y: FH / 2, h: FH, w: 1, vy: 0 };
  var shown = -1, last = 0, Hs = 0, fs = null, fv = 0, narrowWas = null;

  // DOM-мир: кадры и облака картинками — видны, пока не готов WebGL, и если его нет
  function top(y) { return (TH - y) * U; }              // y мира (снизу) -> px сверху
  FRAMES.forEach(function (f, i) {
    var im = document.createElement("img");
    im.className = "tower__img";
    im.alt = ""; im.decoding = "async"; f.img = im; f.src = "assets/scene-0" + f.n + ".webp"; f.cy = f.y + FH / 2;
    im.style.cssText = "left:0;top:" + top(f.y + FH) + "px;width:" + U + "px;height:" + FH * U + "px";
    worlds[0].appendChild(im);
  });
  CLOUDS.forEach(function (c) {
    var im = document.createElement("img");
    im.className = "tower__cloud";
    im.alt = ""; im.decoding = "async"; c.img = im; c.url = "assets/" + c.src + ".webp"; c.cy = c.y;
    im.style.cssText = "left:" + (0.5 + (c.dx || 0) - c.w / 2) * U + "px;top:" + top(c.y + c.h / 2) + "px;width:" + c.w * U + "px;height:" + c.h * U + "px" + (c.flip ? ";transform:scaleX(-1)" : "");
    worlds[0].appendChild(im);
  });
  for (var wi = 0; wi < worlds.length; wi++) { worlds[wi].style.width = U + "px"; worlds[wi].style.height = TH * U + "px"; }
  // бутылка на уступе верхнего кадра
  var bp = A.bottle6 || [0.33, 0.785, 0.42], sb = tower.querySelector(".scene__bottle"), fb = FRAMES[FRAMES.length - 1];
  sb.style.setProperty("--bot-x", bp[0]);
  sb.style.setProperty("--bot-y", top(fb.y + (1 - bp[1]) * FH) / (TH * U));
  sb.style.setProperty("--bot-h", bp[2] * FH / TH);

  // картинка DOM-мира подгружается, когда камера в полутора кадрах от неё
  function lazyImg(o) {
    if (o.img.src || window.GI_TOWER.ext || Math.abs(o.cy - cam.y) > 0.9) return;
    o.img.src = o.url || o.src;
  }

  // Катмулл — Ром по точкам с равным шагом: через каждую остановку камера проходит плавно, без излома
  function cr(a, b, c, d, t) {
    return b + 0.5 * t * (c - a + t * (2 * a - 5 * b + 4 * c - d + t * (3 * (b - c) + d - a)));
  }
  function world(k) {
    if (k.sky) { var c = CLOUDS[CLOUDS.length - 1]; return { x: 0.5, y: c.y + c.h * 0.15 + FH / 2, h: FH }; }
    var f = FRAMES[k.f]; return { x: k.x, y: f.y + (1 - k.y) * FH, h: k.h };
  }
  function target(keys, f) {                            // f — 0..n-1, место в прокрутке в «остановках»
    var n = keys.length, i = clamp(Math.floor(f), 0, n - 2), t = clamp(f - i, 0, 1);
    t = t + 0.35 * (t * t * (3 - 2 * t) - t);           // у подписи чуть медленнее, но не стоп
    var a = world(keys[Math.max(i - 1, 0)]), b = world(keys[i]), c = world(keys[i + 1]), d = world(keys[Math.min(i + 2, n - 1)]);
    return { x: cr(a.x, b.x, c.x, d.x, t), y: cr(a.y, b.y, c.y, d.y, t), h: cr(a.h, b.h, c.h, d.h, t) };
  }

  // доля прокрутки 0..1 -> место в «остановках» 0..n-1 с учётом разной длины участков (STEP)
  function toStop(p, n) {
    var st = STEP.slice(0, n - 1), total = st.reduce(function (a, b) { return a + b; }, 0), d = p * total;
    for (var i = 0; i < st.length; i++) { if (d <= st[i]) return i + d / st[i]; d -= st[i]; }
    return n - 1;
  }

  function layout() {
    var n = (narrow.matches ? KEYS_PHONE : KEYS).length;
    var sum = STEP.slice(0, n - 1).reduce(function (a, b) { return a + b; }, 0) * 100;
    tower.style.height = "calc(100svh + " + sum + "svh)";
    // врезки: картинка кадра крупно, нужная точка — в центре рамки
    insets.forEach(function (el) {
      var at = el.getAttribute("data-at").split(",").map(Number), i = el.firstChild;
      var w = el.clientWidth, h = el.clientHeight, iw = w * at[2], ih = iw * 0.75;   // врезки 4:3, как рамка
      i.style.width = iw + "px"; i.style.height = ih + "px";
      i.style.left = clamp(w / 2 - at[0] * iw, w - iw, 0) + "px";
      i.style.top = clamp(h / 2 - at[1] * ih, h - ih, 0) + "px";
    });
  }

  // один шаг камеры; js/live.js зовёт его сам перед отрисовкой (иначе холст и бутылка разъезжаются на кадр)
  function step(now) {
    var keys = narrow.matches ? KEYS_PHONE : KEYS, n = keys.length;
    var W = stick.clientWidth, H0 = stick.clientHeight;
    if (!W || !H0) return cam;                          // ещё не разложено
    var r = tower.getBoundingClientRect();
    var p = clamp(-r.top / Math.max(1, r.height - H0), 0, 1);
    var ft = toStop(p, n);
    var dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
    // камера на «пружине» вдоль пути: положение по прокрутке догоняется без скачков скорости — свайп не дёргает
    if (reduce || !dt || fs === null || narrowWas !== narrow.matches) { fs = ft; fv = 0; narrowWas = narrow.matches; }
    else { var om = 7; fv += (om * om * (ft - fs) - 2 * om * fv) * dt; fs += fv * dt; }
    var f = clamp(fs, 0, n - 1);
    var g = target(keys, clamp(f, 0, n - 1));
    // высота экрана на телефоне скачет, когда прячется адресная строка — камера меняет её плавно
    Hs = Hs && !reduce ? Hs + (H0 - Hs) * (dt ? 1 - Math.exp(-dt * 3) : 1) : H0; var H = Hs;
    var oy = cam.y;
    cam.x = g.x; cam.y = g.y; cam.h = g.h;
    // кадр не шире мира и не выходит за его края
    var h = Math.min(cam.h, H / W), w = h * W / H;
    cam.x = clamp(cam.x, w / 2, 1 - w / 2);
    cam.y = clamp(cam.y, h / 2, TH - h / 2);
    cam.h = h; cam.w = w;
    cam.vy = dt ? (cam.y - oy) / dt : 0;
    var z = W / (w * U);
    var ky = keys[3] ? world(keys[3]).y : 0;           // глоток: камера дошла или проскочила остановку за кадр
    if (!gulpDone && !reduce && keys[3] && Math.round(f) === 3 && cam.vy > 0 && (Math.abs(cam.y - ky) < 0.02 * FH || (oy - ky) * (cam.y - ky) < 0)) {
      gulpDone = true;
      var pf = FRAMES[2], wx = 0.68, wy = pf.y + (1 - 0.62) * FH;     // чаша под ладонями: круги от капель — по воде, не по лицу
      gulp(W / 2 + (wx - cam.x) * U * W / (w * U), H / 2 + (top(wy) - top(cam.y)) * W / (w * U));
    }
    var tf = "translate3d(" + (W / 2 - cam.x * U * z).toFixed(1) + "px," + (H / 2 - top(cam.y) * z).toFixed(1) + "px,0) scale(" + z.toFixed(5) + ")";
    for (var i = 0; i < worlds.length; i++) worlds[i].style.transform = tf;
    FRAMES.forEach(lazyImg); CLOUDS.forEach(lazyImg);
    // подписи и врезки: видны те, у чьей остановки сейчас камера
    var near = Math.round(f), on = Math.abs(f - near) < (keys[near].k === 6 ? 0.6 : keys[near].k === 4 ? 0.2 : 0.34) ? keys[near].k : -1;
    var fa = keys[Math.floor(f)], fb = keys[Math.min(n - 1, Math.ceil(f))];
    if (fa && fb && fa.k === fb.k) on = fa.k;          // две остановки одной подписи подряд — не мигаем
    if (on !== shown) {
      if (on >= 0 && window.GI_SOUND) window.GI_SOUND.flip();   // новая остановка — шелест страницы
      shown = on;
      caps.forEach(function (c) {
        var k = +c.getAttribute("data-key");
        c.classList.toggle("is-in", k === on);
        // врезка: картинку подгружаем на остановку раньше, чтобы к показу была готова
        if (c.classList.contains("inset") && (k === on || k === on + 1) && !c.firstChild.style.backgroundImage) c.firstChild.style.backgroundImage = "url(" + c.getAttribute("data-src") + ")";
      });
      hero.classList.toggle("is-out", on !== 0);
      if (hint) hint.classList.toggle("is-out", on !== 0);
    }
    return cam;
  }
  var gulpEl = document.querySelector(".gulp");
  var gulpDone = false;
  function gulp(x, y) {
    gulpEl.style.setProperty("--gx", Math.round(x) + "px"); gulpEl.style.setProperty("--gy", Math.round(y) + "px");
    gulpEl.classList.remove("is-on"); void gulpEl.offsetWidth; gulpEl.classList.add("is-on");
    if (window.GI_SOUND) window.GI_SOUND.splash();
  }
  window.GI_TOWER = { step: step, cam: cam, FRAMES: FRAMES, CLOUDS: CLOUDS, FH: FH, TH: TH, narrow: narrow, ext: false };
  function loop(now) {
    requestAnimationFrame(loop);
    if (window.GI_TOWER.ext) return;                    // рисует js/live.js
    if (tower.getBoundingClientRect().bottom < 0) return;
    step(now);
  }

  /* ---------- ссылки «к бутылке»: финал внутри закреплённого экрана — прокручиваем до конца подъёма ---------- */
  var finalEl = tower.querySelector(".final");
  function toEnd(smooth) { window.scrollTo({ top: tower.offsetTop + tower.offsetHeight - window.innerHeight, behavior: smooth && !reduce ? "smooth" : "auto" }); }
  Array.prototype.forEach.call(document.querySelectorAll('a[href="#final"]'), function (a) {
    a.addEventListener("click", function (e) {
      e.preventDefault();
      toEnd(true);
      finalEl.querySelector(".btn--big").focus({ preventScroll: true });
    });
  });
  finalEl.addEventListener("focusin", function () { if (!finalEl.classList.contains("is-in")) toEnd(false); });

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
  layout();
  step(performance.now());                              // первый экран сразу на месте, не ждём кадра
  narrow.addEventListener ? narrow.addEventListener("change", layout) : narrow.addListener(layout);
  window.addEventListener("resize", layout);
  if (bar) window.addEventListener("scroll", topbar, { passive: true });
  if (bar) document.addEventListener("focusin", function () { bar.classList.remove("is-hidden"); });
  requestAnimationFrame(loop);

  /* ---------- заставка ---------- */
  var intro = document.querySelector(".intro");
  if (intro) {
    var t0 = Date.now(), done = false;
    var go = function () {
      if (done) return; done = true;
      setTimeout(function () { intro.classList.add("is-out"); setTimeout(function () { intro.remove(); }, 900); }, reduce ? 0 : Math.max(0, 1100 - (Date.now() - t0)));
    };
    var first = new Image(); first.onload = first.onerror = go; first.src = "assets/scene-02.webp";
    setTimeout(go, 3500);
  }
})();
