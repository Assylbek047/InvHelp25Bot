// === БАЗОВЫЕ НАСТРОЙКИ ===
const API_BASE = 'https://d68e5bf5d4ab.ngrok-free.app';

console.log('[app.js] loaded');

// ====== Фронтовый кэш ======
const cache = {
  data: new Map(),
  get(key, ttl=30000){
    const v = this.data.get(key);
    if (!v) return null;
    if (Date.now() - v.ts > ttl){ this.data.delete(key); return null; }
    return v.value;
  },
  set(key, value){ this.data.set(key, {ts: Date.now(), value}); }
};

async function cachedFetchJson(url, ttlMs=30000){
  const hit = cache.get(url, ttlMs);
  if (hit) return hit;
  const r = await fetch(url, {cache:'no-store'});
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  const j = await r.json();
  cache.set(url, j);
  return j;
}

// ====== Функции API ======
async function fetchPrice(symbol){
  const url = `${API_BASE}/api/price?symbol=${encodeURIComponent(symbol)}`;
  return cachedFetchJson(url, 30000);
}
async function fetchSeries(symbol, days=30){
  const url = `${API_BASE}/api/series?symbol=${encodeURIComponent(symbol)}&days=${days}`;
  try{
    return await cachedFetchJson(url, 60000);
  }catch(e){
    const cur = await fetchPrice(symbol).catch(()=>null);
    let p = Number(cur?.price) || 100;
    const now = Date.now();
    const points = Array.from({length: Math.min(365, days)}, (_, i) => {
      p = p * (1 + (Math.random() - 0.5) * 0.02);
      const t = now - (days - 1 - i) * 86400000;
      return { t, p: Number(p.toFixed(2)) };
    });
    return { symbol, points, _fallback: true };
  }
}

// ====== Новости / Инсайты ======
async function fetchNews(symbol, limit = 3){
  const url = `${API_BASE}/api/news?symbol=${encodeURIComponent(symbol)}&limit=${limit}`;
  return cachedFetchJson(url, 60000);
}
async function fetchInsights(symbol, limit = 3){
  const url = `${API_BASE}/api/insights?symbol=${encodeURIComponent(symbol)}&limit=${limit}`;
  try { return await cachedFetchJson(url, 60000); } catch(_) { return { items: [] }; }
}
function sentimentBadge(s){
  const map = { positive: '👍', neutral: '•', negative: '👎' };
  const cls = s === 'positive' ? 'pos' : s === 'negative' ? 'neg' : 'muted';
  return `<span class="badge ${cls}">${map[s] || '•'} ${s || 'neutral'}</span>`;
}
function sourceBadge(kind){
  const k = (kind||'').toLowerCase();
  const label = k === 'verified' ? 'Проверенный' : 'Слух';
  const cls = k === 'verified' ? 'badge-ok' : 'badge-warn';
  return `<span class="badge ${cls}">${label}</span>`;
}
function fmtDate(x){
  const d = new Date(x); if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString();
}
async function renderNews(symbol, targetId, limit = 3){
  const box = document.getElementById(targetId);
  if (!box) return;
  box.innerHTML = '<div class="muted">Новости загружаются…</div>';
  try{
    const data = await fetchNews(symbol, limit);
    const items = data?.items || data || [];
    if (!items.length){ box.innerHTML = '<div class="muted">Нет новостей</div>'; return; }
    const html = items.slice(0, limit).map(n => {
      const title = n.title || 'Без заголовка';
      const url = n.url || '#';
      const date = fmtDate(n.published_at || n.time || Date.now());
      const sent = (n.sentiment || 'neutral').toLowerCase();
      const ai = n.ai_comment ? `<div class="ai-note">${n.ai_comment.text || n.ai_comment}</div><div class="muted tiny">confidence: ${(n.ai_comment?.confidence || 'med')}</div>` : '';
      const kind = n.kind || n.source_kind || 'verified';
      return `<div class="news-item">
        <a href="${url}" target="_blank" rel="noopener">${title}</a>
        <div class="news-meta">
          <span class="muted">${date}</span>
          ${sourceBadge(kind)}
          ${sentimentBadge(sent)}
        </div>
        ${ai}
      </div>`;
    }).join('');
    box.innerHTML = html;
  }catch(e){
    box.innerHTML = '<div class="neg">Новости недоступны</div>';
  }
}
async function renderPortfolioNews(){
  const box = document.getElementById('news-home');
  if (!box) return;
  try{
    const p = await getPortfolio();
    const syms = (p?.holdings || []).map(h=>h.symbol).slice(0,3);
    const symbols = syms.length ? syms : ['BTC','AAPL','GOLD'];
    box.innerHTML = '';
    for (const s of symbols){
      const sectionId = `news-${s}`;
      const section = document.createElement('div');
      section.className = 'card';
      section.innerHTML = `<div class="card-title">${s} — Новости / Инсайты</div><div id="${sectionId}" class="list"></div>`;
      box.appendChild(section);
      await renderNews(s, sectionId, 3);
    }
  }catch(_){ /* ignore */ }
}

