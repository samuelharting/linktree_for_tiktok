/* Experiments: live badge variants 11 and 15 (html[data-live="11"|"15"]).
   Styles live in experiments-live2.css. Builds its own .lv2 element inside the
   hero countdown link, computes the next 9:30 ET weekday open itself and ticks
   every second. Live window: 9:30-11:00 ET (adds .lv2-on to the link).
   Test hook: ?xlive=1 forces the live state. */
(function () {
  var root = document.documentElement;
  var el = document.querySelector("[data-live-countdown]");
  if (!el || typeof Intl === "undefined") return;

  var query = null;
  try {
    query = new URLSearchParams(window.location.search);
  } catch (e) {}
  var forceLive = !!(query && query.get("xlive") === "1");

  var OPEN = 9 * 3600 + 30 * 60; // 9:30 New York
  var END = OPEN + 90 * 60; // live until 11:00
  var days = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  var names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hourCycle: "h23",
  });
  function pad(n) {
    return (n < 10 ? "0" : "") + n;
  }
  function isWeekday(d) {
    return d >= 1 && d <= 5;
  }

  function state() {
    var parts = {};
    fmt.formatToParts(new Date()).forEach(function (p) {
      parts[p.type] = p.value;
    });
    var day = days[parts.weekday];
    var now = (+parts.hour % 24) * 3600 + +parts.minute * 60 + +parts.second;
    var realLive = isWeekday(day) && now >= OPEN && now < END;
    if (realLive || forceLive) {
      var elapsed = realLive ? now - OPEN : 754;
      return { live: true, secs: elapsed, h: Math.floor(elapsed / 3600), m: Math.floor(elapsed / 60) % 60, s: elapsed % 60 };
    }
    var ahead = 0;
    while (!(isWeekday((day + ahead) % 7) && (ahead > 0 || now < OPEN))) ahead++;
    var secs = ahead * 86400 + OPEN - now;
    return {
      live: false,
      secs: secs,
      h: Math.floor(secs / 3600),
      m: Math.floor(secs / 60) % 60,
      s: secs % 60,
      when: ahead === 0 ? "Today" : names[(day + ahead) % 7],
    };
  }

  function node(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function set(n, text) {
    if (n.textContent !== text) n.textContent = text;
  }
  // Restart a CSS animation on a node (used for the per-second tick).
  function bump(n) {
    n.classList.remove("lv2-bump");
    void n.offsetWidth;
    n.classList.add("lv2-bump");
  }

  /* Each builder fills the .lv2 box and returns update(state). */
  var builders = {
    // 11: flip-clock lite.
    11: function (box) {
      var dot = box.appendChild(node("span", "lv2-dot"));
      var label = box.appendChild(node("span", "lv2-label"));
      var cells = box.appendChild(node("span", "lv2-cells"));
      var hh = cells.appendChild(node("span", "lv2-cell"));
      cells.appendChild(node("span", "lv2-sep", ":"));
      var mm = cells.appendChild(node("span", "lv2-cell"));
      cells.appendChild(node("span", "lv2-sep", ":"));
      var ss = cells.appendChild(node("span", "lv2-cell lv2-cell-s"));
      dot.setAttribute("aria-hidden", "true");
      return function (st) {
        set(label, st.live ? "Live now" : "Next stream in");
        set(hh, pad(st.h));
        set(mm, pad(st.m));
        set(ss, pad(st.s));
        bump(ss);
      };
    },
    // 15: minimal, seconds-sweep ring around a dot.
    15: function (box) {
      var ring = box.appendChild(node("span", "lv2-ring"));
      ring.appendChild(node("span", "lv2-ring-dot"));
      ring.setAttribute("aria-hidden", "true");
      var label = box.appendChild(node("span", "lv2-label"));
      var time = box.appendChild(node("span", "lv2-time"));
      var parts = [];
      ["h", "m", "s"].forEach(function (u) {
        var num = time.appendChild(node("span", "lv2-num"));
        time.appendChild(node("span", "lv2-unit", u));
        parts.push(num);
      });
      return function (st) {
        set(label, st.live ? "Live now" : "Next stream in");
        label.hidden = false;
        set(parts[0], String(st.h));
        parts[0].hidden = parts[0].nextSibling.hidden = st.h === 0;
        set(parts[1], pad(st.m));
        set(parts[2], pad(st.s));
        // Sweep fills over each minute; the ring is never fully empty.
        ring.style.setProperty("--lv2-p", st.live ? "1" : String((st.s + 1) / 60));
      };
    },
  };

  var box = null;
  var update = null;
  var current = null;

  function sync() {
    var v = root.dataset.live;
    if (!builders[v]) {
      if (box) box.remove();
      box = update = current = null;
      el.classList.remove("lv2-on");
      return;
    }
    if (v !== current) {
      if (box) box.remove();
      box = node("span", "lv2 lv2-v" + v);
      el.appendChild(box);
      update = builders[v](box);
      current = v;
    }
    tick();
  }

  function tick() {
    if (!update) return;
    var st = state();
    el.classList.toggle("lv2-on", st.live);
    update(st);
  }

  var timer = null;
  function loop() {
    tick();
    timer = setTimeout(loop, 1000 - (Date.now() % 1000) + 10);
  }

  sync();
  loop();
  document.addEventListener("bandz:variant", sync);
  if (window.MutationObserver) {
    new MutationObserver(sync).observe(root, {
      attributes: true,
      attributeFilter: ["data-live"],
    });
  }
})();
