import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import vm from "node:vm";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const inlineScriptMatches = Array.from(html.matchAll(/<script>([\s\S]*?)<\/script>/g));
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
  return tag.match(new RegExp(`\\s${escapedAttribute}\\s*=\\s*["']([^"']*)["']`, "i"))?.[1] ?? null;
}

function hasAttribute(tag, attribute) {
  const escapedAttribute = attribute.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\s${escapedAttribute}(?=\\s|=|/?>)`, "i").test(tag);
}

function tagsWithAttributeValue(tagName, attribute, value) {
  return openingTags(tagName).filter((tag) => attributeValue(tag, attribute) === value);
}

function elementWithAttributeValue(tagName, attribute, value) {
  const attributePattern = `${escapeRegExp(attribute)}\\s*=\\s*["']${escapeRegExp(value)}["']`;
  return html.match(
    new RegExp(`<${tagName}\\b(?=[^>]*\\s${attributePattern})[^>]*>[\\s\\S]*?<\\/${tagName}>`, "i"),
  )?.[0] ?? null;
}

const expectedDesignTokens = new Map([
  ["--background", "#F4F4F2"],
  ["--background-alt", "#E9E9E6"],
  ["--surface", "#FFFFFF"],
  ["--text", "#111111"],
  ["--muted-text", "#666662"],
  ["--border", "#D3D3CF"],
  ["--accent", "#111111"],
  ["--accent-dark", "#171717"],
  ["--accent-soft", "#ECECEA"],
  ["--accent-muted", "#797975"],
  ["--discord", "#7C4DFF"],
  ["--journal", "#0071E3"],
]);

for (const [token, value] of expectedDesignTokens) {
  assert.match(
    css,
    new RegExp(`${escapeRegExp(token)}\\s*:\\s*${escapeRegExp(value)}\\s*;`, "i"),
    `${token} should use the monochrome palette value ${value}`,
  );
}

assert.match(
  html,
  /<meta\s+name=["']theme-color["']\s+content=["']#F1F1EE["']\s*\/>/i,
  "The browser theme color should match the approved background token",
);
assert.equal(html.includes("og-store-forest-preview.png"), false, "The old forest social preview should not be referenced");
assert.equal(html.includes("og-store-graphite-preview.png"), false, "The stale social preview path should not be referenced");
assert.match(html, /og-livestream-preview\.png/, "The livestream social preview should be wired into page metadata");
assert.match(
  html,
  /<meta\s+property=["']og:url["']\s+content=["']https:\/\/all-bandz-links\.vercel\.app\/\?preview=livestream["']\s*\/>/i,
  "The social card should use a fresh canonical preview URL",
);
await assert.doesNotReject(
  access(new URL("../og-livestream-preview.png", import.meta.url)),
  "The livestream social preview asset should exist on disk",
);
assert.match(
  css,
  /\.button--primary\s*\{[^}]*background:\s*var\(--accent-dark\)/i,
  "Primary buttons should use the dark graphite accent",
);
assert.match(
  css,
  /\.button--primary:hover\s*\{[^}]*background:\s*var\(--accent\)/i,
  "Primary button hover should use the graphite accent",
);
assert.match(
  css,
  /\.button--secondary\s*\{[^}]*background:\s*transparent/i,
  "Secondary buttons should retain a transparent background",
);

const forbiddenColorPatterns = [
  [/#(?:59465f|443349|75615e)\b/i, "legacy purple hex"],
  [/#(?:28343e|343c45)\b/i, "legacy blue-gray hex"],
  [/#f0b661\b/i, "legacy bright-gold hex"],
  [/#(?:3d4b41|29352e|e3e7e1)\b/i, "legacy green hex"],
  [/rgba?\(\s*(?:89\s*,\s*70\s*,\s*95|137\s*,\s*112\s*,\s*145|147\s*,\s*117\s*,\s*154)/i, "legacy purple RGB"],
  [/rgba?\(\s*(?:40\s*,\s*52\s*,\s*62|104\s*,\s*119\s*,\s*133)/i, "legacy blue-gray RGB"],
  [/rgba?\(\s*240\s*,\s*182\s*,\s*97/i, "legacy bright-gold RGB"],
  [/rgba?\(\s*(?:61\s*,\s*75\s*,\s*65|41\s*,\s*53\s*,\s*46)/i, "legacy green RGB"],
  [/\b(?:plum|purple)\b/i, "legacy purple color name"],
];

for (const [pattern, label] of forbiddenColorPatterns) {
  assert.doesNotMatch(css, pattern, `The stylesheet should not contain ${label} values`);
}

const renderedText = textFromMarkup(bodyMatch[1]);
const requiredCopy = [
  "FREE INDICATORS · LIVESTREAMS · FREE JOURNAL",
  "Live trading. Free tools.",
  "Live streams, a trading community, free indicators, and a free journal.",
  "Get the indicators in Discord",
  "9 free, open-source indicators in the free Discord",
  "Free trading journal",
  "Join the free Discord",
  "Open the free journal",
  "Free Indicators in Discord",
  "Journal · Free",
  "01 · Indicators",
  "Nine free indicators.",
  "Free & open source",
  "Maps ICT macro windows and first-presented FVGs with volume-imbalance and calendar context.",
  "Tracks ICT killzones, session liquidity, opening ranges, and Opening RTH Gap projections.",
  "Scans multi-timeframe SMT divergence while filtering redundant lower-timeframe signals.",
  "Displays higher-timeframe candles with PSP, SMT, T-Spots, CISD, FVGs, and sweeps.",
  "Maps NWOG, NDOG, HTF levels, scheduled opens, dealing ranges, and ADR targets.",
  "Tracks higher-timeframe liquidity sweeps through CISD and opposing-swing confirmation, then projects standard-deviation objectives from the setup anchors.",
  "Combines five core Bandz workflows into one streamlined script for a cleaner single-chart workflow. Bandz Levels and alerts are not included.",
  "Want all nine?",
  "Free and open source in the Discord.",
  "02 · Trading Journal",
  "Review the process, not just the P&L.",
  "Bandz Trading Journal",
  "Log every trade. See what is working.",
  "03 · Discord",
  "Trade live with us in the free Discord.",
  "Free Discord",
  "Free to join",
  "Watch live trading streams, ask questions in real time, and get all nine indicators.",
  "Catch the live trading streams",
];

for (const expectedCopy of requiredCopy) {
  assert.ok(renderedText.includes(expectedCopy), `The page should render the approved copy: "${expectedCopy}"`);
}

assert.match(
  html,
  /<a\s+class=["']brand["'][^>]*>\s*Bandz\s*<\/a>/i,
  "The header brand should render without a trailing period",
);
assert.match(html, /<a\s+href=["']#discord["']>\s*Discord\s*<em class="nav-free[^"]*">Free<\/em><\/a>/i, "Navigation should link to Discord and mark it free like the other links");
assert.match(
  html,
  /<nav\s+class=["']hero-socials["'][^>]*aria-label=["']Bandz social media quick links["']/i,
  "The hero should include a subtle social-links row",
);
for (const socialLabel of ["Bandz on X", "Bandz on Instagram", "Bandz on TikTok", "Bandz on YouTube"]) {
  assert.equal(
    (html.match(new RegExp(`aria-label=["']${socialLabel}["']`, "g")) ?? []).length,
    2,
    `${socialLabel} should appear once near the top and once in the footer`,
  );
}
const heroSocialMarkup = elementWithAttributeValue("nav", "aria-label", "Bandz social media quick links");
const footerSocialMarkup = elementWithAttributeValue("nav", "aria-label", "Bandz social media");
const socialTargets = (markup) =>
  (markup.match(/<a\b[^>]*\bclass=["'][^"']*\bsocial-link\b[^"']*["'][^>]*>/gi) ?? []).map((tag) => ({
    label: attributeValue(tag, "aria-label"),
    href: attributeValue(tag, "href"),
    appUrl: attributeValue(tag, "data-app-url"),
  }));
assert.deepEqual(
  socialTargets(heroSocialMarkup),
  socialTargets(footerSocialMarkup),
  "The top and footer social controls should share the same destinations and app-link behavior",
);
assert.ok(
  html.indexOf('href="#journal"') < html.indexOf('href="#discord"'),
  "Trading Journal should appear before Discord in the navigation",
);
assert.ok(
  html.indexOf('id="journal"') < html.indexOf('id="discord"'),
  "Trading Journal should appear before Discord on the page",
);
assert.match(
  html,
  /const\s+backgroundVariant\s*=\s*["']grid["']\s*;/,
  "The background treatment should be controlled by one paper/grid/market setting",
);
assert.match(css, /data-background-variant=["']grid["']/, "The grid background variant should be implemented");
assert.match(css, /data-background-variant=["']market["']/, "The market background variant should be implemented");

const expectedUiThemes = ["studio", "night"];
assert.match(
  html,
  /const\s+allowedUiThemes\s*=\s*\[\s*["']studio["']\s*,\s*["']night["']\s*\]/,
  "Only the final light and dark themes should be selectable",
);
assert.match(
  html,
  /let\s+initialUiTheme\s*=\s*["']studio["']\s*;/,
  "Studio Edit should be the default theme",
);
assert.match(
  html,
  /<div\b[^>]*class=["'][^"']*ui-switcher[^"']*["'][^>]*\bhidden\b/i,
  "The retired comparison switcher should remain hidden",
);

const modeToggles = classedTags("button", "theme-mode-toggle");
assert.equal(modeToggles.length, 1, "The header should expose one light and dark mode toggle");
assert.equal(
  attributeValue(modeToggles[0], "aria-label"),
  "Switch to dark mode",
  "The default light-mode toggle should clearly announce its action",
);
assert.ok(
  hasAttribute(modeToggles[0], "data-theme-mode-toggle"),
  "The light and dark mode toggle should include its behavior hook",
);

assert.doesNotMatch(html, /toggle-style-cycle/, "The removed toggle comparison control should stay absent");
assert.doesNotMatch(html, /data-toggle-design/, "The final page should not retain alternate toggle treatments");
assert.match(
  css,
  /linear-gradient\(90deg,\s*#171717\s+0\s+50%,\s*#f5f5f1\s+50%\s+100%\)/i,
  "The final light/dark control should retain the split-disc treatment",
);

for (const theme of expectedUiThemes) {
  assert.match(
    css,
    new RegExp(`data-ui-theme=["']${escapeRegExp(theme)}["']`, "i"),
    `The ${theme} UI should have a dedicated stylesheet`,
  );
}

assert.match(
  css,
  /html\[data-ui-theme=["']studio["']\]\s+\.brand\s*,\s*html\[data-ui-theme=["']night["']\]\s+\.brand\s*\{[^}]*font-family:\s*["']Manrope["'][^}]*font-style:\s*normal/is,
  "Light and dark modes should share the approved Bandz wordmark typography",
);

const indicatorsSectionIndex = html.indexOf('id="indicators"');
const discordSectionIndex = html.indexOf('id="discord"');
const journalSectionIndex = html.indexOf('id="journal"');
assert.ok(indicatorsSectionIndex > -1, "The Indicators section should be present");
assert.ok(journalSectionIndex > indicatorsSectionIndex, "Trading Journal should follow Indicators in the page hierarchy");
assert.ok(discordSectionIndex > journalSectionIndex, "Discord should follow Trading Journal in the page hierarchy");

const headerNavigation = html.match(
  /<nav\b[^>]*class=["'][^"']*header-nav[^"']*["'][^>]*>[\s\S]*?<\/nav>/i,
)?.[0];
assert.ok(headerNavigation, "The header navigation should be present");
assert.ok(
  headerNavigation.indexOf('href="#indicators"') < headerNavigation.indexOf('href="#journal"') &&
    headerNavigation.indexOf('href="#journal"') < headerNavigation.indexOf('href="#discord"'),
  "The header navigation should list Indicators, Trading Journal, then Discord",
);

const forbiddenPublicCopy = [
  "Trade With Me",
  "My Free Discord",
  "My Paid Discord",
  "Indicator One",
  "Indicator Two",
  "Indicator Three",
  "Indicator Four",
  "Indicator Five",
  "Store preview only",
  "checkout is not connected",
  "Final product details coming next",
  "screenshots will replace the placeholders",
  "will replace the placeholders",
  "Placeholder coming soon",
  "These are preview cards",
  "Preview offer",
  "Final names coming next",
  "Final name coming",
  "Replace with indicator screenshot",
  "Use this space to lead",
  "Use this description to explain",
  "Describe the setup this indicator",
  "Show how this tool fits",
  "Close the collection by explaining",
  "Paid Discord placeholder",
  "no invite or payment link is connected",
  "send your Whop/WAP product link",
];

assert.equal(
  renderedText.includes("Bandz."),
  false,
  "Visible Bandz branding should not include a trailing period",
);
assert.equal(html.includes("offer-strip"), false, "The repetitive price divider should be fully removed");
assert.equal(renderedText.includes("$"), false, "The indicators are free, so no price should appear");
assert.equal(html.toLowerCase().includes("whop"), false, "The retired Whop checkout should not be linked");

for (const forbiddenCopy of forbiddenPublicCopy) {
  assert.equal(
    html.toLowerCase().includes(forbiddenCopy.toLowerCase()),
    false,
    `Internal or retired copy should not appear: "${forbiddenCopy}"`,
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
assert.equal(indicatorCards.length, 9, "The storefront should contain exactly nine indicator cards");
assert.equal(classedTags("span", "product-status").length, 0, "Released indicators should not display a Coming soon status");
assert.equal(
  html.includes("data-indicator-timeframe"),
  false,
  "Indicator slides should not display timeframe labels",
);

const indicatorTabTags = tagsWithAttributeValue("button", "role", "tab");
const indicatorPanelTags = tagsWithAttributeValue(null, "role", "tabpanel");
assert.equal(indicatorTabTags.length, 9, "The indicator selector should contain exactly nine role=tab buttons");
assert.equal(indicatorPanelTags.length, 9, "The indicator selector should contain exactly nine tabpanels");

const selectedIndicatorTabTags = indicatorTabTags.filter(
  (tag) => attributeValue(tag, "aria-selected") === "true",
);
const visibleIndicatorPanelTags = indicatorPanelTags.filter((tag) => !hasAttribute(tag, "hidden"));
assert.equal(selectedIndicatorTabTags.length, 1, "Exactly one indicator tab should be selected initially");
assert.equal(visibleIndicatorPanelTags.length, 1, "Exactly one indicator panel should be visible initially");

const tabDataIds = indicatorTabTags.map((tag) => attributeValue(tag, "data-indicator-tab"));
const panelDataIds = indicatorPanelTags.map((tag) => attributeValue(tag, "data-indicator-panel"));
assert.equal(new Set(tabDataIds).size, 9, "Each indicator tab should have a unique data id");
assert.equal(new Set(panelDataIds).size, 9, "Each indicator panel should have a unique data id");

for (const tabTag of indicatorTabTags) {
  const dataId = attributeValue(tabTag, "data-indicator-tab");
  const tabId = attributeValue(tabTag, "id");
  const controlledPanelId = attributeValue(tabTag, "aria-controls");
  const expectedIndicator = expectedIndicators.find((indicator) => indicator.id === dataId);
  const panelTag = indicatorPanelTags.find(
    (candidate) => attributeValue(candidate, "data-indicator-panel") === dataId,
  );

  assert.ok(dataId, "Each indicator tab should provide a data-indicator-tab id");
  assert.ok(expectedIndicator, `Indicator tab ${dataId} should map to an expected product`);
  assert.ok(panelTag, `Indicator tab ${dataId} should have a panel with the same data id`);
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

  const tabElement = elementWithAttributeValue("button", "data-indicator-tab", dataId);
  const panelElement = elementWithAttributeValue("article", "data-indicator-panel", dataId);
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
    assert.ok(panelImage, `Indicator panel ${dataId} should contain a screenshot image`);
    assert.ok(hasAttribute(panelImage, "data-indicator-image"), `Indicator panel ${dataId} screenshot should use the catalog hook`);
    assert.equal(attributeValue(panelImage, "src"), expectedIndicator.source, `Indicator panel ${dataId} should use the correct screenshot source`);
    assert.equal(attributeValue(panelImage, "alt"), expectedIndicator.alt, `Indicator panel ${dataId} should describe its screenshot`);
  } else {
    const placeholder = panelElement.match(/<div\b[^>]*class=["'][^"']*zones-visual[^"']*["'][^>]*>/i)?.[0];
    assert.ok(placeholder, `Indicator panel ${dataId} should contain a preview placeholder until a real chart is supplied`);
    assert.equal(attributeValue(placeholder, "role"), "img", `Indicator panel ${dataId} placeholder should expose image semantics`);
    assert.equal(attributeValue(placeholder, "aria-label"), expectedIndicator.placeholderAlt, `Indicator panel ${dataId} placeholder should be described accessibly`);
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

const discordCards = classedTags("article", "community-card");
const discordIconWraps = classedTags("span", "discord-icon");
assert.equal(discordCards.length, 1, "The community section should contain one intentional free Discord card");
assert.equal(discordIconWraps.length, 1, "The Discord card should display one Discord icon");
assert.equal(literalCount("fa-brands fa-discord"), 5, "Every Discord link should carry the Discord glyph");
assert.match(html, /<h3>Free Discord<\/h3>/, "The Discord card should use the approved title");
assert.match(html, /class=["'][^"']*discord-visual/, "The Discord banner should include a restrained community visual");
assert.equal(html.includes("Bandz Premium"), false, "The premium Discord placeholder should be removed");
assert.equal(html.includes("community-card--paid"), false, "No paid Discord card shell should remain");

assert.equal(
  literalCount('href="https://discord.gg/XdWaEBXQ6G"'),
  5,
  "The Discord invite should be linked from the top bar, header, hero, indicator CTA, and Discord section",
);
assert.equal(
  literalCount('href="https://bandzjournal.vercel.app/"'),
  4,
  "The journal should be linked from the top bar, header, hero, and journal section",
);

const journalScreenshotSource = "assets/journal/bandz-journal-calendar.png";
const journalScreenshotTag = openingTags("img").find(
  (tag) => attributeValue(tag, "src") === journalScreenshotSource,
);
assert.ok(journalScreenshotTag, "The journal section should use the supplied Bandz Journal calendar screenshot");
assert.equal(attributeValue(journalScreenshotTag, "width"), "3840", "The journal screenshot should retain its source width");
assert.equal(attributeValue(journalScreenshotTag, "height"), "2215", "The journal screenshot should retain its source height");
await assert.doesNotReject(
  access(new URL(`../${journalScreenshotSource}`, import.meta.url)),
  "The journal screenshot asset should exist on disk",
);
assert.equal(html.includes('src="calender.png"'), false, "The retired journal preview should no longer be rendered");

const indicatorBundleButtons =
  html.match(
    /<button\b(?=[^>]*\bclass=["'][^"']*\bproduct-action\b[^"']*["'])[^>]*>[\s\S]*?<\/button>/gi,
  ) ?? [];
assert.equal(indicatorBundleButtons.length, 0, "Individual indicator cards should not repeat the bundle action");
assert.equal(html.includes('class="included-tag"'), false, "Redundant Included badges should be removed");

const indicatorBanner = html.match(
  /<aside\b(?=[^>]*\bclass=["'][^"']*\bfunnel-section-banner--indicators\b[^"']*["'])[^>]*>[\s\S]*?<\/aside>/i,
)?.[0];
assert.ok(indicatorBanner, "The indicator CTA banner should be present below the indicator browser");
const indicatorBannerButton = indicatorBanner.match(/<a\b[^>]*>[\s\S]*?<\/a>/i)?.[0];
assert.ok(indicatorBannerButton, "The indicator CTA banner should contain a purchase link");
const indicatorBannerButtonTag = elementOpeningTag(indicatorBannerButton, "a");
assert.equal(
  attributeValue(indicatorBannerButtonTag, "href"),
  "https://discord.gg/XdWaEBXQ6G",
  "The indicator CTA should use the Discord invite",
);
assert.equal(
  textFromMarkup(indicatorBannerButton),
  "Join the free Discord",
  "The indicator CTA should use the approved copy",
);
assert.equal(
  html.includes("↗"),
  false,
  "External-link arrows should not use a Unicode glyph that iOS can render as emoji",
);
assert.equal(
  html.includes("↓"),
  false,
  "The in-page arrow should use the same SVG icon system as the external-link arrows",
);
assert.equal(
  openingTags("svg").filter((tag) => /\bexternal-arrow\b/.test(attributeValue(tag, "class") ?? ""))
    .length,
  9,
  "Every external-link CTA should use the stable monochrome SVG arrow",
);
assert.equal(
  literalCount('d="M5 11 11 5M6.5 5H11v4.5"'),
  9,
  "Every external-link icon should use the verified northeast-arrow SVG path",
);
assert.equal(
  literalCount('d="M8 3.5v9M4.75 9.25 8 12.5l3.25-3.25"'),
  0,
  "Every hero link is external now, so no in-page down-arrow remains",
);
assert.equal(
  html.includes(".external-arrow::before") || html.includes(".external-arrow::after"),
  false,
  "The distortion-prone CSS-drawn arrow should not return",
);

const liveCheckoutLinks = openingTags("a").filter((tag) => {
  const href = attributeValue(tag, "href");
  return href && /(?:whop|checkout|wap)/i.test(href);
});
assert.equal(
  liveCheckoutLinks.length,
  0,
  "No checkout links should remain now that the indicators are free",
);
assert.equal(
  /href=["']\?(?:original|popup)=/i.test(html),
  false,
  "Retired Original and Popup preview links should not remain in the page",
);

const retiredTradingViewReferences = [
  "wc5MzQEq",
  "Y8RDMaqx",
  "XIwA0v2s",
  "Multi-Timeframe Timecycles",
  "Multi HTF Candles 2.0",
  "Macros",
  "Watermark",
];

assert.equal(
  literalCount('href="https://www.tradingview.com/script/YnOsAQ78-Bandz-STDV-Flow/"'),
  0,
  "Bandz STDV Flow should not display a TradingView link",
);

for (const retiredReference of retiredTradingViewReferences) {
  assert.equal(
    html.toLowerCase().includes(retiredReference.toLowerCase()),
    false,
    `The retired TradingView reference "${retiredReference}" should not appear`,
  );
}

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

  const tabs = Array.from({ length: 7 }, (_, index) => indicatorTab(index + 1, index === 0));
  const panels = Array.from({ length: 7 }, (_, index) => ({
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

testIndicatorSelection();

testMobileAppLink({
  appUrl: "instagram://user?username=bandz_trading",
  webUrl: "https://www.instagram.com/bandz_trading/",
});

testMobileAppLink({
  appUrl: "tiktok://@bandztrading",
  webUrl: "https://www.tiktok.com/@bandztrading",
});

console.log("Storefront copy, palette, disabled controls, indicator tabs, and mobile social fallbacks are wired correctly.");
