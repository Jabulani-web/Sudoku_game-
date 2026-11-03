const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const DIST = path.join(ROOT, "dist");
const FILES = ["index.html", "style.css", "script.js"];

// `node server.js --build` produces the static bundle hosting serves.
if (process.argv.includes("--build")) {
  fs.mkdirSync(DIST, { recursive: true });

  for (const file of FILES) {
    fs.copyFileSync(path.join(ROOT, file), path.join(DIST, file));
  }

  console.log(`Built ${FILES.length} files into dist/`);
  process.exit(0);
}

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon"
};

const PORT = Number(process.env.PORT) || 3000;

const server = http.createServer((request, response) => {
  const urlPath = decodeURIComponent((request.url || "/").split("?")[0]);
  const relative = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
  const filePath = path.join(ROOT, relative);

  if (!filePath.startsWith(ROOT + path.sep)) {
    response.writeHead(403, { "Content-Type": "text/plain" }).end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
      return;
    }

    response.writeHead(200, {
      "Content-Type": TYPES[path.extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-cache"
    });
    response.end(data);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Sudoku running on http://0.0.0.0:${PORT}`);
});
