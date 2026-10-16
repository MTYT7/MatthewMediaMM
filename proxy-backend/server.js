const express = require("express");
const dns = require("node:dns").promises;
const net = require("node:net");

const app = express();
app.disable("x-powered-by");
const PORT = process.env.PORT || 3000;
const MAX_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 10000;

// Restricted by design: configure an intentional comma-separated allowlist.
function allowedHosts() {
  return (process.env.ALLOWED_HOSTS || "example.com,wikipedia.org,developer.mozilla.org")
    .split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
}
function privateV4(ip) {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  return p[0] === 10 || p[0] === 127 || p[0] === 0 ||
    (p[0] === 169 && p[1] === 254) || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
    (p[0] === 192 && p[1] === 168) || p[0] >= 224;
}
function privateV6(ip) {
  const x = ip.toLowerCase();
  return x === "::1" || x === "::" || x.startsWith("fe8") || x.startsWith("fe9") ||
    x.startsWith("fea") || x.startsWith("feb") || x.startsWith("fc") || x.startsWith("fd") ||
    x.startsWith("::ffff:127.") || x.startsWith("::ffff:10.");
}
async function validateTarget(raw) {
  let u;
  try { u = new URL(raw); } catch { throw new Error("Enter a valid full URL."); }
  if (!["http:", "https:"].includes(u.protocol)) throw new Error("Only HTTP and HTTPS URLs are supported.");
  if (u.username || u.password) throw new Error("URLs containing credentials are not allowed.");
  if (u.port && !["80", "443"].includes(u.port)) throw new Error("Only standard web ports are allowed.");
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || net.isIP(host)) {
    throw new Error("Local and raw-IP destinations are blocked.");
  }
  if (!allowedHosts().some(d => host === d || host.endsWith("." + d))) {
    throw new Error("Domain is not allowlisted. Add its hostname to ALLOWED_HOSTS in your hosting settings.");
  }
  const records = await dns.lookup(host, { all: true, verbatim: true });
  if (!records.length || records.some(r => net.isIPv4(r.address) ? privateV4(r.address) : privateV6(r.address))) {
    throw new Error("This destination resolves to a private or reserved address and is blocked.");
  }
  return u;
}
app.get("/health", (_req, res) => res.json({ ok: true, service: "MatthewMedia Web viewer" }));
app.get("/", (_req, res) => res.type("html").send('<!doctype html><meta name="viewport" content="width=device-width"><title>MatthewMedia proxy</title><h1>MatthewMedia Web backend</h1><p>Backend is online. Try /health to check status.</p>'));
app.get("/fetch", async (req, res) => {
  try {
    if (typeof req.query.url !== "string" || req.query.url.length > 2048) return res.status(400).type("text").send("Provide one URL (maximum 2048 characters).");
    let target = await validateTarget(req.query.url);
    let response;
    for (let redirects = 0; redirects <= 4; redirects++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        response = await fetch(target, { redirect: "manual", signal: controller.signal,
          headers: { "user-agent": "MatthewMediaWeb/1.0 (website viewer)", "accept": "text/html,application/xhtml+xml,text/plain" } });
      } finally { clearTimeout(timer); }
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      const location = response.headers.get("location");
      if (!location || redirects === 4) return res.status(502).type("text").send("Too many or invalid redirects.");
      target = await validateTarget(new URL(location, target).href);
    }
    if (!response) return res.status(502).type("text").send("No response from destination.");
    const type = (response.headers.get("content-type") || "").toLowerCase();
    if (!(type.includes("text/html") || type.includes("application/xhtml+xml") || type.startsWith("text/plain"))) {
      await response.body?.cancel();
      return res.status(415).type("text").send("This starter viewer only displays HTML and plain-text responses.");
    }
    const reader = response.body.getReader(), chunks = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BYTES) { await reader.cancel(); return res.status(413).type("text").send("Page exceeds the 2 MB starter limit."); }
      chunks.push(Buffer.from(value));
    }
    let body = Buffer.concat(chunks).toString("utf8");
    if (type.includes("html")) {
      const base = '<base href="' + (target.origin + "/").replace(/&/g, "&amp;").replace(/"/g, "&quot;") + '">';
      if (/<head\b[^>]*>/i.test(body)) body = body.replace(/<head\b[^>]*>/i, m => m + base);
      else body = base + body;
      res.set("Content-Security-Policy", "default-src https: data: blob: 'unsafe-inline' 'unsafe-eval'; frame-ancestors *");
    }
    res.set("X-Content-Type-Options", "nosniff");
    res.set("Cache-Control", "no-store");
    res.status(response.status).type(type.includes("html") ? "html" : "text").send(body);
  } catch (err) {
    const msg = err.name === "AbortError" ? "Website timed out." : (err.message || "Request failed.");
    res.status(400).type("text").send(msg);
  }
});
app.listen(PORT, "0.0.0.0", () => console.log("MatthewMedia viewer backend listening on " + PORT));
