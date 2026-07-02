// ============================================================
// home-stats.js — 首頁（日曆 + 記帳清單）與統計頁（圓餅圖等）
// 依賴：config.js, db.js, books.js
// ============================================================


// ── calendar ──
function calMove(d){ calM+=d; if(calM>11){calM=0;calY++;}else if(calM<0){calM=11;calY--;} renderCal(); }


function renderCal(){
  document.getElementById('cal-title').textContent=`${calY} 年 ${calM+1} 月`;
  const txs=getBookTxs(); const txDates=new Set(txs.map(t=>t.date));
  const firstDay=new Date(calY,calM,1).getDay();
  const daysInMonth=new Date(calY,calM+1,0).getDate();
  const prevDays=new Date(calY,calM,0).getDate();
  const dows=['日','一','二','三','四','五','六'];
  let html=dows.map(d=>`<div class="cal-dow">${d}</div>`).join('');
  for(let i=firstDay-1;i>=0;i--)
    html+=`<div class="cal-day other-month"><div>${prevDays-i}</div><div class="cal-dot"></div></div>`;
  for(let d=1;d<=daysInMonth;d++){
    const ds=`${calY}-${pad(calM+1)}-${pad(d)}`;
    html+=`<div class="cal-day ${ds===today()?'today':''} ${ds===calSel?'selected':''}" onclick="calSel='${ds}';renderCal()">
      <div>${d}</div><div class="cal-dot ${txDates.has(ds)?'show':''}"></div></div>`;
  }
  const total=firstDay+daysInMonth; const rem=total%7===0?0:7-(total%7);
  for(let d=1;d<=rem;d++) html+=`<div class="cal-day other-month"><div>${d}</div><div class="cal-dot"></div></div>`;
  document.getElementById('cal-grid').innerHTML=html;
  renderCalDetail(calSel);
}


function renderCalDetail(ds){
  const detail=document.getElementById('cal-detail');
  const txs=getBookTxs().filter(t=>t.date===ds);
  if(!txs.length){detail.style.display='none';return;}
  detail.style.display='block';
  const [,mm,dd]=ds.split('-');
  detail.innerHTML=`<div class="cal-detail-title">${parseInt(mm)} 月 ${parseInt(dd)} 日 · ${txs.length} 筆</div>`+
    txs.map(t=>txHTML(t,true)).join('');
}


// ── home ──
function renderHome(){
  const now=new Date();
  document.getElementById('sum-month').textContent=`${now.getFullYear()} 年 ${now.getMonth()+1} 月`;
  const txs=getBookTxs();
  // 只計算「無目標」的日常收支
  const monthTx=txs.filter(t=>sameMonth(t.date,now)&&!t.goalId);
  const income=sumType(monthTx,'income'),expense=sumType(monthTx,'expense');
  document.getElementById('sum-income').textContent=`NT$ ${fmt(income)}`;
  document.getElementById('sum-expense').textContent=`NT$ ${fmt(expense)}`;
  document.getElementById('sum-balance').textContent=`NT$ ${fmt(income-expense)}`;
  const cfg=getBook().budgets||{};
  const ab=document.getElementById('budget-alert');
  if(cfg.total&&expense>=cfg.total*.9){ab.textContent=`⚠️ 本月支出已達預算 ${Math.round(expense/cfg.total*100)}%`;ab.style.display='block';}
  else ab.style.display='none';
  renderCal();
  const recent=txs.filter(t=>!t.goalId).slice(0,30);
  const el=document.getElementById('tx-list');
  if(!recent.length){el.innerHTML=`<div style="text-align:center;padding:2rem 1rem;color:var(--text3);"><div style="font-size:2.3rem;margin-bottom:.5rem;">📝</div><div style="font-size:.84rem;line-height:1.7;">還沒有記錄，從上方開始記帳吧</div></div>`;return;}
  el.innerHTML=recent.map(t=>txHTML(t,false)).join('');
}


