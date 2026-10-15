import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import vm from "node:vm";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const inlineScriptMatches = Array.from(
  html.matchAll(/<script>([\s\S]*?)<\/script>/g),
);
const scriptMatch = inlineScriptMatches.at(-1);
const styleMatch = html.match(/<style>([\s\S]*?)<\/style>/);
const bodyMatch = html.match(/<body\b[^>]*>([\s\S]*?)<script>/i);

assert.ok(scriptMatch, "The page script should be present");
assert.ok(styleMatch, "The page styles should be present");
assert.ok(bodyMatch, "The rendered page body should be present");

const css = styleMatch[1];

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function textFromMarkup(markup) {
  return markup
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&(?:mdash|#8212|#x2014);/gi, "—")
    .replace(/&(?:middot|#183|#x00b7);/gi, "·")
    .replace(/\s+([.,!?])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function elementOpeningTag(element, tagName) {
  return element.match(new RegExp(`^<${tagName}\\b[^>]*>`, "i"))?.[0] ?? "";
}

function classedTags(tagName, className) {
  const tags = html.match(new RegExp(`<${tagName}\\b[^>]*>`, "gi")) ?? [];
  return tags.filter((tag) => {
    const classMatch = tag.match(/\bclass=["']([^"']*)["']/i);
    return classMatch?.[1].split(/\s+/).includes(className);
  });
}

function literalCount(value) {
  return html.split(value).length - 1;
}

function openingTags(tagName) {
  const namePattern = tagName ?? "[a-z][a-z0-9-]*";
  return html.match(new RegExp(`<${namePattern}\\b[^>]*>`, "gi")) ?? [];
}

function attributeValue(tag, attribute) {
  const escapedAttribute = attribute.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return (
    tag.match(
      new RegExp(`\\s${escapedAttribute}\\s*=\\s*["']([^"']*)["']`, "i"),
    )?.[1] ?? null
  );
}

function hasAttribute(tag, attribute) {
  const escapedAttribute = attribute.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\s${escapedAttribute}(?=\\s|=|/?>)`, "i").test(tag);
}

function tagsWithAttributeValue(tagName, attribute, value) {
  return openingTags(tagName).filter(
    (tag) => attributeValue(tag, attribute) === value,
  );
}

function elementWithAttributeValue(tagName, attribute, value) {
  const attributePattern = `${escapeRegExp(attribute)}\\s*=\\s*["']${escapeRegExp(value)}["']`;
  return (
    html.match(
      new RegExp(
        `<${tagName}\\b(?=[^>]*\\s${attributePattern})[^>]*>[\\s\\S]*?<\\/${tagName}>`,
        "i",
      ),
    )?.[0] ?? null
  );
}

const expectedIndicators = [
  {
    id: "1",
    name: "Bandz Po3 Profiler",
    cardName: "Po3 Profiler",
    source: "assets/indicators/bandz-po3-profiler.png",
    alt: "Bandz Po3 Profiler showing C1-C4 sequences, SMT divergence, CISD and three HTF candle lanes",
  },
  {
    id: "2",
    name: "Bandz HTF Statistical Zones",
    cardName: "HTF Zones",
    source: "assets/indicators/bandz-htf-zones.png",
    alt: "Bandz HTF Statistical Zones showing daily percentile zones, session zones, and price targets",
  },
  {
    id: "3",
    name: "Bandz Intraday",
    cardName: "Intraday",
    source: "assets/indicators/bandz-intraday-1m.png",
    alt: "Bandz Intraday indicator shown on a 1-minute chart",
  },
  {
    id: "4",
    name: "Bandz SMT",
    cardName: "SMT",
    source: "assets/indicators/bandz-smt-15m.png",
    alt: "Bandz SMT indicator shown on a 15-minute chart",
  },
  {
    id: "5",
    name: "Bandz All-in-One",
    cardName: "All-in-One",
    extra: true,
    source: "assets/indicators/bandz-all-in-one-4h.png",
    alt: "Bandz All-in-One indicator combining the Bandz toolkit on a 4-hour MNQ chart",
  },
  {
    id: "6",
    name: "Bandz STDV Flow",
    cardName: "STDV Flow",
    extra: true,
    source: "assets/indicators/bandz-stdv-flow-1h.png",
    alt: "Bandz STDV Flow indicator projecting CISD standard-deviation objectives on a 4-hour MNQ chart",
  },
];
const indicatorCount = expectedIndicators.length;
const discordInvite = "https://discord.gg/XdWaEBXQ6G";

for (const retired of ["Bandz Sessions", "Bandz Levels", "Bandz HTF\""]) {
  assert.ok(
    !html.includes(`data-indicator-title="${retired.replace('"', "")}"`),
    `${retired.replace('"', "")} is no longer offered in the indicator section`,
  );
}
for (const retiredAsset of [
  "bandz-sessions-1m.png",
  "bandz-htf-15m.png",
  "bandz-levels-5m.png",
]) {
  assert.ok(
    !html.includes(retiredAsset),
    `${retiredAsset} is no longer referenced by the page`,
  );
}
const lede = html.match(/<p class="indicators-lede">([^<]*)<\/p>/)?.[1].trim();
assert.ok(lede, "The indicators lede is present");
assert.match(lede, /Discord/, "The lede points to the Discord");
assert.match(lede, /community/i, "The lede mentions community-built indicators");
assert.ok(lede.split(/\s+/).length <= 8, "The lede stays short (8 words max)");
assert.doesNotMatch(lede, /\d/, "The lede does not state a fixed count");

// The inline chart panel is gone; cards open the viewer instead.
assert.equal(classedTags("article", "indicator-card").length, 0, "No inline chart panels remain");
assert.equal(tagsWithAttributeValue(null, "role", "tabpanel").length, 0, "No tabpanels remain");
assert.equal(tagsWithAttributeValue(null, "role", "tab").length, 0, "Cards are plain buttons, not tabs");
assert.ok(!html.includes("indicator-expand"), "The old expand-chart icon is gone");
assert.equal(
  html.includes("data-indicator-timeframe"),
  false,
  "Indicator cards should not display timeframe labels",
);

const cardTags = openingTags("button").filter((tag) =>
  hasAttribute(tag, "data-indicator-card"),
);
assert.equal(cardTags.length, indicatorCount, "Exactly six indicator cards are present");
assert.deepEqual(
  cardTags.map((tag) => attributeValue(tag, "data-indicator-card")),
  expectedIndicators.map((indicator) => indicator.id),
  "Indicator cards appear in the intended order",
);

for (const expected of expectedIndicators) {
  const tag = cardTags.find(
    (candidate) => attributeValue(candidate, "data-indicator-card") === expected.id,
  );
  const card = elementWithAttributeValue("button", "data-indicator-card", expected.id);
  const label = `Indicator card ${expected.id} (${expected.cardName})`;

  assert.ok(card, `${label} markup should be present`);
  assert.equal(attributeValue(tag, "type"), "button", `${label} is a real button`);
  assert.equal(attributeValue(tag, "aria-haspopup"), "dialog", `${label} announces the viewer`);
  assert.equal(attributeValue(tag, "aria-controls"), "indicator-viewer", `${label} controls the viewer`);
  assert.equal(attributeValue(tag, "data-indicator-title"), expected.name, `${label} carries its full name`);
  assert.equal(attributeValue(tag, "data-indicator-alt"), expected.alt, `${label} describes its chart`);
  const blurb = attributeValue(tag, "data-indicator-blurb");
  assert.ok(blurb && blurb.length <= 70, `${label} has a one-line description`);
  assert.match(
    card,
    new RegExp(`<span\\b[^>]*\\bdata-indicator-name\\b[^>]*>\\s*${escapeRegExp(expected.cardName)}\\s*<\\/span>`),
    `${label} shows its short name`,
  );

  const thumb = card.match(/<img\b[^>]*>/i)?.[0];
  assert.ok(thumb && hasAttribute(thumb, "data-indicator-thumb"), `${label} shows a thumbnail`);
  assert.equal(attributeValue(thumb, "src"), expected.source, `${label} thumbnail uses its screenshot`);
  assert.equal(attributeValue(thumb, "alt"), "", `${label} thumbnail is decorative (the name labels the card)`);
  assert.ok(
    Number(attributeValue(thumb, "width")) > 0 && Number(attributeValue(thumb, "height")) > 0,
    `${label} thumbnail declares its size`,
  );
  await assert.doesNotReject(
    access(new URL(`../${expected.source}`, import.meta.url)),
    `${label} screenshot asset should exist`,
  );

  assert.equal(hasAttribute(tag, "data-indicator-extra"), Boolean(expected.extra), `${label} ${expected.extra ? "sits" : "does not sit"} behind Show more`);
  assert.equal(hasAttribute(tag, "hidden"), Boolean(expected.extra), `${label} is ${expected.extra ? "hidden" : "shown"} by default`);
}

const moreButtonTags = openingTags("button").filter((tag) =>
  hasAttribute(tag, "data-indicator-more"),
);
assert.equal(moreButtonTags.length, 1, "One Show more control is present");
assert.equal(attributeValue(moreButtonTags[0], "aria-expanded"), "false", "Show more starts collapsed");
assert.equal(attributeValue(moreButtonTags[0], "aria-controls"), "indicator-grid", "Show more controls the card grid");
assert.ok(
  openingTags().some((tag) => attributeValue(tag, "id") === "indicator-grid"),
  "The Show more target exists",
);

// The viewer: an aria-modal dialog with title, description, pager, close and one Discord link.
const viewer = elementWithAttributeValue("dialog", "id", "indicator-viewer");
assert.ok(viewer, "The indicator viewer dialog is present");
const viewerTag = elementOpeningTag(viewer, "dialog");
assert.equal(attributeValue(viewerTag, "aria-modal"), "true", "The viewer is aria-modal");
assert.equal(attributeValue(viewerTag, "aria-labelledby"), "indicator-viewer-title", "The viewer is labelled by the indicator name");
assert.ok(/id="indicator-viewer-title"/.test(viewer), "The viewer title element exists");
for (const hook of ["data-iv-img", "data-iv-blurb", "data-iv-prev", "data-iv-next", "data-iv-close", "data-iv-count"]) {
  assert.ok(viewer.includes(hook), `The viewer contains ${hook}`);
}
for (const hook of ["data-iv-prev", "data-iv-next", "data-iv-close"]) {
  const tag = (viewer.match(/<button\b[^>]*>/g) || []).find((candidate) => hasAttribute(candidate, hook));
  assert.ok(attributeValue(tag, "aria-label"), `The ${hook} control has an accessible name`);
}

// Guard real destinations and functionality independently of the visual design.
assert.doesNotMatch(html, /href=["'][^"']*tradingview\.com/i, "Indicator access goes through Discord, not direct TradingView links");
const viewerLinks = viewer.match(/<a\b[^>]*>/g) || [];
assert.equal(viewerLinks.length, 1, "The viewer has one Discord access link");
assert.equal(attributeValue(viewerLinks[0], "href"), discordInvite, "The viewer links to the Bandz Discord");
assert.match(viewer, /fa-discord[\s\S]*Get it in Discord/, "The viewer button reads Get it in Discord");

const anchors = openingTags("a");
for (const tag of anchors) {
  const href = attributeValue(tag, "href");
  if (href?.startsWith("#"))
    assert.ok(
      openingTags().some((t) => attributeValue(t, "id") === href.slice(1)),
      "Anchor target exists: " + href,
    );
  if (attributeValue(tag, "target") === "_blank")
    assert.ok(
      attributeValue(tag, "rel")?.includes("noopener"),
      "External tabs protect the opener",
    );
  assert.ok(
    !/whop|checkout|github\.com/i.test(href || ""),
    "No retired paid or source-repository links",
  );
}
for (const label of [
  "Bandz on X",
  "Bandz on Instagram",
  "Bandz on TikTok",
  "Bandz on YouTube",
]) {
  const tags = tagsWithAttributeValue("a", "aria-label", label);
  assert.equal(tags.length, 1, label + " appears once, in the footer");
}
assert.ok(
  anchors.some(
    (t) => attributeValue(t, "href") === "https://discord.gg/XdWaEBXQ6G",
  ),
  "Discord invite retained",
);
assert.ok(
  anchors.some(
    (t) => attributeValue(t, "href") === "https://bandzjournal.vercel.app/",
  ),
  "Journal retained",
);
assert.ok(
  html.includes("og-livestream-preview.png"),
  "Social preview retained",
);
assert.ok(!html.includes("↗"), "Use SVG arrows to avoid iOS emoji rendering");
for (const script of inlineScriptMatches) new vm.Script(script[1]);
for (const tag of openingTags("img")) {
  const src = attributeValue(tag, "src");
  if (src && !src.startsWith("http"))
    await access(new URL("../" + src, import.meta.url));
}
assert.equal(
  classedTags("button", "theme-mode-toggle").length,
  1,
  "Theme toggle retained",
);
assert.ok(!html.includes("data-shot-viewer"), "The old screenshot viewer is replaced by the indicator viewer");
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

function testIndicatorViewer() {
  let focused = null;

  function element(extra = {}, initialAttributes = {}) {
    const attributes = new Map(Object.entries(initialAttributes));
    const node = eventTarget({
      hidden: false,
      dataset: {},
      textContent: "",
      ...extra,
      setAttribute(name, value) {
        attributes.set(name, String(value));
      },
      getAttribute(name) {
        return attributes.has(name) ? attributes.get(name) : null;
      },
      focus() {
        focused = node;
      },
    });
    return node;
  }

  const cards = expectedIndicators.map((indicator) => {
    const thumb = element({}, { src: indicator.source, width: "2000", height: "1000" });
    const card = element({
      hidden: Boolean(indicator.extra),
      dataset: {
        indicatorCard: indicator.id,
        indicatorTitle: indicator.name,
        indicatorAlt: indicator.alt,
        indicatorBlurb: `${indicator.cardName} blurb`,
        ...(indicator.extra ? { indicatorExtra: "" } : {}),
      },
      querySelector(selector) {
        return selector === "[data-indicator-thumb]" ? thumb : null;
      },
    });
    return card;
  });

  const parts = {
    "[data-iv-shell]": element(),
    "[data-iv-stage]": element(),
    "[data-iv-img]": element(),
    "[data-iv-title]": element(),
    "[data-iv-blurb]": element(),
    "[data-iv-count]": element(),
    "[data-iv-prev]": element(),
    "[data-iv-next]": element(),
    "[data-iv-close]": element(),
    "[data-iv-discord]": element(),
  };
  const viewer = element({
    open: false,
    showModal() {
      this.open = true;
    },
    close() {
      this.open = false;
    },
    querySelector(selector) {
      return parts[selector] ?? null;
    },
  });
  const moreButton = element({ textContent: "Show more" }, { "aria-expanded": "false" });
  const rootClasses = new Set();
  const document = eventTarget({
    hidden: false,
    webkitHidden: false,
    documentElement: {
      classList: {
        add: (name) => rootClasses.add(name),
        remove: (name) => rootClasses.delete(name),
      },
    },
    querySelector(selector) {
      if (selector === "[data-indicator-more]") return moreButton;
      if (selector === "[data-indicator-viewer]") return viewer;
      return null;
    },
    querySelectorAll(selector) {
      return selector === "[data-indicator-card]" ? cards : [];
    },
  });

  Object.defineProperty(document, "activeElement", { get: () => focused });

  vm.runInNewContext(scriptMatch[1], {
    document,
    navigator: { userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
    window: { clearTimeout() {}, setTimeout() {} },
  });

  const click = (node) => node.listener("click")({ target: node });
  const key = (name, extra = {}) => {
    let prevented = false;
    viewer.listener("keydown")({ key: name, ...extra, preventDefault() { prevented = true; } });
    return prevented;
  };
  function assertShowing(index, total, context) {
    const expected = expectedIndicators[index];
    assert.equal(viewer.open, true, `The viewer is open ${context}`);
    assert.equal(parts["[data-iv-title]"].textContent, expected.name, `The viewer shows ${expected.name} ${context}`);
    assert.equal(parts["[data-iv-img]"].src, expected.source, `The viewer shows the ${expected.cardName} chart ${context}`);
    assert.equal(parts["[data-iv-img]"].alt, expected.alt, `The viewer chart is described ${context}`);
    assert.equal(parts["[data-iv-blurb]"].textContent, `${expected.cardName} blurb`, `The viewer shows the description ${context}`);
    assert.equal(parts["[data-iv-count]"].textContent, `${index + 1} / ${total}`, `The viewer counter reads ${index + 1} / ${total} ${context}`);
  }

  // Tap a card: the viewer opens on it, locks scroll and focuses Close.
  click(cards[2]);
  assertShowing(2, 4, "after tapping Intraday");
  assert.ok(rootClasses.has("iv-open"), "Page scroll is locked while the viewer is open");
  assert.equal(focused, parts["[data-iv-close]"], "Focus moves into the viewer");

  // Next/previous move through the visible cards only, wrapping around.
  click(parts["[data-iv-next]"]);
  assertShowing(3, 4, "after Next");
  click(parts["[data-iv-next]"]);
  assertShowing(0, 4, "after Next wraps past the last visible card");
  click(parts["[data-iv-prev]"]);
  assertShowing(3, 4, "after Previous wraps back");
  assert.equal(key("ArrowLeft"), true, "ArrowLeft is handled in the viewer");
  assertShowing(2, 4, "after ArrowLeft");

  // Swipes: left goes to the next indicator, down closes.
  const stage = parts["[data-iv-stage]"];
  stage.listener("pointerdown")({ clientX: 300, clientY: 400 });
  stage.listener("pointerup")({ clientX: 180, clientY: 410 });
  assertShowing(3, 4, "after swiping left");

  // Focus stays inside: Tab from the last control wraps to the first.
  parts["[data-iv-discord]"].focus();
  assert.equal(key("Tab"), true, "Tab is trapped at the end of the viewer");
  assert.equal(focused, parts["[data-iv-prev]"], "Tab wraps to the first viewer control");
  assert.equal(key("Tab", { shiftKey: true }), true, "Shift+Tab is trapped at the start");
  assert.equal(focused, parts["[data-iv-discord]"], "Shift+Tab wraps to the last viewer control");

  // Esc closes and returns focus to the card being shown.
  let cancelPrevented = false;
  viewer.listener("cancel")({ preventDefault() { cancelPrevented = true; } });
  assert.equal(cancelPrevented, true, "Esc is handled by the viewer close");
  assert.equal(viewer.open, false, "Esc closes the viewer");
  assert.ok(!rootClasses.has("iv-open"), "Page scroll unlocks after closing");
  assert.equal(focused, cards[3], "Focus returns to the card that was showing");

  // Show more reveals the extras, and the viewer then pages through all six.
  click(moreButton);
  assert.equal(moreButton.getAttribute("aria-expanded"), "true", "Show more expands");
  assert.equal(moreButton.textContent, "Show less", "Expanded control reads Show less");
  cards.forEach((card, index) => assert.equal(card.hidden, false, `Card ${index + 1} is shown when expanded`));
  click(cards[5]);
  assertShowing(5, 6, "after tapping STDV Flow");
  click(parts["[data-iv-next]"]);
  assertShowing(0, 6, "after Next wraps from the last of six");

  // Close button and backdrop both close.
  click(parts["[data-iv-close]"]);
  assert.equal(viewer.open, false, "The close button closes the viewer");
  assert.equal(focused, cards[0], "Focus returns to the card after the close button");
  click(cards[1]);
  viewer.listener("pointerdown")({});
  viewer.listener("click")({ target: viewer });
  assert.equal(viewer.open, false, "Tapping the backdrop closes the viewer");
  click(cards[1]);
  viewer.listener("click")({ target: parts["[data-iv-img]"] });
  assert.equal(viewer.open, true, "Tapping the chart itself keeps the viewer open");
  stage.listener("pointerdown")({ clientX: 200, clientY: 200 });
  stage.listener("pointerup")({ clientX: 205, clientY: 320 });
  assert.equal(viewer.open, false, "Swiping down closes the viewer");

  // Show less hides the extras again.
  click(moreButton);
  assert.equal(moreButton.getAttribute("aria-expanded"), "false", "Show less collapses");
  assert.equal(moreButton.textContent, "Show more", "Collapsed control reads Show more");
  cards.forEach((card, index) =>
    assert.equal(card.hidden, Boolean(expectedIndicators[index].extra), `Card ${index + 1} visibility resets when collapsed`),
  );
}

function testMobileAppLink({ appUrl, webUrl }) {
  const navigations = [];
  const timers = [];
  const link = eventTarget({ dataset: { appUrl }, href: webUrl });
  const document = eventTarget({
    hidden: false,
    webkitHidden: false,
    querySelector() {
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
    navigator: {
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
    },
    window,
  });

  let defaultPrevented = false;
  link.listener("click")({
    preventDefault() {
      defaultPrevented = true;
    },
  });

  assert.equal(
    defaultPrevented,
    true,
    "Mobile social taps should use the app-link handler",
  );
  assert.deepEqual(
    navigations,
    [appUrl],
    "The installed app should be attempted first",
  );
  assert.equal(timers.length, 1, "A web fallback should be scheduled");

  timers[0]();
  assert.deepEqual(
    navigations,
    [appUrl, webUrl],
    "The HTTPS profile should be used if the app does not open",
  );
}

testIndicatorViewer();

testMobileAppLink({
  appUrl: "instagram://user?username=bandz_trading",
  webUrl: "https://www.instagram.com/bandz_trading/",
});

testMobileAppLink({
  appUrl: "tiktok://@bandztrading",
  webUrl: "https://www.tiktok.com/@bandztrading",
});

console.log(
  "All six indicator cards, the indicator viewer, destinations, social fallbacks, and page anchors pass.",
);
