// ============================================================
// db.js — 資料存取層（DB 物件）
// 所有跟 Supabase / localStorage 讀寫資料的程式都在這裡，
// 其餘模組一律透過 DB.xxx() 存取資料，不直接碰 localStorage 或 _sb。
// 依賴：auth.js（_sb, _user, isCloud()）
// ============================================================


// ── 雲端 DB 層（自動 fallback 到 localStorage） ──
const DB={
  // books 存在 localStorage（含自訂分類/預算）
  getBooks:  ()=>JSON.parse(localStorage.getItem('books')||'[]'),
  saveBooks: d=>localStorage.setItem('books',JSON.stringify(d)),
  // recurs / goals / assets 存 localStorage
  getRecurs: ()=>JSON.parse(localStorage.getItem('recurs')||'[]'),
  saveRecurs:d=>localStorage.setItem('recurs',JSON.stringify(d)),
  getGoals:  ()=>JSON.parse(localStorage.getItem('goals')||'[]'),
  saveGoals: d=>localStorage.setItem('goals',JSON.stringify(d)),
  getAssets: ()=>JSON.parse(localStorage.getItem('assets')||'[]'),
  saveAssets:d=>localStorage.setItem('assets',JSON.stringify(d)),
  getInsts:  ()=>JSON.parse(localStorage.getItem('insts')||'[]'),
  saveInsts: d=>localStorage.setItem('insts',JSON.stringify(d)),
  // txs：雲端模式走 Supabase，本機走 localStorage
  getTxs: ()=>JSON.parse(localStorage.getItem('txs')||'[]'),
  saveTxs: d=>localStorage.setItem('txs',JSON.stringify(d)),
  // 雲端 tx 操作
  async insertTx(tx){
    if(!isCloud()){ const t=DB.getTxs(); t.unshift(tx); DB.saveTxs(t); return; }
    const row={id:tx.id,user_id:_user.id,book_id:tx.bookId||'personal',type:tx.type,
      amount:tx.amount,cat_id:tx.catId||'other',sub_cat:tx.subCat||'',
      note:tx.note||'',date:tx.date,who:tx.who||'',goal_id:tx.goalId||'',inst_id:tx.instId||''};
    const {error}=await _sb.from('transactions').insert(row);
    if(error) console.error('insert tx',error);
    const t=DB.getTxs(); t.unshift(tx); DB.saveTxs(t);
  },
  async deleteTx(id){
    if(!isCloud()){
      const t=DB.getTxs().filter(x=>x.id!==id); DB.saveTxs(t); return;
    }
    // 先等 Supabase 刪除完成
    const {error}=await _sb.from('transactions').delete().eq('id',id).eq('user_id',_user.id);
    if(error){ console.error('deleteTx error',error); return; }
    // 再更新 localStorage
    const t=DB.getTxs().filter(x=>x.id!==id); DB.saveTxs(t);
  },
  async fetchTxs(){
    if(!isCloud()) return;
    const {data,error}=await _sb.from('transactions')
      .select('*').eq('user_id',_user.id).order('date',{ascending:false});
    if(!error&&data){
      const txs=data.map(r=>({
        id:r.id, bookId:r.book_id||'personal', type:r.type, amount:r.amount,
        catId:r.cat_id||'other', subCat:r.sub_cat||'', note:r.note||'',
        date:r.date, who:r.who||'', goalId:r.goal_id||'', instId:r.inst_id||'',
      }));
      DB.saveTxs(txs);
    }
  },

  // ── 共同帳本雲端操作 ──
  async createSharedBook(book){
    if(!isCloud()) return null;
    const displayName=_user.user_metadata?.full_name||_user.email||'未知';
    const {data,error}=await _sb.from('shared_books').insert({
      id:book.id, name:book.name, created_by:_user.id, members:[],
      member_names:{[_user.id]:displayName}, cats:book.cats, budgets:book.budgets||{}
    }).select().single();
    if(error){console.error('create shared book',error);return null;}
    return data;
  },

  async fetchSharedBooks(){
    if(!isCloud()) return [];
    const {data,error}=await _sb.from('shared_books').select('*');
    if(error||!data) return [];
    return data;
  },

  async updateSharedBook(bookId,updates){
    if(!isCloud()) return;
    await _sb.from('shared_books').update(updates).eq('id',bookId);
  },

  async deleteSharedBook(bookId){
    if(!isCloud()) return;
    await _sb.from('shared_books').delete().eq('id',bookId);
  },

  async joinSharedBook(inviteCode){
    if(!isCloud()) return {error:'需要登入才能加入共同帳本'};
    const displayName=_user.user_metadata?.full_name||_user.email||'未知';
    const {data,error}=await _sb.rpc('join_shared_book',{invite_code:inviteCode,display_name:displayName});
    if(error) return {error:error.message};
    return data;
  },

  async fetchSharedTxs(bookId){
    if(!isCloud()) return [];
    const {data,error}=await _sb.from('shared_transactions')
      .select('*').eq('book_id',bookId).order('date',{ascending:false});
    if(error||!data) return [];
    // 轉換回 camelCase
    return data.map(r=>({
      id:r.id, bookId:r.book_id, type:r.type, amount:r.amount,
      catId:r.cat_id||'other', subCat:r.sub_cat||'',
      note:r.note||'', date:r.date, who:r.who_name||'',
      goalId:r.goal_id||'', instId:r.inst_id||'',
    }));
  },

  async insertSharedTx(tx,bookId,whoOverride=''){
    if(!isCloud()) return;
    // whoOverride 是選擇的成員名，空字串代表不指定
    const whoName=whoOverride||'';
    // 確保 id 唯一
    const uniqueId = tx.id.includes('_') ? tx.id : tx.id+'_'+Math.random().toString(36).slice(2,6);
    const row={
      id:uniqueId, book_id:bookId, user_id:_user.id, who_name:whoName,
      type:tx.type, amount:tx.amount,
      cat_id:tx.catId||'other', sub_cat:tx.subCat||'',
      note:tx.note||'', date:tx.date, goal_id:tx.goalId||'', inst_id:tx.instId||''
    };
    const {error}=await _sb.from('shared_transactions').insert(row);
    if(error) console.error('insert shared tx',error);
  },

  async deleteSharedTx(id){
    if(!isCloud()) return;
    await _sb.from('shared_transactions').delete().eq('id',id);
  },

  async updateTx(id, updates){
    if(!isCloud()) return;
    const row={};
    if(updates.type!==undefined) row.type=updates.type;
    if(updates.amount!==undefined) row.amount=updates.amount;
    if(updates.catId!==undefined) row.cat_id=updates.catId;
    if(updates.subCat!==undefined) row.sub_cat=updates.subCat;
    if(updates.note!==undefined) row.note=updates.note;
    if(updates.date!==undefined) row.date=updates.date;
    if(updates.who!==undefined) row.who=updates.who;
    if(updates.goalId!==undefined) row.goal_id=updates.goalId;
    if(updates.instId!==undefined) row.inst_id=updates.instId;
    const {error}=await _sb.from('transactions').update(row).eq('id',id).eq('user_id',_user.id);
  },

  async updateSharedTx(id, updates){
    if(!isCloud()) return;
    const row={};
    if(updates.type!==undefined) row.type=updates.type;
    if(updates.amount!==undefined) row.amount=updates.amount;
    if(updates.catId!==undefined) row.cat_id=updates.catId;
    if(updates.subCat!==undefined) row.sub_cat=updates.subCat;
    if(updates.note!==undefined) row.note=updates.note;
    if(updates.date!==undefined) row.date=updates.date;
    if(updates.who!==undefined) row.who_name=updates.who;
    if(updates.goalId!==undefined) row.goal_id=updates.goalId;
    if(updates.instId!==undefined) row.inst_id=updates.instId;
    const {error}=await _sb.from('shared_transactions').update(row).eq('id',id);
    if(error) console.error('updateSharedTx',error);
  },

  // ══════════════════════════════
  // 存錢罐雲端操作
  // ══════════════════════════════
  async fetchGoals(bookIds){
    if(!isCloud()) return null;
    // 抓所有相關帳本的存錢罐（個人 + 共同帳本）
    let query = _sb.from('goals').select('*');
    if(bookIds && bookIds.length){
      query = query.in('book_id', bookIds);
    } else {
      query = query.eq('user_id', _user.id);
    }
    const {data:goals, error} = await query;
    if(error||!goals) return null;
    return goals.map(g=>({
      id:g.id, bookId:g.book_id, e:g.emoji, name:g.name,
      target:g.target||0, note:g.note||'', createdAt:g.created_at,
      allocs:[], spends:[],
    }));
  },

  async upsertGoal(g){
    if(!isCloud()) return;
    await _sb.from('goals').upsert({
      id:g.id, user_id:_user.id, book_id:g.bookId||curBook,
      emoji:g.e||'🎯', name:g.name, target:g.target||0,
      note:g.note||'', created_at:g.createdAt||today()
    },{onConflict:'id'});
  },

  async updateGoalTarget(id, target, note){
    if(!isCloud()) return;
    await _sb.from('goals').update({target, note:note||''}).eq('id',id);
  },

  // ── 分期付款 ──
  async fetchInstallments(){
    if(!isCloud()) return null;
    const {data,error}=await _sb.from('installments').select('*').eq('user_id',_user.id).order('created_at',{ascending:false});
    if(error||!data) return null;
    return data.map(r=>({
      id:r.id, bookId:r.book_id, name:r.name, e:r.emoji||'💳',
      totalAmount:r.total_amount, perAmount:r.per_amount,
      totalPeriods:r.total_periods, paidPeriods:r.paid_periods,
      startDate:r.start_date, catId:r.cat_id||'other',
      note:r.note||'', status:r.status||'active',
    }));
  },

  async upsertInstallment(inst){
    if(!isCloud()) return;
    const {error}=await _sb.from('installments').upsert({
      id:inst.id, user_id:_user.id, book_id:inst.bookId||curBook,
      name:inst.name, emoji:inst.e||'💳',
      total_amount:inst.totalAmount, per_amount:inst.perAmount,
      total_periods:inst.totalPeriods, paid_periods:inst.paidPeriods,
      start_date:inst.startDate, cat_id:inst.catId||'other',
      note:inst.note||'', status:inst.status||'active',
    },{onConflict:'id'});
    if(error) console.error('upsertInstallment',error);
  },

  async deleteInstallment(id){
    if(!isCloud()) return;
    await _sb.from('installments').delete().eq('id',id).eq('user_id',_user.id);
  },

  async deleteGoal(id){
    if(!isCloud()) return;
    await _sb.from('goals').delete().eq('id',id).eq('user_id',_user.id);
  },

  async upsertAlloc(goalId, alloc){
    if(!isCloud()) return;
    await _sb.from('goal_allocs').upsert({
      id:alloc.id, goal_id:goalId, user_id:_user.id,
      amount:alloc.amount, note:alloc.note||'', date:alloc.date
    },{onConflict:'id'});
  },

  async deleteAlloc(id){
    if(!isCloud()) return;
    await _sb.from('goal_allocs').delete().eq('id',id).eq('user_id',_user.id);
  },

  async upsertSpend(goalId, spend){
    if(!isCloud()) return;
    await _sb.from('goal_spends').upsert({
      id:spend.id, goal_id:goalId, user_id:_user.id,
      amount:spend.amount, note:spend.note||'', date:spend.date
    },{onConflict:'id'});
  },

  async deleteSpend(id){
    if(!isCloud()) return;
    await _sb.from('goal_spends').delete().eq('id',id).eq('user_id',_user.id);
  },

  // ══════════════════════════════
  // 資金帳戶雲端操作
  // ══════════════════════════════
  async fetchAssets(bookIds){
    if(!isCloud()) return null;
    let query = _sb.from('assets').select('*');
    if(bookIds && bookIds.length){
      query = query.in('book_id', bookIds);
    } else {
      query = query.eq('user_id', _user.id);
    }
    const {data:assets, error} = await query;
    if(error||!assets) return null;
    const assetIds = assets.map(a=>a.id);
    const {data:txs} = assetIds.length
      ? await _sb.from('asset_txs').select('*').in('asset_id', assetIds)
      : {data:[]};
    return assets.map(a=>({
      id:a.id, bookId:a.book_id, e:a.emoji, name:a.name,
      initAmount:a.init_amount||0, note:a.note||'', createdAt:a.created_at,
      txs:(txs||[]).filter(t=>t.asset_id===a.id).map(t=>({
        id:t.id, type:t.type, amount:t.amount, note:t.note||'', date:t.date
      })),
    }));
  },

  async upsertAsset(a){
    if(!isCloud()) return;
    await _sb.from('assets').upsert({
      id:a.id, user_id:_user.id, book_id:a.bookId||curBook,
      emoji:a.e||'🏦', name:a.name, init_amount:a.initAmount||0,
      note:a.note||'', created_at:a.createdAt||today()
    },{onConflict:'id'});
  },

  async deleteAsset(id){
    if(!isCloud()) return;
    await _sb.from('assets').delete().eq('id',id).eq('user_id',_user.id);
  },

  async upsertAssetTx(assetId, tx){
    if(!isCloud()) return;
    await _sb.from('asset_txs').upsert({
      id:tx.id, asset_id:assetId, user_id:_user.id,
      type:tx.type, amount:tx.amount, note:tx.note||'', date:tx.date
    },{onConflict:'id'});
  },

  // ── 個人設定（預算）雲端儲存 ──
  async saveUserSettings(settings){
    if(!isCloud()) return;
    await _sb.from('user_settings').upsert({
      user_id: _user.id,
      settings_json: JSON.stringify(settings),
      updated_at: new Date().toISOString(),
    }, {onConflict:'user_id'});
  },

  async fetchUserSettings(){
    if(!isCloud()) return null;
    const {data,error}=await _sb.from('user_settings')
      .select('settings_json').eq('user_id',_user.id).single();
    if(error||!data) return null;
    try{ return JSON.parse(data.settings_json); }catch(e){ return null; }
  },

  // 共同帳本預算同步
  async saveSharedBookBudgets(bookId, budgets){
    if(!isCloud()) return;
    await _sb.from('shared_books').update({budgets}).eq('id',bookId);
  },
}