// ====== Chart.js Helpers ======
function toChartData(points){
  const src = Array.isArray(points) ? points : [];
  const arr = src.slice(-120);
  return {
    labels: arr.map(x => new Date(x.t).toLocaleDateString()),
    values: arr.map(x => x?.p ?? null)
  };
}
const charts = {};
function renderLineChart(canvasId, labels, values){
  const el = document.getElementById(canvasId);
  if (!el) return;
  const ctx = el.getContext('2d');
  if (charts[canvasId]) charts[canvasId].destroy();
  charts[canvasId] = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets: [{ data: values, tension: .25, borderWidth: 2, pointRadius: 0 }]},
    options: {
      responsive: true,
      plugins: { legend: { display: false }},
      scales: { x: { display: false }, y: { display: false } }
    }
  });
}

// ====== Диапазоны ======
let rangeDays = 7;
function bindRangePills(){
  document.querySelectorAll('.range-pill').forEach(p=>{
    p.addEventListener('click', async ()=>{
      document.querySelectorAll('.range-pill').forEach(x=>x.classList.remove('active'));
      p.classList.add('active');
      rangeDays = parseInt(p.dataset.days,10) || 7;
      await renderHomeCharts();
      if (document.getElementById('crypto')?.classList.contains('active')) await renderCryptoTabChart();
      if (document.getElementById('stocks')?.classList.contains('active')) await renderStocksTabChart();
      if (document.getElementById('commodities')?.classList.contains('active')) await renderCommoditiesTabChart();
    });
  });
}

// ====== Отрисовка графиков ======
async function renderHomeCharts(){
  try{
    const [btc, aapl, gold] = await Promise.all([
      fetchSeries('BTC', rangeDays),
      fetchSeries('AAPL', rangeDays),
      fetchSeries('GOLD', rangeDays),
    ]);
    let d = toChartData(btc.points);  renderLineChart('chart-btc', d.labels, d.values);
    d = toChartData(aapl.points);     renderLineChart('chart-aapl', d.labels, d.values);
    d = toChartData(gold.points);     renderLineChart('chart-gold', d.labels, d.values);
  }catch(e){ console.warn('home charts', e); }
}
async function renderCryptoTabChart(){
  try{
    const btc = await fetchSeries('BTC', rangeDays);
    const d = toChartData(btc.points);
    renderLineChart('chart-btc-tab', d.labels, d.values);
  }catch(e){ console.warn('crypto tab chart', e); }
}
async function renderStocksTabChart(){
  try{
    const aapl = await fetchSeries('AAPL', rangeDays);
    const d = toChartData(aapl.points);
    renderLineChart('chart-aapl-tab', d.labels, d.values);
  }catch(e){ console.warn('stocks tab chart', e); }
}
async function renderCommoditiesTabChart(){
  try{
    const gold = await fetchSeries('GOLD', rangeDays);
    const d = toChartData(gold.points);
    renderLineChart('chart-gold-tab', d.labels, d.values);
  }catch(e){ console.warn('commod tab chart', e); }
}

// ====== Списки цен ======
function renderRows(symbols, targetId){
  const box = document.getElementById(targetId);
  return async () => {
    if (!box) return;
    box.innerHTML = '<div class="muted">Загрузка…</div>';
    const parts = await Promise.all(symbols.map(async (s)=>{
      try{
        const d = await fetchPrice(s);
        const cls = d.change_pct>0 ? 'pos' : d.change_pct<0 ? 'neg' : '';
        return `<div class="item">
                  <div><b>${d.symbol}</b> — $${Number(d.price).toFixed(2)}</div>
                  <div class="${cls}">${Number(d.change_pct).toFixed(2)}%</div>
                </div>`;
      }catch(_){
        return `<div class="item"><b>${s}</b> — <span class="neg">нет данных</span></div>`;
      }
    }));
    box.innerHTML = parts.join('');
  };
}
async function loadBlock(symbols, boxId){
  const run = renderRows(symbols, boxId);
  await run();
}

