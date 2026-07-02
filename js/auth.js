// ============================================================
// auth.js — Google 登入 / 登出 / 雲端狀態判斷
// 依賴：config.js（SB_URL, SB_KEY）
// ============================================================


let _sb = null, _user = null;


async function sbInit(){
  if(!SB_URL||!SB_KEY) return false;
  try{
    _sb = supabase.createClient(SB_URL, SB_KEY);
    const {data:{session}} = await _sb.auth.getSession();
    if(session){ _user=session.user; return true; }
    _sb.auth.onAuthStateChange((_,sess)=>{
      _user = sess?.user||null;
      if(_user) showApp();
      else showLogin();
    });
    return false;
  }catch(e){ console.warn('Supabase init failed',e); return false; }
}


function isCloud(){ return !!(_sb&&_user); }


async function signInGoogle(){
  if(!_sb){ toast('尚未設定 Supabase'); return; }
  await _sb.auth.signInWithOAuth({
    provider:'google',
    options:{
      redirectTo: location.href,
      scopes: 'https://www.googleapis.com/auth/drive.file',
      queryParams:{ access_type:'offline', prompt:'consent' }
    }
  });
}

async function signOut(){
  if(_sb) await _sb.auth.signOut();
  _user=null; showLogin();
}

