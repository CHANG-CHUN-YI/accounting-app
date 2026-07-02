// ============================================================
// installments.js — 財富頁：分期付款
// 依賴：config.js, db.js, books.js, transactions.js（saveTx）
// ============================================================


const INST_EMOJIS=['💳','🚗','🏠','📱','💻','✈️','💎','🏥','📚','🎓','🛒','⚡'];

let instEmoji='💳';


function pickInstEmoji(e){
  instEmoji=e;
  document.getElementById('inst-emoji-btn').textContent=e;
  closeMo('mo-inst-emoji');
}


// switchWealthTab 擴充支援 inst
function switchWealthTab(tab){
  ['goals','assets','inst'].forEach(t=>{
    const panel=document.getElementById('wealth-'+t);
    const btn=document.getElementById('wtab-'+t);
    if(panel) panel.style.display=t===tab?'block':'none';
    if(btn) btn.classList.toggle('active',t===tab);
  });
  if(tab==='inst'){ renderInsts(); }
  if(tab==='goals') renderGoals();
  if(tab==='assets') renderAssets();
}


// 開啟新增分期（重設表單）
function openAddInst(){
  document.getElementById('inst-modal-title').innerHTML='新增分期付款 <button class="md-close" onclick="closeMo(\'mo-add-inst\')">✕</button>';
  document.getElementById('inst-name-inp').value='';
  document.getElementById('inst-per-amt').value='';
  document.getElementById('inst-total-p').value='';
  document.getElementById('inst-paid-p').value='0';
  document.getElementById('inst-start-date').value=today();
  document.getElementById('inst-note-inp').value='';
  document.getElementById('inst-edit-id').value='';
  document.getElementById('inst-submit-btn').textContent='建立分期';
  instEmoji='💳';
  document.getElementById('inst-emoji-btn').textContent='💳';
  // 填入分類選單
  const sel=document.getElementById('inst-cat-sel');
  sel.innerHTML=getCats('expense').map(c=>`<option value="${c.id}">${c.e} ${c.n}</option>`).join('');
  document.getElementById('mo-add-inst').classList.add('open');
}


// 開啟編輯分期
function openEditInst(id){
  const inst=DB.getInsts().find(i=>i.id===id);
  if(!inst) return;
  document.getElementById('inst-modal-title').innerHTML='編輯分期付款 <button class="md-close" onclick="closeMo(\'mo-add-inst\')">✕</button>';
  instEmoji=inst.e||'💳';
  document.getElementById('inst-emoji-btn').textContent=instEmoji;
  document.getElementById('inst-name-inp').value=inst.name;
  document.getElementById('inst-per-amt').value=inst.perAmount;
  document.getElementById('inst-total-p').value=inst.totalPeriods;
  document.getElementById('inst-paid-p').value=inst.paidPeriods;
  document.getElementById('inst-start-date').value=inst.startDate||today();
  document.getElementById('inst-note-inp').value=inst.note||'';
  document.getElementById('inst-edit-id').value=id;
  document.getElementById('inst-submit-btn').textContent='儲存修改';
  const sel=document.getElementById('inst-cat-sel');
  sel.innerHTML=getCats('expense').map(c=>`<option value="${c.id}">${c.e} ${c.n}</option>`).join('');
  sel.value=inst.catId||'other';
  document.getElementById('mo-add-inst').classList.add('open');
}


async function submitInst(){
  const editId=document.getElementById('inst-edit-id').value;
  const name=document.getElementById('inst-name-inp').value.trim();
  const perAmt=parseFloat(document.getElementById('inst-per-amt').value);
  const totalP=parseInt(document.getElementById('inst-total-p').value);
  const paidP=parseInt(document.getElementById('inst-paid-p').value)||0;
  const startDate=document.getElementById('inst-start-date').value||today();
  const catId=document.getElementById('inst-cat-sel').value||'other';
  const note=document.getElementById('inst-note-inp').value.trim();

  if(!name){toast('請輸入名稱');return;}
  if(!perAmt||perAmt<=0){toast('請輸入每期金額');return;}
  if(!totalP||totalP<=0){toast('請輸入總期數');return;}
  if(paidP>totalP){toast('已付期數不能超過總期數');return;}

  const inst={
    id: editId||('inst_'+Date.now()+'_'+Math.random().toString(36).slice(2,5)),
    bookId: curBook, name, e:instEmoji,
    totalAmount: perAmt*totalP, perAmount:perAmt,
    totalPeriods:totalP, paidPeriods:paidP,
    startDate, catId, note,
    status: paidP>=totalP?'done':'active',
  };

  const insts=DB.getInsts();
  if(editId){
    const idx=insts.findIndex(i=>i.id===editId);
    if(idx>=0) insts[idx]=inst; else insts.push(inst);
  } else {
    insts.unshift(inst);
  }
  DB.saveInsts(insts);
  await DB.upsertInstallment(inst);
  closeMo('mo-add-inst');
  renderInsts();
  toast(editId?'已更新 ✓':`「${name}」分期已建立`);
}


