import { copyFile, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const serverDir = path.join(dist, "server");

const html = await readFile(path.join(root, "index.html"), "utf8");
const ogImage = await readFile(path.join(root, "og-livestream-preview.png"));
const journalImage = await readFile(
  path.join(root, "assets", "journal", "bandz-journal-calendar.png"),
);
const indicatorAssetPaths = [
  "bandz-intraday-1m.png",
  "bandz-sessions-1m.png",
  "bandz-smt-15m.png",
  "bandz-htf-15m.png",
  "bandz-levels-5m.png",
  "bandz-stdv-flow-1h.png",
  "bandz-all-in-one-4h.png",
  "bandz-htf-zones.png",
  "bandz-po3-profiler.png",
];
const indicatorImages = Object.fromEntries(
  await Promise.all(
    indicatorAssetPaths.map(async (filename) => [
      `/assets/indicators/${filename}`,
      (await readFile(path.join(root, "assets", "indicators", filename))).toString("base64"),
    ]),
  ),
);

// Keep the output directory itself so Windows previews holding it open do not block a rebuild.
await mkdir(dist, { recursive: true });
for (const entry of await readdir(dist)) {
  await rm(path.join(dist, entry), { recursive: true, force: true });
}
await mkdir(serverDir, { recursive: true });
await mkdir(path.join(dist, "assets", "indicators"), { recursive: true });
await mkdir(path.join(dist, "assets", "journal"), { recursive: true });

const workerSource = `
const pageHtml = ${JSON.stringify(html)};
const ogBase64 = ${JSON.stringify(ogImage.toString("base64"))};
const journalBase64 = ${JSON.stringify(journalImage.toString("base64"))};
const indicatorBase64 = ${JSON.stringify(indicatorImages)};
let ogBytes;
let journalBytes;
const indicatorBytes = new Map();

function getOgBytes() {
  if (!ogBytes) {
    const binary = atob(ogBase64);
    ogBytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  }
  return ogBytes;
}

function getJournalBytes() {
  if (!journalBytes) {
    const binary = atob(journalBase64);
    journalBytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  }
  return journalBytes;
}

function getIndicatorBytes(pathname) {
  if (!indicatorBytes.has(pathname)) {
    const binary = atob(indicatorBase64[pathname]);
    indicatorBytes.set(pathname, Uint8Array.from(binary, (character) => character.charCodeAt(0)));
  }
  return indicatorBytes.get(pathname);
}

function responseFor(request, body, init) {
  return new Response(request.method === "HEAD" ? null : body, init);
}

function renderPage(requestUrl) {
  return pageHtml.replaceAll("https://all-bandz-links.vercel.app", requestUrl.origin);
}

const worker = {
  async fetch(request) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", {
        status: 405,
        headers: { Allow: "GET, HEAD" },
      });
    }

    const url = new URL(request.url);

    if (url.pathname === "/og-livestream-preview.png") {
      return responseFor(request, getOgBytes(), {
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
    }

    if (url.pathname === "/assets/journal/bandz-journal-calendar.png") {
      return responseFor(request, getJournalBytes(), {
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
    }

    if (url.pathname in indicatorBase64) {
      return responseFor(request, getIndicatorBytes(url.pathname), {
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
    }

    if (url.pathname === "/favicon.ico") {
      return new Response(null, { status: 204 });
    }

    return responseFor(request, renderPage(url), {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=0, must-revalidate",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "strict-origin-when-cross-origin",
      },
    });
  },
};

export default worker;
`.trimStart();

await Promise.all([
  writeFile(path.join(serverDir, "index.js"), workerSource),
  copyFile(path.join(root, "index.html"), path.join(dist, "index.html")),
  copyFile(
    path.join(root, "og-livestream-preview.png"),
    path.join(dist, "og-livestream-preview.png"),
  ),
  copyFile(
    path.join(root, "assets", "journal", "bandz-journal-calendar.png"),
    path.join(dist, "assets", "journal", "bandz-journal-calendar.png"),
  ),
  ...indicatorAssetPaths.map((filename) =>
    copyFile(
      path.join(root, "assets", "indicators", filename),
      path.join(dist, "assets", "indicators", filename),
    ),
  ),
]);

console.log("Static site build complete.");
