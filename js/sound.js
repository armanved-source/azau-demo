/* Звук: ветер в горах и вода у источника, синтезом (Web Audio, без файлов). По умолчанию выключен — включается кнопкой
   в правом нижнем углу. Ветер дышит порывами всю дорогу, вода слышна сильнее у кадров с источником и водопадом
   (по камере js/main.js). У глотка — короткий всплеск. */
(function () {
  "use strict";
  var AC = window.AudioContext || window.webkitAudioContext;
  var T = window.GI_TOWER;
  if (!AC || !T) return;

  var btn = document.createElement("button");
  btn.className = "sound";
  btn.type = "button";
  btn.setAttribute("aria-pressed", "false");
  btn.setAttribute("aria-label", "Звук гор: включить");
  btn.innerHTML = '<svg viewBox="0 0 32 20" aria-hidden="true"><path class="sound__w" d="M1 10 Q5 2 9 10 T17 10 T25 10 T31 10"/></svg><span>Звук</span>';
  document.body.appendChild(btn);

  var ctx, master, windG, waterG, windF, on = false;
  function noise(sec) {
    var b = ctx.createBuffer(1, ctx.sampleRate * sec, ctx.sampleRate), d = b.getChannelData(0), last = 0;
    for (var i = 0; i < d.length; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }   // бурый шум
    var s = ctx.createBufferSource(); s.buffer = b; s.loop = true; return s;
  }
  function build() {
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);
    // ветер: низкий шум через полосовой фильтр, частота и громкость гуляют порывами
    var w = noise(4); windF = ctx.createBiquadFilter(); windF.type = "bandpass"; windF.frequency.value = 420; windF.Q.value = 0.7;
    windG = ctx.createGain(); windG.gain.value = 0.5;
    w.connect(windF); windF.connect(windG); windG.connect(master); w.start();
    // вода: светлый шум, выше по частоте
    var r = noise(3), wf = ctx.createBiquadFilter(); wf.type = "highpass"; wf.frequency.value = 1400;
    var r2 = ctx.createBiquadFilter(); r2.type = "peaking"; r2.frequency.value = 3200; r2.gain.value = 6;
    waterG = ctx.createGain(); waterG.gain.value = 0;
    r.connect(wf); wf.connect(r2); r2.connect(waterG); waterG.connect(master); r.start();
  }
  function set(v) {
    on = v;
    if (on && !ctx) build();
    if (!ctx) return;
    if (on && ctx.state === "suspended") ctx.resume();
    master.gain.setTargetAtTime(on ? 0.55 : 0, ctx.currentTime, 0.4);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    btn.setAttribute("aria-label", on ? "Звук гор: выключить" : "Звук гор: включить");
    btn.classList.toggle("is-on", on);
  }
  btn.addEventListener("click", function () { set(!on); });

  // вода громче у источника (кадр 3 — глоток, кадр 5 — источник наверху, переход-водопад между ними)
  function waterAt(y) {
    var F = T.FRAMES, near = 0;
    [2, 4].forEach(function (i) { if (F[i]) near = Math.max(near, 1 - Math.min(1, Math.abs(F[i].y + T.FH / 2 - y) / 0.6)); });
    var c = T.CLOUDS[3]; if (c) near = Math.max(near, 0.7 * (1 - Math.min(1, Math.abs(c.y - y) / 0.4)));
    return near;
  }
  function tick(now) {
    requestAnimationFrame(tick);
    if (!ctx || !on) return;
    var t = now / 1000, gust = 0.55 + 0.45 * Math.max(0, Math.sin(t * 0.53) * 0.6 + Math.sin(t * 1.31 + 1.7) * 0.4);
    windF.frequency.setTargetAtTime(300 + 380 * gust, ctx.currentTime, 0.3);
    windG.gain.setTargetAtTime(0.25 + 0.35 * gust, ctx.currentTime, 0.3);
    waterG.gain.setTargetAtTime(0.03 + 0.5 * waterAt(T.cam.y), ctx.currentTime, 0.4);
  }
  requestAnimationFrame(tick);

  // всплеск у глотка: короткий шум с падающим фильтром
  window.GI_SOUND = {
    splash: function () {
      if (!ctx || !on) return;
      var s = noise(1), f = ctx.createBiquadFilter(), g = ctx.createGain(), t = ctx.currentTime;
      f.type = "bandpass"; f.Q.value = 2; f.frequency.setValueAtTime(2600, t); f.frequency.exponentialRampToValueAtTime(500, t + 0.7);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.9, t + 0.04); g.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
      s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + 1);
    }
  };
})();
