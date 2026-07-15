import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const serverDir = path.join(dist, "server");

const html = await readFile(path.join(root, "index.html"), "utf8");
const ogImage = await readFile(path.join(root, "og.png"));
const journalImage = await readFile(path.join(root, "calender.png"));

await rm(dist, { recursive: true, force: true });
await mkdir(serverDir, { recursive: true });

const workerSource = `
const pageHtml = ${JSON.stringify(html)};
const ogBase64 = ${JSON.stringify(ogImage.toString("base64"))};
const journalBase64 = ${JSON.stringify(journalImage.toString("base64"))};
let ogBytes;
let journalBytes;

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

    if (url.pathname === "/og.png") {
      return responseFor(request, getOgBytes(), {
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
    }

    if (url.pathname === "/calender.png") {
      return responseFor(request, getJournalBytes(), {
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
  copyFile(path.join(root, "og.png"), path.join(dist, "og.png")),
  copyFile(path.join(root, "calender.png"), path.join(dist, "calender.png")),
]);

console.log("Static site build complete.");
