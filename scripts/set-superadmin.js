const Database = require('better-sqlite3');
const path = require('path');

const EMAIL = 'nicolnolhan6@gmail.com';
const db = new Database(path.join(__dirname, '..', 'data', 'locly.db'));

const user = db.prepare('SELECT id,email,role,status FROM users WHERE lower(email)=lower(?)').get(EMAIL);
if (!user) {
  console.error(`Compte introuvable : ${EMAIL}`);
  console.error('Connecte d’abord ce compte à Locly, puis relance ce script.');
  process.exitCode = 1;
} else {
  db.prepare("UPDATE users SET role='superadmin' WHERE id=?").run(user.id);
  console.log(`OK — ${user.email} est maintenant superadmin.`);
  console.log(`Statut du compte : ${user.status}`);
}
db.close();
