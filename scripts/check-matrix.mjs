import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { extractRecords } from "../src/extract/extract.js";
import { buildMatrixEras } from "../src/extract/matrix.js";
import { parseLayout } from "../src/layouts/parse.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const web = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const layout = parseLayout(readFileSync(resolve(web, "src/layouts/414M60001000029.md"), "utf8"));
if (!layout || layout.lawId !== "414M60001000029") {
  console.error("NG: レイアウト MD が読めない");
  process.exit(1);
}
if (layout.order[0] !== "クロロエチレン" || layout.order.length !== 26) {
  console.error("NG: 物質順", layout.order[0], layout.order.length);
  process.exit(1);
}

const data = JSON.parse(readFileSync(resolve(root, "data/raw/414M60001000029_20260701.json"), "utf8"));
const { eras } = buildMatrixEras(extractRecords(data), layout);
const latest = eras[0];
const first = latest.body[0];
const ok = first?.item === "クロロエチレン" && first.group === "第一種特定有害物質" && latest.body.length === 26;
console.log(`${ok ? "OK" : "NG"} マトリクス ${latest.body.length}物質 先頭 ${first?.item} ${first?.cells?.[0]}`);
if (!ok) process.exit(1);