// 標記本期已付
async function payInstPeriod(id){
  const insts=DB.getInsts();
  const inst=insts.find(i=>i.id===id);
  if(!inst) return;
  if(inst.paidPeriods>=inst.totalPeriods){toast('已全部還清');return;}

  inst.paidPeriods++;
  if(inst.paidPeriods>=inst.totalPeriods) inst.status='done';
  DB.saveInsts(insts);
  await DB.upsertInstallment(inst);

  // 自動記一筆支出，note 加 [分期] 前綴，讓刪除回滾和預算計算都能可靠辨識
  await saveTx({
    type:'expense', amount:inst.perAmount,
    catId:inst.catId||'other', subCat:'',
    note:`[分期] ${inst.name} 第${inst.paidPeriods}期`,
    date:today(), who:'', goalId:'', instId:inst.id,
  });
  renderInsts();
  toast(`✓ 已付第 ${inst.paidPeriods} 期，剩 ${inst.totalPeriods-inst.paidPeriods} 期`);
}


async function deleteInst(id){
  if(!confirm('確定刪除此分期付款？'))return;
  DB.saveInsts(DB.getInsts().filter(i=>i.id!==id));
  await DB.deleteInstallment(id);
  renderInsts();
  toast('已刪除');
}


function renderInsts(){
  const el=document.getElementById('inst-list');
  if(!el) return;
  const insts=DB.getInsts().filter(i=>i.bookId===curBook);
  if(!insts.length){
    el.innerHTML='<div style="text-align:center;padding:2rem;color:var(--text3);font-size:.85rem;">尚無分期付款記錄<br>點右上角「＋ 新增分期」開始追蹤</div>';
    return;
  }
  const active=insts.filter(i=>i.status==='active');
  const done=insts.filter(i=>i.status==='done');
  const renderCard=inst=>{
    const pct=inst.totalPeriods?Math.round(inst.paidPeriods/inst.totalPeriods*100):0;
    const remain=inst.totalPeriods-inst.paidPeriods;
    const remainAmt=remain*inst.perAmount;
    const isDone=inst.status==='done';
    // 計算下一期日期
    const nextDate=inst.paidPeriods<inst.totalPeriods?getNextPayDate(inst):'—';
    return `<div class="inst-card">
      <div class="inst-header">
        <div class="inst-icon">${inst.e}</div>
        <div>
          <div class="inst-name">${esc(inst.name)}</div>
          ${inst.note?`<div style="font-size:.72rem;color:var(--text3);">${esc(inst.note)}</div>`:''}
        </div>
        <span class="${isDone?'inst-status-done':'inst-status-active'}">${isDone?'✓ 已結清':'進行中'}</span>
      </div>
      <div class="inst-bar-wrap">
        <div class="inst-bar${isDone?' done':''}" style="width:${pct}%"></div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:.73rem;color:var(--text3);margin-bottom:.6rem;">
        <span>已付 ${inst.paidPeriods} / ${inst.totalPeriods} 期</span>
        <span>${pct}%</span>
      </div>
      <div class="inst-stats">
        <div class="inst-stat">
          <div class="inst-stat-label">每期金額</div>
          <div class="inst-stat-val" style="color:var(--blue-d);">NT$${fmt(inst.perAmount)}</div>
        </div>
        <div class="inst-stat">
          <div class="inst-stat-label">剩餘金額</div>
          <div class="inst-stat-val" style="color:${isDone?'var(--green-d)':'#b07a74'};">${isDone?'✓ 結清':'NT$'+fmt(remainAmt)}</div>
        </div>
        <div class="inst-stat">
          <div class="inst-stat-label">${isDone?'共還款':'下期日期'}</div>
          <div class="inst-stat-val" style="font-size:.75rem;">${isDone?'NT$'+fmt(inst.totalAmount):nextDate}</div>
        </div>
      </div>
      ${!isDone?`<div style="display:flex;gap:8px;margin-top:.8rem;">
        <button onclick="payInstPeriod('${inst.id}')" style="flex:2;padding:9px;border-radius:10px;background:var(--blue-d);color:#fff;font-size:.84rem;font-weight:500;">💰 本期已付（第${inst.paidPeriods+1}期）</button>
        <button onclick="openEditInst('${inst.id}')" style="flex:1;padding:9px;border-radius:10px;background:var(--bg2);color:var(--text2);font-size:.82rem;">編輯</button>
        <button onclick="deleteInst('${inst.id}')" style="padding:9px 12px;border-radius:10px;background:var(--bg2);color:var(--text3);font-size:.82rem;">✕</button>
      </div>`:`<div style="display:flex;gap:8px;margin-top:.8rem;">
        <button onclick="openEditInst('${inst.id}')" style="flex:1;padding:9px;border-radius:10px;background:var(--bg2);color:var(--text2);font-size:.82rem;">編輯</button>
        <button onclick="deleteInst('${inst.id}')" style="padding:9px 12px;border-radius:10px;background:var(--bg2);color:var(--text3);font-size:.82rem;">✕</button>
      </div>`}
    </div>`;
  };
  el.innerHTML=
    (active.length?'<div style="font-size:.78rem;color:var(--text2);font-weight:600;margin-bottom:.5rem;">進行中</div>'+active.map(renderCard).join(''):'')
   +(done.length?'<div style="font-size:.78rem;color:var(--text3);font-weight:600;margin:.8rem 0 .5rem;">已結清</div>'+done.map(renderCard).join(''):'');
}


// 計算下一期付款日
function getNextPayDate(inst){
  if(!inst.startDate) return '—';
  const start=new Date(inst.startDate);
  const next=new Date(start);
  next.setMonth(next.getMonth()+inst.paidPeriods);
  return `${next.getMonth()+1}/${next.getDate()}`;
}


async function loadInstsFromCloud(){
  const data = await DB.fetchInstallments();
  if(!data) return;
  DB.saveInsts(data);
}

