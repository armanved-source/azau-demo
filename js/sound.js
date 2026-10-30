/* Звук: мягкий шорох разворачиваемого свитка на каждой новой остановке истории и лёгкая капля у глотка.
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
  btn.setAttribute("aria-label", "Звук свитка: включить");
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
  // свиток разворачивается: долгий мягкий шорох (тёплый, без высоких), в нём редкие тихие потрескивания волокон
  function flip() {
    var t = ctx.currentTime, dur = 1.25;
    var s = noise(dur + 0.1), lp = ctx.createBiquadFilter(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
    lp.type = "lowpass"; lp.frequency.value = 2200; lp.Q.value = 0.3;
    bp.type = "bandpass"; bp.Q.value = 0.7;
    bp.frequency.setValueAtTime(700, t); bp.frequency.linearRampToValueAtTime(1300, t + dur * 0.55); bp.frequency.linearRampToValueAtTime(900, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05, t + 0.25);          // мягкий вход
    g.gain.setValueAtTime(0.05, t + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);         // долгий хвост
    s.connect(bp); bp.connect(lp); lp.connect(g); g.connect(master); s.start(t); s.stop(t + dur + 0.05);
    for (var i = 0; i < 7; i++) {                                 // волокна папируса: тихие короткие щелчки
      var tc = t + 0.15 + Math.random() * (dur - 0.35), c = noise(0.03), cf = ctx.createBiquadFilter(), cg = ctx.createGain();
      cf.type = "bandpass"; cf.frequency.value = 1500 + Math.random() * 1500; cf.Q.value = 2;
      cg.gain.setValueAtTime(0.0001, tc); cg.gain.exponentialRampToValueAtTime(0.012 + Math.random() * 0.012, tc + 0.004); cg.gain.exponentialRampToValueAtTime(0.0001, tc + 0.03);
      c.connect(cf); cf.connect(cg); cg.connect(master); c.start(tc); c.stop(tc + 0.035);
    }
  }
  function set(v) {
    on = v;
    if (on && !ctx) build();
    if (!ctx) return;
    clearTimeout(sleep);
    if (on) { if (ctx.state === "suspended") ctx.resume(); flip(); }   // при включении — один шелест: слышно, что работает
    else sleep = setTimeout(function () { if (!on) ctx.suspend(); }, 800);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    btn.setAttribute("aria-label", on ? "Звук свитка: выключить" : "Звук свитка: включить");
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
      var now = performance.now(); if (now - lastFlip < 900) return; lastFlip = now;   // быстрая прокрутка — не трещим
      flip();
    },
    // капля у глотка: тихий «плюх» в чашу
    splash: function () {
      if (!ctx || !on) return;
      var t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sine"; o.frequency.setValueAtTime(900, t); o.frequency.exponentialRampToValueAtTime(380, t + 0.2);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.08, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.32);
    }
  };
})();
