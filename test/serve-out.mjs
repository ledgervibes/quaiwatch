/**
 * test/serve-out.mjs — local preview of the exported static site.
 *
 * Serves ./out and proxies /api/* to the live deployment, so the freshly built
 * client code can be exercised against real explorer data without deploying.
 * Verification-only; not part of the app or the build.
 */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname } from "node:path";

const ROOT = new URL("../out/", import.meta.url);
const UPSTREAM = "https://quaiwatch.pages.dev";
const PORT = Number(process.argv[2] ?? 4319);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".txt": "text/plain; charset=utf-8",
};

async function resolveFile(pathname) {
  const rel = decodeURIComponent(pathname.replace(/^\/+/, ""));
  const candidates = rel === "" ? ["index.html"] : [rel, `${rel}/index.html`, `${rel}.html`];
  for (const candidate of candidates) {
    const path = join(ROOT.pathname.replace(/^\//, ""), candidate);
    try {
      const info = await stat(path);
      if (info.isFile()) return path;
    } catch {
      /* try next */
    }
  }
  return null;
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname.startsWith("/api/")) {
    const upstream = await fetch(`${UPSTREAM}${url.pathname}${url.search}`, {
      headers: { Accept: "application/json" },
    });
    const body = await upstream.arrayBuffer();
    res.writeHead(upstream.status, {
      "Content-Type": upstream.headers.get("Content-Type") ?? "application/json",
    });
    res.end(Buffer.from(body));
    return;
  }

  const file = await resolveFile(url.pathname);
  if (!file) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("not found");
    return;
  }
  const data = await readFile(file);
  res.writeHead(200, { "Content-Type": TYPES[extname(file)] ?? "application/octet-stream" });
  res.end(data);
}).listen(PORT, () => {
  console.log(`serving ./out on http://localhost:${PORT} (api proxied to ${UPSTREAM})`);
});
