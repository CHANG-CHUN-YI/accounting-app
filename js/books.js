// ============================================================
// books.js — 帳本管理（個人 / 共同帳本）
// 帳本切換、新增/刪除帳本、共同帳本邀請碼、雲端設定載入
// 依賴：config.js, db.js
// ============================================================


// ══════════════════════════════════════════
// 共同帳本雲端功能
// ══════════════════════════════════════════

async function loadUserSettings(){
  if(!isCloud()) return;
  const settings = await DB.fetchUserSettings();
  if(!settings) return;

  const localBooks = DB.getBooks();

  // 從雲端載入個人帳本設定（含分類、預算）
  if(settings.books && settings.books.length){
    const sharedLocalBooks = localBooks.filter(b=>b.type==='shared');
    DB.saveBooks([...settings.books, ...sharedLocalBooks]);
  } else if(settings.budgets){
    const books = DB.getBooks();
    const personalBook = books.find(b=>b.type==='personal');
    if(personalBook){ personalBook.budgets=settings.budgets; DB.saveBooks(books); }
  }

  // 載入固定收支
  if(settings.recurs && settings.recurs.length){
    DB.saveRecurs(settings.recurs);
  }
}


// 把所有個人帳本設定（含分類、預算）同步到雲端
async function syncBooksToCloud(){
  if(!isCloud()) return;
  const personalBooks=DB.getBooks().filter(b=>b.type!=='shared');
  await DB.saveUserSettings({
    books: personalBooks,
    recurs: DB.getRecurs(),
    lastSync: new Date().toISOString(),
  });
}


async function loadSharedBooks(){
  if(!isCloud()) return;
  const sbList = await DB.fetchSharedBooks();
  sharedBooks = {};
  sbList.forEach(sb => { sharedBooks[sb.id] = sb; });

  // 把雲端共同帳本合併到 localStorage 的帳本列表（顯示用）
  const localBooks = DB.getBooks().filter(b => b.type !== 'shared' || !sharedBooks[b.id]);
  const cloudShared = sbList.map(sb => ({
    id: sb.id, name: sb.name, type: 'shared',
    members: Object.values(sb.member_names||{}),
    cats: sb.cats || dc(DEF_CATS),
    budgets: sb.budgets || {total:0,cats:{}},
    _cloud: true,
  }));
  DB.saveBooks([...localBooks, ...cloudShared]);
}


async function fetchSharedTxsForBook(bookId){
  if(!isCloud()||!sharedBooks[bookId]) return;
  const txs = await DB.fetchSharedTxs(bookId);
  sharedTxCache[bookId] = txs;
}


function getBookTxsWithShared(){
  const book = getBook();
  if(book.type==='shared' && sharedTxCache[curBook]){
    return sharedTxCache[curBook];
  }
  return DB.getTxs().filter(t=>t.bookId===curBook);
}


// 建立共同帳本（雲端）
async function addSharedBookCloud(name){
  const bookId = 'sb_' + Math.random().toString(36).slice(2,8);
  const newBook = {
    id: bookId, name, type:'shared', members:[],
    cats: dc(DEF_CATS), budgets:{total:0,cats:{}}, _cloud:true
  };
  if(isCloud()){
    const result = await DB.createSharedBook(newBook);
    if(!result){ toast('建立失敗，請稍後再試'); return null; }
    sharedBooks[bookId] = result;
  }
  const books = DB.getBooks();
  books.push(newBook);
  DB.saveBooks(books);
  return bookId;
}


// 用邀請碼加入共同帳本
async function joinByInviteCode(code){
  const trimmed = code.trim();
  if(!trimmed){ toast('請輸入邀請碼'); return; }
  const result = await DB.joinSharedBook(trimmed);
  if(result?.error){ toast(result.error); return; }
  toast('✓ 已加入「'+result.book_name+'」');
  await loadSharedBooks();
  renderBookTabs();
  closeMo('mo-join-shared');
}


// 複製邀請碼
function copyInviteCode(bookId){
  navigator.clipboard.writeText(bookId)
    .then(()=>toast('邀請碼已複製 ✓'))
    .catch(()=>{
      // 複製失敗時顯示邀請碼讓使用者手動複製
      prompt('請手動複製此邀請碼：', bookId);
    });
}


// ── 版本遷移：把舊帳本分類補上 subs ──
function migrateCats(){
  const books = DB.getBooks();
  let changed = false;
  books.forEach(book => {
    ['expense','income'].forEach(type => {
      const defCats = DEF_CATS[type] || [];
      const bookCats = (book.cats || {})[type] || [];
      bookCats.forEach(cat => {
        if(!cat.subs) {
          // 用 DEF_CATS 裡同 id 的 subs 補上，找不到就給空陣列
          const def = defCats.find(d => d.id === cat.id);
          cat.subs = def ? [...(def.subs||[])] : [];
          changed = true;
        }
      });
    });
  });
  if(changed) DB.saveBooks(books);
}


// ── books ──
function getBook(){ return DB.getBooks().find(b=>b.id===curBook)||DB.getBooks()[0]; }

function getBookTxs(){
  const book=getBook();
  if(book?.type==='shared'&&sharedTxCache[curBook]) return sharedTxCache[curBook];
  return DB.getTxs().filter(t=>t.bookId===curBook);
}


