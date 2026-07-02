// ============================================================
// assets.js — 財富頁：資金帳戶
// 依賴：config.js, db.js, books.js
// ============================================================


async function loadAssetsFromCloud(){
  const allBookIds = DB.getBooks().map(b=>b.id);
  const data = await DB.fetchAssets(allBookIds);
  if(!data) return;
  DB.saveAssets(data);
}

function pickAssetEmoji(e){ assetEmoji=e; document.getElementById('asset-emoji-btn').textContent=e; document.querySelectorAll('#asset-eg-grid .eb').forEach(b=>b.classList.toggle('sel',b.textContent===e)); closeMo('mo-asset-emoji'); }


// ── Assets (資金帳戶) ──
async function addAsset(){
  const name=document.getElementById('asset-name-inp').value.trim();
  if(!name){toast('請輸入帳戶名稱');return;}
  const assets=DB.getAssets();
  const newAsset={id:'ast'+Date.now(),bookId:curBook,e:assetEmoji,name,
    initAmount:parseFloat(document.getElementById('asset-init-inp').value)||0,
    note:document.getElementById('asset-note-inp').value.trim(),
    txs:[],createdAt:today()};
  assets.push(newAsset);
  DB.saveAssets(assets);
  await DB.upsertAsset(newAsset);
  closeMo('mo-add-asset');
  document.getElementById('asset-name-inp').value=''; document.getElementById('asset-init-inp').value=''; document.getElementById('asset-note-inp').value='';
  assetEmoji='🏦'; document.getElementById('asset-emoji-btn').textContent='🏦';
  renderAssets(); updateTotalAssets(); toast(`「${name}」已建立`);
}


function renderAssets(){
  const assets=DB.getAssets().filter(a=>a.bookId===curBook);
  const el=document.getElementById('assets-list');
  if(!assets.length){el.innerHTML=`<div style="text-align:center;padding:2.5rem 1rem;color:var(--text3);"><div style="font-size:2.3rem;margin-bottom:.5rem;">🏦</div><div style="font-size:.84rem;line-height:1.7;">還沒有資金帳戶<br>點右上角新增</div></div>`;return;}
  el.innerHTML=assets.map(a=>{
    const bal=a.initAmount+(a.txs||[]).reduce((s,t)=>s+(t.type==='in'?t.amount:-t.amount),0);
    const lastTx=(a.txs||[]).slice(-1)[0];
    return `<div class="asset-card">
      <div class="asset-header">
        <div class="asset-icon">${a.e}</div>
        <div style="flex:1;"><div class="asset-name">${esc(a.name)}</div>${a.note?`<div class="asset-meta">${esc(a.note)}</div>`:''}</div>
        <button onclick="deleteAsset('${a.id}')" style="color:var(--text3);opacity:.4;font-size:.88rem;padding:4px;">✕</button>
      </div>
      <div class="asset-balance">NT$ ${fmt(bal)}</div>
      <div class="asset-meta">${lastTx?`最後操作 ${lastTx.date}`:`建立於 ${a.createdAt}`}</div>
      <div class="asset-actions">
        <button class="asset-btn in" onclick="openAssetTx('${a.id}','in')">存入 ＋</button>
        <button class="asset-btn out" onclick="openAssetTx('${a.id}','out')">提領 −</button>
      </div>
    </div>`;
  }).join('');
}


function openAssetTx(id,type){
  assetTxId=id; assetTxType=type;
  const a=DB.getAssets().find(a=>a.id===id);
  document.getElementById('asset-tx-title').innerHTML=`${a.e} ${esc(a.name)} <button class="md-close" onclick="closeMo('mo-asset-tx')">✕</button>`;
  setAssetTxType(type);
  // 重設為新增模式
  document.getElementById('asset-tx-amt').value='';
  document.getElementById('asset-tx-note').value='';
  document.getElementById('asset-tx-date').value=today();
  document.getElementById('asset-tx-edit-id').value='';
  document.getElementById('asset-tx-submit-btn').textContent='確認';
  renderAssetHist(a);
  openMo('mo-asset-tx');
}


function renderAssetHist(a){
  const hist=(a.txs||[]).slice().sort((x,y)=>y.date.localeCompare(x.date)).slice(0,20);
  document.getElementById('asset-hist-list').innerHTML=hist.map(t=>`
    <div class="dep-item">
      <span style="color:var(--text3);min-width:60px;font-size:.8rem;">${t.date}</span>
      <span style="flex:1;padding:0 6px;font-size:.83rem;">${esc(t.note||'')}</span>
      <span style="font-weight:600;color:${t.type==='in'?'var(--green-d)':'#b07a74'};margin-right:6px;">${t.type==='in'?'+':'−'}NT$${fmt(t.amount)}</span>
      <button onclick="openEditAssetTx('${assetTxId}','${t.id}')" style="font-size:.7rem;color:var(--blue-d);padding:2px 5px;border-radius:5px;border:1px solid var(--blue-l);margin-right:3px;">編</button>
      <button onclick="deleteAssetTx('${assetTxId}','${t.id}')" style="font-size:.7rem;color:var(--text3);padding:2px 5px;border-radius:5px;border:1px solid var(--border);">✕</button>
    </div>`).join('')||'<div style="font-size:.8rem;color:var(--text3);">尚無記錄</div>';
}


