// === БАЗОВЫЕ НАСТРОЙКИ ===
// Укажи базовый URL своего мини-API бота.
// Для локального теста: 'http://localhost:8080'
// Для продакшена: например, 'https://your-bot-host.tld'
const API_BASE = 'http://localhost:8080';

const tg = window.Telegram?.WebApp;
if (tg) { try { tg.ready(); tg.expand(); tg.MainButton?.hide(); } catch(_){} }

// Переход с обложки к приложению
const enterBtn = document.getElementById('enterBtn');
enterBtn?.addEventListener('click', () => {
  document.getElementById('welcome').classList.add('hide');
  setTimeout(() => {
    document.getElementById('welcome').hidden = true;
    document.getElementById('app').hidden = false;
    // авто-подгрузка при входе
    refreshAll();
  }, 260);
});

// Табы
document.getElementById('tabs').addEventListener('click', (e)=>{
  const btn = e.target.closest('.tab'); if(!btn) return;
  document.querySelectorAll('.tab').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  const id = btn.dataset.target;
  document.querySelectorAll('section.view').forEach(v=>v.classList.remove('active'));
  document.getElementById(id).classList.add('active');

  // Подгружаем соответствующий раздел при первом открытии
  if (id==='crypto') loadBlock(['BTC','ETH','SOL'], 'crypto-only');
  if (id==='stocks') loadBlock(['AAPL','MSFT','SPY'], 'stocks-only');
  if (id==='commodities') loadBlock(['GOLD','BRENT','WTI'], 'commodities-only');
});

// FAB «Обновить все»
document.getElementById('fab').addEventListener('click', refreshAll);

// ====== ЗАГРУЗКА ДАННЫХ ======
async function fetchPrice(symbol){
  const url = `${API_BASE}/api/price?symbol=${encodeURIComponent(symbol)}`;
  const r = await fetch(url, { cache:'no-store' });
  if (!r.ok) throw new Error('Bad status');
  return r.json();
}

function renderRows(symbols, targetId){
  const box = document.getElementById(targetId);
  return async () => {
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

async function refreshAll(){
  // Главная (три карточки)
  await loadBlock(['BTC','ETH','SOL'], 'crypto-list');
  await loadBlock(['AAPL','MSFT','SPY'], 'stocks-list');
  await loadBlock(['GOLD','BRENT','WTI'], 'commodities-list');

  // Если открыты разделы — тоже обновим
  if (document.getElementById('crypto').classList.contains('active'))
    await loadBlock(['BTC','ETH','SOL'], 'crypto-only');
  if (document.getElementById('stocks').classList.contains('active'))
    await loadBlock(['AAPL','MSFT','SPY'], 'stocks-only');
  if (document.getElementById('commodities').classList.contains('active'))
    await loadBlock(['GOLD','BRENT','WTI'], 'commodities-only');

  // маленькая сводка на главной (демо)
  document.getElementById('home-brief').innerHTML =
    `<div class="muted">Разделы обновлены • ${new Date().toLocaleTimeString()}</div>`;
}

// если кто-то открывает страницу напрямую (вне welcome), можно форснуть автозагрузку:
// refreshAll();
