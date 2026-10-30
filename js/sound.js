/* Звук: тихий шелест перелистываемой страницы на каждой новой остановке истории (как книга) и лёгкая капля у глотка.
   Синтез (Web Audio, без файлов), ничего не звучит постоянно. По умолчанию выключен — кнопка в левом нижнем углу
   (на телефоне — слева вверху). main.js зовёт GI_SOUND.flip() при смене остановки и GI_SOUND.splash() у глотка. */
(function () {
  "use strict";
  var AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;

  var btn = document.createElement("button");
  btn.className = "sound";
  btn.type = "button";
  btn.setAttribute("aria-pressed", "false");
  btn.setAttribute("aria-label", "Звук страниц: включить");
  btn.innerHTML = '<svg viewBox="0 0 32 20" aria-hidden="true"><path class="sound__w" d="M1 10 Q5 2 9 10 T17 10 T25 10 T31 10"/></svg><span>Звук</span>';
  var skip = document.querySelector(".skip");
  if (skip) skip.parentNode.insertBefore(btn, skip.nextSibling); else document.body.insertBefore(btn, document.body.firstChild);

  var ctx, master, on = false, sleep = 0, lastFlip = 0;
  function build() {
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
  }
  // белый шум нужной длины
  function noise(sec) {
    var b = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * sec), ctx.sampleRate), d = b.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    var s = ctx.createBufferSource(); s.buffer = b; return s;
  }
  // шелест страницы: мягкий «вжух» бумаги (полоса шума скользит вверх) и короткий хлопок ложащегося листа
  function flip() {
    var t = ctx.currentTime, dur = 0.42;
    var s = noise(dur + 0.1), f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = "bandpass"; f.Q.value = 0.9;
    f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(3200, t + dur * 0.7);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.05, t + dur * 0.75);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + dur + 0.05);
    var c = noise(0.08), cf = ctx.createBiquadFilter(), cg = ctx.createGain(), tc = t + dur * 0.8;
    cf.type = "lowpass"; cf.frequency.value = 1400;
    cg.gain.setValueAtTime(0.0001, tc); cg.gain.exponentialRampToValueAtTime(0.09, tc + 0.008); cg.gain.exponentialRampToValueAtTime(0.0001, tc + 0.07);
    c.connect(cf); cf.connect(cg); cg.connect(master); c.start(tc); c.stop(tc + 0.08);
  }
  function set(v) {
    on = v;
    if (on && !ctx) build();
    if (!ctx) return;
    clearTimeout(sleep);
    if (on) { if (ctx.state === "suspended") ctx.resume(); flip(); }   // при включении — один шелест: слышно, что работает
    else sleep = setTimeout(function () { if (!on) ctx.suspend(); }, 800);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    btn.setAttribute("aria-label", on ? "Звук страниц: выключить" : "Звук страниц: включить");
    btn.classList.toggle("is-on", on);
  }
  btn.addEventListener("click", function () { set(!on); });
  document.addEventListener("visibilitychange", function () {
    if (!ctx) return;
    if (document.hidden) ctx.suspend(); else if (on) ctx.resume();
  });

  window.GI_SOUND = {
    flip: function () {
      if (!ctx || !on || document.hidden) return;
      var now = performance.now(); if (now - lastFlip < 350) return; lastFlip = now;   // быстрая прокрутка — не трещим
      flip();
    },
    // капля у глотка: тихий «плюх» в чашу
    splash: function () {
      if (!ctx || !on) return;
      var t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sine"; o.frequency.setValueAtTime(1300, t); o.frequency.exponentialRampToValueAtTime(420, t + 0.18);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.18, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.32);
    }
  };
})();
