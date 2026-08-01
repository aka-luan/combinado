import { createReadStream } from "node:fs";
import { createServer } from "node:http";
import { stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";

const root = resolve(process.argv[2] ?? "out");
const port = Number.parseInt(process.argv[3] ?? process.env.PORT ?? "4173", 10);

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
};

function fileForRequest(requestUrl) {
  const pathname = decodeURIComponent(new URL(requestUrl, "http://127.0.0.1").pathname);
  const candidate = normalize(join(root, pathname));
  if (candidate !== root && !candidate.startsWith(`${root}/`)) return null;
  return candidate;
}

async function existingFile(candidate) {
  try {
    const details = await stat(candidate);
    return details.isFile() ? candidate : null;
  } catch {
    return null;
  }
}

const server = createServer(async (request, response) => {
  if (!request.url || (request.method !== "GET" && request.method !== "HEAD")) {
    response.writeHead(405, { Allow: "GET, HEAD" }).end();
    return;
  }

  let candidate;
  try {
    candidate = fileForRequest(request.url);
  } catch {
    response.writeHead(400).end("Invalid request path");
    return;
  }

  if (!candidate) {
    response.writeHead(403).end("Forbidden");
    return;
  }

  let file = await existingFile(candidate);
  if (!file) file = await existingFile(join(candidate, "index.html"));
  if (!file) file = await existingFile(join(root, "index.html"));

  if (!file) {
    response.writeHead(404).end("Not found");
    return;
  }

  const contentType = contentTypes[extname(file).toLowerCase()] ?? "application/octet-stream";
  const details = await stat(file);
  response.writeHead(200, {
    "Content-Length": details.size,
    "Content-Type": contentType,
  });
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  createReadStream(file).pipe(response);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Static server listening on http://127.0.0.1:${port}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => server.close(() => process.exit(0)));
}
