/* Stream countdown for the hero Discord button and the footer line.
   Weekday sessions (New York time, DST handled by Intl): London 1:00-4:00 AM and 9:30 AM-12:00 PM.
   Test hook: ?cdlive=london or ?cdlive=ny forces that session to show as live. */
(function () {
  if (typeof Intl === "undefined") return;
  var block = document.querySelector("[data-hero-sessions]");
  var nudge = document.querySelector("[data-footer-nudge]");
  var nudgeText = nudge && nudge.querySelector("[data-footer-nudge-text]");
  var nudgeThen = nudge && nudge.querySelector("[data-footer-nudge-then]");
  var liveStates = document.querySelectorAll("[data-live-state]");
  if (!block && !nudgeText) return;

  var forced = null;
  try {
    var q = new URLSearchParams(window.location.search).get("cdlive");
    if (q === "london" || q === "ny") forced = q;
  } catch (e) {}

  var LONDON = { name: "London", label: "London stream", hour: 1, minute: 0, from: 60, to: 240 };
  var NY = { name: "9:30 AM", label: "9:30 AM stream", hour: 9, minute: 30, from: 570, to: 720 };

  var fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  });
  function parts(d) {
    var out = {};
    fmt.formatToParts(d).forEach(function (p) {
      out[p.type] = p.value;
    });
    return out;
  }
  function isWeekday(name) {
    return name !== "Sat" && name !== "Sun";
  }
  // Next weekday start at hour:minute New York time. Scans real instants, so DST is respected.
  function nextStart(now, hour, minute) {
    var c = new Date(now.getTime());
    c.setUTCSeconds(0, 0);
    if (c <= now) c = new Date(c.getTime() + 60000);
    for (var i = 0; i < 8 * 24 * 60; i++, c = new Date(c.getTime() + 60000)) {
      var p = parts(c);
      if (isWeekday(p.weekday) && +p.hour === hour && +p.minute === minute) return c;
    }
    return c;
  }
  function pad(n) {
    return (n < 10 ? "0" : "") + n;
  }
  // 5h 43m 12s, or 1d 3h 04m once it is more than a day away.
  function withSeconds(ms) {
    var s = Math.max(0, Math.ceil(ms / 1000));
    var d = Math.floor(s / 86400);
    var h = Math.floor((s % 86400) / 3600);
    var m = Math.floor((s % 3600) / 60);
    if (d) return d + "d " + h + "h " + pad(m) + "m";
    return h ? h + "h " + pad(m) + "m " + pad(s % 60) + "s" : m + "m " + pad(s % 60) + "s";
  }
  // 5h 43m, no seconds.
  function rough(ms) {
    var m = Math.max(1, Math.ceil(ms / 60000));
    var h = Math.floor(m / 60);
    if (h >= 24) return Math.floor(h / 24) + "d " + (h % 24) + "h";
    return h > 0 ? h + "h " + pad(m % 60) + "m" : m + "m";
  }

  var nextLondon, nextNy;
  var last = {};
  function setText(el, value) {
    if (last[el.dataset.t || "_"] === value && el.dataset.t) return;
    el.textContent = value;
    if (el.dataset.t) last[el.dataset.t] = value;
  }

  function tick() {
    var now = new Date();
    if (!nextLondon || nextLondon <= now) nextLondon = nextStart(now, LONDON.hour, LONDON.minute);
    if (!nextNy || nextNy <= now) nextNy = nextStart(now, NY.hour, NY.minute);

    var p = parts(now);
    var mins = (+p.hour % 24) * 60 + +p.minute;
    var real = null;
    if (isWeekday(p.weekday)) {
      if (mins >= LONDON.from && mins < LONDON.to) real = "london";
      else if (mins >= NY.from && mins < NY.to) real = "ny";
    }
    var session = forced || real;
    var live = !!session;

    var L = { s: LONDON, rem: nextLondon - now };
    var N = { s: NY, rem: nextNy - now };
    var order = nextLondon < nextNy ? [L, N] : [N, L];
    var liveOne = session === "london" ? L : N;
    var otherOne = session === "london" ? N : L;

    for (var i = 0; i < liveStates.length; i++) liveStates[i].classList.toggle("is-live", live);

    if (block) {
      var vals = {
        n1: order[0].s.label,
        n1t: withSeconds(order[0].rem),
        n2: order[1].s.label,
        n2t: withSeconds(order[1].rem),
        l1: liveOne.s.label,
        l2: otherOne.s.label,
        l2t: withSeconds(otherOne.rem),
      };
      var cells = block.querySelectorAll("[data-t]");
      for (var j = 0; j < cells.length; j++) {
        if (cells[j].textContent !== vals[cells[j].dataset.t]) cells[j].textContent = vals[cells[j].dataset.t];
      }
      var idle = block.querySelectorAll("[data-idle]");
      var liv = block.querySelectorAll("[data-live]");
      for (var k = 0; k < idle.length; k++) idle[k].hidden = live;
      for (var m2 = 0; m2 < liv.length; m2++) liv[m2].hidden = !live;
    }

    if (nudgeText) {
      var text = live ? "Live now" : "Next stream: " + order[0].s.name + " in " + rough(order[0].rem);
      var then = live ? "" : order[1].s.label + " in " + rough(order[1].rem);
      if (nudgeText.textContent !== text) nudgeText.textContent = text;
      if (nudgeThen) {
        if (nudgeThen.textContent !== then) nudgeThen.textContent = then;
        nudgeThen.hidden = !then;
      }
      nudge.classList.toggle("is-live", live);
    }
  }

  tick();
  setInterval(tick, 1000);
})();
