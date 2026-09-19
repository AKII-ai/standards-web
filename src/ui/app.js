import { describeCorsFailure, fetchLawData, fetchRevisions, searchLaws } from "../api/egov.js";
import { downloadStandardsXlsx } from "../export/xlsx.js";
import { extractRecords, formatValue, groupByEra } from "../extract/extract.js";
import { expandQuery, isKana, toHiragana } from "../search/aliases.js";
import { FEATURED } from "../search/featured.js";
import { lawCard, rankLaws } from "../search/rank.js";

const els = {
  form: document.querySelector("#search-form"),
  input: document.querySelector("#q"),
  status: document.querySelector("#status"),
  featured: document.querySelector("#featured"),
  results: document.querySelector("#results"),
  detail: document.querySelector("#detail"),
};

let searchToken = 0;
let loadToken = 0;
let featuredReady = false;
let lastExport = null;

function setStatus(text, kind = "") {
  els.status.textContent = text;
  els.status.dataset.kind = kind;
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function bindCards(root) {
  root.querySelectorAll("[data-law-id]").forEach((btn) => {
    btn.addEventListener("click", () => selectLaw(btn.dataset.lawId, btn.dataset.title));
  });
}

function renderCard(law, i) {
  const repealed = law.repeal && law.repeal !== "None";
  return `
    <button type="button" class="law-card${repealed ? " is-repealed" : ""}" data-law-id="${escapeHtml(law.law_id)}" data-title="${escapeHtml(law.title)}" style="--i:${i}">
      <span class="law-card__idx">${String(i + 1).padStart(2, "0")}</span>
      <span class="law-card__body">
        <span class="law-card__title">${escapeHtml(law.title)}</span>
        <span class="law-card__meta">
          <span class="pill">${escapeHtml(law.type_label)}</span>
          ${law.law_num ? `<span>${escapeHtml(law.law_num)}</span>` : ""}
          ${law.enforcement_date ? `<span>施行 ${escapeHtml(law.enforcement_date)}</span>` : ""}
          ${repealed ? `<span class="pill pill--warn">廃止等</span>` : ""}
        </span>
      </span>
      <span class="law-card__id">${escapeHtml(law.law_id)}</span>
    </button>`;
}

function resetToHome() {
  els.input.value = "";
  els.results.innerHTML = "";
  els.results.hidden = true;
  els.detail.hidden = true;
  els.detail.innerHTML = "";
  lastExport = null;
  loadFeatured();
}

function showHome() {
  els.featured.hidden = false;
  els.results.hidden = true;
  els.results.innerHTML = "";
  els.detail.hidden = true;
  setStatus("下から選ぶか、大気・土壌・地下水などで検索してください。");
}

function isolateSelected(lawId, title) {
  const source = document.querySelector(`[data-law-id="${CSS.escape(lawId)}"]`);
  els.featured.hidden = true;
  els.results.hidden = false;
  els.results.innerHTML = "";
  if (source) {
    const clone = source.cloneNode(true);
    clone.disabled = true;
    clone.classList.add("is-selected");
    clone.removeAttribute("style");
    els.results.appendChild(clone);
    return;
  }
  els.results.innerHTML = renderCard({
    law_id: lawId,
    title: title || lawId,
    type_label: "",
    law_num: "",
    enforcement_date: "",
    repeal: "None",
  }, 0);
  const btn = els.results.querySelector("[data-law-id]");
  if (btn) {
    btn.disabled = true;
    btn.classList.add("is-selected");
  }
}

function scrollToDetail() {
  window.scrollTo({ top: 0, behavior: "smooth" });
}

export async function loadFeatured() {
  if (featuredReady) {
    showHome();
    return;
  }
  els.featured.innerHTML = `<p class="progress">土壌汚染まわりの法令を読み込んでいます…</p>`;
  els.featured.hidden = false;
  try {
    const cards = await Promise.all(
      FEATURED.flatMap((g) => g.laws).map(async (seed) => {
        try {
          const json = await searchLaws({ law_id: seed.law_id, limit: 5 });
          const hit = (json.laws || []).find((e) => e.law_info?.law_id === seed.law_id);
          if (hit) return lawCard(hit);
        } catch {
          /* 静的表示に落とす */
        }
        return { ...seed, law_num: "", enforcement_date: "", repeal: "None" };
      }),
    );
    const byId = new Map(cards.map((c) => [c.law_id, c]));
    els.featured.innerHTML = `
      <h2 class="featured__heading">土壌汚染まわり</h2>
      <p class="featured__lead">よく使う入口です。大気・土壌・地下水でも検索できます。</p>
      ${FEATURED.map((group) => `
        <section class="featured__group">
          <h3>${escapeHtml(group.name)}</h3>
          <div class="results">
            ${group.laws.map((seed, i) => renderCard(byId.get(seed.law_id) || seed, i)).join("")}
          </div>
        </section>
      `).join("")}`;
    bindCards(els.featured);
    featuredReady = true;
    showHome();
  } catch (err) {
    els.featured.innerHTML = `<p class="status status--error">${escapeHtml(describeCorsFailure(err))}</p>`;
  }
}

export async function runSearch(raw) {
  const q = String(raw || "").trim();
  const token = ++searchToken;
  if (!q) {
    els.results.innerHTML = "";
    await loadFeatured();
    return;
  }
  els.featured.hidden = true;
  els.results.hidden = false;
  els.results.innerHTML = "";
  els.detail.hidden = true;
  setStatus("検索しています…");
  const queries = expandQuery(q);
  try {
    const batches = [];
    for (const term of queries) {
      batches.push(searchLaws({ title: term }));
      if (isKana(term)) batches.push(searchLaws({ kana: toHiragana(term) }));
    }
    const jsons = await Promise.all(batches);
    if (token !== searchToken) return;
    const entries = jsons.flatMap((j) => j.laws || []);
    const ranked = rankLaws(entries, queries);
    if (!ranked.length) {
      setStatus("近い法令が見つかりませんでした。告示・条例は e-Gov API の対象外です。", "empty");
      return;
    }
    setStatus(`${ranked.length}件（近い名前順）`);
    els.results.innerHTML = ranked.map((law, i) => renderCard(law, i)).join("");
    bindCards(els.results);
  } catch (err) {
    if (token !== searchToken) return;
    setStatus(describeCorsFailure(err), "error");
  }
}

export async function selectLaw(lawId, title = "") {
  const token = ++loadToken;
  const next = `#/law/${encodeURIComponent(lawId)}`;
  if (location.hash !== next) history.replaceState(null, "", next);
  isolateSelected(lawId, title);
  els.detail.hidden = false;
  setStatus(`「${title || lawId}」の条文を取得しています…`);
  els.detail.innerHTML = `
    <section class="panel panel--loading">
      <p class="progress-kicker">選択した法令</p>
      <h2 class="progress-title">${escapeHtml(title || lawId)}</h2>
      <p class="progress">条文を取得しています… <span id="progress-label">版の一覧を確認中</span></p>
    </section>`;
  scrollToDetail();
  try {
    const revisions = await fetchRevisions(lawId);
    if (token !== loadToken) return;
    const usable = revisions.filter((rv) => rv.amendment_enforcement_date && rv.law_revision_id);
    if (!usable.length) {
      const current = await fetchLawData(lawId);
      if (token !== loadToken) return;
      renderDetail(current.revision_info?.law_title || title, lawId, [current]);
      return;
    }
    const bodies = [];
    for (let i = 0; i < usable.length; i += 1) {
      if (token !== loadToken) return;
      const label = document.querySelector("#progress-label");
      if (label) label.textContent = `${i + 1} / ${usable.length} 版を取得中`;
      bodies.push(await fetchLawData(usable[i].law_revision_id));
    }
    if (token !== loadToken) return;
    const latestTitle = bodies[0]?.revision_info?.law_title || title;
    renderDetail(latestTitle, lawId, bodies);
  } catch (err) {
    if (token !== loadToken) return;
    els.detail.innerHTML = `<section class="panel"><p class="status status--error">${escapeHtml(describeCorsFailure(err))}</p></section>`;
  }
}

function renderDetail(title, lawId, bodies) {
  const rows = bodies.flatMap((data) => extractRecords(data));
  const { dates, eras } = groupByEra(rows);
  lastExport = null;
  const back = `<p class="toolbar">
        <a class="back" href="#/">一覧に戻る</a>
      </p>`;
  if (!rows.length) {
    setStatus("この法令から数値基準は見つかりませんでした。", "empty");
    els.detail.innerHTML = `
      <section class="panel panel--empty">
        ${back}
        <header class="detail-head">
          <h2>${escapeHtml(title)}</h2>
          <p class="detail-meta">法令ID ${escapeHtml(lawId)}</p>
        </header>
        <p class="empty-lead">この法令から数値基準は見つかりませんでした。</p>
        <p class="status status--empty">別表や号列記にミリグラム等の基準がないか、基準が条文の別の構造にあります。告示・条例は対象外です。</p>
      </section>`;
    return;
  }
  lastExport = { title, eras };
  setStatus(`${rows.length}行の基準値（${dates.length}版）`);
  const range = dates.length ? `${dates[0]} 〜 ${dates[dates.length - 1]}` : "—";
  els.detail.innerHTML = `
    <section class="panel">
      <p class="toolbar">
        <a class="back" href="#/">一覧に戻る</a>
        <button type="button" class="export" id="export-xlsx">Excel出力</button>
      </p>
      <header class="detail-head">
        <h2>${escapeHtml(title)}</h2>
        <p class="detail-meta">
          法令ID ${escapeHtml(lawId)}　／　出典 e-Gov法令API　／　
          収録 ${dates.length}版（${escapeHtml(range)} 施行）。これより古い版はAPIにありません。
        </p>
      </header>
      ${eras.map(renderEra).join("")}
      <p class="toolbar toolbar--bottom">
        <button type="button" class="export" id="export-xlsx-bottom">Excel出力</button>
      </p>
      <footer class="notes">
        <p>★新設／★改正は、1つ前の収録版との比較。括弧書きは条文の文言そのまま。当分の間は暫定基準。</p>
        <p>告示・条例の上乗せ基準は含まない。並びはAPIが返した順。Excelは改正（施行）年ごとにシートを分けています。</p>
      </footer>
    </section>`;
  els.detail.querySelectorAll(".export").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (lastExport) downloadStandardsXlsx(lastExport);
    });
  });
}

