// ============================================================
// config.js — 全域常數設定 + 全域狀態變數
// 內容：預設分類(DEF_CATS)、emoji 清單、配色、Supabase 連線金鑰、
//      所有頁面共用的全域狀態變數（curBook、calY/calM 等）
// 給其他模組使用，不依賴任何其他 js 檔案。
// ============================================================

// ══════════════════════════════════════════
// 預設分類（含豐富子分類）
// ══════════════════════════════════════════
const DEF_CATS = {
  expense:[
    {id:'food',   e:'🍜',n:'餐飲',   subs:['早餐','午餐','晚餐','下午茶','宵夜','飲料','聚餐']},
    {id:'trans',  e:'🚌',n:'交通',   subs:['公車/捷運','計程車/Uber','油費','停車費','高鐵/火車','機票']},
    {id:'shop',   e:'🛍️',n:'購物',   subs:['服飾鞋包','日用品','保養化妝','3C/電器','家居用品','書籍文具']},
    {id:'enter',  e:'🎬',n:'娛樂',   subs:['電影/展覽','遊戲點數','KTV','旅遊','訂閱服務','運動健身']},
    {id:'med',    e:'💊',n:'醫療健康',subs:['掛號費','藥品','健身房','保健食品','牙醫']},
    {id:'edu',    e:'📚',n:'教育',   subs:['學費','線上課程','書籍','文具','補習']},
    {id:'bill',   e:'📄',n:'帳單水電',subs:['電費','水費','瓦斯','網路費','手機費','保險']},
    {id:'rent',   e:'🏠',n:'房租/房貸',subs:['房租','管理費','修繕']},
    {id:'food2',  e:'🛒',n:'超市/食材',subs:['超市','市場','生鮮','零食飲料']},
    {id:'pet',    e:'🐾',n:'毛孩',   subs:['飼料','醫療','美容','用品']},
    {id:'gift2',  e:'🎁',n:'人情禮金',subs:['禮物','婚喪喜慶','出遊請客']},
    {id:'other',  e:'📦',n:'其他支出',subs:[]},
  ],
  income:[
    {id:'salary', e:'💼',n:'薪資',   subs:['月薪','獎金','加班費','年終']},
    {id:'part',   e:'💡',n:'兼職/接案',subs:['接案','打工','稿費']},
    {id:'invest', e:'📈',n:'投資收益',subs:['股票','基金','定存利息','ETF','房租收入']},
    {id:'gift',   e:'🧧',n:'紅包/贈與',subs:['過年紅包','生日禮金','長輩給']},
    {id:'sell',   e:'♻️',n:'出售物品',subs:['二手拍賣','FB社團','蝦皮']},
    {id:'refund', e:'↩️',n:'退款/補助',subs:['退款','政府補助','報帳']},
    {id:'inc-other',e:'📦',n:'其他收入',subs:[]},
  ]
};


const EMOJI_LIST=['🍜','🍱','🍔','🍰','☕','🧋','🍺','🥗','🛍️','👗','👟','💄','🚌','🚗','🛵','✈️','🏠','💊','🏥','📚','🎓','🎬','🎮','🎵','🏋️','💼','💰','🎁','📈','💡','📄','🔌','💧','📦','🌿','🐾','🐶','🐱','🌸','⭐','❤️','🔑','📱','💻','🛒','🎯','🏦','🪙','💎','🗺️','🧳','🏔️','🎓','🏖️','🚀','🌙','☀️'];

const GOAL_EMOJIS=['🎯','🗺️','🧳','🏖️','✈️','🎓','🚗','🏠','💍','🎮','💻','📷','🏔️','🌸','🎪','🚀'];

const ASSET_EMOJIS=['🏦','🛡️','💰','📊','🪙','💎','🏠','📈','🔒','💼','🌱','⚡'];

const CAT_COLORS=['#a89bbf','#8fa8b8','#c4a09a','#8fb5a0','#d4b896','#b8a8bf','#9ab8b0','#bfb8a0','#c8a8a0','#a0c0b8','#b0a0c8','#c0b8a0','#a8b8c0','#c0a8b0','#b8c0a8','#a0b8c0'];


// ══════════════════════════════════════════
// Supabase 設定（部署時填入，本機留空會自動用 localStorage）
// ══════════════════════════════════════════
const SB_URL  = 'https://xjgxlgriodjpicnsiyip.supabase.co';

const SB_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhqZ3hsZ3Jpb2RqcGljbnNpeWlwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzOTA5NDYsImV4cCI6MjA5Nzk2Njk0Nn0.ISh-lHn4Dinuf5656H9XuCmDrHjHe5YgRKRZzCyL3DY';




let curBook='',curType='expense',curPieView='expense';

let sharedBooks={}; // {bookId: {id,name,members,member_names,cats,...}}

let sharedTxCache={}; // {bookId: [tx,...]}

let isSharedBook=false; // 目前帳本是否為共同帳本

let pickedEmoji='📦',goalEmoji='🎯',assetEmoji='🏦';

let subMgrCatId='',subMgrType='expense';

let allocGoalId='',assetTxId='',assetTxType='in';

let pendingTx=null;

let calY=0,calM=0,calSel='';

let pieChart=null;

let curWealthTab='goals';

let curGoalChip=''; // '' = 無目標

