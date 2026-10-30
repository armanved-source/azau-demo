/* Музыка: дудук («Mysterious Duduk», Amurich / ATMA, Pixabay Content License) тихим фоном. По умолчанию выключена —
   включается кнопкой «Музыка». Трек целиком загружается до первого звука (при потоковой подгрузке на телефоне музыка
   рвалась, пока сайт грузит кадры). Громкость — через Web Audio: на iPhone у <audio> громкость не меняется. Плеер
   «разблокируется» прямо в момент нажатия, иначе Safari не даст заиграть после загрузки. */
(function () {
  "use strict";
  var SRC = "assets/music-duduk.mp3", VOL = 0.35;
  var AC = window.AudioContext || window.webkitAudioContext;
  // крошечный беззвучный wav — чтобы запустить плеер в момент нажатия, пока грузится трек
  var SILENT = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";

  var btn = document.createElement("button");
  btn.className = "music";
  btn.type = "button";
  btn.setAttribute("aria-pressed", "false");
  btn.setAttribute("aria-label", "Музыка: включить");
  btn.innerHTML = '<svg viewBox="0 0 32 20" aria-hidden="true"><path class="music__w" d="M1 10 Q5 2 9 10 T17 10 T25 10 T31 10"/></svg><span>Музыка</span>';
  var skip = document.querySelector(".skip");
  if (skip) skip.parentNode.insertBefore(btn, skip.nextSibling); else document.body.insertBefore(btn, document.body.firstChild);

  var audio = null, ctx = null, gain = null, on = false, ready = false, loading = false, sleep = 0;
  function level(v, sec) {                               // плавная громкость
    if (gain) { var t = ctx.currentTime; gain.gain.cancelScheduledValues(t); gain.gain.setValueAtTime(gain.gain.value, t); gain.gain.linearRampToValueAtTime(v, t + sec); }
    else audio.volume = v;                               // браузер без Web Audio — как получится
  }
  function unlock() {                                    // строго внутри нажатия
    audio = new Audio(SILENT); audio.loop = true; audio.preload = "auto";
    if (AC) {
      try {
        ctx = new AC(); gain = ctx.createGain(); gain.gain.value = 0;
        ctx.createMediaElementSource(audio).connect(gain); gain.connect(ctx.destination); ctx.resume();
      } catch (e) { ctx = gain = null; }
    }
    if (!gain) audio.volume = 0;
    audio.play().catch(function () {});
  }
  function load() {
    loading = true; btn.classList.add("is-loading");
    var go = function (url) {
      audio.src = url; audio.loop = true; ready = true; loading = false; btn.classList.remove("is-loading");
      if (on) { audio.play().catch(function () {}); level(VOL, 1.5); }
    };
    fetch(SRC).then(function (r) { if (!r.ok) throw 0; return r.blob(); })
      .then(function (b) { go(URL.createObjectURL(b)); })
      .catch(function () { go(SRC); });                  // не вышло целиком — хотя бы потоком
  }
  function set(v) {
    on = v;
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    btn.setAttribute("aria-label", on ? "Музыка: выключить" : "Музыка: включить");
    btn.classList.toggle("is-on", on);
    clearTimeout(sleep);
    if (on && !audio) { unlock(); load(); return; }
    if (!audio) return;
    if (on) {
      if (ctx && ctx.state === "suspended") ctx.resume();
      if (ready) { audio.play().catch(function () {}); level(VOL, 1.5); }
    } else {
      level(0, 0.7);
      sleep = setTimeout(function () { if (!on) audio.pause(); }, 750);
    }
  }
  btn.addEventListener("click", function () { set(!on); });
  document.addEventListener("visibilitychange", function () {
    if (!audio || !on || !ready) return;
    if (document.hidden) audio.pause(); else audio.play().catch(function () {});
  });
})();
