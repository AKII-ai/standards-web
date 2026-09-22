import { formatValue } from "../extract/extract.js";

export function eraYear(era) {
  return String(era.start || "").slice(0, 4) || "不明";
}

export function uniqueName(base, used, max = 80) {
  let name = base.slice(0, max) || "基準値";
  let n = 2;
  while (used.has(name)) {
    const suffix = ` ${n}`;
    name = `${base.slice(0, max - suffix.length)}${suffix}`;
    n += 1;
  }
  used.add(name);
  return name;
}

export function safeDownloadName(title) {
  return String(title || "基準値").replace(/[/\\?%*:|"<>]/g, "_");
}

export function kindLabel(withChanges) {
  return withChanges ? "変更追記" : "基準値";
}

export const LONG_HEADERS = ["表/条", "項目（条文表記）", "条件", "基準値", "条文の文言", "施行期間"];

export function matrixRows(era, withChanges) {
  return era.body.map((row) => [
    row.group,
    row.removed ? `（${row.item} はこの版で廃止）` : row.item,
    ...row.cells.map((c, i) => (withChanges && row.notes?.[i] ? `${c}（${row.notes[i]}）` : c)),
  ]);
}

export function longRows(era, withChanges) {
  return era.rows.map((r) => [
    r.table,
    r.item_raw,
    r.condition,
    r.mark === "removed"
      ? `（この版で廃止。旧値 ${r.value_raw}）`
      : withChanges && r.changeNote
        ? `${formatValue(r)}（${r.changeNote}）`
        : formatValue(r),
    r.value_raw,
    `${era.start} 〜 ${era.end}`,
  ]);
}

export function eraTable(era, mode, withChanges) {
  if (mode === "matrix") {
    return { headers: era.headers, rows: matrixRows(era, withChanges) };
  }
  return { headers: LONG_HEADERS, rows: longRows(era, withChanges) };
}
