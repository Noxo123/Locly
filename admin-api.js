const http = require('http');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');
const path = require('path');

const PORT = process.env.ADMIN_PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'locly-dev-secret-change-me';
const db = new Database(path.join(__dirname, 'data', 'locly.db'));
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS admin_audit_logs (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 admin_id INTEGER NOT NULL,
 action TEXT NOT NULL,
 target_type TEXT,
 target_id INTEGER,
 details TEXT,
 ip TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS ip_controls (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 ip TEXT NOT NULL UNIQUE,
 action TEXT NOT NULL CHECK(action IN ('blocked','allowed')),
 reason TEXT,
 created_by INTEGER,
 expires_at TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS money_ledger (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 booking_id INTEGER,
 user_id INTEGER,
 type TEXT NOT NULL,
 amount REAL NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending',
 reference TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS admin_actions (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 admin_id INTEGER NOT NULL,
 action TEXT NOT NULL,
 target_user_id INTEGER,
 reason TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS presence_sessions (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 visitor_id TEXT NOT NULL UNIQUE,
 user_id INTEGER,
 ip TEXT NOT NULL,
 user_agent TEXT,
 first_seen TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 last_seen TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_presence_last_seen ON presence_sessions(last_seen);
CREATE INDEX IF NOT EXISTS idx_presence_ip ON presence_sessions(ip);
`);

function json(res, status, body) { const out = JSON.stringify(body); res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Authorization,Content-Type','Access-Control-Allow-Methods':'GET,POST,PATCH,OPTIONS'}); res.end(out); }
function audit(admin, action, targetType, targetId, details, ip) { db.prepare('INSERT INTO admin_audit_logs(admin_id,action,target_type,target_id,details,ip) VALUES(?,?,?,?,?,?)').run(admin.id,action,targetType,targetId,details ? JSON.stringify(details) : null,ip||null); }
function auth(req,res,next){ const h=req.headers.authorization||''; if(!h.startsWith('Bearer ')) return json(res,401,{error:'Authentification requise'}); try{const u=jwt.verify(h.slice(7),JWT_SECRET); const dbu=db.prepare('SELECT * FROM users WHERE id=?').get(u.id); if(!dbu||dbu.status!=='active') return json(res,403,{error:'Compte indisponible'}); req.user=dbu; next();}catch{return json(res,401,{error:'Session invalide'});} }
function admin(req,res,next){ if(!['admin','superadmin','moderator','finance'].includes(req.user.role)) return json(res,403,{error:'Accès administrateur refusé'}); next(); }
function body(req){return new Promise((resolve,reject)=>{let s='';req.on('data',c=>{s+=c;if(s.length>1000000) req.destroy();});req.on('end',()=>{try{resolve(s?JSON.parse(s):{})}catch{reject(new Error('JSON invalide'))}});});}
function ip(req){return (req.headers['x-forwarded-for']||req.socket.remoteAddress||'').split(',')[0].trim().replace(/^::ffff:/,'');}
function optionalUser(req){const h=req.headers.authorization||'';if(!h.startsWith('Bearer '))return null;try{const u=jwt.verify(h.slice(7),JWT_SECRET);return db.prepare('SELECT id,status FROM users WHERE id=?').get(u.id)?.status==='active'?u.id:null}catch{return null}}
function cleanupPresence(){db.prepare("DELETE FROM presence_sessions WHERE last_seen < datetime('now','-2 minutes')").run()}

const server=http.createServer(async(req,res)=>{
 if(req.method==='OPTIONS') return json(res,204,{});
 try{
  if(req.method==='POST'&&req.url==='/api/presence'){
   const b=await body(req); const visitorId=String(b.visitorId||'').trim();
   if(!visitorId||visitorId.length>100) return json(res,400,{error:'visitorId requis'});
   cleanupPresence();
   const userId=optionalUser(req); const visitorIp=ip(req); const ua=String(req.headers['user-agent']||'').slice(0,500);
   db.prepare(`INSERT INTO presence_sessions(visitor_id,user_id,ip,user_agent,first_seen,last_seen) VALUES(?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
     ON CONFLICT(visitor_id) DO UPDATE SET user_id=excluded.user_id,ip=excluded.ip,user_agent=excluded.user_agent,last_seen=CURRENT_TIMESTAMP`).run(visitorId,userId,visitorIp,ua);
   return json(res,200,{ok:true});
  }
  if(req.method==='POST'&&req.url==='/api/presence/leave'){
   const b=await body(req); const visitorId=String(b.visitorId||'').trim(); if(visitorId) db.prepare('DELETE FROM presence_sessions WHERE visitor_id=?').run(visitorId); return json(res,200,{ok:true});
  }
  if(req.method==='GET'&&req.url==='/api/presence/stats'){
   cleanupPresence();
   const online=db.prepare("SELECT COUNT(*) n FROM presence_sessions WHERE last_seen >= datetime('now','-90 seconds')").get().n;
   const usersOnline=db.prepare("SELECT COUNT(*) n FROM presence_sessions WHERE user_id IS NOT NULL AND last_seen >= datetime('now','-90 seconds')").get().n;
   const visitorsOnline=db.prepare("SELECT COUNT(*) n FROM presence_sessions WHERE user_id IS NULL AND last_seen >= datetime('now','-90 seconds')").get().n;
   const today=db.prepare("SELECT COUNT(*) n FROM presence_sessions WHERE first_seen >= datetime('now','start of day')").get().n;
   const ips=db.prepare("SELECT ip,COUNT(*) count,MAX(last_seen) last_seen FROM presence_sessions WHERE last_seen >= datetime('now','-90 seconds') GROUP BY ip ORDER BY count DESC LIMIT 100").all();
   return json(res,200,{online,usersOnline,visitorsOnline,todayVisitors:today,ips});
  }
  if(!req.url.startsWith('/api/admin')) return json(res,404,{error:'Not found'});
  let denied=false; auth(req,res,()=>{}); if(!req.user) return; admin(req,res,()=>{}); if(!['admin','superadmin','moderator','finance'].includes(req.user.role)) return;
  const url=new URL(req.url,'http://localhost'); const p=url.pathname.replace('/api/admin','');
  if(req.method==='GET'&&p==='/overview'){
   cleanupPresence();
   const users=db.prepare('SELECT COUNT(*) n FROM users').get().n, active=db.prepare("SELECT COUNT(*) n FROM users WHERE status='active'").get().n, suspended=db.prepare("SELECT COUNT(*) n FROM users WHERE status='suspended'").get().n;
   const listings=db.prepare('SELECT COUNT(*) n FROM listings').get().n, bookings=db.prepare('SELECT COUNT(*) n FROM bookings').get().n, reports=db.prepare("SELECT COUNT(*) n FROM reports WHERE status='open'").get().n;
   const money=db.prepare('SELECT COALESCE(SUM(amount),0) total FROM money_ledger WHERE status=\'completed\'').get().total;
   const online=db.prepare("SELECT COUNT(*) n FROM presence_sessions WHERE last_seen >= datetime('now','-90 seconds')").get().n;
   return json(res,200,{users,active,suspended,listings,bookings,openReports:reports,processedMoney:money,online});
  }
  if(req.method==='GET'&&p==='/users'){
   const q=(url.searchParams.get('q')||'').trim(); const status=url.searchParams.get('status')||'';
   const rows=db.prepare(`SELECT id,name,email,role,trust_score,status,created_at FROM users WHERE (name LIKE ? OR email LIKE ?) AND status LIKE ? ORDER BY created_at DESC LIMIT 200`).all('%'+q+'%','%'+q+'%',status?status:'%'); return json(res,200,{users:rows});
  }
  if(req.method==='POST'&&p.match(/^\/users\/\d+\/ban$/)){const id=Number(p.split('/')[2]); const b=await body(req); const reason=String(b.reason||'Violation des règles').slice(0,500); db.prepare("UPDATE users SET status='suspended' WHERE id=?").run(id); db.prepare('INSERT INTO admin_actions(admin_id,action,target_user_id,reason) VALUES(?,?,?,?)').run(req.user.id,'ban',id,reason); audit(req.user,'ban','user',id,{reason},ip(req)); return json(res,200,{ok:true,status:'suspended'});}
  if(req.method==='POST'&&p.match(/^\/users\/\d+\/unban$/)){const id=Number(p.split('/')[2]); db.prepare("UPDATE users SET status='active' WHERE id=?").run(id); db.prepare('INSERT INTO admin_actions(admin_id,action,target_user_id,reason) VALUES(?,?,?,?)').run(req.user.id,'unban',id,'Réintégration'); audit(req.user,'unban','user',id,null,ip(req)); return json(res,200,{ok:true,status:'active'});}
  if(req.method==='PATCH'&&p.match(/^\/users\/\d+\/role$/)){if(!['admin','superadmin'].includes(req.user.role)) return json(res,403,{error:'Seul un administrateur principal peut modifier les rôles'}); const id=Number(p.split('/')[2]); const b=await body(req); const roles=['user','moderator','finance','admin','superadmin']; if(!roles.includes(b.role)) return json(res,400,{error:'Rôle invalide'}); db.prepare('UPDATE users SET role=? WHERE id=?').run(b.role,id); audit(req.user,'role_change','user',id,{role:b.role},ip(req)); return json(res,200,{ok:true});}
  if(req.method==='GET'&&p==='/reports'){const rows=db.prepare(`SELECT r.*, reporter.name reporter_name,target.name target_name FROM reports r JOIN users reporter ON reporter.id=r.reporter_id JOIN users target ON target.id=r.target_id WHERE r.status='open' ORDER BY r.created_at ASC LIMIT 200`).all(); return json(res,200,{reports:rows});}
  if(req.method==='POST'&&p.match(/^\/reports\/\d+\/resolve$/)){const id=Number(p.split('/')[2]); const b=await body(req); db.prepare("UPDATE reports SET status=? WHERE id=?").run(b.status==='confirmed'?'confirmed':'resolved',id); audit(req.user,'resolve_report','report',id,{status:b.status},ip(req)); return json(res,200,{ok:true});}
  if(req.method==='GET'&&p==='/ips'){const rows=db.prepare('SELECT * FROM ip_controls ORDER BY created_at DESC LIMIT 500').all(); return json(res,200,{ips:rows});}
  if(req.method==='POST'&&p==='/ips/block'){const b=await body(req); const value=String(b.ip||'').trim(); if(!value) return json(res,400,{error:'IP requise'}); db.prepare("INSERT INTO ip_controls(ip,action,reason,created_by,expires_at) VALUES(?,?,?,?,?) ON CONFLICT(ip) DO UPDATE SET action='blocked',reason=excluded.reason,created_by=excluded.created_by,expires_at=excluded.expires_at").run(value,'blocked',String(b.reason||'Blocage administrateur').slice(0,300),req.user.id,b.expiresAt||null); audit(req.user,'block_ip','ip',null,{ip:value,reason:b.reason},ip(req)); return json(res,200,{ok:true});}
  if(req.method==='POST'&&p==='/ips/unblock'){const b=await body(req); db.prepare("DELETE FROM ip_controls WHERE ip=?").run(String(b.ip||'').trim()); audit(req.user,'unblock_ip','ip',null,{ip:b.ip},ip(req)); return json(res,200,{ok:true});}
  if(req.method==='GET'&&p==='/ledger'){if(!['admin','superadmin','finance'].includes(req.user.role)) return json(res,403,{error:'Accès finance refusé'}); const rows=db.prepare(`SELECT m.*,u.name user_name FROM money_ledger m LEFT JOIN users u ON u.id=m.user_id ORDER BY m.created_at DESC LIMIT 300`).all(); return json(res,200,{ledger:rows});}
  if(req.method==='POST'&&p==='/ledger'){if(!['admin','superadmin','finance'].includes(req.user.role)) return json(res,403,{error:'Accès finance refusé'}); const b=await body(req); const amount=Number(b.amount); if(!Number.isFinite(amount)||amount===0) return json(res,400,{error:'Montant invalide'}); const info=db.prepare('INSERT INTO money_ledger(booking_id,user_id,type,amount,status,reference) VALUES(?,?,?,?,?,?)').run(b.bookingId||null,b.userId||null,String(b.type||'adjustment'),amount,String(b.status||'completed'),String(b.reference||'').slice(0,100)); audit(req.user,'ledger_entry','money',Number(info.lastInsertRowid),{amount,type:b.type},ip(req)); return json(res,201,{id:info.lastInsertRowid});}
  if(req.method==='GET'&&p==='/audit'){const rows=db.prepare(`SELECT a.*,u.name admin_name FROM admin_audit_logs a JOIN users u ON u.id=a.admin_id ORDER BY a.created_at DESC LIMIT 300`).all(); return json(res,200,{logs:rows});}
  return json(res,404,{error:'Route admin inconnue'});
 }catch(e){ console.error(e); return json(res,500,{error:'Erreur interne'}); }
});
server.listen(PORT,()=>console.log(`Locly Admin API listening on :${PORT}`));