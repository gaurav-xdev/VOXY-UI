// Artifact validation, run in CI after `npm run build`. Fails on anything that must never ship to browsers.
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = "dist/client";
const problems = [];
const SECRET_PATTERNS = [
  [/sk_(live|test)_[A-Za-z0-9]{10,}/, "Stripe secret key"],
  [/whsec_[A-Za-z0-9]{10,}/, "Stripe webhook secret"],
  [/rk_(live|test)_[A-Za-z0-9]{10,}/, "Stripe restricted key"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "private key"],
  [/postgres(ql)?:\/\/[^\s"']+:[^\s"']+@/, "database URL with credentials"],
  [/APP_SECRET|DATABASE_URL|STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET|SMTP_URL/, "server-only variable name"],
  [/localStorage\.(set|get)Item\(["'`](token|session|auth|jwt)/i, "token in localStorage"],
];

async function* walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}

let total = 0;
const sizes = [];
for await (const file of walk(root)) {
  const s = await stat(file);
  total += s.size;
  if (file.endsWith(".map")) problems.push(`source map shipped: ${file}`);
  if (/\.(js|css|html|svg|json|txt)$/.test(file)) {
    const text = await readFile(file, "utf8");
    for (const [re, label] of SECRET_PATTERNS) if (re.test(text)) problems.push(`${label} found in ${file}`);
  }
  if (/\.(js)$/.test(file)) sizes.push([file, s.size]);
}
await readFile(path.join(root, "index.html"), "utf8").then((h) => {
  if (/fonts\.googleapis\.com|fonts\.gstatic\.com/.test(h)) problems.push("index.html references Google Fonts (self-host instead)");
  if (/<script(?![^>]*\bsrc=)[^>]*>[^<]/i.test(h)) problems.push("index.html contains an inline script (CSP forbids it)");
});

sizes.sort((a, b) => b[1] - a[1]);
console.log(`client build: ${(total / 1024).toFixed(0)} kB total (uncompressed, incl. precompressed copies)`);
for (const [f, s] of sizes.slice(0, 8)) console.log(`  ${(s / 1024).toFixed(0).padStart(6)} kB  ${path.relative(root, f)}`);
if (problems.length) {
  console.error("\nARTIFACT CHECK FAILED:\n - " + problems.join("\n - "));
  process.exit(1);
}
console.log("artifact check passed");
