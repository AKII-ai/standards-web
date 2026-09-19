/** 漢数字変換と基準値セルの正規化。scripts/egov.py と同等。value_raw が常に正。 */

const KANJI_DIGIT = {
  〇: "0", 一: "1", 二: "2", 三: "3", 四: "4",
  五: "5", 六: "6", 七: "7", 八: "8", 九: "9",
};
const UNIT_WORDS = { 十: 10, 百: 100, 千: 1000 };
const MULTIPLIERS = { 万: 10000, 億: 100000000 };
const NUM = "[〇一二三四五六七八九十百千万・0-9.]+";
const UNIT_MAP = [
  ["一ミリリットルにつき", "コロニー形成単位", "CFU/mL"],
  ["一リットルにつき", "ミリグラム", "mg/L"],
  ["一リットルにつき", "マイクログラム", "µg/L"],
  ["一リットルにつき", "ピコグラム", "pg/L"],
  ["一キログラムにつき", "ミリグラム", "mg/kg"],
  ["一立方メートルにつき", "ミリグラム", "mg/m3"],
  ["一グラムにつき", "ナノグラム", "ng/g"],
];

function kanjiInt(s) {
  if (!s) throw new Error("empty");
  if ([...s].every((c) => c in KANJI_DIGIT)) {
    return parseInt([...s].map((c) => KANJI_DIGIT[c]).join(""), 10);
  }
  let total = 0;
  let section = 0;
  let num = 0;
  for (const c of s) {
    if (c in KANJI_DIGIT) {
      num = parseInt(KANJI_DIGIT[c], 10);
    } else if (c in UNIT_WORDS) {
      section += (num || 1) * UNIT_WORDS[c];
      num = 0;
    } else if (c in MULTIPLIERS) {
      total += (section + num || 1) * MULTIPLIERS[c];
      section = 0;
      num = 0;
    } else {
      throw new Error(c);
    }
  }
  return total + section + num;
}

export function kanjiToNumber(s) {
  const t = String(s || "").trim();
  if (!t) return null;
  if (/^[0-9]+(\.[0-9]+)?$/.test(t)) return t;
  const parts = t.split("・");
  if (parts.length > 2) return null;
  let intpart;
  try {
    intpart = kanjiInt(parts[0]);
  } catch {
    return null;
  }
  if (parts.length === 1) return String(intpart);
  const frac = [...parts[1]].map((c) => KANJI_DIGIT[c] ?? "?").join("");
  if (frac.includes("?")) return null;
  return `${intpart}.${frac}`;
}

export function parseValue(text) {
  const t = String(text || "").replace(/[\s　]/g, "");
  for (const [prefix, unitWord, unit] of UNIT_MAP) {
    if (!t.includes(prefix)) continue;
    const m = t.match(new RegExp(
      `(${NUM})(?:（(日間平均${NUM})）)?${unitWord}(以下|未満|以上|を超える)?`,
    ));
    if (m) {
      const v = kanjiToNumber(m[1]);
      if (v != null) {
        const conds = [];
        if (m[2]) {
          const avg = kanjiToNumber(m[2].replace("日間平均", ""));
          conds.push(`日間平均${avg || m[2]}`);
        }
        const suffix = m[3] || "";
        if (suffix && suffix !== "以下") conds.push(suffix);
        return [v, unit, conds.join("、")];
      }
    }
  }
  if (t.includes("検出されないこと")) return ["ND", "", ""];
  let m = t.match(new RegExp(`(${NUM})以上(${NUM})以下`));
  if (m) {
    const lo = kanjiToNumber(m[1]);
    const hi = kanjiToNumber(m[2]);
    if (lo && hi) return [`${lo}-${hi}`, "", "範囲"];
  }
  m = t.match(new RegExp(`(${NUM})を超え(${NUM})未満`));
  if (m) {
    const lo = kanjiToNumber(m[1]);
    const hi = kanjiToNumber(m[2]);
    if (lo && hi) return [`${lo}-${hi}`, "", "範囲（超え・未満）"];
  }
  return ["", "", ""];
}
