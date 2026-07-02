// ============================================================
// categories.js — 分類 / 子分類管理
// 依賴：config.js, db.js, books.js（getBook）
// ============================================================

function getCats(type){
  const cats = (getBook().cats||{})[type]||[];
  // 防禦性檢查：確保每個 cat 都有 subs 陣列
  cats.forEach(cat=>{
    if(!cat.subs){
      const def=(DEF_CATS[type]||[]).find(d=>d.id===cat.id);
      cat.subs = def ? [...(def.subs||[])] : [];
    }
  });
  return cats;
}


// ── categories ──
function fillMainCats(){
  const sel=document.getElementById('main-cat-sel');
  sel.innerHTML=getCats(curType).map(c=>`<option value="${c.id}">${c.e} ${c.n}</option>`).join('');
  updateSubCats();
}


function fillCatSel(selId,type){
  const sel=document.getElementById(selId);if(!sel)return;
  sel.innerHTML=getCats(type).map(c=>`<option value="${c.id}">${c.e} ${c.n}</option>`).join('');
}


function updateSubCats(){
  const mainId=document.getElementById('main-cat-sel').value;
  const cat=getCats(curType).find(c=>c.id===mainId);
  const sub=document.getElementById('sub-cat-sel');
  if(cat&&cat.subs&&cat.subs.length){
    sub.innerHTML=`<option value="">（子分類）</option>`+cat.subs.map(s=>`<option value="${esc(s)}">${s}</option>`).join('');
    sub.style.display='';
  }else sub.style.display='none';
}


function setType(type){
  curType=type;
  document.getElementById('t-expense').classList.toggle('active',type==='expense');
  document.getElementById('t-income').classList.toggle('active',type==='income');
  fillMainCats();
}


function openCatMgr(type){
  subMgrType=type;
  document.getElementById('cat-mgr-title').innerHTML=`管理${type==='expense'?'支出':'收入'}分類 <button class="md-close" onclick="closeMo('mo-cat-mgr')">✕</button>`;
  pickedEmoji='📦'; document.getElementById('cat-emoji-btn').textContent='📦';
  document.getElementById('new-cat-name').value='';
  renderCatMgrList(); openMo('mo-cat-mgr');
}


function renderCatMgrList(){
  const cats=getCats(subMgrType);
  document.getElementById('cat-mgr-list').innerHTML=cats.map(c=>`
    <div class="cmi">
      <div class="cmi-e">${c.e}</div>
      <div style="flex:1;display:flex;align-items:center;gap:6px;">
        <span style="font-size:.87rem;">${esc(c.n)}</span>
        <button class="sub-toggle" onclick="openSubMgr('${c.id}')">子分類 ${(c.subs||[]).length}</button>
      </div>
      <button onclick="deleteCat('${c.id}')" style="color:var(--text3);opacity:.45;font-size:.88rem;padding:4px;">✕</button>
    </div>`).join('')||'<p style="font-size:.82rem;color:var(--text3);padding:.4rem 0;">尚無分類</p>';
}


async function addCat(){
  const name=document.getElementById('new-cat-name').value.trim();
  if(!name){toast('請輸入名稱');return;}
  const books=DB.getBooks(),book=books.find(b=>b.id===curBook);
  book.cats[subMgrType].push({id:'c'+Date.now(),e:pickedEmoji,n:name,subs:[]});
  DB.saveBooks(books); document.getElementById('new-cat-name').value='';
  pickedEmoji='📦'; document.getElementById('cat-emoji-btn').textContent='📦';
  renderCatMgrList(); fillMainCats(); updateCatCounts();
  await syncBooksToCloud();
  toast('已新增');
}


async function deleteCat(id){
  // 清掉這個分類的預算設定，並從帳本移除
  const books=DB.getBooks(), bookRef=books.find(b=>b.id===curBook);
  if(bookRef.budgets&&bookRef.budgets.cats) delete bookRef.budgets.cats[id];
  bookRef.cats[subMgrType]=bookRef.cats[subMgrType].filter(c=>c.id!==id);
  DB.saveBooks(books);
  await savePersonalBudget(bookRef.budgets||{});
  renderCatMgrList(); fillMainCats(); updateCatCounts();
  await syncBooksToCloud();
  toast('已刪除');
}


function openSubMgr(catId){
  subMgrCatId=catId;
  const cat=getCats(subMgrType).find(c=>c.id===catId);
  document.getElementById('sub-mgr-title').innerHTML=`${cat.e} ${esc(cat.n)} 子分類 <button class="md-close" onclick="closeMo('mo-sub-mgr')">✕</button>`;
  document.getElementById('new-sub-name').value='';
  renderSubMgrList(); openMo('mo-sub-mgr');
}


function renderSubMgrList(){
  const cat=getCats(subMgrType).find(c=>c.id===subMgrCatId);if(!cat)return;
  document.getElementById('sub-mgr-list').innerHTML=(cat.subs||[]).map((s,i)=>`
    <div style="display:flex;align-items:center;gap:8px;padding:.45rem .65rem;background:var(--bg);border-radius:8px;margin-bottom:4px;border:1px solid var(--border);">
      <span style="flex:1;font-size:.86rem;">${esc(s)}</span>
      <button onclick="deleteSub(${i})" style="color:var(--text3);opacity:.45;font-size:.88rem;padding:4px;">✕</button>
    </div>`).join('')||'<p style="font-size:.8rem;color:var(--text3);padding:.35rem 0;">尚無子分類</p>';
}


async function addSub(){
  const name=document.getElementById('new-sub-name').value.trim();if(!name){toast('請輸入名稱');return;}
  const books=DB.getBooks(),book=books.find(b=>b.id===curBook);
  const cat=book.cats[subMgrType].find(c=>c.id===subMgrCatId);
  if(!cat.subs)cat.subs=[];cat.subs.push(name);
  DB.saveBooks(books); document.getElementById('new-sub-name').value='';
  renderSubMgrList(); updateSubCats();
  await syncBooksToCloud();
  toast('已新增');
}


async function deleteSub(idx){
  const books=DB.getBooks(),book=books.find(b=>b.id===curBook);
  book.cats[subMgrType].find(c=>c.id===subMgrCatId).subs.splice(idx,1);
  DB.saveBooks(books); renderSubMgrList(); updateSubCats();
  await syncBooksToCloud();
  toast('已刪除');
}


function updateCatCounts(){
  document.getElementById('exp-cat-ct').textContent=(getBook().cats.expense||[]).length+' 項';
  document.getElementById('inc-cat-ct').textContent=(getBook().cats.income||[]).length+' 項';
}


function pickEmoji(e){ pickedEmoji=e; document.getElementById('cat-emoji-btn').textContent=e; document.querySelectorAll('#eg-grid .eb').forEach(b=>b.classList.toggle('sel',b.textContent===e)); closeMo('mo-emoji'); }

