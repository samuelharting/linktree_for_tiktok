/* Stream countdown for the hero Discord button strip and the footer line.
   To change stream times, edit SESSIONS below (New York time; DST is handled by Intl).
   Test hook: ?cdlive=asia, ?cdlive=london or ?cdlive=ny forces that session to show as live. */
(function () {
  // Stream schedule. The strip shows the columns in this order (owner's order: 9:30 AM, Asia, London).
  //   id:    used by the ?cdlive= test hook
  //   label: shown in the strip and the footer
  //   start, end: "HH:MM", 24-hour New York time. An end earlier than the start runs past midnight.
  //   days:  New York weekdays the session STARTS on. 0 Sun, 1 Mon, 2 Tue, 3 Wed, 4 Thu, 5 Fri, 6 Sat.
  //          Asia runs Sunday-Thursday evenings: the trading week opens Sunday evening.
  var SESSIONS = [
    { id: "ny", label: "9:30 AM", start: "09:30", end: "12:00", days: [1, 2, 3, 4, 5] }, // 9:30 AM-12 PM, Mon-Fri
    { id: "asia", label: "Asia", start: "18:00", end: "22:00", days: [0, 1, 2, 3, 4] }, // 6-10 PM, Sun-Thu
    { id: "london", label: "London", start: "01:00", end: "04:00", days: [1, 2, 3, 4, 5] }, // 1-4 AM, Mon-Fri
  ];
  var TIME_ZONE = "America/New_York";

  if (typeof Intl === "undefined") return;
  var root = document.documentElement;
  var block = document.querySelector("[data-hero-sessions]");
  var liveTag = document.querySelector("[data-hero-live-tag]");
  var nudge = document.querySelector("[data-footer-nudge]");
  var nudgeText = nudge && nudge.querySelector("[data-footer-nudge-text]");
  var nudgeThen = nudge && nudge.querySelector("[data-footer-nudge-then]");
  var liveStates = document.querySelectorAll("[data-live-state]");
  if (!block && !nudgeText) return;

  var forced = null;
  try {
    var q = new URLSearchParams(window.location.search).get("cdlive");
    for (var f = 0; f < SESSIONS.length; f++) if (SESSIONS[f].id === q) forced = q;
  } catch (e) {}

  var fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    weekday: "short",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  });
  var DAY = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

  // New York wall clock for an instant.
  function zoned(ms) {
    var o = {};
    fmt.formatToParts(new Date(ms)).forEach(function (p) {
      o[p.type] = p.value;
    });
    return { y: +o.year, mo: +o.month, d: +o.day, h: +o.hour % 24, mi: +o.minute, wd: DAY[o.weekday] };
  }
  // New York wall clock -> real instant (ms). Day overflow is fine (d + 1 on the 31st).
  // Two passes settle the UTC offset across DST changes.
  function instant(y, mo, d, h, mi) {
    var want = Date.UTC(y, mo - 1, d, h, mi);
    var t = want;
    for (var i = 0; i < 2; i++) {
      var z = zoned(t);
      t += want - Date.UTC(z.y, z.mo - 1, z.d, z.h, z.mi);
    }
    return t;
  }
  function hm(text) {
    var p = String(text).split(":");
    return { h: +p[0] || 0, m: +p[1] || 0 };
  }
  SESSIONS.forEach(function (s) {
    s.from = hm(s.start);
    s.to = hm(s.end);
    s.overnight = s.to.h * 60 + s.to.m <= s.from.h * 60 + s.from.m;
  });

  // The window that is live now or comes next for a session: { start, end } in ms, or null.
  function windowFor(s, now) {
    var t = zoned(now);
    for (var k = -1; k <= 8; k++) {
      if (s.days.indexOf((((t.wd + k) % 7) + 7) % 7) < 0) continue;
      var start = instant(t.y, t.mo, t.d + k, s.from.h, s.from.m);
      var end = instant(t.y, t.mo, t.d + k + (s.overnight ? 1 : 0), s.to.h, s.to.m);
      if (end > now) return { start: start, end: end, at: now };
    }
    return null;
  }

  function pad(n) {
    return (n < 10 ? "0" : "") + n;
  }
  // Strip: 1d 3h over a day, 6h 36m from an hour, 36m 05s under an hour.
  function compact(ms) {
    var s = Math.max(0, Math.ceil(ms / 1000));
    var d = Math.floor(s / 86400);
    var h = Math.floor((s % 86400) / 3600);
    var m = Math.floor((s % 3600) / 60);
    if (d) return d + "d " + h + "h";
    if (h) return h + "h " + pad(m) + "m";
    return m + "m " + pad(s % 60) + "s";
  }
  // Footer: 5h 43m, or 1d 3h, no seconds.
  function rough(ms) {
    var m = Math.max(1, Math.ceil(ms / 60000));
    var h = Math.floor(m / 60);
    if (h >= 24) return Math.floor(h / 24) + "d " + (h % 24) + "h";
    return h > 0 ? h + "h " + pad(m % 60) + "m" : m + "m";
  }

  // One column per session, built from SESSIONS so the labels always match the config.
  var cells = [];
  if (block) {
    block.textContent = "";
    SESSIONS.forEach(function (s) {
      var row = document.createElement("span");
      row.className = "row";
      row.setAttribute("data-session", s.id);
      var name = row.appendChild(document.createElement("span"));
      name.textContent = s.label;
      var val = row.appendChild(document.createElement("b"));
      val.textContent = "\u2014";
      block.appendChild(row);
      cells.push({ row: row, val: val });
    });
  }

  var wins = [];
  function tick() {
    var now = Date.now();
    var state = SESSIONS.map(function (s, i) {
      var w = wins[i];
      if (!w || now >= w.end || now < w.at) w = wins[i] = windowFor(s, now);
      return {
        s: s,
        live: forced === s.id || (!!w && now >= w.start),
        rem: w ? w.start - now : Infinity,
      };
    });
    var anyLive = state.some(function (x) {
      return x.live;
    });
    // Soonest upcoming first, then the one after it.
    var upcoming = state
      .filter(function (x) {
        return !x.live && x.rem !== Infinity;
      })
      .sort(function (a, b) {
        return a.rem - b.rem;
      });
    // The column the eye should land on: the live one(s), otherwise the next to start.
    var next = !anyLive && upcoming[0];

    root.classList.toggle("is-stream-live", anyLive);
    if (liveTag) liveTag.hidden = !anyLive;
    for (var i = 0; i < liveStates.length; i++) liveStates[i].classList.toggle("is-live", anyLive);

    cells.forEach(function (c, j) {
      var x = state[j];
      var text = x.live ? "LIVE" : x.rem === Infinity ? "\u2014" : compact(x.rem);
      if (c.val.textContent !== text) c.val.textContent = text;
      c.val.classList.toggle("livebadge", x.live);
      c.row.classList.toggle("is-live", x.live);
      c.row.classList.toggle("is-next", x === next);
    });

    if (nudgeText) {
      var text = "Next stream soon";
      var then = "";
      if (anyLive) text = "Live now";
      else if (upcoming[0]) {
        text = "Next stream: " + upcoming[0].s.label + " in " + rough(upcoming[0].rem);
        if (upcoming[1]) then = upcoming[1].s.label + " stream in " + rough(upcoming[1].rem);
      }
      if (nudgeText.textContent !== text) nudgeText.textContent = text;
      if (nudgeThen) {
        if (nudgeThen.textContent !== then) nudgeThen.textContent = then;
        nudgeThen.hidden = !then;
      }
      nudge.classList.toggle("is-live", anyLive);
    }
  }

  // Tick just after each wall-clock second so the seconds never skip.
  function loop() {
    tick();
    setTimeout(loop, 1010 - (Date.now() % 1000));
  }
  loop();
})();
