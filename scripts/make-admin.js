const Database=require('better-sqlite3');
const db=new Database('./data/locly.db');
const email=(process.argv[2]||'').trim().toLowerCase();
const role=process.argv[3]||'superadmin';
if(!email||!['admin','superadmin','moderator','finance'].includes(role)){console.error('Usage: node scripts/make-admin.js email@example.com superadmin|admin|moderator|finance');process.exit(1)}
const user=db.prepare('SELECT id,name,email,role FROM users WHERE email=?').get(email);
if(!user){console.error('Utilisateur introuvable. Crée d’abord son compte Locly.');process.exit(1)}
db.prepare('UPDATE users SET role=? WHERE id=?').run(role,user.id);
console.log(`OK: ${user.email} -> ${role}`);
