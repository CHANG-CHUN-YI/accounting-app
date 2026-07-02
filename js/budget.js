// ============================================================
// budget.js — 預算頁（月預算、分類預算、固定收支）
// 依賴：config.js, db.js, books.js, categories.js
// ============================================================


async function savePersonalBudget(budgets){
  const books=DB.getBooks(), book=books.find(b=>b.id===curBook);
  if(book){ book.budgets=budgets; DB.saveBooks(books); }
  if(isCloud()&&getBook()?.type!=='shared'){
    await syncBooksToCloud();
  } else if(isCloud()&&getBook()?.type==='shared'){
    await DB.saveSharedBookBudgets(curBook, budgets);
    if(sharedBooks[curBook]) sharedBooks[curBook].budgets=budgets;
  }
}


// ── budget ──
function renderBudget(){
  const now=new Date();
  // 預算只算日常（無目標、非分期付款、非固定收支自動記帳）的支出
  // 分期付款和固定收支都已在分配總覽各自獨立計入，排除在外避免重複計算
  const isAutoTx=t=>!!(t.instId||(t.note||'').startsWith('[分期] ')||(t.note||'').startsWith('[固定] '));
  // monthExp：排除自動記帳，供分類明細列表使用（避免雙重計算）
  const monthExp=getBookTxs().filter(t=>sameMonth(t.date,now)&&t.type==='expense'&&!t.goalId&&!isAutoTx(t));
  // totalSpent：包含固定＋分期的實際總花費，供頂部「已用」進度條使用
  const totalSpent=getBookTxs().filter(t=>sameMonth(t.date,now)&&t.type==='expense'&&!t.goalId).reduce((s,t)=>s+Number(t.amount),0);
  const books=DB.getBooks(),book=books.find(b=>b.id===curBook);
  const cfg=book.budgets||{};const tb=cfg.total||0;
  document.getElementById('total-b-display').textContent=tb?`NT$ ${fmt(tb)}`:'未設定';
  if(tb){
    document.getElementById('inp-total-budget').value=tb;
    const pct=Math.min(Math.round(totalSpent/tb*100),100);
    const bar=document.getElementById('total-bbar');
    bar.style.width=pct+'%'; bar.className='bbar'+(pct>=80?' warn':'');
    document.getElementById('total-bpct').textContent=`已用 NT$${fmt(totalSpent)} / NT$${fmt(tb)}（${pct}%）`;
  }else{document.getElementById('total-bbar').style.width='0%';document.getElementById('total-bpct').textContent='';}
  const catCfg=cfg.cats||{};
  // 只計算目前存在的分類預算（排除已刪除的分類）
  const existCatIds = new Set(getCats('expense').map(c=>c.id));
  const catAllocated = Object.entries(catCfg)
    .filter(([id])=>existCatIds.has(id))
    .reduce((s,[,v])=>s+Number(v||0),0);
  // 固定支出也計入分配
  const recurExpense = DB.getRecurs()
    .filter(r=>r.bookId===curBook&&r.type==='expense')
    .reduce((s,r)=>s+Number(r.amount||0),0);
  // 進行中的分期付款每月金額也計入
  const instExpense = DB.getInsts()
    .filter(i=>i.bookId===curBook&&i.status==='active')
    .reduce((s,i)=>s+Number(i.perAmount||0),0);
  const totalAllocated = catAllocated + recurExpense + instExpense;

  // 更新分配總覽
  const summaryEl = document.getElementById('cat-budget-summary');
  if(tb && summaryEl){
    summaryEl.style.display='block';
    const remain = tb - totalAllocated;
    const allocPct = Math.min(Math.round(totalAllocated/tb*100),100);
    const isOver = totalAllocated > tb;
    document.getElementById('cat-alloc-bar').style.width = allocPct+'%';
    document.getElementById('cat-alloc-bar').style.background = isOver ? '#b07a74' : allocPct>=90 ? 'var(--amber-d)' : 'var(--blue-d)';
    const detailParts = [];
    if(recurExpense>0) detailParts.push(`固定 NT$${fmt(recurExpense)}`);
    if(instExpense>0) detailParts.push(`分期 NT$${fmt(instExpense)}`);
    const detailStr = detailParts.length ? `（含${detailParts.join('、')}）` : '';
    document.getElementById('cat-alloc-amt').textContent = `NT$${fmt(totalAllocated)}${detailStr}`;
    document.getElementById('cat-alloc-pct').textContent = `${allocPct}%`;
    const remainEl = document.getElementById('cat-alloc-remain');
    if(isOver){
      remainEl.textContent = `⚠️ 超出 NT$${fmt(-remain)}`;
      remainEl.style.color = '#b07a74';
    } else {
      remainEl.textContent = `剩餘可分配 NT$${fmt(remain)}`;
      remainEl.style.color = remain < tb*0.1 ? 'var(--amber-d)' : 'var(--green-d)';
    }
  } else if(summaryEl){
    summaryEl.style.display='none';
  }

  document.getElementById('cat-blist').innerHTML=getCats('expense').map(cat=>{
    const spent=monthExp.filter(t=>t.catId===cat.id).reduce((s,t)=>s+Number(t.amount),0);
    const budget=catCfg[cat.id]||0;
    const pct=budget?Math.min(Math.round(spent/budget*100),100):0;
    return `<div class="cat-bitem">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
        <div style="font-size:.87rem;font-weight:500;">${cat.e} ${esc(cat.n)}</div>
        <div style="font-size:.79rem;color:var(--text2);">NT$${fmt(spent)}${budget?' / NT$'+fmt(budget):''}</div>
      </div>
      ${budget?`<div class="bbar-wrap"><div class="bbar${pct>=80?' warn':''}" style="width:${pct}%"></div></div>`:''}
      <div class="bitem-row">
        <input class="b-input" type="number" placeholder="設定預算" value="${budget||''}" id="cb-${cat.id}"
          inputmode="decimal" oninput="previewCatBudget('${cat.id}',this.value)">
        <button class="bsave" onclick="saveCatBudget('${cat.id}')">儲存</button>
      </div>
    </div>`;
  }).join('');
  renderInstBudgetList();
  renderRecurList();
}