function renderBookTabs(){
  const books=DB.getBooks();
  document.getElementById('book-tabs').innerHTML=
    books.map(b=>`<button class="btab ${b.type==='shared'?'shared':''} ${b.id===curBook?'active':''}" onclick="switchBook('${b.id}')">${b.type==='shared'?'👥 ':''}${esc(b.name)}</button>`).join('')+
    `<button style="flex-shrink:0;width:25px;height:25px;border-radius:50%;border:1.5px dashed var(--border);color:var(--text3);font-size:1rem;display:flex;align-items:center;justify-content:center;margin:auto 0;" onclick="openMo('mo-add-book')">＋</button>`;
}


async function switchBook(id,re=true){
  curBook=id; localStorage.setItem('lastBook',id);
  const b=getBook();
  isSharedBook = b?.type==='shared';
  document.getElementById('book-title').textContent=b?.name||'帳本';
  document.getElementById('sum-card').className='summary-card '+(isSharedBook?'shared':'personal');
  fillMainCats(); fillGoalChips();
  // 切換到共同帳本時從雲端拉取記錄
  if(isSharedBook&&isCloud()&&!sharedTxCache[id]){
    await fetchSharedTxsForBook(id);
  }
  if(re){renderBookTabs();renderHome();if(document.getElementById('page-stats').classList.contains('active'))renderStats();if(document.getElementById('page-budget').classList.contains('active'))renderBudget();updateCatCounts();}
}


async function addBook(){
  const name=document.getElementById('new-book-name').value.trim();
  if(!name){toast('請輸入帳本名稱');return;}
  const type=document.getElementById('new-book-type').value;
  closeMo('mo-add-book'); document.getElementById('new-book-name').value='';
  document.getElementById('new-book-type').value='personal';
  document.getElementById('shared-sec').style.display='none';

  if(type==='shared'){
    if(!isCloud()){toast('請先登入才能建立共同帳本');return;}
    const bookId=await addSharedBookCloud(name);
    if(!bookId) return;
    renderBookTabs(); switchBook(bookId);
    toast(`「${name}」已建立！邀請碼：${bookId}`);
    setTimeout(()=>{ openMo('mo-book-mgr'); },400);
  } else {
    const books=DB.getBooks();
    const nb={id:'b'+Date.now(),name,type:'personal',members:[],cats:dc(DEF_CATS),budgets:{total:0,cats:{}}};
    books.push(nb); DB.saveBooks(books);
    await syncBooksToCloud();
    renderBookTabs(); switchBook(nb.id); toast(`「${name}」已建立`);
  }
}


function renderBookListMd(){
  const books=DB.getBooks();
  document.getElementById('book-list-md').innerHTML=books.map(b=>{
    const isS=b.type==='shared';
    const sb=sharedBooks[b.id];
    const members=isS&&sb?Object.values(sb.member_names||{}).join('、'):'';
    const inv=isS&&sb?`<div style="margin-top:5px;display:flex;align-items:center;gap:6px;">
      <span style="font-size:.7rem;color:var(--text3);">邀請碼：</span>
      <code style="font-size:.78rem;font-weight:700;color:var(--blue-d);">${b.id}</code>
      <button onclick="copyInviteCode('${b.id}')" style="font-size:.7rem;color:var(--blue-d);padding:2px 6px;border-radius:5px;border:1px solid var(--blue-l);">複製</button>
    </div>`:'';
    return `<div style="padding:.75rem 0;border-bottom:1px solid var(--border);">
      <div style="display:flex;align-items:center;gap:10px;">
        <div>${isS?'👥':'📒'}</div>
        <div style="flex:1;"><div style="font-size:.88rem;font-weight:500;">${esc(b.name)}</div>
          <div style="font-size:.72rem;color:var(--text3);">${isS?'共同'+(members?'・'+members:''):'個人帳本'}</div></div>
        ${books.length>1?`<button onclick="deleteBook('${b.id}')" style="font-size:.79rem;color:var(--text3);opacity:.6;padding:4px 8px;">刪除</button>`:''}
      </div>${inv}
    </div>`;
  }).join('')+
  `<button onclick="closeMo('mo-book-mgr');openMo('mo-join-shared')" style="width:100%;padding:10px;border-radius:11px;border:1.5px dashed var(--border);color:var(--text2);font-size:.84rem;margin-top:10px;display:flex;align-items:center;justify-content:center;gap:6px;">🔑 用邀請碼加入共同帳本</button>`;
}


async function deleteBook(id){
  if(!confirm('確定刪除此帳本及所有記錄？'))return;
  let books=DB.getBooks().filter(b=>b.id!==id);
  if(!books.length){toast('至少保留一個帳本');return;}

  // 共同帳本：同步刪除 Supabase
  const book=DB.getBooks().find(b=>b.id===id);
  if(book?.type==='shared'&&isCloud()){
    await DB.deleteSharedBook(id);
    delete sharedBooks[id];
    delete sharedTxCache[id];
  }

  DB.saveBooks(books);
  DB.saveTxs(DB.getTxs().filter(t=>t.bookId!==id));
  if(curBook===id) curBook=books[0].id;
  closeMo('mo-book-mgr'); switchBook(curBook); toast('帳本已刪除');
}

