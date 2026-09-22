/** 別表／号列記からの基準値抽出。scripts/extract.py と同等（絞り込み・意味ラベルなし）。 */

import { findAll, nodeText } from "./tree.js";
import { itemHintFromText } from "./unitHints.js";
import UNIT_HINTS_TEXT from "./unit_hints.txt?raw";
import { kanjiToNumber, parseValue } from "./value.js";

const KANJI_NUM_ONLY = /^[〇一二三四五六七八九十百千]+$/;
const SEA_SPLIT = /(海域以外の公共用水域に排出されるもの|海域に排出されるもの)/;
const ITEM_HINT = itemHintFromText(UNIT_HINTS_TEXT);

function splitSeaCondition(text) {
  const parts = String(text).split(SEA_SPLIT);
  if (parts.length < 5) return [["", text]];
  const out = [];
  for (let i = 1; i < parts.length; i += 2) {
    const cond = parts[i].includes("海域以外") ? "海域以外" : "海域";
    out.push([cond, parts[i + 1]]);
  }
  return out;
}

function* rowsFromAppdx(body) {
  for (const table of findAll(body, "AppdxTable")) {
    let title = [...findAll(table, "AppdxTableTitle")].map(nodeText).join("").trim();
    title = (title.split(/[（(]/)[0] || title).trim() || title;
    for (const row of findAll(table, "TableRow")) {
      const cells = [...findAll(row, "TableColumn")].map((c) => nodeText(c).trim());
      yield [title, cells, ""];
    }
  }
}

function* rowsFromItems(body) {
  for (const art of findAll(body, "Article")) {
    const artTitle = [...findAll(art, "ArticleTitle")].map(nodeText).join("").trim();
    if (!ITEM_HINT.test(nodeText(art))) continue;
    const paras = [...findAll(art, "Paragraph")].filter(
      (p) => [...findAll(p, "Item")].length > 0,
    );
    for (const p of paras) {
      const pcond = paras.length > 1 ? `第${(p.attr || {}).Num ?? ""}項` : "";
      for (const item of findAll(p, "Item")) {
        const cols = [...findAll(item, "Column")].map((c) => nodeText(c).trim());
        if (cols.length < 2) continue;
        for (let i = 0; i < cols.length - 1; i += 2) {
          yield [artTitle, [cols[i], cols[i + 1]], pcond];
        }
      }
    }
  }
}

function isHeader(cells) {
  const joined = cells.join("");
  return /許容限度|第[一二三四五]欄|有害物質の種類/.test(joined) || joined === "項目許容限度";
}

function emitRows(table, cells, carry) {
  cells = cells.filter((c) => c !== "");
  if (!cells.length || isHeader(cells)) {
    carry[table] = "";
    return [];
  }
  if (cells.length >= 3 && KANJI_NUM_ONLY.test(cells[0])) cells = cells.slice(1);
  if (cells.length < 2) return [];
  const valueRaw = cells[cells.length - 1];
  const itemRaw = cells[cells.length - 2];
  if (/掲げる(項目|物質)/.test(itemRaw)) return [];
  const extra = cells.slice(0, -2).join("／");
  if (extra) carry[table] = extra;
  const conditionBase = extra || carry[table] || "";
  return splitSeaCondition(valueRaw).map(([seaCond, vtext]) => {
    const cond = [conditionBase, seaCond].filter(Boolean).join("、");
    return [itemRaw, cond, vtext];
  });
}

function joinCond(...parts) {
  return parts.filter(Boolean).join("、");
}

export function extractRecords(data) {
  const ri = data.revision_info || {};
  const body = data.law_full_text;
  const lawId = data.law_info?.law_id || ri.law_id || "";
  const revId = ri.law_revision_id || "";
  const enforce = ri.amendment_enforcement_date || "";
  const records = [];
  const carry = {};
  for (const src of [rowsFromAppdx(body), rowsFromItems(body)]) {
    for (const [table, cells, pcond] of src) {
      for (const [itemRaw, cond, vtext] of emitRows(table, cells, carry)) {
        let [value, unit, extraCond] = parseValue(vtext);
        if (!value) {
          const m = vtext.match(/^(日間平均)?([〇一二三四五六七八九十百千万・0-9.]+)(?:（(.+)）)?$/);
          if (m) {
            const v = kanjiToNumber(m[2]);
            if (v) {
              value = v;
              extraCond = joinCond(m[1], m[3]);
            }
          }
        }
        if (value && !unit) {
          if (itemRaw.includes("リットルにつきミリグラム") && !itemRaw.includes("ミリリットル")) {
            unit = "mg/L";
          } else if (itemRaw.includes("ミリリットルにつきコロニー")) {
            unit = "CFU/mL";
          }
        }
        if (vtext.includes("当分の間")) {
          extraCond = joinCond(extraCond, "当分の間（暫定基準）");
        }
        records.push({
          law_id: lawId,
          table,
          item_raw: itemRaw,
          value: value || "",
          unit,
          value_raw: vtext,
          condition: joinCond(pcond, cond, extraCond),
          enforcement_date: enforce,
          revision_id: revId,
        });
      }
    }
  }
  return records;
}

export function formatValue(r) {
  const v = r.value || `（${r.value_raw}）`;
  const u = r.unit ? ` ${r.unit}` : "";
  const c = r.condition ? `（${r.condition}）` : "";
  return `${v}${u}${c}`;
}

export function dayBefore(iso) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() - 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function groupByEra(rows) {
  const byDate = new Map();
  for (const r of rows) {
    const d = r.enforcement_date || "";
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d).push(r);
  }
  const dates = [...byDate.keys()].filter(Boolean).sort();
  const eras = [];
  for (let i = dates.length - 1; i >= 0; i -= 1) {
    const start = dates[i];
    const end = i === dates.length - 1 ? "現行" : dayBefore(dates[i + 1]);
    const current = byDate.get(start);
    const prev = i > 0 ? byDate.get(dates[i - 1]) : null;
    const prevMap = new Map();
    if (prev) {
      for (const r of prev) prevMap.set(`${r.table}\t${r.item_raw}\t${r.condition}`, r);
    }
    const curKeys = new Set(current.map((r) => `${r.table}\t${r.item_raw}\t${r.condition}`));
    const rowsOut = [];
    const starNotes = [];
    for (const r of current) {
      const k = `${r.table}\t${r.item_raw}\t${r.condition}`;
      let mark = "";
      let changeNote = "";
      if (prev) {
        if (!prevMap.has(k)) {
          mark = "new";
          changeNote = "この版で追加";
        } else if (prevMap.get(k).value_raw !== r.value_raw) {
          mark = "changed";
          const from = formatValue(prevMap.get(k));
          const to = formatValue(r);
          changeNote = `${from} → ${to}`;
        }
      }
      rowsOut.push({ ...r, mark, changeNote });
    }
    if (prev) {
      for (const [k, old] of prevMap) {
        if (!curKeys.has(k)) {
          rowsOut.push({
            ...old,
            mark: "removed",
            value: "",
            unit: "",
            value_raw: `この版で廃止。旧値 ${old.value_raw}`,
          });
        }
      }
    }
    eras.push({ start, end, rows: rowsOut, starNotes });
  }
  return { dates, eras };
}