function renderInstBudgetList(){
  const insts=DB.getInsts().filter(i=>i.bookId===curBook&&i.status==='active');
  const el=document.getElementById('inst-budget-list');
  const titleEl=document.getElementById('inst-budget-title');
  if(!el) return;
  if(!insts.length){
    if(titleEl) titleEl.style.display='none';
    el.style.display='none';
    return;
  }
  if(titleEl) titleEl.style.display='';
  el.style.display='';
  el.innerHTML=insts.map(inst=>{
    const nextDate=getNextPayDate(inst);
    const cat=getCats('expense').find(c=>c.id===inst.catId)||{e:'📦',n:'其他'};
    return `<div style="display:flex;align-items:center;gap:10px;background:var(--bg3);border-radius:10px;padding:.8rem;margin-bottom:6px;box-shadow:var(--shadow);">
      <div style="width:32px;height:32px;border-radius:8px;background:rgba(168,155,191,.2);display:flex;align-items:center;justify-content:center;font-size:.9rem;flex-shrink:0;">${inst.e||'💳'}</div>
      <div style="flex:1;">
        <div style="font-size:.86rem;font-weight:500;">${esc(inst.name)}</div>
        <div style="font-size:.71rem;color:var(--text3);margin-top:1px;">下期 ${nextDate}・${cat.e} ${esc(cat.n)}・${inst.paidPeriods}/${inst.totalPeriods} 期</div>
      </div>
      <div style="font-weight:600;font-size:.9rem;color:#b07a74;flex-shrink:0;">-${fmt(inst.perAmount)}</div>
    </div>`;
  }).join('');
}


// 輸入分類預算時即時預覽分配總覽
function previewCatBudget(catId, val){
  const book=getBook();
  const catCfg=(book.budgets||{}).cats||{};
  const tb=(book.budgets||{}).total||0;
  if(!tb) return;
  // 用當前輸入值預覽
  const existIds = new Set(getCats('expense').map(c=>c.id));
  const preview={...catCfg, [catId]: parseFloat(val)||0};
  const catAlloc=Object.entries(preview)
    .filter(([id])=>existIds.has(id))
    .reduce((s,[,v])=>s+Number(v||0),0);
  const recurExp=DB.getRecurs()
    .filter(r=>r.bookId===curBook&&r.type==='expense')
    .reduce((s,r)=>s+Number(r.amount||0),0);
  const instExp=DB.getInsts()
    .filter(i=>i.bookId===curBook&&i.status==='active')
    .reduce((s,i)=>s+Number(i.perAmount||0),0);
  const totalAllocated=catAlloc+recurExp+instExp;
  const remain=tb-totalAllocated;
  const allocPct=Math.min(Math.round(totalAllocated/tb*100),100);
  const isOver=totalAllocated>tb;
  document.getElementById('cat-alloc-bar').style.width=allocPct+'%';
  document.getElementById('cat-alloc-bar').style.background=isOver?'#b07a74':allocPct>=90?'var(--amber-d)':'var(--blue-d)';
  const pParts=[];
  if(recurExp>0) pParts.push(`固定 NT$${fmt(recurExp)}`);
  if(instExp>0) pParts.push(`分期 NT$${fmt(instExp)}`);
  const pDetail=pParts.length?`（含${pParts.join('、')}）`:'';
  document.getElementById('cat-alloc-amt').textContent=`NT$${fmt(totalAllocated)}${pDetail}`;
  document.getElementById('cat-alloc-pct').textContent=`${allocPct}%`;
  const remainEl=document.getElementById('cat-alloc-remain');
  if(isOver){
    remainEl.textContent=`⚠️ 超出 NT$${fmt(-remain)}`;
    remainEl.style.color='#b07a74';
  } else {
    remainEl.textContent=`剩餘可分配 NT$${fmt(remain)}`;
    remainEl.style.color=remain<tb*0.1?'var(--amber-d)':'var(--green-d)';
  }
}


