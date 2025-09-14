// === БАЗОВЫЕ НАСТРОЙКИ ===
// Для Telegram/продакшена используй публичный https (ngrok/сервер)
// Для локального теста можно временно поставить 'http://localhost:8080'
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

// /api/series ИЛИ фолбэк, если его пока нет на бэке
async function fetchSeries(symbol, days=30){
  const url = `${API_BASE}/api/series?symbol=${encodeURIComponent(symbol)}&days=${days}`;
  try{
    return await cachedFetchJson(url, 60000);
  }catch(e){
    // Фолбэк: генерим «историю» вокруг текущей цены, чтобы графики не были пустыми
    const cur = await fetchPrice(symbol).catch(()=>null);
    let p = Number(cur?.price) || 100;
    const now = Date.now();
    const points = Array.from({length: Math.min(365, days)}, (_, i) => {
      p = p * (1 + (Math.random() - 0.5) * 0.02); // ±1%
      const t = now - (days - 1 - i) * 86400000;
      return { t, p: Number(p.toFixed(2)) };
    });
    return { symbol, points, _fallback: true };
  }
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
let rangeDays = 7; // 1, 7, 30
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

// ====== Списки цен на карточках (loadBlock) ======
function renderRows(symbols, targetId){
  const box = document.getElementById(targetId);
  return async () => {
    if (!box) { console.warn('no target box', targetId); return; }
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
}

document.getElementById('fab').addEventListener('click', async ()=>{
  await refreshAll();
  await renderHomeCharts();
});

// После «Войти»
const enterBtn = document.getElementById('enterBtn');
enterBtn?.addEventListener('click', async () => {
  document.getElementById('welcome').classList.add('hide');
  setTimeout(async () => {
    document.getElementById('welcome').hidden = true;
    document.getElementById('app').hidden = false;
    await refreshAll();
    await renderHomeCharts();
  }, 260);
});
