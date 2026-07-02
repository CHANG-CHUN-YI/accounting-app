// ============================================================
// transactions.js — 記帳核心邏輯
// 新增記帳、編輯、刪除記帳記錄；存錢罐 / 分期付款的自動連動也在這裡處理
// 依賴：config.js, db.js, books.js, categories.js
// ============================================================


// ── goal chips (記帳時選目標) ──
function fillGoalChips(){
  const goals=DB.getGoals().filter(g=>g.bookId===curBook);
  const row=document.getElementById('goal-chips');
  if(!goals.length){row.style.display='none';return;}
  row.style.display='flex';
  row.innerHTML=`<button class="goal-chip ${curGoalChip===''?'active':''}" onclick="selGoalChip('')">無目標</button>`+
    goals.map(g=>`<button class="goal-chip ${curGoalChip===g.id?'active':''}" onclick="selGoalChip('${g.id}')">${g.e} ${esc(g.name)}</button>`).join('');
}

function selGoalChip(id){ curGoalChip=id; fillGoalChips(); }


// ── transactions ──
function addTx(override){
  const d=override||{
    type:curType, amount:parseFloat(document.getElementById('amt-in').value),
    catId:document.getElementById('main-cat-sel').value,
    subCat:document.getElementById('sub-cat-sel').style.display!=='none'?document.getElementById('sub-cat-sel').value:'',
    note:document.getElementById('note-in').value.trim(),
    date:document.getElementById('date-in').value,
    goalId:curGoalChip,
  };
  if(!d.amount||d.amount<=0){toast('請輸入正確金額');return;}
  if(!d.date){toast('請選擇日期');return;}
  const book=getBook();
  if(book.type==='shared'&&!override){pendingTx=d;renderWhoList();openMo('mo-who');return;}
  saveTx({...d,who:d.who||''});
}


function renderWhoList(){
  const book=getBook();
  // 取得共同帳本的所有成員名稱（包含 Supabase 的 member_names）
  const sb=sharedBooks[curBook];
  let members=[];
  if(sb&&sb.member_names){
    members=Object.values(sb.member_names);
  } else if(book.members&&book.members.length){
    members=book.members;
  }
  document.getElementById('who-list').innerHTML=
    members.map(m=>`<button onclick="confirmWho('${esc(m)}')" style="display:block;width:100%;text-align:left;padding:12px 14px;border-radius:10px;border:1.5px solid var(--border);margin-bottom:7px;font-size:.91rem;font-weight:500;">${esc(m)}</button>`).join('')+
    `<button onclick="confirmWho('')" style="display:block;width:100%;text-align:center;padding:10px;border-radius:10px;border:1.5px dashed var(--border);margin-bottom:7px;font-size:.84rem;color:var(--text3);">不指定（共同）</button>`;
}

function confirmWho(who){ closeMo('mo-who'); if(pendingTx){saveTx({...pendingTx,who});pendingTx=null;} }


async function saveTx(d){
  const tx={id:Date.now()+'_'+Math.random().toString(36).slice(2,6),bookId:curBook,type:d.type,amount:d.amount,catId:d.catId,subCat:d.subCat||'',note:d.note||'',date:d.date,who:d.who||'',goalId:d.goalId||'',instId:d.instId||''};
  const book=getBook();
  if(book?.type==='shared'&&isCloud()){
    await DB.insertSharedTx(tx, curBook, d.who||'');
    if(!sharedTxCache[curBook]) sharedTxCache[curBook]=[];
    // who: 選擇的成員名；沒選則顯示登入者名
    // who: 只用選擇的成員名，不指定就留空
    const whoDisplay=d.who||'';
    sharedTxCache[curBook].unshift({...tx, who:whoDisplay, who_name:whoDisplay});
  } else {
    await DB.insertTx(tx);
  }

  // 收入 + 選了存錢罐 → 自動撥款進罐
  if(d.type==='income' && d.goalId && !d._silent){
    const goals=DB.getGoals();
    const g=goals.find(g=>g.id===d.goalId);
    if(g){
      const txRef=tx?.id||('a'+Date.now());
      const newAlloc={id:'a_'+txRef, amount:d.amount,
        note:d.note||'', date:d.date||today()};
      g.allocs.push(newAlloc);
      DB.saveGoals(goals);
      await DB.upsertAlloc(d.goalId, newAlloc);
    }
  }
  // 支出 + 選了存錢罐 → 自動記入花費
  if(d.type==='expense' && d.goalId && !d._silent){
    const goals=DB.getGoals();
    const g=goals.find(g=>g.id===d.goalId);
    if(g){
      const txRef2=tx?.id||('sp'+Date.now());
      const newSpend={id:'sp_'+txRef2, amount:d.amount,
        note:d.note||'', date:d.date||today()};
      g.spends.push(newSpend);
      DB.saveGoals(goals);
      await DB.upsertSpend(d.goalId, newSpend);
    }
  }

  if(!d._silent){
    document.getElementById('amt-in').value='';
    document.getElementById('note-in').value='';
    document.getElementById('date-in').value=today();
    renderHome(); toast('記帳成功 ✓');
  } else renderHome();
  renderCal();
}


