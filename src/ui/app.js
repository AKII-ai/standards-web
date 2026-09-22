import { describeCorsFailure, fetchLawData, fetchRevisions, searchLaws } from "../api/egov.js";
import { downloadStandardsMd } from "../export/md.js";
import { downloadStandardsXlsx } from "../export/xlsx.js";
import { extractRecords, formatValue, groupByEra } from "../extract/extract.js";
import { buildMatrixEras } from "../extract/matrix.js";
import { getLayout } from "../layouts/index.js";
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
let lastSearch = { query: "", laws: [] };
const standardsCache = new Map();

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

function changeFrom(note) {
  if (!note) return "";
  return `<span class="change-from">（${escapeHtml(note)}）</span>`;
}

function bindCards(root) {
  root.querySelectorAll("[data-law-id]").forEach((btn) => {
    btn.addEventListener("click", () => selectLaw(btn.dataset.lawId, btn.dataset.title));
  });
}

function renderCard(law, i) {
  const repealed = law.repeal && law.repeal !== "None";
  const has = law.hasStandards === true;
  return `
    <button type="button" class="law-card${repealed ? " is-repealed" : ""}${has ? " has-standards" : ""}" data-law-id="${escapeHtml(law.law_id)}" data-title="${escapeHtml(law.title)}" style="--i:${i}">
      <span class="law-card__idx">${String(i + 1).padStart(2, "0")}</span>
      <span class="law-card__body">
        <span class="law-card__title">${escapeHtml(law.title)}</span>
        <span class="law-card__meta">
          <span class="pill">${escapeHtml(law.type_label)}</span>
          ${law.law_num ? `<span>${escapeHtml(law.law_num)}</span>` : ""}
          ${law.enforcement_date ? `<span>施行 ${escapeHtml(law.enforcement_date)}</span>` : ""}
          ${repealed ? `<span class="pill pill--warn">廃止等</span>` : ""}
          ${has ? `<span class="pill pill--ok">基準値あり</span>` : ""}
        </span>
      </span>
      <span class="law-card__id">${escapeHtml(law.law_id)}</span>
    </button>`;
}

function searchStatus(laws, probing = false) {
  const n = laws.length;
  const known = laws.filter((l) => l.hasStandards === true).length;
  if (probing && known === 0) return `${n}件（近い名前順）。基準値の有無を確認しています…`;
  if (known) return `${n}件（近い名前順）。基準値がある法令は緑色です（${known}件）。`;
  return `${n}件（近い名前順）`;
}

function resetToHome() {
  lastSearch = { query: "", laws: [] };
  els.input.value = "";
  els.results.innerHTML = "";
  els.results.hidden = true;
  els.detail.hidden = true;
  els.detail.innerHTML = "";
  lastExport = null;
  loadFeatured();
}

function restoreSearchList() {
  els.detail.hidden = true;
  els.detail.innerHTML = "";
  lastExport = null;
  els.featured.hidden = true;
  els.results.hidden = false;
  els.input.value = lastSearch.query;
  const cards = [...els.results.querySelectorAll("[data-law-id]")];
  const sameList = cards.length === lastSearch.laws.length
    && lastSearch.laws.every((law, i) => cards[i]?.dataset.lawId === law.law_id);
  if (sameList) {
    cards.forEach((btn) => {
      btn.hidden = false;
      btn.disabled = false;
      btn.classList.remove("is-selected");
    });
    setStatus(searchStatus(lastSearch.laws));
  } else {
    paintSearchResults(lastSearch.laws);
  }
  window.scrollTo({ top: 0 });
}

function paintSearchResults(laws) {
  els.results.hidden = false;
  els.results.innerHTML = laws.map((law, i) => renderCard(law, i)).join("");
  bindCards(els.results);
  setStatus(searchStatus(laws, laws.some((l) => l.hasStandards == null)));
}

