import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/);

assert.ok(scriptMatch, "The page script should be present");

function eventTarget(extra = {}) {
  const listeners = new Map();

  return {
    ...extra,
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    removeEventListener(type) {
      listeners.delete(type);
    },
    listener(type) {
      return listeners.get(type);
    },
  };
}

function testMobileAppLink({ appUrl, webUrl }) {
  const navigations = [];
  const timers = [];
  const link = eventTarget({ dataset: { appUrl }, href: webUrl });
  const closeButton = eventTarget();
  const dialog = eventTarget({
    open: false,
    querySelector() {
      return closeButton;
    },
    showModal() {
      this.open = true;
    },
    close() {
      this.open = false;
    },
  });
  const openButton = eventTarget();
  const classList = { add() {}, remove() {} };
  const document = eventTarget({
    body: { classList },
    hidden: false,
    webkitHidden: false,
    querySelector(selector) {
      if (selector === "#indicatorsDialog") return dialog;
      if (selector === "#openIndicators") return openButton;
      return null;
    },
    querySelectorAll(selector) {
      return selector === "a[data-app-url]" ? [link] : [];
    },
  });
  const location = {};

  Object.defineProperty(location, "href", {
    set(value) {
      navigations.push(value);
    },
  });

  const window = {
    location,
    setTimeout(callback) {
      timers.push(callback);
    },
  };

  vm.runInNewContext(scriptMatch[1], {
    document,
    navigator: { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)" },
    window,
  });

  let defaultPrevented = false;
  link.listener("click")({
    preventDefault() {
      defaultPrevented = true;
    },
  });

  assert.equal(defaultPrevented, true, "Mobile social taps should use the app-link handler");
  assert.deepEqual(navigations, [appUrl], "The installed app should be attempted first");
  assert.equal(timers.length, 1, "A web fallback should be scheduled");

  timers[0]();
  assert.deepEqual(navigations, [appUrl, webUrl], "The HTTPS profile should be used if the app does not open");
}

testMobileAppLink({
  appUrl: "instagram://user?username=bandz_trading",
  webUrl: "https://www.instagram.com/bandz_trading/",
});

testMobileAppLink({
  appUrl: "tiktok://@bandztrading",
  webUrl: "https://www.tiktok.com/@bandztrading",
});

console.log("Instagram and TikTok mobile app links and web fallbacks are wired correctly.");
