import { strToU8, zipSync } from "fflate";
import { eraStamp, kindLabel, safeDownloadName, uniqueName } from "./table.js";

function escapeCell(s) {
  return String(s ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function mdTable(headers, rows) {
  const line = (cells) => `| ${cells.map(escapeCell).join(" | ")} |`;
  return [
    line(headers),
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map(line),
  ].join("\n");
}

function eraMarkdown(title, era, mode, withChanges) {
  const { headers, rows } = eraTable(era, mode, withChanges);
  return [
    `# ${title}`,
    "",
    `施行 ${era.start} 〜 ${era.end}`,
    "",
    mdTable(headers, rows),
    "",
  ].join("\n");
}

export function downloadStandardsMd({ title, eras, mode, withChanges }) {
  const used = new Set();
  const files = {};
  for (const era of eras) {
    const base = `${eraStamp(era)} ${safeDownloadName(title)}.md`;
    const name = uniqueName(base, used, 120);
    files[name] = strToU8(eraMarkdown(title, era, mode, withChanges));
  }
  const zipped = zipSync(files, { level: 6 });
  const blob = new Blob([zipped], { type: "application/zip" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${safeDownloadName(title)}_${kindLabel(withChanges)}.zip`;
  a.click();
  URL.revokeObjectURL(a.href);
}
