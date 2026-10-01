// Serves a built bundle the way OLMS does (Linear OLM-2026, OLMS ADR-109): the calculator runs in
// <iframe sandbox="allow-scripts"> under a per-response nonce + 'strict-dynamic' policy, and loads
// the bundle from /vendor/<commit>/ with CORS and cross-origin CORP. No dependencies.
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const TYPES = {
	".html": "text/html; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".json": "application/json",
	".png": "image/png",
	".svg": "image/svg+xml",
	".gif": "image/gif",
	".woff": "font/woff",
	".woff2": "font/woff2",
	".ttf": "font/ttf",
	".otf": "font/otf",
};

/** The same frame policy OLMS sends (server/site-app.ts, graphEmbedCsp). */
export function frameCsp(nonce) {
	return `default-src 'none'; script-src 'nonce-${nonce}' 'strict-dynamic'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'; sandbox allow-scripts`;
}

async function file(path) {
	try {
		if ((await stat(path)).isFile()) return await readFile(path);
	} catch {
		// missing
	}
	return null;
}

export function startServer({ bundleDir, commit, port = 0 }) {
	const bundleRoot = resolve(bundleDir);
	const server = createServer(async (request, response) => {
		const url = new URL(request.url, "http://localhost");
		const send = (status, body, headers = {}) => {
			response.writeHead(status, { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...headers });
			response.end(body);
		};
		if (url.pathname === "/" || url.pathname === "/host.html") {
			const html = (await readFile(join(here, "host.html"), "utf8")).replace("__FRAME_QUERY__", url.search);
			return send(200, html, {
				"Content-Type": TYPES[".html"],
				"Content-Security-Policy": "default-src 'self'; frame-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'",
			});
		}
		if (url.pathname === "/frame.html") {
			const nonce = randomBytes(16).toString("base64");
			const html = (await readFile(join(here, "frame.html"), "utf8")).replaceAll("__CSP_NONCE__", nonce);
			return send(200, html, { "Content-Type": TYPES[".html"], "Content-Security-Policy": frameCsp(nonce) });
		}
		if (url.pathname === "/frame.js" || url.pathname === "/host.js") {
			const body = (await readFile(join(here, url.pathname.slice(1)), "utf8")).replaceAll("__COMMIT__", commit);
			return send(200, body, { "Content-Type": TYPES[".js"], "Cross-Origin-Resource-Policy": "cross-origin" });
		}
		const prefix = `/vendor/${commit}/`;
		if (url.pathname.startsWith(prefix)) {
			const relative = normalize(decodeURIComponent(url.pathname.slice(prefix.length)));
			const path = join(bundleRoot, relative);
			if (!path.startsWith(bundleRoot)) return send(403, "Forbidden");
			const body = await file(path);
			if (!body) return send(404, "Not Found");
			return send(200, body, {
				"Content-Type": TYPES[extname(path)] ?? "application/octet-stream",
				"Access-Control-Allow-Origin": "*",
				"Cross-Origin-Resource-Policy": "cross-origin",
			});
		}
		return send(404, "Not Found");
	});
	return new Promise((resolveServer) => {
		server.listen(port, "127.0.0.1", () => resolveServer(server));
	});
}