function showHome() {
  els.featured.hidden = false;
  els.results.hidden = true;
  els.results.innerHTML = "";
  els.detail.hidden = true;
  setStatus("下から選ぶか、大気・土壌・地下水などで検索してください。");
}

function isolateSelected(lawId, title) {
  els.featured.hidden = true;
  els.results.hidden = false;
  if (lastSearch.query) {
    const cards = [...els.results.querySelectorAll("[data-law-id]")];
    const found = cards.find((btn) => btn.dataset.lawId === lawId);
    if (found) {
      cards.forEach((btn) => {
        const match = btn.dataset.lawId === lawId;
        btn.hidden = !match;
        btn.disabled = match;
        btn.classList.toggle("is-selected", match);
      });
      return;
    }
  }
  const source = document.querySelector(`[data-law-id="${CSS.escape(lawId)}"]`);
  els.results.innerHTML = "";
  if (source) {
    const clone = source.cloneNode(true);
    clone.hidden = false;
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
  els.featured.innerHTML = `<p class="progress">よく使う法令を読み込んでいます…</p>`;
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
    const byId = new Map(cards.map((c) => {
      const has = standardsCache.has(c.law_id) ? standardsCache.get(c.law_id) : null;
      return [c.law_id, { ...c, hasStandards: has }];
    }));
    els.featured.innerHTML = `
      <h2 class="featured__heading">よく使うもの</h2>
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
    void markStandards([...byId.values()]);
  } catch (err) {
    els.featured.innerHTML = `<p class="status status--error">${escapeHtml(describeCorsFailure(err))}</p>`;
  }
}

export async function runSearch(raw) {
  const q = String(raw || "").trim();
  const token = ++searchToken;
  if (!q) {
    lastSearch = { query: "", laws: [] };
    els.results.innerHTML = "";
    await loadFeatured();
    return;
  }
  els.featured.hidden = true;
  els.results.hidden = false;
  els.results.innerHTML = "";
  els.detail.hidden = true;
  els.detail.innerHTML = "";
  lastExport = null;
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
    const ranked = rankLaws(entries, queries).map((law) => ({
      ...law,
      hasStandards: standardsCache.has(law.law_id) ? standardsCache.get(law.law_id) : null,
    }));
    lastSearch = { query: q, laws: ranked };
    if (!ranked.length) {
      setStatus("近い法令が見つかりませんでした。告示・条例は e-Gov API の対象外です。", "empty");
      return;
    }
    paintSearchResults(ranked);
    await markStandards(ranked, { token, updateStatus: true });
  } catch (err) {
    if (token !== searchToken) return;
    setStatus(describeCorsFailure(err), "error");
  }
}

function applyStandardsMark(lawId, has) {
  const law = lastSearch.laws.find((item) => item.law_id === lawId);
  if (law) law.hasStandards = has;
  document.querySelectorAll(`[data-law-id="${CSS.escape(lawId)}"]`).forEach((btn) => {
    if (!btn.classList.contains("law-card")) return;
    btn.classList.toggle("has-standards", has);
    if (!has) return;
    const meta = btn.querySelector(".law-card__meta");
    if (meta && !meta.querySelector(".pill--ok")) {
      meta.insertAdjacentHTML("beforeend", `<span class="pill pill--ok">基準値あり</span>`);
    }
  });
}

async function probeHasStandards(lawId) {
  if (standardsCache.has(lawId)) return standardsCache.get(lawId);
  const data = await fetchLawData(lawId);
  const has = extractRecords(data).length > 0;
  standardsCache.set(lawId, has);
  return has;
}

async function markStandards(laws, { token = null, updateStatus = false } = {}) {
  const stillCurrent = () => token == null || token === searchToken;
  const pending = laws.filter((law) => law.hasStandards == null);
  const refreshStatus = (probing) => {
    if (updateStatus && stillCurrent() && els.detail.hidden) {
      setStatus(searchStatus(token == null ? laws : lastSearch.laws, probing));
    }
  };
  if (!pending.length) {
    refreshStatus(false);
    return;
  }
  let cursor = 0;
  const workers = Array.from({ length: Math.min(3, pending.length) }, async () => {
    while (cursor < pending.length) {
      if (!stillCurrent()) return;
      const law = pending[cursor];
      cursor += 1;
      try {
        const has = await probeHasStandards(law.law_id);
        if (!stillCurrent()) return;
        applyStandardsMark(law.law_id, has);
        refreshStatus(true);
      } catch {
        /* 判定できない法令は色を付けない */
      }
    }
  });
  await Promise.all(workers);
  refreshStatus(false);
}

export async function selectLaw(lawId, title = "") {
  const token = ++loadToken;
  const next = `#/law/${encodeURIComponent(lawId)}`;
  if (location.hash !== next) history.replaceState(null, "", next);
  isolateSelected(lawId, title);
  els.detail.hidden = false;
  setStatus(`「${title || lawId}」の条文を取得しています…`);
  els.detail.innerHTML = `
    ${backControl()}
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

function backControl() {
  return `<p class="nav-back"><a class="back" href="#/">法令一覧に戻る</a></p>`;
}

function exportToolbar(pos) {
  const extra = pos === "bottom" ? " toolbar--bottom" : "";
  return `
      <p class="toolbar${extra}">
        <a class="back" href="#/">法令一覧に戻る</a>
        <span class="export-box">
          <label><input type="radio" name="export-kind-${pos}" value="values" checked> 基準値のみ</label>
          <label><input type="radio" name="export-kind-${pos}" value="changes"> 変更内容を追記</label>
          <button type="button" class="export" data-export="xlsx">Excel出力</button>
          <button type="button" class="export" data-export="md">Markdown出力</button>
        </span>
      </p>`;
}

function bindExport(payload) {
  const radios = [...els.detail.querySelectorAll('input[type="radio"][name^="export-kind-"]')];
  radios.forEach((radio) => {
    radio.addEventListener("change", () => {
      if (!radio.checked) return;
      radios.forEach((other) => {
        if (other.value === radio.value) other.checked = true;
      });
    });
  });
  els.detail.querySelectorAll("[data-export]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const withChanges = Boolean(els.detail.querySelector('input[name^="export-kind-"]:checked[value="changes"]'));
      const data = { ...payload, withChanges };
      if (btn.dataset.export === "md") downloadStandardsMd(data);
      else downloadStandardsXlsx(data);
    });
  });
}

function renderDetail(title, lawId, bodies) {
  const rows = bodies.flatMap((data) => extractRecords(data));
  const { dates, eras } = groupByEra(rows);
  lastExport = null;
  standardsCache.set(lawId, rows.length > 0);
  applyStandardsMark(lawId, rows.length > 0);
  if (!rows.length) {
    setStatus("この法令から数値基準は見つかりませんでした。", "empty");
    els.detail.innerHTML = `
      ${backControl()}
      <section class="panel panel--empty">
        <header class="detail-head">
          <h2>${escapeHtml(title)}</h2>
          <p class="detail-meta">法令ID ${escapeHtml(lawId)}</p>
        </header>
        <p class="empty-lead">この法令から数値基準は見つかりませんでした。</p>
        <p class="status status--empty">別表や号列記にミリグラム等の基準がないか、基準が条文の別の構造にあります。告示・条例は対象外です。</p>
      </section>`;
    return;
  }
  const layout = getLayout(lawId);
  const matrix = layout ? buildMatrixEras(rows, layout) : null;
  const payload = matrix
    ? { title, mode: "matrix", eras: matrix.eras }
    : { title, eras };
  lastExport = payload;
  const usedDates = matrix ? matrix.dates : dates;
  setStatus(matrix
    ? `${matrix.eras.reduce((n, e) => n + e.body.length, 0)}物質（${usedDates.length}版）`
    : `${rows.length}行の基準値（${dates.length}版）`);
  const range = usedDates.length ? `${usedDates[0]} 〜 ${usedDates[usedDates.length - 1]}` : "—";
  els.detail.innerHTML = `
    ${backControl()}
    <section class="panel">
      ${exportToolbar("top")}
      <header class="detail-head">
        <h2>${escapeHtml(title)}</h2>
        <p class="detail-meta">
          法令ID ${escapeHtml(lawId)}　／　出典 e-Gov法令API　／　
          収録 ${usedDates.length}版（${escapeHtml(range)} 施行）。これより古い版はAPIにありません。
        </p>
      </header>
      ${matrix ? matrix.eras.map(renderMatrixEra).join("") : eras.map(renderEra).join("")}
      ${exportToolbar("bottom")}
      <footer class="notes">
        <p>${matrix
    ? "黄色は、1つ前の収録版から追加または変更があった物質です。赤いかっこ書きは、そのセルの変更前の値、または追加であることです。該当しない組合せは－。"
    : "黄色は、1つ前の収録版と比べて追加または変更があった項目と基準です。赤いかっこ書きは変更の内容です。括弧書きの基準は条文の文言そのまま。当分の間は暫定基準。"}</p>
        <p>告示・条例の上乗せ基準は含まない。${matrix
    ? "並びと別表の意味は src/layouts の Markdown で指定しています。"
    : "並びはAPIが返した順。"}Excelは改正（施行）年ごとにシートを分けます。Markdownは年ごとのファイルをZIPにまとめます。どちらも「基準値のみ」か「変更内容を追記」を選べます。列の境目をドラッグすると、その列の幅が変わります。</p>
      </footer>
    </section>`;
  bindExport(payload);
  colShares = null;
  layoutColumns();
}

let colShares = null;
let layingOut = false;

function colGroup(count) {
  return `<colgroup>${Array.from({ length: count }, () => "<col>").join("")}</colgroup>`;
}

function layoutColumns() {
  if (layingOut) return;
  const tables = [...els.detail.querySelectorAll("table")];
  if (!tables.length) {
    colShares = null;
    return;
  }
  const count = tables[0].tHead?.rows[0]?.cells.length || 0;
  if (!count) return;
  layingOut = true;
  try {
    if (!colShares || colShares.length !== count) {
      colShares = Array.from({ length: count }, () => 100 / count);
    }
    for (const table of tables) {
      const cols = table.querySelectorAll("col");
      if (cols.length !== colShares.length) continue;
      colShares.forEach((share, i) => {
        cols[i].style.width = `${share}%`;
      });
    }
    placeColHandles();
  } finally {
    layingOut = false;
  }
}

function placeColHandles() {
  els.detail.querySelectorAll(".col-resize").forEach((el) => el.remove());
  for (const table of els.detail.querySelectorAll("table")) {
    const scroll = table.closest(".table-scroll");
    const cells = table.tHead?.rows[0]?.cells;
    if (!scroll || !cells || cells.length < 2) continue;
    const scrollRect = scroll.getBoundingClientRect();
    const tableRect = table.getBoundingClientRect();
    for (let i = 0; i < cells.length - 1; i += 1) {
      const edge = cells[i].getBoundingClientRect().right;
      const handle = document.createElement("div");
      handle.className = "col-resize";
      handle.dataset.col = String(i);
      handle.title = "ドラッグで列の幅を変える";
      handle.style.left = `${edge - scrollRect.left - 4}px`;
      handle.style.top = `${tableRect.top - scrollRect.top}px`;
      handle.style.height = `${tableRect.height}px`;
      scroll.appendChild(handle);
    }
  }
}

function bindTableResize() {
  els.detail.addEventListener("pointerdown", (e) => {
    const handle = e.target.closest?.(".col-resize");
    if (!handle || e.button !== 0) return;
    const index = Number(handle.dataset.col);
    const table = handle.closest(".table-scroll")?.querySelector("table");
    if (!table || !colShares || !Number.isInteger(index) || index >= colShares.length - 1) return;
    e.preventDefault();
    const startX = e.clientX;
    const startShares = colShares.slice();
    const width = table.getBoundingClientRect().width || 1;
    const move = (ev) => {
      const minShare = Math.min(18, (72 / width) * 100);
      let left = startShares[index] + ((ev.clientX - startX) / width) * 100;
      let right = startShares[index + 1] - ((ev.clientX - startX) / width) * 100;
      if (left < minShare) {
        right -= minShare - left;
        left = minShare;
      }
      if (right < minShare) {
        left -= minShare - right;
        right = minShare;
      }
      colShares = startShares.slice();
      colShares[index] = left;
      colShares[index + 1] = right;
      layoutColumns();
    };
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  });
  window.addEventListener("resize", () => {
    if (els.detail.querySelector("table")) placeColHandles();
  });
  const observer = new MutationObserver(() => {
    if (!layingOut && els.detail.querySelector("table")) layoutColumns();
  });
  observer.observe(els.detail, { childList: true });
}

function renderEra(era) {
  return `
    <article class="era">
      <h3>施行 ${escapeHtml(era.start)} 〜 ${escapeHtml(era.end)}</h3>
      <div class="table-wrap">
        <div class="table-scroll">
        <table>
          ${colGroup(4)}
          <thead>
            <tr><th>表/条</th><th>項目（条文表記）</th><th>条件</th><th>基準値</th></tr>
          </thead>
          <tbody>
            ${era.rows.map((r) => {
              const removed = r.mark === "removed";
              const changed = r.mark === "new" || r.mark === "changed";
              const val = removed ? escapeHtml(`（${r.value_raw}）`) : escapeHtml(formatValue(r));
              return `<tr class="${removed ? "is-removed" : ""}">
                <td>${escapeHtml(r.table)}</td>
                <td class="${changed ? "is-changed" : ""}">${escapeHtml(r.item_raw)}</td>
                <td>${escapeHtml(r.condition)}</td>
                <td class="${changed ? "is-changed" : ""}">${val}${changeFrom(r.changeNote)}</td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
        </div>
      </div>
    </article>`;
}

function renderMatrixEra(era) {
  const fallback = era.apiOrder
    ? `<p class="status status--empty">この版の並び順はAPI取得結果の順。物質の構成が指定と異なるため。</p>`
    : "";
  return `
    <article class="era">
      <h3>施行 ${escapeHtml(era.start)} 〜 ${escapeHtml(era.end)}</h3>
      <div class="table-wrap">
        <div class="table-scroll">
        <table class="matrix">
          ${colGroup(era.headers.length)}
          <thead>
            <tr>${era.headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr>
          </thead>
          <tbody>
            ${era.body.map((row) => {
              const name = row.removed ? `（${row.item} はこの版で廃止）` : row.item;
              const rowChanged = row.changed?.some(Boolean);
              const mark = rowChanged ? "is-changed" : "";
              return `<tr class="${row.removed ? "is-removed" : ""}">
                <td class="${mark}">${escapeHtml(row.group)}</td>
                <td class="${mark}">${escapeHtml(name)}</td>
                ${row.cells.map((c, i) => `<td class="${row.changed?.[i] ? "is-changed" : ""}">${escapeHtml(c)}${changeFrom(row.notes?.[i])}</td>`).join("")}
              </tr>`;
            }).join("")}
          </tbody>
        </table>
        </div>
      </div>
      ${fallback}
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
  bindTableResize();
  window.addEventListener("hashchange", () => {
    const id = hashLawId();
    if (id) {
      selectLaw(id);
      return;
    }
    if (lastSearch.query) {
      restoreSearchList();
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
