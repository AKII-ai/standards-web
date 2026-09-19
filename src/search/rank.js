import { coreToken, toHiragana } from "./aliases.js";

export const LAW_TYPE_LABEL = {
  Constitution: "憲法",
  Act: "法律",
  CabinetOrder: "政令",
  ImperialOrder: "勅令",
  MinisterialOrdinance: "省令",
  Rule: "規則",
  Misc: "その他",
};

export function lawCard(entry) {
  const info = entry.law_info || {};
  const cur = entry.current_revision_info || entry.revision_info || {};
  return {
    law_id: info.law_id,
    law_num: info.law_num || "",
    law_type: info.law_type || cur.law_type || "",
    type_label: LAW_TYPE_LABEL[info.law_type] || info.law_type || "",
    title: cur.law_title || "",
    title_kana: cur.law_title_kana || "",
    abbrev: cur.abbrev || "",
    enforcement_date: cur.amendment_enforcement_date || "",
    status: cur.current_revision_status || "",
    repeal: cur.repeal_status || "None",
  };
}

function normalize(s) {
  return toHiragana(String(s || "").replace(/[\s　]/g, "").toLowerCase());
}

function isSubsequence(query, text) {
  if (!query) return false;
  let i = 0;
  for (const ch of text) {
    if (ch === query[i]) i += 1;
    if (i >= query.length) return true;
  }
  return false;
}

export function scoreLaw(law, queries) {
  const title = normalize(law.title);
  const kana = normalize(law.title_kana);
  const abbrev = normalize(law.abbrev);
  let best = 0;
  for (const q of queries) {
    const n = normalize(q);
    if (!n) continue;
    const core = normalize(coreToken(q));
    if (title === n || abbrev === n) best = Math.max(best, 100);
    else if (title.startsWith(n) || abbrev.startsWith(n)) best = Math.max(best, 88);
    else if (title.includes(n) || abbrev.includes(n)) best = Math.max(best, 70);
    else if (kana.startsWith(n)) best = Math.max(best, 72);
    else if (kana.includes(n)) best = Math.max(best, 52);
    if (isSubsequence(n, title) || isSubsequence(n, kana)) {
      const compactness = n.length / Math.max(title.length, 1);
      best = Math.max(best, 74 + Math.round(compactness * 10));
    }
    if (core.length >= 2 && (title.includes(core) || kana.includes(core))) {
      best = Math.max(best, 58);
    }
  }
  return best;
}

export function rankLaws(entries, queries) {
  const seen = new Set();
  const cards = [];
  for (const entry of entries) {
    const card = lawCard(entry);
    if (!card.law_id || seen.has(card.law_id)) continue;
    seen.add(card.law_id);
    const score = scoreLaw(card, queries);
    if (score <= 0) continue;
    cards.push({ ...card, score });
  }
  cards.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.repeal !== b.repeal) return a.repeal === "None" ? -1 : 1;
    if (a.title.length !== b.title.length) return a.title.length - b.title.length;
    return a.title.localeCompare(b.title, "ja");
  });
  return cards;
}