function txHTML(t,compact){
  const cats=[...getCats('expense'),...getCats('income')];
  const cat=cats.find(c=>c.id===t.catId)||{e:'📦',n:'其他'};
  const sign=t.type==='expense'?'-':'+';
  const [,mm,dd]=t.date.split('-');
  const subTag=t.subCat?` <span style="font-size:.69rem;color:var(--text3);">· ${esc(t.subCat)}</span>`:'';
  // 名字標籤：只在共同帳本且有指定成員時顯示
  const book=getBook();
  const whoDisplay=(book?.type==='shared')?(t.who_name||t.who||''):'';
  const whoTag=(whoDisplay&&whoDisplay.trim())?`<span class="who-badge">${esc(whoDisplay)}</span>`:'';
  // 存錢罐標籤：goalId 要有值且能找到對應存錢罐
  const goals=DB.getGoals();
  const goal=(t.goalId&&t.goalId.trim())?goals.find(g=>g.id===t.goalId):null;
  const goalTag=goal?`<span class="goal-badge">${goal.e} ${esc(goal.name)}</span>`:'';
  return `<div class="tx-item">
    <div class="tx-icon ${t.type}">${cat.e}</div>
    <div class="tx-info">
      <div class="tx-cat">${esc(cat.n)}${subTag}${whoTag}${goalTag}</div>
      ${t.note?`<div class="tx-meta">${esc(t.note)}</div>`:''}
    </div>
    <div class="tx-right">
      <div class="tx-amt ${t.type}">${sign}${fmt(t.amount)}</div>
      ${!compact?`<div class="tx-date">${parseInt(mm)}/${parseInt(dd)}</div>`:''}
    </div>
    <div style="display:flex;flex-direction:column;gap:3px;flex-shrink:0;">
      <button onclick="openEditTx('${t.id}')" style="color:var(--blue-d);font-size:.7rem;padding:3px 6px;border-radius:5px;border:1px solid var(--blue-l);background:rgba(59,130,196,.07);line-height:1.3;">編輯</button>
      <button class="tx-del" onclick="deleteTx('${t.id}')" style="font-size:.7rem;padding:3px 6px;">刪除</button>
    </div>
  </div>`;
}


// ── 年份選單（含未來 5 年） ──
function rebuildYearSel(){
  // 改為 input 後只需設定初始值
  const inp=document.getElementById('stats-year');
  if(inp&&!inp.value) inp.value=new Date().getFullYear();
}


// ── stats ──
function buildPieTabs(){
  const book=getBook();
  let html=`<button class="pie-tab ${curPieView==='expense'?'active':''}" onclick="setPieView('expense',this)">💸 支出</button>
            <button class="pie-tab ${curPieView==='income'?'active':''}" onclick="setPieView('income',this)">💰 收入</button>`;
  if(book.type==='shared') book.members.forEach(m=>{
    html+=`<button class="pie-tab ${curPieView===m?'active':''}" onclick="setPieView('${esc(m)}',this)">👤 ${esc(m)}</button>`;
  });
  // 存錢罐頁籤已移除，存錢罐圖表在財富頁各自顯示
  document.getElementById('pie-tabs').innerHTML=html;
}


function setPieView(view,btn){
  curPieView=view;
  document.querySelectorAll('.pie-tab').forEach(b=>b.classList.remove('active'));
  if(btn)btn.classList.add('active');
  const tx=getStatsTx(); renderPieChart(tx); renderCatStats(tx);
}


function getStatsTx(){
  const year=parseInt(document.getElementById('stats-year').value);
  const month=parseInt(document.getElementById('stats-month').value);
  return getBookTxs().filter(t=>{
    const d=new Date(t.date);
    if(d.getFullYear()!==year)return false;
    if(month!==0&&d.getMonth()+1!==month)return false;
    return true;
  });
}


function renderStats(){
  buildPieTabs();
  const tx=getStatsTx();
  renderPieChart(tx); renderCatStats(tx);
  // 更新總覽卡
  const income=tx.filter(t=>t.type==='income'&&!t.goalId).reduce((s,t)=>s+Number(t.amount),0);
  const expense=tx.filter(t=>t.type==='expense'&&!t.goalId).reduce((s,t)=>s+Number(t.amount),0);
  const el_i=document.getElementById('stats-total-income');
  const el_e=document.getElementById('stats-total-expense');
  const el_b=document.getElementById('stats-total-balance');
  const el_l=document.getElementById('stats-period-label');
  if(el_i) el_i.textContent='NT$ '+fmt(income);
  if(el_e) el_e.textContent='NT$ '+fmt(expense);
  if(el_b) el_b.textContent='NT$ '+fmt(income-expense);
  if(el_l){
    const y=document.getElementById('stats-year')?.value||'';
    const m=parseInt(document.getElementById('stats-month')?.value||'0');
    el_l.textContent=m===0?y+'年全年':y+'年 '+m+'月';
  }
}


