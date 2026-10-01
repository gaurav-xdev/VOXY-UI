// Dependency-free secret scan over git-tracked + untracked (non-ignored) files. Complements (does not replace) a hosted scanner.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" }).split("\n").filter(Boolean);
const RULES = [
  [/sk_live_[A-Za-z0-9]{16,}/, "Stripe live secret key"],
  [/rk_live_[A-Za-z0-9]{16,}/, "Stripe live restricted key"],
  [/sk_test_[A-Za-z0-9]{24,}/, "Stripe test secret key"],
  [/whsec_[A-Za-z0-9]{24,}/, "Stripe webhook signing secret"],
  [/-----BEGIN (RSA |EC |OPENSSH |DSA |)PRIVATE KEY-----/, "private key"],
  [/AKIA[0-9A-Z]{16}/, "AWS access key id"],
  [/gh[pousr]_[A-Za-z0-9]{36,}/, "GitHub token"],
  [/xox[baprs]-[A-Za-z0-9-]{10,}/, "Slack token"],
  [
    /(postgres(?:ql)?|mysql|mongodb(?:\+srv)?|smtps?):\/\/[^\s:@/"']+:(?!password|pass|secret|\*+|x+|user|changeme|\$|<|\{)[^\s@/"']{6,}@(?!localhost|127\.0\.0\.1|host\b|smtp\.example)/i,
    "connection string with credentials",
  ],
];
// Test fixtures use obviously fake values; only these exact placeholders are allow-listed.
const ALLOW = [/voxy:hunter2@/, /whsec_testsecret/, /sk_test_fake/, /price_[A-Za-z_]+_test/];
let bad = 0;
for (const f of files) {
  if (/(^|\/)(package-lock\.json|\.png|\.woff2?)$/.test(f)) continue;
  let text;
  try {
    text = readFileSync(f, "utf8");
  } catch {
    continue;
  }
  text.split("\n").forEach((line, i) => {
    for (const [re, label] of RULES) {
      const m = re.exec(line);
      if (m && !ALLOW.some((a) => a.test(m[0]))) {
        bad++;
        console.error(`${f}:${i + 1}: possible ${label}`);
      }
    }
  });
}
if (/(^|\n)\.env($|\n)/.test(files.join("\n"))) {
  bad++;
  console.error(".env is tracked");
}
if (bad) process.exit(1);
console.log(`secret scan: ${files.length} files, no findings`);
