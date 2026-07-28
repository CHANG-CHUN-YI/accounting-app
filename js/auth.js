// ============================================================
// auth.js — Google 登入 / 登出 / 雲端狀態判斷
// 依賴：config.js（SB_URL, SB_KEY）
// ============================================================


let _sb = null, _user = null;


async function sbInit(){
  if(!SB_URL||!SB_KEY) return false;
  try{
    _sb = supabase.createClient(SB_URL, SB_KEY, {
      auth: {
        flowType: 'implicit',      // 不用 PKCE，避免 bad_oauth_state
        detectSessionInUrl: true,  // 自動從 URL hash 讀取 token
        persistSession: true,
        autoRefreshToken: true,
      }
    });
    const {data:{session}} = await _sb.auth.getSession();
    if(session){ _user=session.user; return true; }
    _sb.auth.onAuthStateChange((_,sess)=>{
      _user = sess?.user||null;
      if(_user) showApp();
      else showLogin();
    });
    // 如果 URL 帶有 OAuth 錯誤，顯示提示
    const params = new URLSearchParams(location.search);
    if(params.get('error')){
      const desc = params.get('error_description')||'登入失敗';
      toast('登入失敗：'+desc.replace(/\+/g,' '));
      history.replaceState(null,'',location.pathname); // 清掉網址列的錯誤參數
    }
    return false;
  }catch(e){ console.warn('Supabase init failed',e); return false; }
}


function isCloud(){ return !!(_sb&&_user); }


async function signInGoogle(){
  if(!_sb){ toast('尚未設定 Supabase'); return; }
  await _sb.auth.signInWithOAuth({
    provider:'google',
    options:{
      redirectTo: location.origin,
      scopes: 'https://www.googleapis.com/auth/drive.file',
      queryParams:{ access_type:'offline', prompt:'consent' }
    }
  });
}

async function signOut(){
  if(_sb) await _sb.auth.signOut();
  _user=null; showLogin();
}
