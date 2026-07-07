// ============================================================
// backup.js — CSV/JSON 匯出匯入、Google Drive 自動備份、Realtime 即時同步
// 依賴：config.js, db.js, books.js, transactions.js
// ============================================================


// ── CSV ──
function exportCSV(){
  const txs=getBookTxs();if(!txs.length){toast('還沒有記錄');return;}
  const csv=buildCSV(txs);
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'}));
  a.download=`記帳本_${today()}.csv`; a.click(); toast('CSV 已匯出');
}


function exportJSON(){
  const payload={
    version:'2', exportedAt:new Date().toISOString(),
    books:DB.getBooks(), txs:getBookTxs(),
    recurs:DB.getRecurs(), goals:DB.getGoals(), assets:DB.getAssets()
  };
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));
  a.download=`記帳本_${today()}.json`; a.click(); toast('JSON 已匯出');
}


function importCSV(input){
  const file=input.files[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload=e=>{
    const raw=e.target.result.replace(/^\uFEFF/,'');
    const lines=raw.split(/\r?\n/);
    const header=lines[0].split(',').map(h=>h.trim().replace(/^"|"$/g,''));
    const colIdx={
      type:   header.findIndex(h=>h==='類型'||h==='type'),
      amount: header.findIndex(h=>h==='金額'||h==='amount'),
      catId:  header.findIndex(h=>h==='分類'||h==='catId'),
      subCat: header.findIndex(h=>h==='子分類'||h==='subCat'),
      note:   header.findIndex(h=>h==='備註'||h==='note'),
      date:   header.findIndex(h=>h==='日期'||h==='date'),
      who:    header.findIndex(h=>h==='記帳者'||h==='who'),
      goalId: header.findIndex(h=>h==='目標'||h==='goalId'),
    };
    const useHeader=colIdx.type>=0&&colIdx.amount>=0&&colIdx.date>=0;
    const rows=[];
    lines.slice(1).forEach((line,idx)=>{
      if(!line.trim()) return;
      const p=parseCSVLine(line);
      const get=(col,pos)=>useHeader?(p[colIdx[col]]||'').trim():(p[pos]||'').trim();
      const typeRaw=get('type',1);
      const amount=parseFloat(get('amount',2));
      const date=(get('date',6)||'').trim();
      if(!amount||!date) return;
      rows.push({
        type: typeRaw==='收入'||typeRaw==='income'?'income':'expense',
        amount, catId: get('catId',3)||'other', subCat: get('subCat',4)||'',
        note: (get('note',5)||'').replace(/^"|"$/g,''),
        date, who: get('who',7)||'', goalId: get('goalId',8)||'',
        // 每筆給唯一 id
        _uid: `imp_${Date.now()+idx}_${Math.random().toString(36).slice(2,8)}`,
      });
    });
    if(!rows.length){ toast('沒有有效資料'); return; }
    toast(`匯入中，共 ${rows.length} 筆…`);
    // 用 Promise 確保 async 寫入完成
    doImport(rows).then(count=>{
      renderHome();
      toast(`✓ 已匯入 ${count} 筆`);
    }).catch(err=>{
      console.error('import error',err);
      toast('匯入失敗，請查看 Console');
    });
  };
  reader.readAsText(file,'utf-8'); input.value='';
}


async function doImport(rows){
  const book=getBook();
  const isShared=book?.type==='shared';

  if(isCloud()){
    if(isShared){
      // 共同帳本 → shared_transactions
      const whoName=_user.user_metadata?.full_name||_user.email||'我';
      const supaRows=rows.map(r=>({
        id: r._uid,
        book_id: curBook, user_id: _user.id, who_name: whoName,
        type: r.type, amount: r.amount,
        cat_id: r.catId, sub_cat: r.subCat,
        note: r.note, date: r.date, goal_id: r.goalId,
      }));
      for(let i=0;i<supaRows.length;i+=50){
        const batch=supaRows.slice(i,i+50);
        const {error}=await _sb.from('shared_transactions').upsert(batch,{onConflict:'id'});
        if(error) console.error('import shared batch',i,error);
      }
      await fetchSharedTxsForBook(curBook);
    } else {
      // 個人帳本 → transactions
      const supaRows=rows.map(r=>({
        id: r._uid,
        user_id: _user.id, book_id: curBook,
        type: r.type, amount: r.amount,
        cat_id: r.catId, sub_cat: r.subCat,
        note: r.note, date: r.date,
        who: r.who, goal_id: r.goalId,
      }));
      for(let i=0;i<supaRows.length;i+=50){
        const batch=supaRows.slice(i,i+50);
        // upsert 避免重複匯入同一份 CSV 造成重複記錄
        const {error}=await _sb.from('transactions').upsert(batch,{onConflict:'id'});
        if(error) console.error('import batch',i,error);
      }
      await DB.fetchTxs();
    }
  } else {
    // 本機模式
    const txs=DB.getTxs();
    rows.forEach(r=>{
      txs.unshift({id:r._uid, bookId:curBook,
        type:r.type, amount:r.amount, catId:r.catId, subCat:r.subCat,
        note:r.note, date:r.date, who:r.who, goalId:r.goalId});
    });
    DB.saveTxs(txs);
  }
  // 處理有 goalId 的記錄 → 同步到存錢罐（用 id 去重避免重複匯入）
  const goals = DB.getGoals();
  let goalChanged = false;
  const goalPromises = [];
  rows.forEach(r=>{
    if(!r.goalId) return;
    const g = goals.find(g=>g.id===r.goalId);
    if(!g) return;
    if(r.type==='income'){
      const allocId='a_'+r._uid;
      // 去重：已存在同 id 就跳過
      if(g.allocs.find(a=>a.id===allocId)) return;
      const alloc={id:allocId, amount:r.amount, note:r.note||'CSV匯入', date:r.date};
      g.allocs.push(alloc);
      goalPromises.push(DB.upsertAlloc(r.goalId, alloc));
    } else {
      const spendId='sp_'+r._uid;
      if(g.spends.find(s=>s.id===spendId)) return;
      const spend={id:spendId, amount:r.amount, note:r.note||'', date:r.date};
      g.spends.push(spend);
      goalPromises.push(DB.upsertSpend(r.goalId, spend));
    }
    goalChanged = true;
  });
  if(goalChanged){
    DB.saveGoals(goals);
    await Promise.all(goalPromises);
  }

  return rows.length;
}


// RFC 4180 簡易 CSV 解析（處理引號內含逗號的欄位）
function parseCSVLine(line){
  const result=[]; let cur=''; let inQ=false;
  for(let i=0;i<line.length;i++){
    const c=line[i];
    if(c==='"'){ if(inQ&&line[i+1]==='"'){cur+='"';i++;}else inQ=!inQ; }
    else if(c===','&&!inQ){ result.push(cur); cur=''; }
    else cur+=c;
  }
  result.push(cur);
  return result;
}


// ══════════════════════════════════════════
// Google Drive 自動備份
// 使用 Google Identity Services（GIS）+ Drive API v3
// 每天備份一次，存在使用者自己的 Google Drive AppData 資料夾
// ══════════════════════════════════════════
const GD_CLIENT_ID = '336212546733-gd4pnho93vrkncl8d98arhdjb0tclm7g.apps.googleusercontent.com';

const GD_SCOPE = 'https://www.googleapis.com/auth/drive.file';

let _gdToken = null;


function toggleAutoBackup(){
  const enabled = localStorage.getItem('autoBackup') !== 'off';
  const newState = !enabled;
  localStorage.setItem('autoBackup', newState ? 'on' : 'off');
  const el = document.getElementById('backup-toggle');
  if(el){ el.classList.toggle('on', newState); }
  toast(newState ? '☁️ 自動備份已開啟' : '自動備份已關閉');
}


function initBackupToggle(){
  const enabled = localStorage.getItem('autoBackup') !== 'off';
  const el = document.getElementById('backup-toggle');
  if(el) el.classList.toggle('on', enabled);
}


// ══════════════════════════════════════════
// Supabase Realtime 即時同步
// ══════════════════════════════════════════
let _realtimeChannel = null;


function setupRealtime(){
  if(!isCloud()) return;
  // 清除舊的輪詢（避免 Realtime 恢復後輪詢仍在跑）
  if(_pollTimer){ clearInterval(_pollTimer); _pollTimer=null; }
  // 清除舊的頻道
  if(_realtimeChannel){
    _sb.removeChannel(_realtimeChannel);
    _realtimeChannel = null;
  }

  _realtimeChannel = _sb.channel('db-changes')
    // 個人交易記錄即時更新
    .on('postgres_changes',{
      event: '*',
      schema: 'public',
      table: 'transactions',
      filter: `user_id=eq.${_user.id}`
    }, async ()=>{
      await DB.fetchTxs();
      renderHome();
      if(document.getElementById('page-stats').classList.contains('active')) renderStats();
      if(document.getElementById('page-budget').classList.contains('active')) renderBudget();
    })
    // 共同帳本交易記錄即時更新
    .on('postgres_changes',{
      event: '*',
      schema: 'public',
      table: 'shared_transactions',
    }, async (payload)=>{
      const bookId = payload.new?.book_id || payload.old?.book_id;
      if(!bookId || !sharedBooks[bookId]) return;
      // 只更新當前顯示的共同帳本
      await fetchSharedTxsForBook(bookId);
      if(curBook === bookId){
        renderHome();
        if(document.getElementById('page-stats').classList.contains('active')) renderStats();
      }
    })
    // 存錢罐即時更新
    .on('postgres_changes',{
      event: '*',
      schema: 'public',
      table: 'goals',
      filter: `user_id=eq.${_user.id}`
    }, async ()=>{
      await loadGoalsFromCloud();
      if(document.getElementById('page-wealth').classList.contains('active')) renderWealth();
      fillGoalChips();
    })
    // 資金帳戶即時更新
    .on('postgres_changes',{
      event: '*',
      schema: 'public',
      table: 'assets',
      filter: `user_id=eq.${_user.id}`
    }, async ()=>{
      await loadAssetsFromCloud();
      if(document.getElementById('page-wealth').classList.contains('active')) renderWealth();
    })
    .subscribe((status)=>{
      if(status === 'SUBSCRIBED'){
        console.log('Realtime 連線成功');
        document.getElementById('mode-badge').textContent='☁️ 即時同步';
      } else if(status === 'CHANNEL_ERROR'){
        console.warn('Realtime 連線失敗，改用輪詢');
        startPolling();
      }
    });
}


// Realtime 不可用時改用輪詢（3 分鐘更新一次，減少耗電）
const POLL_INTERVAL = 180000;
let _pollTimer = null;

function startPolling(){
  if(_pollTimer) return;
  if(document.hidden) return; // 頁面在背景時不啟動
  _pollTimer = setInterval(async()=>{
    if(!isCloud() || document.hidden) return; // 在背景時跳過本次輪詢
    await DB.fetchTxs();
    renderHome();
    if(isSharedBook) await fetchSharedTxsForBook(curBook);
  }, POLL_INTERVAL);
}


// ── Page Visibility API ──────────────────────────────────────
// 進入背景（鎖屏、切換 App）：立即斷開所有連線，避免耗電
// 回到前台：重新建立連線並更新資料
document.addEventListener('visibilitychange', ()=>{
  if(document.hidden){
    // 進背景：停止輪詢、關閉 WebSocket
    if(_pollTimer){ clearInterval(_pollTimer); _pollTimer=null; }
    if(_realtimeChannel){ _sb.removeChannel(_realtimeChannel); _realtimeChannel=null; }
  } else {
    // 回前台：重新連線，並補抓離線期間錯過的資料
    if(isCloud()){
      setupRealtime();
      DB.fetchTxs().then(()=>{ renderHome(); renderBudget(); });
    }
  }
});


// ── 網路狀態偵測 ─────────────────────────────────────────────
// 飛航模式或斷網時停止所有背景活動
// 恢復網路時重新連線並同步資料
window.addEventListener('offline', ()=>{
  if(_pollTimer){ clearInterval(_pollTimer); _pollTimer=null; }
  if(_realtimeChannel){ _sb.removeChannel(_realtimeChannel); _realtimeChannel=null; }
  const badge=document.getElementById('mode-badge');
  if(badge) badge.textContent='☁️ 離線中';
});

window.addEventListener('online', ()=>{
  if(isCloud()){
    setupRealtime();
    DB.fetchTxs().then(()=>{ renderHome(); renderBudget(); });
  }
});


function scheduleAutoBackup(){
  const lastBackup = localStorage.getItem('lastBackupDate');
  const todayStr = today();
  if(lastBackup === todayStr) return; // 今天已備份
  // 等頁面穩定後 30 秒再做，避免影響使用體驗
  setTimeout(()=> autoBackup(), 30000);
}


async function autoBackup(){
  if(!isCloud()) return;
  if(localStorage.getItem('autoBackup') === 'off') return; // 使用者關閉自動備份
  try{
    await doGDriveBackup(true);
  }catch(e){
    console.warn('Auto backup failed', e);
  }
}


async function manualBackup(){
  toast('備份中…');
  try{
    await doGDriveBackup(false);
  }catch(e){
    toast('備份失敗，請稍後再試');
    console.error(e);
  }
}


async function doGDriveBackup(silent){
  // 取得 Google Access Token
  const {data:{session}} = await _sb.auth.getSession();
  const token = session?.provider_token;
  if(!token){
    if(!silent){
      toast('請重新登入以啟用 Google Drive 備份');
      // 重新登入並要求 Drive 權限
      setTimeout(()=>{
        if(confirm('需要重新登入才能啟用 Google Drive 備份，現在登入嗎？')){
          signInGoogle();
        }
      }, 500);
    }
    return;
  }

  const dateStr = today();
  const payload = {
    version: '2',
    exportedAt: new Date().toISOString(),
    books:   DB.getBooks(),
    txs:     DB.getTxs(),
    recurs:  DB.getRecurs(),
    goals:   DB.getGoals(),
    assets:  DB.getAssets(),
  };

  // 確保備份資料夾存在（第一次自動建立「記帳本備份」資料夾）
  const folderId = await getOrCreateBackupFolder(token);

  // 上傳 JSON（完整資料，可完整還原）
  await uploadToDrive(token, `記帳本備份_${dateStr}.json`,
    JSON.stringify(payload, null, 2), 'application/json', folderId);

  // 上傳 CSV（Excel 可開）
  const csv = buildCSV(DB.getTxs());
  await uploadToDrive(token, `記帳本備份_${dateStr}.csv`,
    '\uFEFF' + csv, 'text/csv', folderId);

  localStorage.setItem('lastBackupDate', dateStr);
  localStorage.setItem('lastBackupTime', new Date().toLocaleString('zh-TW'));
  const el = document.getElementById('last-backup-time');
  if(el) el.textContent = localStorage.getItem('lastBackupTime');

  if(!silent) toast('✓ 已備份到 Google Drive');
}


// 取得或建立「記帳本備份」資料夾，回傳 folderId
async function getOrCreateBackupFolder(token){
  const folderName = '記帳本備份';
  // 搜尋是否已有這個資料夾
  const q = encodeURIComponent(`name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`,
    { headers:{ Authorization: `Bearer ${token}` } }
  );
  const { files=[] } = await res.json();
  if(files[0]?.id) return files[0].id;

  // 沒有就建立
  const create = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers:{ Authorization: `Bearer ${token}`, 'Content-Type':'application/json' },
    body: JSON.stringify({ name: folderName, mimeType:'application/vnd.google-apps.folder' })
  });
  const folder = await create.json();
  return folder.id;
}