function renderPieChart(tx){
  const goals=DB.getGoals();
  const goal=goals.find(g=>g.id===curPieView);
  let subset;
  if(curPieView==='expense'){subset=tx.filter(t=>t.type==='expense'&&!t.goalId);document.getElementById('pie-title').textContent='💸 支出分類';}
  else if(curPieView==='income'){subset=tx.filter(t=>t.type==='income'&&!t.goalId);document.getElementById('pie-title').textContent='💰 收入分類';}
  else{subset=tx.filter(t=>t.type==='expense'&&t.who===curPieView&&!t.goalId);document.getElementById('pie-title').textContent=`👤 ${curPieView}`;}

  const map={};
  subset.forEach(t=>{const k=t.subCat?`${t.catId}::${t.subCat}`:t.catId; map[k]=(map[k]||0)+Number(t.amount);});
  const entries=Object.entries(map).sort((a,b)=>b[1]-a[1]);
  const total=entries.reduce((s,[,v])=>s+v,0);
  const labels=[],data=[],colors=[];
  entries.forEach(([k,v],i)=>{
    const [cid,sub]=k.split('::');
    const cats=[...getCats('expense'),...getCats('income')];
    const cat=cats.find(c=>c.id===cid)||{e:'📦',n:cid};
    labels.push(sub?`${cat.e} ${sub}`:`${cat.e} ${cat.n}`); data.push(v); colors.push(CAT_COLORS[i%CAT_COLORS.length]);
  });
  document.getElementById('pie-total').textContent=total?`合計 NT$ ${fmt(total)}`:'';
  const ctx=document.getElementById('pie-chart').getContext('2d');
  if(pieChart)pieChart.destroy();
  if(!data.length){ctx.clearRect(0,0,400,300);return;}
  pieChart=new Chart(ctx,{type:'doughnut',data:{labels,datasets:[{data,backgroundColor:colors,borderWidth:2,borderColor:'#fff'}]},options:{responsive:true,maintainAspectRatio:false,cutout:'55%',plugins:{legend:{position:'right',labels:{font:{size:11},color:'#7a7870',boxWidth:12,padding:8}}}}});
}


function renderCatStats(tx){
  const goals=DB.getGoals();
  const goal=goals.find(g=>g.id===curPieView);
  let subset;
  if(curPieView==='expense') subset=tx.filter(t=>t.type==='expense'&&!t.goalId);
  else if(curPieView==='income') subset=tx.filter(t=>t.type==='income'&&!t.goalId);
  else subset=tx.filter(t=>t.type==='expense'&&t.who===curPieView&&!t.goalId);
  const map={};
  subset.forEach(t=>{const k=t.subCat?`${t.catId}::${t.subCat}`:t.catId; map[k]=(map[k]||0)+Number(t.amount);});
  const total=subset.reduce((s,t)=>s+Number(t.amount),0);
  const entries=Object.entries(map).sort((a,b)=>b[1]-a[1]);
  document.getElementById('cat-breakdown-title').textContent=curPieView==='income'?'收入明細':curPieView==='expense'?'支出明細':`${curPieView} 支出明細`;
  const el=document.getElementById('cat-stat-rows');
  if(!entries.length){el.innerHTML='<div style="text-align:center;padding:1rem;color:var(--text3);font-size:.82rem;">本期無記錄</div>';return;}
  el.innerHTML=entries.map(([k,v],i)=>{
    const [cid,sub]=k.split('::');
    const cats=[...getCats('expense'),...getCats('income')];
    const cat=cats.find(c=>c.id===cid)||{e:'📦',n:cid};
    const pct=total?Math.round(v/total*100):0;
    const color=CAT_COLORS[i%CAT_COLORS.length];
    return `<div class="cat-stat-item">
      <div style="flex:1;min-width:0;">
        <div style="display:flex;align-items:center;gap:8px;">
          <div class="cat-dot" style="background:${color}"></div>
          <div class="cat-stat-name">${sub?`${cat.e} ${sub}`:`${cat.e} ${cat.n}`}</div>
          <div class="cat-stat-pct">${pct}%</div>
          <div class="cat-stat-amt">NT$${fmt(v)}</div>
        </div>
        <div style="margin-left:18px;margin-top:4px;">
          <div class="cat-stat-bar-wrap">
            <div class="cat-stat-bar" style="width:${pct}%;background:${color};"></div>
          </div>
        </div>
      </div>
    </div>`;
  }).join('');
}

