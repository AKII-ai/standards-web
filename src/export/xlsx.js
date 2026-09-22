import * as XLSX from "xlsx";
import { eraTable, eraYear, kindLabel, safeDownloadName, uniqueName } from "./table.js";

function safeSheetName(year, title, used) {
  const namePart = String(title || "基準値")
    .replace(/[:\\/?*[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  let base = `${year} ${namePart}`.trim();
  if (!base) base = String(year);
  return uniqueName(base, used, 31);
}

export function downloadStandardsXlsx({ title, eras, mode, withChanges }) {
  const wb = XLSX.utils.book_new();
  const used = new Set();
  for (const era of eras) {
    const year = eraYear(era);
    const wsName = safeSheetName(year, title, used);
    const { headers, rows } = eraTable(era, mode, withChanges);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws["!cols"] = headers.map((_, i) => ({ wch: mode === "matrix" ? (i <= 1 ? 28 : 22) : [28, 40, 24, 28, 40, 24][i] }));
    XLSX.utils.book_append_sheet(wb, ws, wsName);
  }
  const file = `${safeDownloadName(title)}_${kindLabel(withChanges)}.xlsx`;
  XLSX.writeFile(wb, file);
}
