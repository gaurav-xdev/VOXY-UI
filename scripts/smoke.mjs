// Post-boot smoke test against a RUNNING server (used in CI against real PostgreSQL, and locally).
//   BASE_URL=http://127.0.0.1:8080 node scripts/smoke.mjs
const base = process.env.BASE_URL ?? "http://127.0.0.1:8080";
const fails = [];
const check = async (name, fn) => {
  try {
    await fn();
    console.log("✓", name);
  } catch (e) {
    fails.push(name);
    console.log("✗", name, "-", e.message);
  }
};
const j = async (path, init) => {
  const r = await fetch(base + path, { redirect: "manual", ...init });
  return { r, text: await r.text() };
};
await check("health", async () => {
  const { r } = await j("/api/health");
  if (r.status !== 200) throw new Error(String(r.status));
});
await check("ready (database reachable, schema current)", async () => {
  const { r } = await j("/api/ready");
  if (r.status !== 200) throw new Error(String(r.status));
});
await check("security headers present", async () => {
  const { r } = await j("/");
  for (const h of ["content-security-policy", "x-content-type-options", "referrer-policy", "permissions-policy"]) if (!r.headers.get(h)) throw new Error("missing " + h);
  if (r.headers.get("x-powered-by")) throw new Error("x-powered-by leaked");
});
await check("SPA served, unknown path is a real 404", async () => {
  const a = await j("/");
  if (a.r.status !== 200 || !a.text.includes('id="root"')) throw new Error("index");
  const b = await j("/definitely-missing");
  if (b.r.status !== 404 || !b.text.includes('id="root"')) throw new Error("404 shape " + b.r.status);
});
await check("unknown API route returns JSON 404 without leaking", async () => {
  const { r, text } = await j("/api/nope");
  if (r.status !== 404 || !text.includes('"ok":false')) throw new Error(String(r.status));
});
await check("protected route is 401 for anonymous", async () => {
  const { r } = await j("/api/account/sessions");
  if (r.status !== 401) throw new Error(String(r.status));
});
await check("cross-site write is rejected (CSRF)", async () => {
  const { r } = await j("/api/auth/login", { method: "POST", headers: { "content-type": "application/json", origin: "https://evil.example" }, body: "{}" });
  if (r.status < 400 || r.status >= 500) throw new Error(String(r.status));
});
if (fails.length) {
  console.error(`\nSMOKE FAILED: ${fails.join(", ")}`);
  process.exit(1);
}
console.log("smoke passed");
