// Bundles the API server into dist-server/ and copies SQL migrations next to it.
// Dependencies stay external (installed from package-lock.json in the runtime image).
import { build } from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";

await rm("dist-server", { recursive: true, force: true });
await mkdir("dist-server", { recursive: true });
await build({
  entryPoints: ["server/index.ts"],
  outfile: "dist-server/index.js",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  packages: "external",
  sourcemap: false,
  logLevel: "info",
  banner: { js: "// VOXY server bundle" },
});
await cp("server/db/migrations", "dist-server/migrations", { recursive: true });
console.log("server built → dist-server/");