let editTxType='expense';


function openEditTx(id){
  const allTxs=[...DB.getTxs(),...(sharedTxCache[curBook]||[])];
  const t=allTxs.find(t=>t.id===id);
  if(!t)return;
  editTxType=t.type;
  document.getElementById('edit-tx-id').value=id;
  document.getElementById('edit-amount').value=t.amount;
  document.getElementById('edit-note').value=t.note||'';
  document.getElementById('edit-date').value=t.date;
  // 分類選單
  fillEditCats(t.type);
  document.getElementById('edit-main-cat').value=t.catId||'';
  updateEditSubCats();
  setTimeout(()=>{
    if(t.subCat) document.getElementById('edit-sub-cat').value=t.subCat;
  },50);
  // 類型按鈕
  setEditType(t.type, false);
  openMo('mo-edit-tx');
}


function setEditType(type, refill=true){
  editTxType=type;
  const expBtn=document.getElementById('edit-type-expense');
  const incBtn=document.getElementById('edit-type-income');
  expBtn.style.fontWeight=type==='expense'?'700':'400';
  expBtn.style.borderColor=type==='expense'?'#b07a74':'var(--border)';
  incBtn.style.fontWeight=type==='income'?'700':'400';
  incBtn.style.borderColor=type==='income'?'var(--green-d)':'var(--border)';
  if(refill) fillEditCats(type);
}


function fillEditCats(type){
  const sel=document.getElementById('edit-main-cat');
  sel.innerHTML=getCats(type).map(c=>`<option value="${c.id}">${c.e} ${c.n}</option>`).join('');
  updateEditSubCats();
}


function updateEditSubCats(){
  const mainId=document.getElementById('edit-main-cat').value;
  const cat=getCats(editTxType).find(c=>c.id===mainId);
  const sub=document.getElementById('edit-sub-cat');
  const lbl=document.getElementById('edit-sub-label');
  if(cat&&cat.subs&&cat.subs.length){
    sub.innerHTML=`<option value="">（子分類）</option>`+cat.subs.map(s=>`<option value="${esc(s)}">${s}</option>`).join('');
    sub.style.display=''; lbl.style.display='';
  }else{ sub.style.display='none'; lbl.style.display='none'; }
}


async function saveTxEdit(){
  const id=document.getElementById('edit-tx-id').value;
  const amount=parseFloat(document.getElementById('edit-amount').value);
  if(!amount||amount<=0){toast('請輸入正確金額');return;}
  const updates={
    type:editTxType,
    amount,
    catId:document.getElementById('edit-main-cat').value,
    subCat:document.getElementById('edit-sub-cat').style.display!=='none'?document.getElementById('edit-sub-cat').value:'',
    note:document.getElementById('edit-note').value.trim(),
    date:document.getElementById('edit-date').value,
  };
  const book=getBook();
  if(book?.type==='shared'&&isCloud()){
    // 先更新 Supabase，等完成後再更新 cache
    await DB.updateSharedTx(id,updates);
    if(sharedTxCache[curBook]){
      const idx=sharedTxCache[curBook].findIndex(t=>t.id===id);
      if(idx>=0) sharedTxCache[curBook][idx]={...sharedTxCache[curBook][idx],...updates};
    }
  } else {
    await DB.updateTx(id,updates);
    // 再更新 localStorage（用 Supabase 回傳確認後的資料）
    const txs=DB.getTxs();
    const idx=txs.findIndex(t=>t.id===id);
    if(idx>=0) txs[idx]={...txs[idx],...updates};
    DB.saveTxs(txs);
  }
  closeMo('mo-edit-tx');
  renderHome(); renderCal();
  if(document.getElementById('page-stats').classList.contains('active'))renderStats();
  toast('記錄已更新 ✓');
}


