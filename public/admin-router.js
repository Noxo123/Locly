(()=>{
const ADMIN_ROLES=['moderator','finance','admin','superadmin'];
const ROLE_PERMISSIONS={moderator:['reports','users:read','ban'],finance:['finance'],admin:['reports','users:read','users:write','ban','ip','finance','audit'],superadmin:['*']};
const TOKEN_KEY='locly_token';
let currentUser=null;
function token(){return localStorage.getItem(TOKEN_KEY)}
function session(){return currentUser}
function getRole(s){return String(s?.role||s?.user?.role||s?.user?.account?.role||'').toLowerCase()}
function authorized(){return ADMIN_ROLES.includes(getRole(currentUser))}
function permission(p){const x=ROLE_PERMISSIONS[getRole(currentUser)]||[];return x.includes('*')||x.includes(p)}
function syncAdminLinks(){document.querySelectorAll('.admin-link,[data-admin-link],#admin-link').forEach(el=>{const ok=authorized();el.hidden=!ok;el.style.display=ok?'':'none';el.setAttribute('aria-hidden',String(!ok))})}
async function loadAuth(){
  const t=token();
  if(!t){currentUser=null;syncAdminLinks();return null}
  try{
    const r=await fetch('/api/me',{headers:{Authorization:`Bearer ${t}`}});
    if(!r.ok) throw new Error('auth');
    const d=await r.json();
    currentUser=d.user||null;
    syncAdminLinks();
    return currentUser;
  }catch{currentUser=null;syncAdminLinks();return null}
}
async function guard(){
  if(location.hash.split('?')[0]!=='#/admin')return true;
  const u=await loadAuth();
  if(!u||!ADMIN_ROLES.includes(getRole(u))){location.hash='#/login';return false}
  return true;
}
window.LoclyAdmin={roles:ADMIN_ROLES,permissions:ROLE_PERMISSIONS,getSession:session,getRole,isAdmin:authorized,can:permission,syncAdminLinks,guard,loadAuth};
document.addEventListener('DOMContentLoaded',async()=>{await loadAuth();await guard()});
window.addEventListener('hashchange',async()=>{await loadAuth();await guard()});
})();