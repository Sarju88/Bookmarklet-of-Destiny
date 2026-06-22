import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const root = process.cwd();
const port = Number(process.env.PORT || 4173);
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

createServer(async (request, response) => {
  try {
    const raw = request.url === "/" ? "/index.html" : request.url.split("?")[0];
    const file = normalize(join(root, raw));
    if (!file.startsWith(root)) throw new Error("Invalid path");
    if (raw === "/tests/fixtures/youtube-like.html") {
      response.setHeader("Content-Security-Policy", "require-trusted-types-for 'script'; script-src 'none'; object-src 'none'; base-uri 'self'");
    }
    response.setHeader("Content-Type", types[extname(file)] || "application/octet-stream");
    response.end(await readFile(file));
  } catch {
    response.statusCode = 404;
    response.end("Not found");
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`Bookmarklet of Destiny: http://127.0.0.1:${port}`);
});
