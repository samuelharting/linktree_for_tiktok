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
    name: "Bandz Intraday",
    source: "assets/indicators/bandz-intraday-1m.png",
    alt: "Bandz Intraday indicator shown on a 1-minute chart",
  },
  {
    id: "2",
    name: "Bandz Sessions",
    source: "assets/indicators/bandz-sessions-1m.png",
    alt: "Bandz Sessions indicator shown on a 1-minute chart",
  },
  {
    id: "3",
    name: "Bandz SMT",
    source: "assets/indicators/bandz-smt-15m.png",
    alt: "Bandz SMT indicator shown on a 15-minute chart",
  },
  {
    id: "4",
    name: "Bandz HTF",
    source: "assets/indicators/bandz-htf-15m.png",
    alt: "Bandz HTF candles indicator shown on a 1-minute chart",
  },
  {
    id: "5",
    name: "Bandz Levels",
    source: "assets/indicators/bandz-levels-5m.png",
    alt: "Bandz Levels indicator shown on a 5-minute chart",
  },
  {
    id: "6",
    name: "Bandz STDV Flow",
    source: "assets/indicators/bandz-stdv-flow-1h.png",
    alt: "Bandz STDV Flow indicator projecting CISD standard-deviation objectives on a 4-hour MNQ chart",
  },
  {
    id: "7",
    name: "Bandz All-in-One",
    source: "assets/indicators/bandz-all-in-one-4h.png",
    alt: "Bandz All-in-One indicator combining the Bandz toolkit on a 4-hour MNQ chart",
  },
  {
    id: "8",
    name: "Bandz HTF Statistical Zones",
    tabName: "HTF Zones",
    source: "assets/indicators/bandz-htf-zones.png",
    alt: "Bandz HTF Statistical Zones showing daily percentile zones, session zones, and price targets",
  },
  {
    id: "9",
    name: "Bandz Po3 Profiler",
    tabName: "Po3 Profiler",
    source: "assets/indicators/bandz-po3-profiler.png",
    alt: "Bandz Po3 Profiler showing C1-C4 sequences, SMT divergence, CISD and three HTF candle lanes",
  },
];

const indicatorCards = classedTags("article", "indicator-card");
assert.equal(
  indicatorCards.length,
  9,
  "The storefront should contain exactly nine indicator cards",
);
assert.equal(
  classedTags("span", "product-status").length,
  0,
  "Released indicators should not display a Coming soon status",
);
assert.equal(
  html.includes("data-indicator-timeframe"),
  false,
  "Indicator slides should not display timeframe labels",
);

const indicatorTabTags = tagsWithAttributeValue("button", "role", "tab");
const indicatorPanelTags = tagsWithAttributeValue(null, "role", "tabpanel");
assert.equal(
  indicatorTabTags.length,
  9,
  "The indicator selector should contain exactly nine role=tab buttons",
);
assert.equal(
  indicatorPanelTags.length,
  9,
  "The indicator selector should contain exactly nine tabpanels",
);

const selectedIndicatorTabTags = indicatorTabTags.filter(
  (tag) => attributeValue(tag, "aria-selected") === "true",
);
const visibleIndicatorPanelTags = indicatorPanelTags.filter(
  (tag) => !hasAttribute(tag, "hidden"),
);
assert.equal(
  selectedIndicatorTabTags.length,
  1,
  "Exactly one indicator tab should be selected initially",
);
assert.equal(
  visibleIndicatorPanelTags.length,
  1,
  "Exactly one indicator panel should be visible initially",
);

const tabDataIds = indicatorTabTags.map((tag) =>
  attributeValue(tag, "data-indicator-tab"),
);
const panelDataIds = indicatorPanelTags.map((tag) =>
  attributeValue(tag, "data-indicator-panel"),
);
assert.equal(
  new Set(tabDataIds).size,
  9,
  "Each indicator tab should have a unique data id",
);
assert.equal(
  new Set(panelDataIds).size,
  9,
  "Each indicator panel should have a unique data id",
);

