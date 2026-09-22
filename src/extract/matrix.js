/** 抽出行をレイアウト MD の物質×基準マトリクスに並べる。report.py の law_md_matrix に合わせる。 */

import { labelsForDate } from "../layouts/parse.js";

export function shortItem(s) {
  const t = String(s || "");
  const m = t.match(/（以下「(.+?)」という。）/);
  if (m) return m[1];
  return t.replace(/（[^）]*）/g, "").trim();
}

export function matrixCell(r, itemKey) {
  if (!r) return "－";
  const raw = String(r.value_raw || "").replace(/。$/, "");
  if (raw.includes("かつ")) return raw;
  if (r.value === "ND") return "検出されないこと";
  if (r.value) {
    let suffix = "以下";
    for (const w of ["未満", "以上", "を超える"]) {
      if ((r.condition || "").includes(w)) suffix = w;
    }
    let out = `${r.value} ${suffix}`;
    const m = String(r.value_raw || "").match(/につき(.*?)[〇一二三四五六七八九十百千万・0-9.]+ミリグラム/);
    const species = (m ? m[1] : "").replace("検液", "");
    if (species && !itemKey.includes(species) && !species.includes(itemKey)) {
      out += `（${species}として）`;
    }
    return out;
  }
  return raw || "－";
}

function mapRow(layout, r) {
  const { tableToColumn, allowed } = labelsForDate(layout, r.enforcement_date);
  if (!allowed.has(r.table)) return null;
  return { ...r, column: tableToColumn.get(r.table) };
}

export function buildMatrixEras(rows, layout) {
  const labeled = rows.map((r) => mapRow(layout, r)).filter(Boolean);
  const byDate = new Map();
  const apiOrder = new Map();
  for (const r of labeled) {
    const d = r.enforcement_date || "";
    const ik = shortItem(r.item_raw);
    if (!byDate.has(d)) byDate.set(d, new Map());
    const items = byDate.get(d);
    if (!items.has(ik)) items.set(ik, {});
    items.get(ik)[r.column] = r;
    if (!apiOrder.has(d)) apiOrder.set(d, []);
    if (!apiOrder.get(d).includes(ik)) apiOrder.get(d).push(ik);
  }
  const dates = [...byDate.keys()].filter(Boolean).sort();
  const colNames = layout.columns.map((c) => c.name);
  const headers = ["分類", "特定有害物質の種類", ...layout.columns.map((c) => (
    c.unit ? `${c.name}（${c.unit}）` : c.name
  ))];
  const eras = [];
  for (let i = dates.length - 1; i >= 0; i -= 1) {
    const start = dates[i];
    const end = i === dates.length - 1
      ? "現行"
      : (() => {
        const d = new Date(`${dates[i + 1]}T00:00:00`);
        d.setDate(d.getDate() - 1);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
      })();
    const items = apiOrder.get(start) || [];
    const ordered = items.every((ik) => layout.order.includes(ik));
    const rowIter = ordered ? layout.order.filter((ik) => items.includes(ik)) : items;
    const prev = i > 0 ? byDate.get(dates[i - 1]) : null;
    const cur = byDate.get(start);
    const starNotes = [];
    const body = [];
    for (const ik of rowIter) {
      const cells = {};
      for (const c of colNames) cells[c] = matrixCell(cur.get(ik)?.[c], ik);
      const changed = {};
      const notes = {};
      if (prev) {
        if (!prev.has(ik)) {
          for (const c of colNames) {
            changed[c] = true;
            if (cells[c] !== "－") notes[c] = "この版で追加";
          }
        } else {
          for (const c of colNames) {
            const from = matrixCell(prev.get(ik)?.[c], ik);
            if (from !== cells[c]) {
              changed[c] = true;
              notes[c] = `${from} → ${cells[c]}`;
            }
          }
        }
      }
      body.push({
        group: layout.groupOf[ik] || "",
        item: ik,
        cells: colNames.map((c) => cells[c]),
        notes: colNames.map((c) => notes[c] || ""),
        changed: colNames.map((c) => Boolean(changed[c])),
        removed: false,
      });
    }
    if (prev) {
      for (const ik of prev.keys()) {
        if (cur.has(ik)) continue;
        body.push({
          group: layout.groupOf[ik] || "",
          item: ik,
          cells: colNames.map(() => "－"),
          notes: colNames.map(() => ""),
          changed: colNames.map(() => false),
          removed: true,
        });
      }
    }
    eras.push({
      start,
      end,
      headers,
      body,
      starNotes,
      apiOrder: !ordered,
    });
  }
  return { dates, eras };
}
