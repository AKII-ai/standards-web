/** レイアウト Markdown の表を読む。値は持たない。 */

function splitCells(line) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

function isSepRow(line) {
  const t = line.trim();
  return /^\|[\s:|\-—－]+\|$/.test(t) || /^[\s:|\-—－]+$/.test(t.replace(/\|/g, ""));
}

function parseTableBlock(lines) {
  const rows = lines.filter((l) => !isSepRow(l)).map(splitCells);
  if (rows.length < 1) return null;
  return { header: rows[0], body: rows.slice(1) };
}

function splitSections(text) {
  const lines = String(text || "").split(/\r?\n/);
  const sections = [{ title: "", lines: [] }];
  for (const line of lines) {
    const m = line.match(/^##\s+(.+?)\s*$/);
    if (m) {
      sections.push({ title: m[1].trim(), lines: [] });
      continue;
    }
    sections[sections.length - 1].lines.push(line);
  }
  return sections;
}

function firstTable(section) {
  const block = [];
  let inTable = false;
  for (const line of section.lines) {
    if (line.trim().startsWith("|")) {
      inTable = true;
      block.push(line);
      continue;
    }
    if (inTable) break;
  }
  return block.length ? parseTableBlock(block) : null;
}

export function parseLayout(text) {
  const raw = String(text || "");
  const idMatch = raw.match(/法令ID[:：]\s*`?([A-Za-z0-9]+)`?/);
  const lawId = idMatch ? idMatch[1] : "";
  if (!lawId) return null;

  const sections = splitSections(raw);
  const columns = [];
  const mappings = [];
  const groups = [];

  for (const sec of sections) {
    const table = firstTable(sec);
    if (!table) continue;
    if (sec.title === "列") {
      const nameI = table.header.findIndex((h) => h === "列名");
      const unitI = table.header.findIndex((h) => h === "単位");
      if (nameI < 0) continue;
      for (const row of table.body) {
        const name = row[nameI];
        if (!name) continue;
        columns.push({ name, unit: unitI >= 0 ? row[unitI] || "" : "" });
      }
      continue;
    }
    if (sec.title === "別表") {
      const fromI = table.header.findIndex((h) => h === "から");
      const colI = table.header.findIndex((h) => h === "列名");
      const tblI = table.header.findIndex((h) => h === "別表");
      if (colI < 0 || tblI < 0) continue;
      for (const row of table.body) {
        const col = row[colI];
        const tableName = row[tblI];
        if (!col || !tableName) continue;
        mappings.push({
          from: (fromI >= 0 ? row[fromI] : "") || "",
          column: col,
          table: tableName,
        });
      }
      continue;
    }
    if (sec.title) {
      const itemI = table.header.findIndex((h) => h === "項目");
      if (itemI < 0) continue;
      const items = table.body.map((row) => row[itemI]).filter(Boolean);
      if (items.length) groups.push({ name: sec.title, items });
    }
  }

  if (!columns.length) return null;
  const order = groups.flatMap((g) => g.items);
  const groupOf = {};
  for (const g of groups) {
    for (const item of g.items) groupOf[item] = g.name;
  }
  return { lawId, columns, mappings, groups, order, groupOf };
}

export function labelsForDate(layout, enforceDate) {
  const date = enforceDate || "";
  const byCol = new Map();
  for (const m of layout.mappings) {
    if (m.from && date && m.from > date) continue;
    const prev = byCol.get(m.column);
    if (!prev || (m.from || "") >= (prev.from || "")) byCol.set(m.column, m);
  }
  const tableToColumn = new Map();
  const allowed = new Set();
  for (const col of layout.columns) {
    const m = byCol.get(col.name);
    if (!m) continue;
    tableToColumn.set(m.table, col.name);
    allowed.add(m.table);
  }
  return { tableToColumn, allowed };
}
