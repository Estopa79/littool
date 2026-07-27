import { formatAuthorYear, formatRanking } from './sourceFormat'
import type { Source } from './sources'
import type { Criterion, SourceCriterionValue } from './evaluationMatrix'

// Eigenstaendige, interaktive Export-Datei im Stil der Design-Referenz
// docs/Evaluationsmatrix_Interaktiv.html (Filter, Suche, Legende,
// Kernaussage-Callout, Score-Statistik) - aber an das aktuelle Datenmodell
// angepasst: variable Kriterienzahl statt fixer 8, vierstufige Skala statt
// dreistufiger Ampel, Filter nach Themenfeld statt fixer Schnittmengen-Codes.
// Keine externen Schriftart-/Skript-Abhaengigkeiten, damit die Datei offline
// weitergebbar bleibt.

export function buildEvaluationHtmlExport(params: {
  criteria: Criterion[]
  sources: Source[]
  values: Map<string, SourceCriterionValue>
  topicNamesBySource: Map<string, string[]>
  allTopicNames: string[]
}): string {
  const { criteria, sources, values, topicNamesBySource, allTopicNames } = params

  const rows = sources.map((s) => {
    const cells = criteria.map((c) => values.get(`${s.id}:${c.id}`)?.value ?? null)
    const sum = cells.reduce((acc: number, v) => acc + (v ?? 0), 0)
    const max = criteria.length * 3
    const isDiss = s.type === 'dissertation'
    return {
      author: formatAuthorYear(s),
      title: s.title,
      ranking: formatRanking(s) || '–',
      topics: topicNamesBySource.get(s.id) ?? [],
      cells,
      score: sum,
      maxScore: max,
      isDiss,
    }
  })

  const rowsJson = JSON.stringify(rows)
  const criteriaJson = JSON.stringify(criteria.map((c) => ({ short_name: c.short_name, name: c.name, derivation: c.derivation })))
  const topicsJson = JSON.stringify(allTopicNames)

  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Evaluationsmatrix – Export</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Segoe UI', system-ui, sans-serif; background: #f0f4f8; color: #1a1a1a; min-height: 100vh; }
.page-header { background: linear-gradient(135deg, #1B3A5C 0%, #0f2240 100%); color: white; padding: 28px 40px 22px; border-bottom: 3px solid #4FC3F7; }
.page-header h1 { font-size: 22px; font-weight: 700; margin-bottom: 6px; }
.page-header p { font-size: 13px; color: #90b8d4; margin-bottom: 14px; }
.callout { background: rgba(46,125,50,0.15); border: 1px solid rgba(46,125,50,0.4); border-radius: 6px; padding: 10px 16px; font-size: 13px; color: #C8E6C9; line-height: 1.6; max-width: 900px; }
.callout strong { color: #A5D6A7; }
.controls { background: white; padding: 14px 40px; display: flex; flex-wrap: wrap; gap: 10px; align-items: center; border-bottom: 1px solid #e2e8f0; position: sticky; top: 0; z-index: 100; box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
.controls label { font-size: 12px; font-weight: 600; color: #1B3A5C; text-transform: uppercase; letter-spacing: 0.5px; margin-right: 4px; }
.filter-group { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.filter-btn { border: 1px solid #cbd5e0; background: white; border-radius: 4px; padding: 5px 12px; font-size: 12px; font-family: inherit; cursor: pointer; transition: all 0.15s; color: #4a5568; }
.filter-btn:hover { border-color: #2E5F8A; color: #1B3A5C; }
.filter-btn.active { background: #1B3A5C; color: white; border-color: #1B3A5C; }
.sep { width: 1px; height: 28px; background: #e2e8f0; }
.search-box { border: 1px solid #cbd5e0; border-radius: 4px; padding: 5px 10px; font-size: 13px; font-family: inherit; width: 220px; outline: none; }
.search-box:focus { border-color: #2E5F8A; }
.legend { padding: 12px 40px; background: white; border-bottom: 1px solid #e2e8f0; display: flex; gap: 20px; flex-wrap: wrap; align-items: center; }
.leg-item { display: flex; align-items: center; gap: 7px; font-size: 12.5px; color: #4a5568; }
.leg-dot { width: 22px; height: 22px; border-radius: 3px; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; flex-shrink: 0; }
.leg-v0 { background: #FFCDD2; color: #B71C1C; }
.leg-v1 { background: #FFE0B2; color: #E65100; }
.leg-v2 { background: #FFF9C4; color: #F57F17; }
.leg-v3 { background: #C8E6C9; color: #2E7D32; }
.leg-diss { background: #E3F2FD; color: #1565C0; border: 1px solid #90CAF9; }
.table-wrap { overflow-x: auto; padding: 24px 40px 40px; }
table { border-collapse: collapse; width: 100%; min-width: 900px; font-size: 12.5px; background: white; box-shadow: 0 2px 12px rgba(0,0,0,0.07); border-radius: 8px; overflow: hidden; }
thead th { background: #1B3A5C; color: white; padding: 10px 8px; text-align: center; font-size: 11px; font-weight: 600; letter-spacing: 0.2px; line-height: 1.4; vertical-align: bottom; white-space: normal; min-width: 70px; border: 1px solid rgba(255,255,255,0.1); }
thead th.th-left { text-align: left; min-width: 150px; }
thead th.th-title { min-width: 220px; text-align: left; }
tr.data-row.hidden { display: none; }
tr.data-row:hover td { filter: brightness(0.96); }
td { border: 1px solid #e2e8f0; padding: 7px 8px; vertical-align: top; }
td.td-author { font-weight: 600; color: #1B3A5C; white-space: nowrap; }
td.td-title { color: #374151; line-height: 1.5; }
td.td-ranking { text-align: center; font-size: 11px; white-space: nowrap; }
td.c-v0 { background: #FFCDD2; text-align: center; font-size: 16px; }
td.c-v1 { background: #FFE0B2; text-align: center; font-size: 16px; }
td.c-v2 { background: #FFF9C4; text-align: center; font-size: 16px; }
td.c-v3 { background: #C8E6C9; text-align: center; font-size: 16px; }
tr.row-diss td { background: #E3F2FD !important; }
tr.row-diss td.td-author { color: #0D47A1; }
tr.row-diss td.td-title { color: #1565C0; font-style: italic; }
td.td-score { vertical-align: middle; min-width: 90px; }
.score-bar-wrap { display: flex; align-items: center; gap: 6px; }
.score-bar { flex: 1; height: 8px; background: #e2e8f0; border-radius: 4px; overflow: hidden; }
.score-fill { height: 100%; border-radius: 4px; }
.score-label { font-family: monospace; font-size: 11px; color: #4a5568; min-width: 44px; }
.stats-bar { padding: 16px 40px; background: white; border-top: 1px solid #e2e8f0; display: flex; gap: 24px; flex-wrap: wrap; align-items: center; }
.stat-chip { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #4a5568; }
.stat-chip strong { color: #1B3A5C; font-size: 18px; }
</style>
</head>
<body>

<div class="page-header">
  <h1>Evaluationsmatrix</h1>
  <p>Export aus LitTool &nbsp;|&nbsp; ${new Date().toLocaleDateString('de-DE')}</p>
  <div class="callout">
    <strong>Kernaussage:</strong> Jede Zeile zeigt eine Quelle, jede Spalte ein Evaluationskriterium. Die Farbe zeigt den Abdeckungsgrad (leer bis voll).
  </div>
</div>

<div class="controls">
  <div class="filter-group" id="topicFilters">
    <label>Themenfeld:</label>
    <button class="filter-btn active" data-topic="">Alle</button>
  </div>
  <div class="sep"></div>
  <input class="search-box" type="text" placeholder="🔍  Suche Autor / Titel …" id="searchInput">
</div>

<div class="legend">
  <div class="leg-item"><div class="leg-dot leg-v3">●</div> Voll abgedeckt</div>
  <div class="leg-item"><div class="leg-dot leg-v2">◑</div> Zur Hälfte abgedeckt</div>
  <div class="leg-item"><div class="leg-dot leg-v1">◔</div> Zu einem Viertel abgedeckt</div>
  <div class="leg-item"><div class="leg-dot leg-v0">○</div> Nicht abgedeckt</div>
  <div class="leg-item"><div class="leg-dot leg-diss">⭐</div> Eigene Dissertation</div>
</div>

<div class="table-wrap">
<table id="mainTable">
<thead>
  <tr id="headRow">
    <th class="th-left">Autor (Jahr)</th>
    <th class="th-title">Titel</th>
    <th>Ranking</th>
  </tr>
</thead>
<tbody id="tableBody"></tbody>
</table>
</div>

<div class="stats-bar">
  <div class="stat-chip">Angezeigte Quellen: <strong id="row-count">–</strong></div>
  <div class="stat-chip">Durchschnittlicher Score: <strong id="avg-score">–</strong></div>
</div>

<script>
const ROWS = ${rowsJson};
const CRITERIA = ${criteriaJson};
const TOPICS = ${topicsJson};

const VALUE_META = {
  0: { symbol: '○', cls: 'v0', label: 'nicht abgedeckt' },
  1: { symbol: '◔', cls: 'v1', label: 'zu einem Viertel abgedeckt' },
  2: { symbol: '◑', cls: 'v2', label: 'zur Hälfte abgedeckt' },
  3: { symbol: '●', cls: 'v3', label: 'voll abgedeckt' },
};

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function ampelHtml(v, derivation) {
  if (v === null) return '<td></td>';
  const m = VALUE_META[v];
  return '<td class="c-' + m.cls + '" title="' + escapeHtml(m.label + (derivation ? ' — ' + derivation : '')) + '">' + m.symbol + '</td>';
}

function scoreHtml(score, max) {
  const pct = max > 0 ? Math.round((score / max) * 100) : 0;
  const color = pct >= 75 ? '#388e3c' : pct >= 40 ? '#f57c00' : '#c62828';
  return '<td class="td-score"><div class="score-bar-wrap"><div class="score-bar"><div class="score-fill" style="width:' + pct + '%;background:' + color + ';"></div></div><span class="score-label">' + score + '/' + max + '</span></div></td>';
}

// Kriterien-Spalten im Kopf ergaenzen
const headRow = document.getElementById('headRow');
CRITERIA.forEach(c => {
  const th = document.createElement('th');
  th.className = 'crit';
  th.title = c.derivation || '';
  th.textContent = c.short_name;
  headRow.appendChild(th);
});
const scoreTh = document.createElement('th');
scoreTh.textContent = 'Score';
headRow.appendChild(scoreTh);

// Themenfeld-Filterbuttons ergaenzen
const topicFilters = document.getElementById('topicFilters');
TOPICS.forEach(t => {
  const btn = document.createElement('button');
  btn.className = 'filter-btn';
  btn.dataset.topic = t;
  btn.textContent = t;
  topicFilters.appendChild(btn);
});

function buildTable() {
  const tbody = document.getElementById('tableBody');
  tbody.innerHTML = '';
  ROWS.forEach(row => {
    const tr = document.createElement('tr');
    tr.className = 'data-row' + (row.isDiss ? ' row-diss' : '');
    tr.dataset.search = (row.author + ' ' + row.title).toLowerCase();
    tr.dataset.topics = row.topics.join('|').toLowerCase();
    tr.dataset.score = row.score;
    let html = '<td class="td-author">' + (row.isDiss ? '⭐ ' : '') + escapeHtml(row.author) + '</td>' +
      '<td class="td-title">' + escapeHtml(row.title) + '</td>' +
      '<td class="td-ranking">' + escapeHtml(row.ranking) + '</td>';
    row.cells.forEach((v, i) => { html += ampelHtml(v, CRITERIA[i].derivation); });
    html += scoreHtml(row.score, row.maxScore);
    tr.innerHTML = html;
    tbody.appendChild(tr);
  });
  applyFilters();
}

let activeTopic = '';
let searchTerm = '';

function applyFilters() {
  const rows = document.querySelectorAll('tr.data-row');
  let visible = 0, totalPct = 0;
  rows.forEach(tr => {
    let show = true;
    if (activeTopic && !tr.dataset.topics.includes(activeTopic.toLowerCase())) show = false;
    if (searchTerm && !tr.dataset.search.includes(searchTerm)) show = false;
    tr.classList.toggle('hidden', !show);
    if (show) {
      visible++;
      const row = ROWS.find(r => (r.author + ' ' + r.title).toLowerCase() === tr.dataset.search);
      if (row && row.maxScore > 0) totalPct += (row.score / row.maxScore) * 100;
    }
  });
  document.getElementById('row-count').textContent = visible;
  document.getElementById('avg-score').textContent = visible > 0 ? Math.round(totalPct / visible) + '%' : '–';
}

document.querySelectorAll('.filter-btn[data-topic]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn[data-topic]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeTopic = btn.dataset.topic;
    applyFilters();
  });
});

document.getElementById('searchInput').addEventListener('input', e => {
  searchTerm = e.target.value.toLowerCase();
  applyFilters();
});

buildTable();
</script>
</body>
</html>
`
}
