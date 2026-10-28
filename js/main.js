/* Конфиг бренда — единственное место, где задано имя. Сменить здесь — сменится по всей странице. */
window.GI_BRAND = {
  name: "АЗАУ",
  product: "Питьевая вода «АЗАУ»"
};

(function () {
  "use strict";

  var DEFAULT_BRAND = "АЗАУ"; // то, что написано в HTML для без-JS
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

  /* ---------- сцены ---------- */
  var scenes = Array.prototype.map.call(document.querySelectorAll(".scene"), function (el, i) {
    return {
      el: el, i: i,
      cam: el.querySelector(".scene__cam"),
      shade: el.querySelector(".scene__shade"),
      img: el.querySelector(".stage__img"),
      stage: el.querySelector(".stage"),
      pan: (el.getAttribute("data-mpan") || "").split(",").map(Number),
      zoom: +(el.getAttribute("data-zoom") || 0),
      b: null
    };
  });
  var final = document.querySelector(".final");

  // «кипение»: второй кадр той же сцены, подгружается, только когда сцена рядом
  function loadBoil(s) {
    if (s.b || reduce) return;
    var key = (s.img.getAttribute("src").match(/scene-0\d/) || ["scene-0" + (s.i + 1)])[0];   // кадр, а не место на странице
    if (!A.boil || A.boil.indexOf(key) < 0) return;
    var b = document.createElement("img");
    b.className = "stage__img stage__img--b";
    b.alt = "";
    b.setAttribute("aria-hidden", "true");
    b.decoding = "async";
    b.src = "assets/" + key + "-b.webp";
    s.img.parentNode.insertBefore(b, s.img.nextSibling);
    b.addEventListener("load", function () { s.b = b; }, { once: true });
  }
  // следующую сцену грузим заранее, пока смотрят текущую
  function warm(s) {
    if (!s) return;
    if (s.img.loading === "lazy") s.img.loading = "eager";
    loadBoil(s);
  }

  /* ---------- прокрутка: наезд следующей страницы, лёгкий наезд камеры ---------- */
  var active = 0, ticking = false;
  var narrow = window.matchMedia("(max-width: 700px)");
  function frame() {
    ticking = false;
    var vh = window.innerHeight;
    var phone = narrow.matches;
    // сцена закреплена (sticky) и держится ещё --dwell прокрутки, потом её накрывает следующая
    var dwell = parseFloat(getComputedStyle(scenes[0].el).marginBottom) || 0;
    for (var i = 0; i < scenes.length; i++) {
      var s = scenes[i];
      var top = s.el.getBoundingClientRect().top;
      var next = scenes[i + 1] ? scenes[i + 1].el : final;
      var nTop = next ? next.getBoundingClientRect().top : vh;
      var enter = clamp(1 - top / vh, 0, 1);            // 0 — сцена ниже экрана, 1 — закреплена
      var hold = dwell ? clamp(1 - (nTop - vh) / dwell, 0, 1) : 1;   // задержка на экране
      var cover = clamp(1 - nTop / vh, 0, 1);           // насколько её накрыла следующая
      var gone = cover >= 1;
      s.el.classList.toggle("is-gone", gone);
      if (gone || enter <= 0) continue;
      if (enter >= 1 && cover < 0.5) active = i;
      if (!reduce) {
        var t = enter + hold + cover;                   // 0..3 — вся жизнь сцены на экране
        var sc = 1.02 + 0.014 * t - 0.012 * cover + s.zoom * clamp(enter + hold - 0.6, 0, 1);   // data-zoom: наезд к главному
        var x = 0;
        // телефон: в широком кадре двое героев — камера ведёт от одного к другому (data-mpan="откуда,куда")
        if (phone && s.pan.length === 2) {
          var over = s.stage.offsetWidth - s.el.clientWidth;
          var k = clamp(0.25 * enter + 0.75 * hold, 0, 1);
          k = k * k * (3 - 2 * k);                      // плавно в начале и в конце
          x = -over * (s.pan[0] + (s.pan[1] - s.pan[0]) * k);
        }
        s.cam.style.transform = "translate3d(" + Math.round(x) + "px," + r3(-cover * 2) + "vh,0) scale(" + r3(sc) + ")";
        s.shade.style.opacity = r3(cover * 0.14);
      }
    }
    warm(scenes[active]);
    warm(scenes[active + 1]);
  }
  function request() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(frame);
  }

  /* ---------- подписи и финал появляются по мере прокрутки ---------- */
  function setupReveal() {
    var caps = document.querySelectorAll(".cap");
    var i;
    if (reduce || !("IntersectionObserver" in window)) {
      for (i = 0; i < caps.length; i++) caps[i].classList.add("is-in");
      if (final) final.classList.add("is-in");
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        var c = e.target.querySelector(".cap");
        if (c) c.classList.add("is-in");
        if (e.target === final) final.classList.add("is-in");
        io.unobserve(e.target);
      });
    }, { threshold: 0.6 });
    scenes.forEach(function (s) { io.observe(s.el); });
    if (final) io.observe(final);
  }

  /* ---------- кипение линий: смена кадров a/b ~6 раз в секунду у сцен на экране ---------- */
  function setupBoil() {
    if (reduce) return;
    // есть WebGL — сцены оживит js/live.js; «кипение» до его загрузки только дёргало первые сцены
    var gl = document.createElement("canvas");
    if (gl.getContext("webgl") || gl.getContext("experimental-webgl")) { A.boil = []; return; }
    var tick = 0;
    setInterval(function () {
      tick++;
      for (var i = 0; i < scenes.length; i++) {
        var s = scenes[i];
        if (!s.b || s.el.classList.contains("is-gone")) continue;
        if (Math.abs(i - active) > 1) continue;
        s.el.classList.toggle("flip", tick % 2 === 0);
      }
    }, 250);
  }

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
  var bp = A.bottle6;                                   // место бутылки на уступе сцены 6 (доли кадра)
  var sb = document.querySelector("#s6 .scene__bottle");   // на первом экране своё место в style
  if (bp && sb) {
    sb.style.setProperty("--bot-x", bp[0]);
    sb.style.setProperty("--bot-y", bp[1]);
    sb.style.setProperty("--bot-h", bp[2]);
  }
  setupReveal();
  setupBoil();
  window.addEventListener("scroll", request, { passive: true });
  if (bar) window.addEventListener("scroll", topbar, { passive: true });
  window.addEventListener("resize", request);
  request();
})();
