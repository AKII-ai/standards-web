/** API の部分一致に載らない短縮名を、検索語へ展開する。 */
export const ALIASES = {
  土対法: "土壌汚染対策法",
  どたいほう: "土壌汚染対策法",
  どたい: "土壌汚染対策法",
  廃掃法: "廃棄物の処理及び清掃に関する法律",
  水濁法: "水質汚濁防止法",
  水濁: "水質汚濁防止法",
  大気法: "大気汚染防止法",
  大防法: "大気汚染防止法",
  化審法: "化学物質の審査及び製造等の規制に関する法律",
  ダイオキシン法: "ダイオキシン類対策特別措置法",
  下水: "下水道法",
};

const TAIL = /(施行規則|施行令|省令|規則|政令|法律)$/;

export function coreToken(s) {
  let t = String(s || "").replace(/[\s　]/g, "");
  t = t.replace(TAIL, "");
  t = t.replace(/法$/, "");
  return t;
}

export function expandQuery(q) {
  const raw = String(q || "").trim();
  if (!raw) return [];
  const out = new Set([raw]);
  const compact = raw.replace(/[\s　]/g, "");
  if (ALIASES[raw]) out.add(ALIASES[raw]);
  if (ALIASES[compact]) out.add(ALIASES[compact]);
  for (const [alias, title] of Object.entries(ALIASES)) {
    if (compact === alias || (compact.length >= 2 && compact.startsWith(alias))) {
      out.add(title);
    }
  }
  const core = coreToken(compact);
  if (core.length >= 2) out.add(core);
  return [...out];
}

export function isKana(s) {
  return /[ぁ-んァ-ヶー]/.test(s) && !/[一-龯]/.test(s);
}

export function toHiragana(s) {
  return String(s).replace(/[ァ-ヶ]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) - 0x60),
  );
}