function setAssetTxType(type){
  assetTxType=type;
  document.getElementById('asset-tx-in-btn').style.fontWeight=type==='in'?'700':'400';
  document.getElementById('asset-tx-out-btn').style.fontWeight=type==='out'?'700':'400';
}


// 新增或編輯資金帳戶交易
async function submitAssetTx(){
  const editId=document.getElementById('asset-tx-edit-id').value;
  if(editId) await saveEditAssetTx(editId);
  else await doAssetTx();
}


async function doAssetTx(){
  const amt=parseFloat(document.getElementById('asset-tx-amt').value);
  if(!amt||amt<=0){toast('請輸入金額');return;}
  const date=document.getElementById('asset-tx-date').value||today();
  const note=document.getElementById('asset-tx-note').value.trim();
  const assets=DB.getAssets(),a=assets.find(a=>a.id===assetTxId);
  if(!a.txs)a.txs=[];
  const atx={id:'at_'+Date.now(),type:assetTxType,amount:amt,note,date};
  a.txs.push(atx);
  DB.saveAssets(assets);
  await DB.upsertAssetTx(assetTxId, atx);
  document.getElementById('asset-tx-amt').value='';
  document.getElementById('asset-tx-note').value='';
  document.getElementById('asset-tx-date').value=today();
  renderAssetHist(a); renderAssets(); updateTotalAssets();
  toast(`${assetTxType==='in'?'存入':'提領'} NT$${fmt(amt)}`);
}


function openEditAssetTx(assetId, txId){
  const a=DB.getAssets().find(a=>a.id===assetId);
  if(!a) return;
  const t=(a.txs||[]).find(t=>t.id===txId);
  if(!t) return;
  assetTxId=assetId;
  setAssetTxType(t.type);
  document.getElementById('asset-tx-amt').value=t.amount;
  document.getElementById('asset-tx-note').value=t.note||'';
  document.getElementById('asset-tx-date').value=t.date||today();
  document.getElementById('asset-tx-edit-id').value=txId;
  document.getElementById('asset-tx-submit-btn').textContent='儲存修改';
}


async function saveEditAssetTx(txId){
  const amt=parseFloat(document.getElementById('asset-tx-amt').value);
  if(!amt||amt<=0){toast('請輸入正確金額');return;}
  const date=document.getElementById('asset-tx-date').value||today();
  const note=document.getElementById('asset-tx-note').value.trim();
  const assets=DB.getAssets(),a=assets.find(a=>a.id===assetTxId);
  if(!a) return;
  const idx=(a.txs||[]).findIndex(t=>t.id===txId);
  if(idx>=0){
    a.txs[idx]={...a.txs[idx], type:assetTxType, amount:amt, note, date};
    DB.saveAssets(assets);
    await DB.upsertAssetTx(assetTxId, a.txs[idx]);
  }
  // 重設為新增模式
  document.getElementById('asset-tx-amt').value='';
  document.getElementById('asset-tx-note').value='';
  document.getElementById('asset-tx-date').value=today();
  document.getElementById('asset-tx-edit-id').value='';
  document.getElementById('asset-tx-submit-btn').textContent='確認';
  renderAssetHist(a); renderAssets(); updateTotalAssets();
  toast('已更新 ✓');
}


async function deleteAssetTx(assetId, txId){
  if(!confirm('確定刪除此交易記錄？')) return;
  const assets=DB.getAssets(),a=assets.find(a=>a.id===assetId);
  if(!a) return;
  a.txs=(a.txs||[]).filter(t=>t.id!==txId);
  DB.saveAssets(assets);
  // 從 Supabase 刪除
  if(isCloud()) await _sb.from('asset_txs').delete().eq('id',txId).eq('user_id',_user.id);
  renderAssetHist(a); renderAssets(); updateTotalAssets();
  toast('已刪除');
}


async function deleteAsset(id){
  if(!confirm('確定刪除此帳戶？'))return;
  DB.saveAssets(DB.getAssets().filter(a=>a.id!==id));
  await DB.deleteAsset(id);
  renderAssets(); updateTotalAssets(); toast('已刪除');
}

