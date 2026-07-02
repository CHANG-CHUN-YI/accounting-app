// ============================================================
// goals.js — 財富頁：存錢罐
// 依賴：config.js, db.js, books.js
// ============================================================


async function loadGoalsFromCloud(){
  // 取得所有帳本 id（個人 + 共同）
  const allBookIds = DB.getBooks().map(b=>b.id);
  const data = await DB.fetchGoals(allBookIds);
  if(!data) return;
  DB.saveGoals(data);
}

function pickGoalEmoji(e){ goalEmoji=e; document.getElementById('goal-emoji-btn').textContent=e; document.querySelectorAll('#goal-eg-grid .eb').forEach(b=>b.classList.toggle('sel',b.textContent===e)); closeMo('mo-goal-emoji'); }


// ── 存錢罐專屬圓餅圖（各自獨立） ──
const _goalCharts={};

function renderGoalPieChart(goalId,canvasId){
  const g=DB.getGoals().find(g=>g.id===goalId);
  if(!g)return;
  const txs=getBookTxs().filter(t=>t.goalId===goalId);
  // 全部從 tx 算
  const totalIn=txs.filter(t=>t.type==='income').reduce((s,t)=>s+Number(t.amount),0);
  const totalOut=txs.filter(t=>t.type==='expense').reduce((s,t)=>s+Number(t.amount),0);
  const remaining=Math.max(totalIn-totalOut,0);

  const ctx=document.getElementById(canvasId);
  if(!ctx)return;
  if(_goalCharts[goalId])_goalCharts[goalId].destroy();
  if(totalIn===0&&totalOut===0){ctx.getContext('2d').clearRect(0,0,300,200);return;}
  const data=[], labels=[], colors=[];
  if(totalOut>0){data.push(totalOut);labels.push('已花費');colors.push('#c4a09a');}
  if(remaining>0){data.push(remaining);labels.push('剩餘');colors.push('#8fb5a0');}
  _goalCharts[goalId]=new Chart(ctx.getContext('2d'),{
    type:'doughnut',
    data:{labels,datasets:[{data,backgroundColor:colors,borderWidth:2,borderColor:'#fff'}]},
    options:{responsive:true,maintainAspectRatio:false,cutout:'58%',
      plugins:{legend:{position:'right',labels:{font:{size:11},color:'#7a7870',boxWidth:12,padding:6}},
               tooltip:{callbacks:{label:c=>`NT$ ${fmt(c.parsed)}`}}}}
  });
}


// ── Goals (目標存錢罐) ──
// 開啟編輯存錢罐
function openEditGoal(id){
  const g=DB.getGoals().find(g=>g.id===id);
  if(!g)return;
  document.getElementById('goal-modal-title').innerHTML=`編輯存錢罐 <button class="md-close" onclick="closeMo('mo-add-goal')">✕</button>`;
  document.getElementById('goal-emoji-btn').textContent=g.e||'🎯';
  goalEmoji=g.e||'🎯';
  document.getElementById('goal-name-inp').value=g.name;
  document.getElementById('goal-target-inp').value=g.target||'';
  document.getElementById('goal-note-inp').value=g.note||'';
  document.getElementById('goal-edit-id').value=id;
  document.getElementById('goal-submit-btn').textContent='儲存修改';
  openMo('mo-add-goal');
}


// 新增或編輯存錢罐
async function submitGoal(){
  const editId=document.getElementById('goal-edit-id').value;
  if(editId){ await updateGoal(editId); } else { await addGoal(); }
}


async function updateGoal(id){
  const name=document.getElementById('goal-name-inp').value.trim();
  if(!name){toast('請輸入名稱');return;}
  const target=parseFloat(document.getElementById('goal-target-inp').value)||0;
  const note=document.getElementById('goal-note-inp').value.trim();
  const goals=DB.getGoals();
  const g=goals.find(g=>g.id===id);
  if(!g)return;
  g.e=goalEmoji; g.name=name; g.target=target; g.note=note;
  DB.saveGoals(goals);
  await DB.updateGoalTarget(id, target, note);
  await DB.upsertGoal(g);
  closeMo('mo-add-goal');
  renderGoals(); toast('存錢罐已更新');
}


