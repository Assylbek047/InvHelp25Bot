const tg = window.Telegram && window.Telegram.WebApp;
if (tg) {
  tg.ready();
  try { tg.expand(); } catch(_) {}
  document.documentElement.dataset.theme = tg.colorScheme || 'dark';
  try { tg.MainButton.hide(); } catch(_) {}
} else {
  document.documentElement.dataset.theme = 'dark';
}
const haptic = (t='light') => { try { tg.HapticFeedback.impactOccurred(t); } catch(_){} };

// элементы
const welcome = document.getElementById('welcome');
const app = document.getElementById('app');
const fab = document.getElementById('fab');

// переход с обложки
document.getElementById('enterBtn').addEventListener('click', () => {
  haptic();
  app.hidden = false;
  app.classList.add('fade-enter');

  welcome.classList.remove('active');
  welcome.hidden = true;               // гарантированно убираем обложку

  app.classList.add('active');
  requestAnimationFrame(()=> app.classList.add('fade-enter-active'));
  setTimeout(()=> app.classList.remove('fade-enter','fade-enter-active'), 300);

  if (!location.hash) location.hash = '#home';
  show(location.hash);
  showFab(true);
});

// состояние (моки)
const store = { pl:null, watchlist:[], ideas:[], risk:null };

// FAB
function setFab(text, onClick){ fab.textContent=text; fab.onclick=()=>{haptic(); onClick && onClick();}; }
function showFab(show=true){ fab.classList.toggle('show', show); }

// роутер
const routes = ['#home','#watchlist','#ideas','#profile'];
function show(hash){
  if (!routes.includes(hash)) hash = '#home';

  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.route===hash));
  routes.forEach(r => {
    const el = document.querySelector(r);
    if (!el) return;
    const active = (r===hash);
    el.hidden = !active;
    el.classList.toggle('active', active);
  });

  if (tg && tg.BackButton) (hash!=='#home') ? tg.BackButton.show() : tg.BackButton.hide();

  if (hash==='#home'){ setFab('Добавить операцию', ()=>alert('Заглушка: форма операции')); showFab(true); }
  else if (hash==='#watchlist'){ setFab('Добавить тикер', addMockTicker); showFab(true); }
  else if (hash==='#ideas'){ setFab('Обновить идеи', loadMockIdeas); showFab(true); }
  else if (hash==='#profile'){ setFab('Сохранить профиль', pseudoSaveProfile); showFab(true); }

  render(hash);
}
window.addEventListener('hashchange', ()=> show(location.hash));
document.getElementById('tabs').addEventListener('click', (e)=>{
  const tab = e.target.closest('.tab'); if(!tab) return;
  location.hash = tab.dataset.route; haptic();
});
if (tg && tg.BackButton) tg.BackButton.onClick(()=>{ history.back(); haptic(); });

// рендеры
function render(hash){
  if (hash==='#home') renderHome();
  if (hash==='#watchlist') renderWatchlist();
  if (hash==='#ideas') renderIdeas();
  if (hash==='#profile') renderProfile();
}

function renderHome(){
  const pill=document.getElementById('pill-pl');
  const plEl=document.getElementById('pl-val');
  const brief=document.getElementById('home-brief');
  plEl.textContent='…';
  brief.innerHTML=`<div class="skeleton sk-line"></div><div class="skeleton sk-line" style="width:55%"></div>`;
  setTimeout(()=>{
    if (store.pl==null) store.pl=(Math.random()*2-1)*3.7;
    const v=store.pl;
    plEl.textContent=(v>=0?'+':'')+v.toFixed(2)+'%';
    pill.style.borderColor=v>=0?'var(--good)':'var(--bad)';
    pill.style.boxShadow=v>=0?'0 0 0 1px var(--good) inset':'0 0 0 1px var(--bad) inset';
    brief.innerHTML=`<div class="muted">Активов: ${store.watchlist.length||0}</div>
                     <div class="muted">Риск-профиль: ${store.risk?mapRisk(store.risk):'не выбран'}</div>`;
  },450);
}

function renderWatchlist(){
  const list=document.getElementById('wl-list');
  const empty=document.getElementById('wl-empty');
  if (!store.watchlist.length){ empty.hidden=false; list.innerHTML=''; return; }
  empty.hidden=true;
  list.innerHTML=store.watchlist.map(a=>{
    const chgCls=a.chg>=0?'chg pos':'chg neg';
    const chgStr=(a.chg>=0?'+':'')+a.chg.toFixed(2)+'%';
    return `<div class="item"><div><div class="ticker">${a.ticker}</div>
            <div class="muted">$${a.price.toFixed(2)}</div></div>
            <div class="${chgCls}">${chgStr}</div></div>`;
  }).join('');
}

function renderIdeas(){
  const list=document.getElementById('ideas-list');
  const empty=document.getElementById('ideas-empty');
  if (!store.ideas.length){ empty.hidden=false; list.innerHTML=''; return; }
  empty.hidden=true;
  list.innerHTML=store.ideas.map(id=>`
    <div class="item">
      <div><div class="title">${id.title}</div>
           <div class="muted">тег: ${id.tag} • риск: ${id.risk}</div></div>
      <button class="btn ghost" onclick="alert('Заглушка: открыть идею');">Открыть</button>
    </div>`).join('');
}

function renderProfile(){
  const box=document.getElementById('profile-state');
  box.innerHTML = !store.risk
    ? `<div class="empty">Ещё не настроено. <span class="chip">Выберите риск-профиль</span></div>`
    : `<div class="pill">Текущий риск-профиль: <strong>${mapRisk(store.risk)}</strong></div>
       <div class="muted" style="margin-top:8px;">(локально, без сервера — демо)</div>`;
}

// действия (моки)
function addMockTicker(){
  const sample=['AAPL','MSFT','NVDA','SPY','TSLA','GOOGL','AMZN','BTC','ETH'];
  const t=sample[Math.floor(Math.random()*sample.length)];
  const price=(Math.random()*3000)+10;
  const chg=(Math.random()*2-1)*5;
  store.watchlist.push({ticker:t, price, chg});
  renderWatchlist();
  if (tg) tg.showPopup({title:'Добавлено', message:`${t} в Watchlist`, buttons:[{type:'ok'}]});
}
function loadMockIdeas(){
  store.ideas=[
    {title:'Долгосрочно: полупроводники', tag:'growth', risk:'средний'},
    {title:'Дивидендный фокус', tag:'dividends', risk:'низкий'},
  ];
  renderIdeas();
}
function pseudoSaveProfile(){
  if (!store.risk){ if(tg) tg.showPopup({title:'Профиль не выбран', message:'Выберите риск-профиль ниже', buttons:[{type:'ok'}]}); return; }
  if (tg) tg.showPopup({title:'Сохранено', message:`Риск-профиль: ${mapRisk(store.risk)}`, buttons:[{type:'ok'}]});
}
function mapRisk(r){ return r==='low'?'Консервативный': r==='med'?'Умеренный':'Агрессивный'; }

// клики по кнопкам профиля и быстрых действий
document.addEventListener('click', (e)=>{
  const btn=e.target.closest('button[data-action]'); if(!btn) return;
  const a=btn.dataset.action;
  if (a==='add_trade') alert('Заглушка: форма операции');
  if (a==='add_ticker') addMockTicker();
  if (a==='set_risk_low'){ store.risk='low'; renderProfile(); }
  if (a==='set_risk_med'){ store.risk='med'; renderProfile(); }
  if (a==='set_risk_high'){ store.risk='high'; renderProfile(); }
});

// старт
if (!location.hash) location.hash='#home';
