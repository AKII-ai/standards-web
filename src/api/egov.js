const API_BASE = import.meta.env.DEV ? "/egov" : "https://laws.e-gov.go.jp/api/2";

async function apiGet(path, params = {}) {
  const q = new URLSearchParams({ response_format: "json", ...params });
  const url = `${API_BASE}/${path}?${q}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`e-Gov API ${res.status}: ${path}`);
  }
  return res.json();
}

export async function searchLaws({ title, kana, law_id, limit = 40 } = {}) {
  const params = { limit: String(limit) };
  if (title) params.law_title = title;
  if (kana) params.law_title_kana = kana;
  if (law_id) params.law_id = law_id;
  return apiGet("laws", params);
}

export async function fetchLawData(id) {
  return apiGet(`law_data/${encodeURIComponent(id)}`);
}

export async function fetchRevisions(lawId) {
  const data = await apiGet(`law_revisions/${encodeURIComponent(lawId)}`);
  return data.revisions || [];
}

export function describeCorsFailure(err) {
  const msg = String(err?.message || err);
  if (/Failed to fetch|NetworkError|CORS/i.test(msg)) {
    return "ブラウザから e-Gov API に直接届きませんでした（CORS）。ローカルでは web フォルダで npm run dev を使ってください。";
  }
  return msg;
}