async function uploadToDrive(token, filename, body, mimeType, folderId){
  // 先搜尋資料夾內同名舊檔
  const q = encodeURIComponent(`name='${filename}' and '${folderId}' in parents and trashed=false`);
  const search = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`,
    { headers:{ Authorization: `Bearer ${token}` } }
  );
  const {files=[]} = await search.json();

  const meta = { name: filename, mimeType, parents: files[0]?.id ? undefined : [folderId] };
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(meta)],{type:'application/json'}));
  form.append('file', new Blob([body],{type: mimeType}));

  const method = files[0]?.id ? 'PATCH' : 'POST';
  const url = files[0]?.id
    ? `https://www.googleapis.com/upload/drive/v3/files/${files[0].id}?uploadType=multipart`
    : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';

  const res = await fetch(url, {
    method, headers:{ Authorization: `Bearer ${token}` }, body: form
  });
  if(!res.ok) throw new Error(`Drive upload failed: ${res.status}`);
}


function buildCSV(txs){
  const header = 'id,類型,金額,分類,子分類,備註,日期,記帳者,目標';
  const rows = txs.map(t =>
    `${t.id},${t.type==='income'?'收入':'支出'},${t.amount},${t.catId||''},${t.subCat||''},"${(t.note||'').replace(/"/g,'""')}",${t.date},${t.who||''},${t.goalId||''}`
  );
  return [header,...rows].join('\n');
}


// 更新帳號 modal 的上次備份時間
function refreshBackupTime(){
  const t = localStorage.getItem('lastBackupTime');
  const el = document.getElementById('last-backup-time');
  if(el) el.textContent = t||'從未備份';
}