async function addGoal(){
  const name=document.getElementById('goal-name-inp').value.trim();
  if(!name){toast('請輸入名稱');return;}
  const goals=DB.getGoals();
  const newGoal={id:'g'+Date.now(),bookId:curBook,e:goalEmoji,name,
    target:parseFloat(document.getElementById('goal-target-inp').value)||0,
    note:document.getElementById('goal-note-inp').value.trim(),
    allocs:[],spends:[],createdAt:today()};
  goals.push(newGoal);
  DB.saveGoals(goals);
  await DB.upsertGoal(newGoal);
  closeMo('mo-add-goal');
  document.getElementById('goal-name-inp').value=''; document.getElementById('goal-target-inp').value=''; document.getElementById('goal-note-inp').value='';
  goalEmoji='🎯'; document.getElementById('goal-emoji-btn').textContent='🎯';
  renderGoals(); fillGoalChips(); toast(`「${name}」存錢罐已建立`);
}


function renderGoals(){
  const goals=DB.getGoals().filter(g=>g.bookId===curBook);
  const el=document.getElementById('goals-list');
  if(!goals.length){el.innerHTML=`<div style="text-align:center;padding:2.5rem 1rem;color:var(--text3);"><div style="font-size:2.3rem;margin-bottom:.5rem;">🎯</div><div style="font-size:.84rem;line-height:1.7;">還沒有目標<br>點右上角新增一個吧</div></div>`;return;}
  el.innerHTML=goals.map(g=>{
    // 全部從 tx 計算（allocs/spends 已棄用）
    const goalTxs=getBookTxs().filter(t=>t.goalId===g.id);
    const allocated=goalTxs.filter(t=>t.type==='income').reduce((s,t)=>s+Number(t.amount),0);
    const spent=0;
    const txSpent=goalTxs.filter(t=>t.type==='expense').reduce((s,t)=>s+Number(t.amount),0);
    const totalSpent=txSpent;
    const remaining=Math.max(allocated-totalSpent,0);
    const pct=g.target?Math.min(Math.round(allocated/g.target*100),100):0;
    return `<div class="goal-card">
      <div class="goal-header">
        <div class="goal-icon">${g.e}</div>
        <div class="goal-name">${esc(g.name)}</div>
        <button onclick="openEditGoal('${g.id}')" style="color:var(--blue-d);font-size:.8rem;padding:4px 8px;border-radius:7px;background:rgba(59,130,196,.1);margin-right:4px;">編輯</button>
        <button onclick="deleteGoal('${g.id}')" style="color:var(--text3);opacity:.4;font-size:.88rem;padding:4px;">✕</button>
      </div>
      ${g.note?`<div style="font-size:.76rem;color:var(--text3);margin-bottom:.5rem;">${esc(g.note)}</div>`:''}
      <div class="goal-prog-label">
        <span>已撥款 NT$${fmt(allocated)}</span>
        <span>${g.target?`目標 NT$${fmt(g.target)}`:'未設目標'}</span>
      </div>
      ${g.target?`<div class="goal-bar-wrap"><div class="goal-bar" style="width:${pct}%"></div></div><div style="font-size:.73rem;color:var(--text2);margin-top:3px;margin-bottom:.3rem;">${pct}% · 還差 NT$${fmt(Math.max(g.target-allocated,0))}</div>`:''}
      <div class="goal-stats">
        <div class="goal-stat"><div class="goal-stat-label">💳 已撥款</div><div class="goal-stat-val">NT$${fmt(allocated)}</div></div>
        <div class="goal-stat"><div class="goal-stat-label">💸 已花費</div><div class="goal-stat-val">NT$${fmt(totalSpent)}</div></div>
        <div class="goal-stat"><div class="goal-stat-label">💰 剩餘</div><div class="goal-stat-val" style="color:var(--green-d);">NT$${fmt(remaining)}</div></div>
      </div>
      <div style="margin-top:.9rem;border-top:1px solid var(--border);padding-top:.9rem;">
        <div style="font-size:.77rem;font-weight:600;color:var(--text2);margin-bottom:.5rem;">收支圓餅圖</div>
        <div style="display:flex;gap:.8rem;margin-bottom:.5rem;">
          <div style="flex:1;background:var(--bg2);border-radius:8px;padding:.45rem .7rem;text-align:center;">
            <div style="font-size:.67rem;color:var(--text3);">撥入</div>
            <div style="font-size:.88rem;font-weight:600;color:var(--green-d);">NT$${fmt(allocated)}</div>
          </div>
          <div style="flex:1;background:var(--bg2);border-radius:8px;padding:.45rem .7rem;text-align:center;">
            <div style="font-size:.67rem;color:var(--text3);">花費</div>
            <div style="font-size:.88rem;font-weight:600;color:#b07a74;">NT$${fmt(totalSpent)}</div>
          </div>
          <div style="flex:1;background:var(--bg2);border-radius:8px;padding:.45rem .7rem;text-align:center;">
            <div style="font-size:.67rem;color:var(--text3);">剩餘</div>
            <div style="font-size:.88rem;font-weight:600;color:var(--blue-d);">NT$${fmt(remaining)}</div>
          </div>
        </div>
        <div style="position:relative;height:140px;"><canvas id="goal-pie-${g.id}"></canvas></div>
      </div>
      <button class="goal-alloc-btn" onclick="openAlloc('${g.id}')">撥款 / 花費記錄</button>
    </div>`;
  }).join('');
  // 渲染各存錢罐圖表（DOM 更新後）
  setTimeout(()=>{
    goals.forEach(g=>renderGoalPieChart(g.id,`goal-pie-${g.id}`));
  },50);
}