// ====== Табы ======
document.getElementById('tabs').addEventListener('click', async (e)=>{
  const btn = e.target.closest('.tab'); if(!btn) return;
  document.querySelectorAll('.tab').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  const id = btn.dataset.target;
  document.querySelectorAll('section.view').forEach(v=>v.classList.remove('active'));
  document.getElementById(id)?.classList.add('active');

  if (id==='crypto'){ await loadBlock(['BTC','ETH','SOL'], 'crypto-only'); await renderCryptoTabChart(); }
  if (id==='stocks'){ await loadBlock(['AAPL','MSFT','SPY'], 'stocks-only'); await renderStocksTabChart(); }
  if (id==='commodities'){ await loadBlock(['GOLD','BRENT','WTI'], 'commodities-only'); await renderCommoditiesTabChart(); }
});

// ====== Портфель / баланс ======
const tg = window.Telegram?.WebApp;
function setVH() {
  const h = (tg && tg.viewportHeight ? tg.viewportHeight : window.innerHeight);
  document.documentElement.style.setProperty('--vh', (h / 100) + 'px');
}
try { tg?.ready(); tg?.expand(); } catch(_) {}
setVH();
tg?.onEvent?.('viewportChanged', setVH);
window.addEventListener('resize', setVH);

const USER_ID = (tg && tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.id)
  ? String(tg.initDataUnsafe.user.id)
  : 'demo';

async function getPortfolio(){
  const url = `${API_BASE}/api/portfolio?user_id=${encodeURIComponent(USER_ID)}`;
  return cachedFetchJson(url, 10000);
}
async function saveHolding(symbol, qty){
  await fetch(`${API_BASE}/api/portfolio?user_id=${encodeURIComponent(USER_ID)}`, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({symbol, qty})
  });
  cache.data.clear();
}
async function removeHolding(symbol){
  await fetch(`${API_BASE}/api/portfolio?user_id=${encodeURIComponent(USER_ID)}&symbol=${encodeURIComponent(symbol)}`, {
    method:'DELETE'
  });
  cache.data.clear();
}

async function renderBalanceOnHome(){
  try{
    const p = await getPortfolio();
    const holdings = p.holdings || [];
    if (!holdings.length){
      document.getElementById('home-brief').innerHTML = '<div class="muted">Портфель пуст. Добавьте активы.</div>';
      return;
    }
    let total = 0;
    for (const h of holdings){
      const d = await fetchPrice(h.symbol);
      if (d && d.price) total += (h.qty || 0) * Number(d.price);
    }
    document.getElementById('home-brief').innerHTML =
      `<div class="muted">Активов: ${holdings.length}</div>
       <div class="muted">Баланс (оценка): $${total.toFixed(2)}</div>`;
  }catch(e){
    document.getElementById('home-brief').innerHTML = '<div class="muted">Баланс недоступен</div>';
  }
}

// ====== Обновление ======
bindRangePills();

async function refreshAll(){
  await loadBlock(['BTC','ETH','SOL'], 'crypto-list');
  await loadBlock(['AAPL','MSFT','SPY'], 'stocks-list');
  await loadBlock(['GOLD','BRENT','WTI'], 'commodities-list');
  await renderBalanceOnHome();
  await renderPortfolioNews();
}

document.getElementById('fab').addEventListener('click', async ()=>{
  await refreshAll();
  await renderHomeCharts();
});

// После «Войти»
const enterBtn = document.getElementById('enterBtn');
enterBtn?.addEventListener('click', async () => {
  const welcomeEl = document.getElementById('welcome');
  welcomeEl?.classList.add('hide');
  document.body.classList.add('locked');

  setTimeout(async () => {
    document.getElementById('welcome')?.setAttribute('hidden', 'true');
    document.getElementById('app')?.removeAttribute('hidden');

    try { tg?.expand(); } catch(_) {}
    setVH();
    window.scrollTo(0, 0);
    document.body.classList.remove('locked');

    await refreshAll();
    await renderHomeCharts();
  }, 260);
});