async function deleteTx(id){
  if(!confirm('確定刪除？'))return;
  // 找到這筆 tx，確認有沒有 goalId（刪除前先記錄）
  const allTxs=[...DB.getTxs(),...(sharedTxCache[curBook]||[])];
  const tx=allTxs.find(t=>t.id===id);

  const book=getBook();
  if(book?.type==='shared'&&isCloud()){
    await DB.deleteSharedTx(id);
    if(sharedTxCache[curBook]) sharedTxCache[curBook]=sharedTxCache[curBook].filter(t=>t.id!==id);
  } else {
    await DB.deleteTx(id);
  }

  // 如果這筆有綁定存錢罐，同步移除存錢罐裡對應的自動記錄
  if(tx?.goalId){
    const goals=DB.getGoals();
    const g=goals.find(g=>g.id===tx.goalId);
    if(g){
      // 優先用 txId 精確比對，找不到再用金額+日期模糊比對
      const txId=tx.id;
      if(tx.type==='income'){
        const before=g.allocs.length;
        // 先試精確比對（id 含 txId）
        g.allocs=g.allocs.filter(a=>!a.id.includes(txId));
        // 沒刪到的話改用金額+日期
        if(g.allocs.length===before){
          g.allocs=g.allocs.filter(a=>!(Math.abs(a.amount-Number(tx.amount))<0.01&&a.date===tx.date));
        }
      } else {
        const before=g.spends.length;
        g.spends=g.spends.filter(s=>!s.id.includes(txId));
        if(g.spends.length===before){
          g.spends=g.spends.filter(s=>!(Math.abs(s.amount-Number(tx.amount))<0.01&&s.date===tx.date));
        }
      }
      DB.saveGoals(goals);
    }
  }

  // 如果這筆是分期付款自動記錄的支出，同步把該分期的已付期數退回一期
  // 雙重辨識：instId 欄位（新）或 note 前綴 [分期]（舊 / 雲端 instId 被覆蓋時的備援）
  const isInstPayment=!!(tx?.instId||(tx?.note||'').startsWith('[分期] '));
  if(isInstPayment){
    const insts=DB.getInsts();
    // 優先用 instId 精確比對
    let inst=tx?.instId ? insts.find(i=>i.id===tx.instId) : null;
    // 找不到時，從 note「[分期] NAME 第N期」解析名稱 + 金額比對
    if(!inst && (tx?.note||'').startsWith('[分期] ')){
      const noteName=(tx.note||'').replace(/^\[分期\] /,'').replace(/ 第\d+期$/,'');
      inst=insts.find(i=>
        i.bookId===curBook && i.name===noteName && i.paidPeriods>0 &&
        Math.abs(Number(i.perAmount)-Number(tx.amount))<0.01
      );
    }
    if(inst && inst.paidPeriods>0){
      inst.paidPeriods--;
      if(inst.status==='done' && inst.paidPeriods<inst.totalPeriods) inst.status='active';
      DB.saveInsts(insts);
      await DB.upsertInstallment(inst);
      renderInsts();
    }
  }

  // 更新畫面（不重拉 Supabase，避免時序問題）
  renderHome(); renderCal();
  if(document.getElementById('page-stats').classList.contains('active'))renderStats();
  if(document.getElementById('page-wealth').classList.contains('active'))renderWealth();
  toast('已刪除');
}