function openAlloc(id){
  allocGoalId=id;
  const g=DB.getGoals().find(g=>g.id===id);
  document.getElementById('alloc-title').innerHTML=`${g.e} ${esc(g.name)} <button class="md-close" onclick="closeMo('mo-alloc')">✕</button>`;
  document.getElementById('alloc-amt').value=''; document.getElementById('alloc-note').value='';
  document.getElementById('goal-spend-amt').value=''; document.getElementById('goal-spend-note').value='';
  renderGoalSpendList(g);
  openMo('mo-alloc');
}


function renderGoalSpendList(g){
  // 只顯示有 goalId 的 tx，不顯示 allocs/spends 避免重複
  const txs=getBookTxs().filter(t=>t.goalId===g.id)
    .sort((a,b)=>(b.date||'').localeCompare(a.date||'')).slice(0,20);
  const allCats=[...getCats('expense'),...getCats('income')];
  document.getElementById('goal-spend-list').innerHTML=txs.length?
    txs.map(t=>{
      const cat=allCats.find(c=>c.id===t.catId)||{e:'',n:''};
      const parts=[cat.e+' '+cat.n, t.subCat, t.note].filter(s=>s&&s.trim());
      const label=parts.join(' · ');
      const isInc=t.type==='income';
      return `<div class="dep-item">
        <span style="color:var(--text3);min-width:60px;">${t.date}</span>
        <span style="flex:1;padding:0 8px;font-size:.82rem;">${esc(label)}</span>
        <span style="font-weight:600;color:${isInc?'var(--green-d)':'#b07a74'};">${isInc?'+':'−'}NT$${fmt(t.amount)}</span>
      </div>`;
    }).join(''):
    '<div style="font-size:.8rem;color:var(--text3);">尚無記錄</div>';
}


async function doAlloc(){
  const amt=parseFloat(document.getElementById('alloc-amt').value);
  if(!amt||amt<=0){toast('請輸入金額');return;}
  const goals=DB.getGoals(),g=goals.find(g=>g.id===allocGoalId);
  const alloc={id:'a_'+Date.now(),amount:amt,note:document.getElementById('alloc-note').value.trim(),date:today()};
  g.allocs.push(alloc);
  DB.saveGoals(goals);
  await DB.upsertAlloc(allocGoalId, alloc);
  document.getElementById('alloc-amt').value=''; document.getElementById('alloc-note').value='';
  renderGoalSpendList(g); renderGoals(); toast(`已撥款 NT$${fmt(amt)}`);
}


async function addGoalSpend(){
  const amt=parseFloat(document.getElementById('goal-spend-amt').value);
  if(!amt||amt<=0){toast('請輸入金額');return;}
  const goals=DB.getGoals(),g=goals.find(g=>g.id===allocGoalId);
  const spend={id:'sp_'+Date.now(),amount:amt,note:document.getElementById('goal-spend-note').value.trim(),date:today()};
  g.spends.push(spend);
  DB.saveGoals(goals);
  await DB.upsertSpend(allocGoalId, spend);
  document.getElementById('goal-spend-amt').value=''; document.getElementById('goal-spend-note').value='';
  renderGoalSpendList(g); renderGoals(); toast('花費已記錄');
}


async function deleteGoal(id){
  if(!confirm('確定刪除此存錢罐？'))return;
  DB.saveGoals(DB.getGoals().filter(g=>g.id!==id));
  await DB.deleteGoal(id);
  renderGoals(); fillGoalChips(); toast('已刪除');
}

