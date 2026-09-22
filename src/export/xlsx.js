import * as XLSX from "xlsx";
import { formatValue } from "../extract/extract.js";

function safeSheetName(year, title, used) {
  const namePart = String(title || "基準値")
    .replace(/[:\\/?*[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  let base = `${year} ${namePart}`.trim().slice(0, 31);
  if (!base) base = String(year);
  let name = base;
  let n = 2;
  while (used.has(name)) {
    const suffix = ` ${n}`;
    name = `${base.slice(0, 31 - suffix.length)}${suffix}`;
    n += 1;
  }
  used.add(name);
  return name;
}

export function downloadStandardsXlsx({ title, eras, mode }) {
  const wb = XLSX.utils.book_new();
  const used = new Set();
  for (const era of eras) {
    const year = String(era.start || "").slice(0, 4) || "不明";
    const wsName = safeSheetName(year, title, used);
    let header;
    let body;
    let cols;
    if (mode === "matrix") {
      header = era.headers;
      body = era.body.map((row) => [
        row.group,
        row.removed ? `（${row.item} はこの版で廃止）` : row.item,
        ...row.cells.map((c, i) => (row.notes?.[i] ? `${c}（${row.notes[i]}）` : c)),
      ]);
      cols = header.map((_, i) => ({ wch: i <= 1 ? 28 : 22 }));
    } else {
      header = ["表/条", "項目（条文表記）", "条件", "基準値", "条文の文言", "施行期間"];
      body = era.rows.map((r) => [
        r.table,
        r.item_raw,
        r.condition,
        r.mark === "removed"
          ? `（この版で廃止。旧値 ${r.value_raw}）`
          : `${formatValue(r)}${r.changeNote ? `（${r.changeNote}）` : ""}`,
        r.value_raw,
        `${era.start} 〜 ${era.end}`,
      ]);
      cols = [
        { wch: 28 },
        { wch: 40 },
        { wch: 24 },
        { wch: 28 },
        { wch: 40 },
        { wch: 24 },
      ];
    }
    const ws = XLSX.utils.aoa_to_sheet([header, ...body]);
    ws["!cols"] = cols;
    XLSX.utils.book_append_sheet(wb, ws, wsName);
  }
  const file = `${title || "基準値"}.xlsx`.replace(/[/\\?%*:|"<>]/g, "_");
  XLSX.writeFile(wb, file);
}
