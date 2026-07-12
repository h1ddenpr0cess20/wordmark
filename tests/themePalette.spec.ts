import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";


const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const themesDir = join(root, "src/css/themes");
const componentsDir = join(root, "src/css/components");

function cssFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...cssFiles(p));
    else if (entry.name.endsWith(".css")) out.push(p);
  }
  return out;
}

test("the base variable layer defines the full status/button palette", () => {
  const vars = readFileSync(join(themesDir, "variables.css"), "utf8");
  for (const v of [
    "--button-text-color",
    "--error-color",
    "--error-color-text",
    "--success-color",
    "--warning-color",
    "--neutral-color",
    "--info-color",
  ]) {
    assert.match(vars, new RegExp(`${v}\\s*:`), `variables.css must define ${v}`);
  }
});

test("every theme block that sets --accent-color also sets --button-text-color", () => {
  for (const file of cssFiles(themesDir)) {
    const css = readFileSync(file, "utf8");
    for (const block of css.split("}")) {
      if (block.includes("--accent-color:") && !block.includes("--button-text-color:")) {
        const sel = block.trim().split("{")[0].trim();
        assert.fail(`${file}: '${sel}' sets --accent-color but not --button-text-color`);
      }
    }
  }
});

test("no component rule with an accent-color background hardcodes its text color", () => {
  const offenders: string[] = [];
  for (const file of cssFiles(componentsDir)) {
    const css = readFileSync(file, "utf8");
    for (const block of css.split("}")) {
      if (!/background(-color)?:\s*var\(--accent-color\)/.test(block)) {
        continue;
      }
      const colorMatch = block.match(/(?:^|[;{])\s*color:\s*([^;]+)/);
      if (colorMatch && !colorMatch[1].includes("var(")) {
        const sel = block.trim().split("{")[0].trim();
        offenders.push(`${file}: '${sel}' -> color: ${colorMatch[1].trim()}`);
      }
    }
  }
  assert.deepEqual(offenders, [], `accent-bg rules with hardcoded text color:\n${offenders.join("\n")}`);
});

test("component CSS does not reintroduce hardcoded danger/status hexes", () => {
  const banned = ["#dc3545", "#e74c3c", "#2ecc71"];
  const offenders: string[] = [];
  for (const file of cssFiles(componentsDir)) {
    readFileSync(file, "utf8").split("\n").forEach((line, i) => {
      for (const hex of banned) {
        if (line.toLowerCase().includes(hex)) {
          offenders.push(`${file}:${i + 1} ${line.trim()}`);
        }
      }
    });
  }
  assert.deepEqual(offenders, [], `hardcoded status colors found:\n${offenders.join("\n")}`);
});
