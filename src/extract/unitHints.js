/** unit_hints.txt の解析。読み込みは呼び出し側（Vite は ?raw、Node はファイル）。 */

function foldUnitTerm(s) {
  return String(s)
    .replace(/／/g, "/")
    .replace(/ℓ/g, "l")
    .replace(/μ/g, "µ")
    .replace(/m³/g, "m3");
}

export function parseUnitHintSource(text) {
  const terms = [];
  const seen = new Set();
  for (const line of String(text || "").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const key = foldUnitTerm(t).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    terms.push(t);
  }
  return terms;
}

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function compileItemHint(terms) {
  const parts = [...terms]
    .sort((a, b) => b.length - a.length)
    .map((t) => {
      let p = escapeRe(foldUnitTerm(t));
      p = p.replace(/µ/g, "(?:µ|μ)");
      p = p.replace(/\//g, "[/／]");
      return p;
    });
  if (!parts.length) return /ミリグラム|水素指数|コロニー形成単位/;
  return new RegExp(parts.join("|"), "i");
}

export function itemHintFromText(text) {
  return compileItemHint(parseUnitHintSource(text));
}