function renderEra(era) {
  const notes = era.starNotes.length
    ? `<ul class="star-notes">${era.starNotes.map((n) => {
      const item = escapeHtml(n.item.slice(0, 50));
      if (n.kind === "new") return `<li><strong>${item}</strong>（${escapeHtml(n.table)}）: この版で追加</li>`;
      return `<li><strong>${item}</strong>（${escapeHtml(n.table)}）: ${escapeHtml(n.from)} → ${escapeHtml(n.to)}</li>`;
    }).join("")}</ul>`
    : "";
  return `
    <article class="era">
      <h3>施行 ${escapeHtml(era.start)} 〜 ${escapeHtml(era.end)}</h3>
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>表/条</th><th>項目（条文表記）</th><th>条件</th><th>基準値</th></tr>
          </thead>
          <tbody>
            ${era.rows.map((r) => {
              const mark = r.mark === "new" ? " ★新設" : r.mark === "changed" ? " ★改正" : "";
              const removed = r.mark === "removed";
              const val = removed ? escapeHtml(`（${r.value_raw}）`) : escapeHtml(formatValue(r)) + mark;
              return `<tr class="${removed ? "is-removed" : ""}">
                <td>${escapeHtml(r.table)}</td>
                <td>${escapeHtml(r.item_raw)}</td>
                <td>${escapeHtml(r.condition)}</td>
                <td>${val}</td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>
      ${notes}
    </article>`;
}

function hashLawId() {
  const m = location.hash.match(/^#\/law\/([^/?#]+)$/);
  return m ? decodeURIComponent(m[1]) : "";
}

export function bindApp() {
  els.form.addEventListener("submit", (e) => {
    e.preventDefault();
    runSearch(els.input.value);
  });
  document.querySelector("#hints")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-q]");
    if (!btn) return;
    els.input.value = btn.dataset.q;
    runSearch(btn.dataset.q);
  });
  let t = 0;
  els.input.addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(() => runSearch(els.input.value), 380);
  });
  window.addEventListener("hashchange", () => {
    const id = hashLawId();
    if (id) {
      selectLaw(id);
      return;
    }
    els.detail.hidden = true;
    els.detail.innerHTML = "";
    resetToHome();
  });
  const initial = hashLawId();
  if (initial) selectLaw(initial);
  else loadFeatured();
}
