/* Музыка: дудук («Mysterious Duduk», Amurich / ATMA, Pixabay Content License) тихим фоном. По умолчанию выключена —
   включается кнопкой «Музыка» (браузеры и не дают играть звук без нажатия). Файл грузится только после нажатия;
   громкость нарастает и затихает плавно; на скрытой вкладке — пауза. */
(function () {
  "use strict";
  var SRC = "assets/music-duduk.mp3", VOL = 0.35;

  var btn = document.createElement("button");
  btn.className = "music";
  btn.type = "button";
  btn.setAttribute("aria-pressed", "false");
  btn.setAttribute("aria-label", "Музыка: включить");
  btn.innerHTML = '<svg viewBox="0 0 32 20" aria-hidden="true"><path class="music__w" d="M1 10 Q5 2 9 10 T17 10 T25 10 T31 10"/></svg><span>Музыка</span>';
  var skip = document.querySelector(".skip");
  if (skip) skip.parentNode.insertBefore(btn, skip.nextSibling); else document.body.insertBefore(btn, document.body.firstChild);

  var audio = null, on = false, fade = 0;
  function ramp(to, ms, done) {
    cancelAnimationFrame(fade);
    var from = audio.volume, t0 = performance.now();
    (function f(now) {
      var k = Math.min(1, (now - t0) / ms);
      audio.volume = from + (to - from) * k;
      if (k < 1) fade = requestAnimationFrame(f); else if (done) done();
    })(t0);
  }
  function set(v) {
    on = v;
    if (on && !audio) { audio = new Audio(SRC); audio.loop = true; audio.volume = 0; }
    if (!audio) return;
    if (on) { audio.play().catch(function () { set(false); }); ramp(VOL, 1500); }
    else ramp(0, 700, function () { if (!on) audio.pause(); });
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    btn.setAttribute("aria-label", on ? "Музыка: выключить" : "Музыка: включить");
    btn.classList.toggle("is-on", on);
  }
  btn.addEventListener("click", function () { set(!on); });
  document.addEventListener("visibilitychange", function () {
    if (!audio || !on) return;
    if (document.hidden) audio.pause(); else audio.play().catch(function () {});
  });
})();
