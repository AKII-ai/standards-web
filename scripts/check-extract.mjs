import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { extractRecords } from "../src/extract/extract.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const samples = [
  ["414M60001000029_20260701.json", 90],
  ["334CO0000000147_20260817.json", 50],
];

let failed = 0;
for (const [name, min] of samples) {
  const data = JSON.parse(readFileSync(resolve(root, "data/raw", name), "utf8"));
  const rows = extractRecords(data);
  const title = data.revision_info?.law_title;
  const ok = rows.length >= min;
  console.log(`${ok ? "OK" : "NG"} ${title}: ${rows.length}行 (目安 ${min}+)`);
  if (!ok) failed += 1;
}
process.exit(failed ? 1 : 0);