for (const tabTag of indicatorTabTags) {
  const dataId = attributeValue(tabTag, "data-indicator-tab");
  const tabId = attributeValue(tabTag, "id");
  const controlledPanelId = attributeValue(tabTag, "aria-controls");
  const expectedIndicator = expectedIndicators.find(
    (indicator) => indicator.id === dataId,
  );
  const panelTag = indicatorPanelTags.find(
    (candidate) => attributeValue(candidate, "data-indicator-panel") === dataId,
  );

  assert.ok(
    dataId,
    "Each indicator tab should provide a data-indicator-tab id",
  );
  assert.ok(
    expectedIndicator,
    `Indicator tab ${dataId} should map to an expected product`,
  );
  assert.ok(
    panelTag,
    `Indicator tab ${dataId} should have a panel with the same data id`,
  );
  assert.equal(
    attributeValue(panelTag, "id"),
    controlledPanelId,
    `Indicator tab ${dataId} should aria-control its matching panel`,
  );
  assert.equal(
    attributeValue(panelTag, "aria-labelledby"),
    tabId,
    `Indicator panel ${dataId} should be labelled by its matching tab`,
  );

  const tabElement = elementWithAttributeValue(
    "button",
    "data-indicator-tab",
    dataId,
  );
  const panelElement = elementWithAttributeValue(
    "article",
    "data-indicator-panel",
    dataId,
  );
  assert.ok(tabElement, `Indicator tab ${dataId} markup should be present`);
  assert.ok(panelElement, `Indicator panel ${dataId} markup should be present`);
  assert.match(
    tabElement,
    new RegExp(
      `<span\\b[^>]*\\bdata-indicator-name\\b[^>]*>\\s*${escapeRegExp(expectedIndicator.tabName ?? expectedIndicator.name.replace(/^Bandz\s+/, ""))}\\s*<\\/span>`,
      "i",
    ),
    `Indicator tab ${dataId} should display the short name of ${expectedIndicator.name}`,
  );
  assert.match(
    panelElement,
    new RegExp(
      `<h3\\b[^>]*\\bdata-indicator-heading\\b[^>]*>\\s*${escapeRegExp(expectedIndicator.name)}\\s*<\\/h3>`,
      "i",
    ),
    `Indicator panel ${dataId} should display ${expectedIndicator.name}`,
  );

  const panelImage = panelElement.match(/<img\b[^>]*>/i)?.[0];
  if (expectedIndicator.source) {
    assert.ok(
      panelImage,
      `Indicator panel ${dataId} should contain a screenshot image`,
    );
    assert.ok(
      hasAttribute(panelImage, "data-indicator-image"),
      `Indicator panel ${dataId} screenshot should use the catalog hook`,
    );
    assert.equal(
      attributeValue(panelImage, "src"),
      expectedIndicator.source,
      `Indicator panel ${dataId} should use the correct screenshot source`,
    );
    assert.equal(
      attributeValue(panelImage, "alt"),
      expectedIndicator.alt,
      `Indicator panel ${dataId} should describe its screenshot`,
    );
  } else {
    const placeholder = panelElement.match(
      /<div\b[^>]*class=["'][^"']*zones-visual[^"']*["'][^>]*>/i,
    )?.[0];
    assert.ok(
      placeholder,
      `Indicator panel ${dataId} should contain a preview placeholder until a real chart is supplied`,
    );
    assert.equal(
      attributeValue(placeholder, "role"),
      "img",
      `Indicator panel ${dataId} placeholder should expose image semantics`,
    );
    assert.equal(
      attributeValue(placeholder, "aria-label"),
      expectedIndicator.placeholderAlt,
      `Indicator panel ${dataId} placeholder should be described accessibly`,
    );
  }
  if (expectedIndicator.source) {
    await assert.doesNotReject(
      access(new URL(`../${expectedIndicator.source}`, import.meta.url)),
      `Indicator panel ${dataId} screenshot asset should exist`,
    );
  }
}

assert.equal(
  attributeValue(selectedIndicatorTabTags[0], "data-indicator-tab"),
  attributeValue(visibleIndicatorPanelTags[0], "data-indicator-panel"),
  "The initially selected tab and visible panel should share the same data id",
);

// Guard real destinations and functionality independently of the visual design.
const expectedReleases = [
  "I5ttNn7Z",
  "U8kMOoTV",
  "rznhXs1f",
  "o5YEAyX5",
  "ARHLM4iy",
  "y8wBff4r",
  "CedxWd5T",
  "r6gH5G4q",
  "i0RzxXU7",
];
for (let i = 1; i <= 9; i++) {
  const panel = elementWithAttributeValue(
    "article",
    "data-indicator-panel",
    String(i),
  );
  const links = panel.match(/<a\b[^>]*>/g) || [];
  assert.equal(links.length, 1, "Each indicator has one release link");
  assert.ok(
    attributeValue(links[0], "href").startsWith(
      "https://www.tradingview.com/script/" + expectedReleases[i - 1] + "-",
    ),
    "The correct public release is linked",
  );
}
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
  assert.equal(tags.length, 2, label + " appears in hero and footer");
  assert.equal(
    attributeValue(tags[0], "href"),
    attributeValue(tags[1], "href"),
    "Social targets agree",
  );
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
assert.ok(html.includes("data-shot-viewer"), "Screenshot viewer retained");
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

function testIndicatorSelection() {
  function indicatorTab(id, selected) {
    const attributes = new Map([["aria-selected", String(selected)]]);

    return eventTarget({
      dataset: { indicatorTab: String(id) },
      tabIndex: selected ? 0 : -1,
      setAttribute(name, value) {
        attributes.set(name, String(value));
      },
      getAttribute(name) {
        return attributes.get(name);
      },
      focus() {},
    });
  }

  const tabs = Array.from({ length: 9 }, (_, index) =>
    indicatorTab(index + 1, index === 0),
  );
  const panels = Array.from({ length: 9 }, (_, index) => ({
    dataset: { indicatorPanel: String(index + 1) },
    hidden: index !== 0,
  }));
  const document = eventTarget({
    hidden: false,
    webkitHidden: false,
    querySelector() {
      return null;
    },
    querySelectorAll(selector) {
      if (selector === "[data-indicator-tab]") return tabs;
      if (selector === "[data-indicator-panel]") return panels;
      return [];
    },
  });

  vm.runInNewContext(scriptMatch[1], {
    document,
    navigator: { userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
    window: {
      clearTimeout() {},
      setTimeout() {},
    },
  });

  tabs[2].listener("click")();

  tabs.forEach((tab, index) => {
    const isThirdIndicator = index === 2;
    assert.equal(
      tab.getAttribute("aria-selected"),
      String(isThirdIndicator),
      `Indicator tab ${index + 1} should ${isThirdIndicator ? "be" : "not be"} selected after clicking the third indicator`,
    );
    assert.equal(
      tab.tabIndex,
      isThirdIndicator ? 0 : -1,
      `Indicator tab ${index + 1} should have the correct tabIndex after clicking the third indicator`,
    );
  });

  panels.forEach((panel, index) => {
    assert.equal(
      panel.hidden,
      index !== 2,
      `Indicator panel ${index + 1} should ${index === 2 ? "be visible" : "be hidden"} after clicking the third indicator`,
    );
  });
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

testIndicatorSelection();

testMobileAppLink({
  appUrl: "instagram://user?username=bandz_trading",
  webUrl: "https://www.instagram.com/bandz_trading/",
});

testMobileAppLink({
  appUrl: "tiktok://@bandztrading",
  webUrl: "https://www.tiktok.com/@bandztrading",
});

console.log(
  "All nine indicator assets, destinations, tab behaviors, social fallbacks, and page anchors pass.",
);