async function saveTotalBudget(){
  const v=parseFloat(document.getElementById('inp-total-budget').value);
  if(!v||v<=0){toast('請輸入正確金額');return;}
  const book=getBook();
  if(!book.budgets) book.budgets={cats:{}};
  book.budgets.total=v;
  await savePersonalBudget(book.budgets);
  closeMo('mo-total-budget'); renderBudget(); renderHome(); toast('月預算已儲存');
}


async function saveCatBudget(catId){
  const v=parseFloat(document.getElementById('cb-'+catId).value)||0;
  const book=getBook();
  if(!book.budgets) book.budgets={cats:{}};
  if(!book.budgets.cats) book.budgets.cats={};
  book.budgets.cats[catId]=v;
  await savePersonalBudget(book.budgets);
  renderBudget(); toast('已儲存');
}


function fillRecurCats(){ fillCatSel('recur-cat',document.getElementById('recur-type').value); }


async function addRecur(){
  const name=document.getElementById('recur-name').value.trim();
  const amt=parseFloat(document.getElementById('recur-amt').value);
  if(!name||!amt){toast('請填寫名稱和金額');return;}
  const recurs=DB.getRecurs();
  const dayVal = parseInt(document.getElementById('recur-day').value)||1;
  const day = Math.min(Math.max(dayVal,1),31);
  recurs.push({id:'r'+Date.now(),bookId:curBook,type:document.getElementById('recur-type').value,name,amount:amt,catId:document.getElementById('recur-cat').value,day:String(day)});
  DB.saveRecurs(recurs);
  await syncBooksToCloud();
  closeMo('mo-add-recur');
  document.getElementById('recur-name').value=''; document.getElementById('recur-amt').value='';
  renderBudget(); toast('已新增');
}


async function deleteRecur(id){
  DB.saveRecurs(DB.getRecurs().filter(r=>r.id!==id));
  await syncBooksToCloud();
  renderBudget(); toast('已刪除');
}


function renderRecurList(){
  const recurs=DB.getRecurs().filter(r=>r.bookId===curBook);
  const rl=document.getElementById('recur-list');
  if(!recurs.length){rl.innerHTML='<div style="color:var(--text3);font-size:.82rem;padding:.35rem 0;">尚未設定</div>';return;}
  rl.innerHTML=recurs.map(r=>{
    const cat=getCats(r.type).find(c=>c.id===r.catId)||{e:'📦',n:''};
    return `<div style="display:flex;align-items:center;gap:10px;background:var(--bg3);border-radius:10px;padding:.8rem;margin-bottom:6px;box-shadow:var(--shadow);">
      <div style="width:32px;height:32px;border-radius:8px;background:rgba(${r.type==='income'?'143,181,160':'168,155,191'},.2);display:flex;align-items:center;justify-content:center;font-size:.9rem;flex-shrink:0;">${cat.e}</div>
      <div style="flex:1;"><div style="font-size:.86rem;font-weight:500;">${esc(r.name)}</div><div style="font-size:.71rem;color:var(--text3);margin-top:1px;">每月 ${r.day} 號・${cat.e} ${esc(cat.n)}</div></div>
      <div style="font-weight:600;font-size:.9rem;color:${r.type==='income'?'var(--green-d)':'#b07a74'};flex-shrink:0;">${r.type==='income'?'+':'-'}${fmt(r.amount)}</div>
      <button onclick="deleteRecur('${r.id}')" style="color:var(--text3);opacity:.4;font-size:.88rem;padding:3px;">✕</button>
    </div>`;
  }).join('');
}


function applyRecurs(){
  const now=new Date();
  const key=`ra_${curBook}_${now.getFullYear()}_${now.getMonth()}`;
  if(localStorage.getItem(key))return;
  DB.getRecurs().filter(r=>r.bookId===curBook).forEach(r=>{
    if(now.getDate()<parseInt(r.day))return;
    const date=`${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(r.day)}`;
    if(!DB.getTxs().find(t=>t.note===`[固定] ${r.name}`&&t.date===date&&t.bookId===curBook))
      saveTx({type:r.type,amount:r.amount,catId:r.catId,subCat:'',note:`[固定] ${r.name}`,date,who:'',goalId:'',_silent:true});
  });
  localStorage.setItem(key,'1');
}
