// ============================================================
// ui.js — 共用 UI（彈窗開關、頁面切換、toast、日期格式化等小工具）+
//        App 啟動流程（init / showLogin / showApp）
// 這支檔案最後載入，並在檔案最底部呼叫 init() 啟動整個 App。
// 依賴：以上所有模組
// ============================================================


async function init(){
  // emoji grids（不需登入就設定好）
  function fillEG(id,list,fn){ document.getElementById(id).innerHTML=list.map(e=>`<button class="eb" onclick="${fn}('${e}')">${e}</button>`).join(''); }
  fillEG('eg-grid',EMOJI_LIST,'pickEmoji');
  fillEG('goal-eg-grid',GOAL_EMOJIS,'pickGoalEmoji');
  fillEG('asset-eg-grid',ASSET_EMOJIS,'pickAssetEmoji');
  fillEG('inst-eg-grid',INST_EMOJIS,'pickInstEmoji');

  // 嘗試初始化 Supabase
  const cloudOk = await sbInit();
  if(SB_URL && SB_KEY && !cloudOk){
    // 有設定 Supabase 但還沒登入 → 顯示登入頁
    showLogin(); return;
  }
  // 本機模式 或 已登入 → 進入 App
  showApp();
}


function showLogin(){
  document.getElementById('login-page').style.display='flex';
  document.getElementById('app').style.display='none';
}


async function showApp(){
  document.getElementById('login-page').style.display='none';
  document.getElementById('app').style.display='flex';

  // 更新模式標籤 & 頭像
  if(isCloud()){
    document.getElementById('mode-badge').textContent='☁️ 雲端';
    document.getElementById('mode-badge').style.color='var(--blue-d)';
    document.getElementById('user-avatar').style.display='flex';
    const meta=_user.user_metadata||{};
    const name=meta.full_name||_user.email||'';
    const avatar=meta.avatar_url||'';
    document.getElementById('user-avatar-img').src=avatar;
    document.getElementById('user-avatar-init').textContent=name?name[0].toUpperCase():'U';
    document.getElementById('mo-user-name').textContent=name;
    document.getElementById('mo-user-email').textContent=_user.email||'';
    document.getElementById('mo-avatar-img').src=avatar;
    document.getElementById('mo-avatar-init').textContent=name?name[0].toUpperCase():'U';
    // 從雲端拉最新 txs
    await DB.fetchTxs();
    // 載入雲端共同帳本
    await loadSharedBooks();
    // 載入個人設定（含帳本分類）
    await loadUserSettings();
    // 載入存錢罐和資金帳戶
    await loadGoalsFromCloud();
    await loadAssetsFromCloud();
    await loadInstsFromCloud();
  }

  // 把舊帳本的分類補上 subs（版本遷移）
  migrateCats();

  let books=DB.getBooks();
  if(!books.length){
    books=[{id:'b1',name:'我的帳本',type:'personal',members:[],cats:dc(DEF_CATS),budgets:{total:0,cats:{}}}];
    DB.saveBooks(books);
  }
  curBook=localStorage.getItem('lastBook')||books[0].id;
  if(!books.find(b=>b.id===curBook)) curBook=books[0].id;

  rebuildYearSel();
  document.getElementById('stats-month').value=new Date().getMonth()+1;

  const now=new Date(); calY=now.getFullYear(); calM=now.getMonth(); calSel=today();
  renderBookTabs();
  // 如果上次停在共同帳本，主動載入資料再渲染
  const lastBook=DB.getBooks().find(b=>b.id===curBook);
  if(lastBook?.type==='shared'&&isCloud()){
    isSharedBook=true;
    await fetchSharedTxsForBook(curBook);
  }
  switchBook(curBook,false); applyRecurs(); renderHome();

  // 自動備份排程（每天一次）
  scheduleAutoBackup();
  // 即時同步（Supabase Realtime）
  setupRealtime();
}


// ══════════════════════════════════════════
// WEALTH PAGE
// ══════════════════════════════════════════
function renderWealth(){
  renderGoals(); renderAssets(); updateTotalAssets(); renderInsts();
}


function updateTotalAssets(){
  // 資金帳戶餘額
  const assets=DB.getAssets().filter(a=>a.bookId===curBook);
  const assetTotal=assets.reduce((s,a)=>{
    const bal=a.initAmount+(a.txs||[]).reduce((ss,t)=>ss+(t.type==='in'?t.amount:-t.amount),0);
    return s+bal;
  },0);

  // 日常累積結餘（排除存錢罐的 goalId 交易）
  const allTxs=getBookTxs().filter(t=>!t.goalId);
  const income=sumType(allTxs,'income');
  const expense=sumType(allTxs,'expense');
  const dailyBalance=income-expense;

  const total=assetTotal+dailyBalance;
  document.getElementById('total-assets-val').textContent=`NT$ ${fmt(total)}`;

  // 補充說明
  const breakdown=document.getElementById('total-assets-breakdown');
  if(breakdown){
    breakdown.textContent=`日常結餘 NT$${fmt(dailyBalance)}　+　帳戶 NT$${fmt(assetTotal)}`;
  }
}


function clearAll(){ localStorage.clear(); closeMo('mo-clear'); init(); toast('資料已清除'); }



// ── UI ──
function switchPage(name){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
  document.getElementById('page-'+name).classList.add('active');
  document.getElementById('nav-'+name).classList.add('active');
  if(name==='stats'){buildPieTabs();renderStats();}
  if(name==='budget'){fillRecurCats();renderBudget();}
  if(name==='wealth'){renderWealth();}
  if(name==='settings'){ updateCatCounts(); initBackupToggle(); }
}


function openMo(id){
  document.getElementById(id).classList.add('open');
  if(id==='mo-book-mgr')renderBookListMd();
  if(id==='mo-add-recur')fillRecurCats();
  if(id==='mo-user')refreshBackupTime();
  // mo-add-inst 由 openAddInst() 直接處理
  if(id==='mo-add-goal'){
    // 重設為新增模式（若不是由 openEditGoal 觸發）
    const editId=document.getElementById('goal-edit-id');
    if(editId&&!editId.value){
      document.getElementById('goal-modal-title').innerHTML='新增目標存錢罐 <button class="md-close" onclick="closeMo(\'mo-add-goal\')">✕</button>';
      document.getElementById('goal-submit-btn').textContent='建立存錢罐';
    }
  }
}

function closeMo(id){ document.getElementById(id).classList.remove('open'); }

function bgClose(e,id){ if(e.target.id===id)closeMo(id); }


let _tt;

function toast(msg){ const el=document.getElementById('toast');el.textContent=msg;el.classList.add('show');clearTimeout(_tt);_tt=setTimeout(()=>el.classList.remove('show'),2200); }


function today(){ const d=new Date(); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }

function fmt(n){ return Math.round(Number(n)).toLocaleString('zh-TW'); }

function pad(n){ return String(n).padStart(2,'0'); }

function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function dc(o){ return JSON.parse(JSON.stringify(o)); }

function sameMonth(ds,now){ const d=new Date(ds); return d.getFullYear()===now.getFullYear()&&d.getMonth()===now.getMonth(); }

function sumType(arr,type){ return arr.filter(t=>t.type===type).reduce((s,t)=>s+Number(t.amount),0); }

document.getElementById('date-in').value=today();
init();

