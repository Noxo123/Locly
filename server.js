const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const Database = require('better-sqlite3');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'locly-dev-secret-change-me';
const ROOT = __dirname;
const DATA = path.join(ROOT, 'data');
const UPLOADS = path.join(ROOT, 'uploads');
fs.mkdirSync(DATA, { recursive: true });
fs.mkdirSync(UPLOADS, { recursive: true });

const db = new Database(path.join(DATA, 'locly.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  trust_score INTEGER NOT NULL DEFAULT 80,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS listings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  city TEXT NOT NULL,
  price REAL NOT NULL CHECK(price >= 0),
  deposit REAL NOT NULL DEFAULT 0 CHECK(deposit >= 0),
  image TEXT,
  status TEXT NOT NULL DEFAULT 'published',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  renter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  total REAL NOT NULL,
  deposit REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS inspections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK(type IN ('before','after')),
  file_path TEXT NOT NULL,
  file_hash TEXT NOT NULL,
  recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(booking_id, type)
);
CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  reviewer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
  comment TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(booking_id, reviewer_id, target_id)
);
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reporter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  booking_id INTEGER REFERENCES bookings(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  details TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);

const hashPassword = (password) => crypto.createHash('sha256').update(password).digest('hex');
const sign = (user) => jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, trustScore: u.trust_score, status: u.status });

function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Authentification requise' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!u || u.status !== 'active') return res.status(403).json({ error: 'Compte suspendu' });
    req.dbUser = u;
    next();
  } catch { res.status(401).json({ error: 'Session invalide' }); }
}
function optionalAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) {
    try { req.user = jwt.verify(header.slice(7), JWT_SECRET); } catch {}
  }
  next();
}
function validateDates(start, end) {
  const a = new Date(start), b = new Date(end);
  return Number.isFinite(a.getTime()) && Number.isFinite(b.getTime()) && b >= a;
}
function recalcTrust(userId) {
  const stats = db.prepare(`SELECT AVG(rating) avg_rating, COUNT(*) reviews FROM reviews WHERE target_id = ?`).get(userId);
  const reports = db.prepare(`SELECT COUNT(*) n FROM reports WHERE target_id = ? AND status IN ('open','confirmed')`).get(userId).n;
  let score = Math.round((stats.avg_rating ? stats.avg_rating * 16 : 80) - reports * 12);
  score = Math.max(0, Math.min(100, score));
  db.prepare('UPDATE users SET trust_score = ? WHERE id = ?').run(score, userId);
  if (score <= 15 || reports >= 4) db.prepare("UPDATE users SET status='suspended' WHERE id=?").run(userId);
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`)
});
const upload = multer({ storage, limits: { fileSize: 100 * 1024 * 1024 }, fileFilter: (_req, file, cb) => cb(null, file.mimetype.startsWith('video/')) });

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(UPLOADS));
app.use(express.static(path.join(ROOT, 'public')));

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'Locly API', version: '1.0.0' }));

app.post('/api/auth/register', (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password || password.length < 6) return res.status(400).json({ error: 'Nom, email et mot de passe de 6 caractères minimum requis.' });
  try {
    const info = db.prepare('INSERT INTO users(name,email,password_hash) VALUES(?,?,?)').run(name.trim(), email.trim().toLowerCase(), hashPassword(password));
    const user = db.prepare('SELECT * FROM users WHERE id=?').get(info.lastInsertRowid);
    res.status(201).json({ user: publicUser(user), token: sign(user) });
  } catch { res.status(409).json({ error: 'Cet email est déjà utilisé.' }); }
});
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email=? AND password_hash=?').get((email || '').trim().toLowerCase(), hashPassword(password || ''));
  if (!user) return res.status(401).json({ error: 'Email ou mot de passe incorrect.' });
  if (user.status !== 'active') return res.status(403).json({ error: 'Compte suspendu.' });
  res.json({ user: publicUser(user), token: sign(user) });
});
app.get('/api/me', auth, (req, res) => res.json({ user: publicUser(req.dbUser) }));

app.get('/api/listings', optionalAuth, (req, res) => {
  const { q = '', category = '', city = '' } = req.query;
  const rows = db.prepare(`SELECT l.*, u.name owner_name, u.trust_score owner_trust, u.status owner_status,
    COALESCE((SELECT AVG(r.rating) FROM reviews r WHERE r.target_id=u.id),0) owner_rating
    FROM listings l JOIN users u ON u.id=l.owner_id
    WHERE l.status='published' AND u.status='active'
    AND l.title LIKE ? AND l.category LIKE ? AND l.city LIKE ? ORDER BY l.created_at DESC`).all(`%${q}%`, `%${category}%`, `%${city}%`);
  res.json({ listings: rows });
});
app.get('/api/listings/:id', (req, res) => {
  const row = db.prepare(`SELECT l.*, u.name owner_name, u.trust_score owner_trust, u.email owner_email,
    COALESCE((SELECT AVG(r.rating) FROM reviews r WHERE r.target_id=u.id),0) owner_rating
    FROM listings l JOIN users u ON u.id=l.owner_id WHERE l.id=?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Annonce introuvable.' });
  res.json({ listing: row });
});
app.post('/api/listings', auth, (req, res) => {
  const { title, description, category, city, price, deposit, image } = req.body;
  if (!title || !description || !category || !city || !Number.isFinite(Number(price))) return res.status(400).json({ error: 'Champs obligatoires manquants.' });
  const info = db.prepare(`INSERT INTO listings(owner_id,title,description,category,city,price,deposit,image) VALUES(?,?,?,?,?,?,?,?)`)
    .run(req.dbUser.id, title.trim(), description.trim(), category.trim(), city.trim(), Number(price), Number(deposit || 0), image || null);
  res.status(201).json({ listing: db.prepare('SELECT * FROM listings WHERE id=?').get(info.lastInsertRowid) });
});
app.get('/api/my/listings', auth, (req, res) => res.json({ listings: db.prepare('SELECT * FROM listings WHERE owner_id=? ORDER BY created_at DESC').all(req.dbUser.id) }));

app.post('/api/bookings', auth, (req, res) => {
  const { listingId, startDate, endDate } = req.body;
  if (!validateDates(startDate, endDate)) return res.status(400).json({ error: 'Dates invalides.' });
  const listing = db.prepare("SELECT * FROM listings WHERE id=? AND status='published'").get(listingId);
  if (!listing) return res.status(404).json({ error: 'Annonce introuvable.' });
  if (listing.owner_id === req.dbUser.id) return res.status(400).json({ error: 'Vous ne pouvez pas louer votre propre matériel.' });
  const days = Math.max(1, Math.ceil((new Date(endDate) - new Date(startDate)) / 86400000));
  const total = days * listing.price;
  const info = db.prepare('INSERT INTO bookings(listing_id,renter_id,start_date,end_date,total,deposit) VALUES(?,?,?,?,?,?)').run(listingId, req.dbUser.id, startDate, endDate, total, listing.deposit);
  res.status(201).json({ booking: db.prepare('SELECT * FROM bookings WHERE id=?').get(info.lastInsertRowid) });
});
app.get('/api/bookings', auth, (req, res) => {
  const rows = db.prepare(`SELECT b.*, l.title, l.city, l.price, l.owner_id, owner.name owner_name, renter.name renter_name
    FROM bookings b JOIN listings l ON l.id=b.listing_id JOIN users owner ON owner.id=l.owner_id JOIN users renter ON renter.id=b.renter_id
    WHERE b.renter_id=? OR l.owner_id=? ORDER BY b.created_at DESC`).all(req.dbUser.id, req.dbUser.id);
  res.json({ bookings: rows });
});
app.patch('/api/bookings/:id', auth, (req, res) => {
  const booking = db.prepare(`SELECT b.*, l.owner_id FROM bookings b JOIN listings l ON l.id=b.listing_id WHERE b.id=?`).get(req.params.id);
  if (!booking || (booking.renter_id !== req.dbUser.id && booking.owner_id !== req.dbUser.id)) return res.status(404).json({ error: 'Location introuvable.' });
  const allowed = ['pending','accepted','rejected','active','returned','disputed','cancelled'];
  if (!allowed.includes(req.body.status)) return res.status(400).json({ error: 'Statut invalide.' });
  db.prepare('UPDATE bookings SET status=? WHERE id=?').run(req.body.status, req.params.id);
  res.json({ booking: db.prepare('SELECT * FROM bookings WHERE id=?').get(req.params.id) });
});

app.post('/api/bookings/:id/inspection', auth, upload.single('video'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Une vidéo est requise.' });
  const booking = db.prepare(`SELECT b.*, l.owner_id FROM bookings b JOIN listings l ON l.id=b.listing_id WHERE b.id=?`).get(req.params.id);
  if (!booking || (booking.renter_id !== req.dbUser.id && booking.owner_id !== req.dbUser.id)) return res.status(404).json({ error: 'Location introuvable.' });
  if (!['before','after'].includes(req.body.type)) return res.status(400).json({ error: 'Type de vidéo invalide.' });
  const hash = crypto.createHash('sha256').update(fs.readFileSync(req.file.path)).digest('hex');
  db.prepare(`INSERT INTO inspections(booking_id,type,file_path,file_hash) VALUES(?,?,?,?) ON CONFLICT(booking_id,type) DO UPDATE SET file_path=excluded.file_path,file_hash=excluded.file_hash,recorded_at=CURRENT_TIMESTAMP`)
    .run(req.params.id, req.body.type, `/uploads/${req.file.filename}`, hash);
  res.status(201).json({ message: 'Vidéo enregistrée.', hash, url: `/uploads/${req.file.filename}` });
});
app.get('/api/bookings/:id/inspections', auth, (req, res) => {
  const booking = db.prepare(`SELECT b.*, l.owner_id FROM bookings b JOIN listings l ON l.id=b.listing_id WHERE b.id=?`).get(req.params.id);
  if (!booking || (booking.renter_id !== req.dbUser.id && booking.owner_id !== req.dbUser.id)) return res.status(404).json({ error: 'Location introuvable.' });
  res.json({ inspections: db.prepare('SELECT * FROM inspections WHERE booking_id=?').all(req.params.id) });
});

app.post('/api/reviews', auth, (req, res) => {
  const { bookingId, rating, comment } = req.body;
  const booking = db.prepare(`SELECT b.*, l.owner_id FROM bookings b JOIN listings l ON l.id=b.listing_id WHERE b.id=? AND b.status='returned'`).get(bookingId);
  if (!booking) return res.status(400).json({ error: 'La location doit être terminée avant de laisser un avis.' });
  const targetId = booking.renter_id === req.dbUser.id ? booking.owner_id : booking.renter_id;
  if (booking.renter_id !== req.dbUser.id && booking.owner_id !== req.dbUser.id) return res.status(403).json({ error: 'Non autorisé.' });
  if (!Number.isInteger(Number(rating)) || rating < 1 || rating > 5 || !comment) return res.status(400).json({ error: 'Note et commentaire requis.' });
  try {
    db.prepare('INSERT INTO reviews(booking_id,reviewer_id,target_id,rating,comment) VALUES(?,?,?,?,?)').run(bookingId, req.dbUser.id, targetId, rating, comment.trim());
    recalcTrust(targetId);
    res.status(201).json({ message: 'Avis publié et vérifié.' });
  } catch { res.status(409).json({ error: 'Vous avez déjà évalué cette personne pour cette location.' }); }
});
app.get('/api/users/:id/reviews', (req, res) => res.json({ reviews: db.prepare(`SELECT r.*, u.name reviewer_name FROM reviews r JOIN users u ON u.id=r.reviewer_id WHERE r.target_id=? ORDER BY r.created_at DESC`).all(req.params.id) }));

app.post('/api/reports', auth, (req, res) => {
  const { targetId, bookingId, reason, details } = req.body;
  if (!targetId || !reason || !details) return res.status(400).json({ error: 'Motif et détails requis.' });
  const info = db.prepare('INSERT INTO reports(reporter_id,target_id,booking_id,reason,details) VALUES(?,?,?,?,?)').run(req.dbUser.id, targetId, bookingId || null, reason, details.trim());
  recalcTrust(Number(targetId));
  res.status(201).json({ reportId: info.lastInsertRowid, message: 'Signalement enregistré. Il sera examiné.' });
});

app.get('/api/admin/reports', auth, (req, res) => {
  if (req.dbUser.role !== 'admin') return res.status(403).json({ error: 'Admin uniquement.' });
  res.json({ reports: db.prepare(`SELECT r.*, reporter.name reporter_name, target.name target_name FROM reports r JOIN users reporter ON reporter.id=r.reporter_id JOIN users target ON target.id=r.target_id ORDER BY r.created_at DESC`).all() });
});
app.patch('/api/admin/reports/:id', auth, (req, res) => {
  if (req.dbUser.role !== 'admin') return res.status(403).json({ error: 'Admin uniquement.' });
  const status = ['open','confirmed','rejected','closed'].includes(req.body.status) ? req.body.status : 'open';
  const report = db.prepare('SELECT * FROM reports WHERE id=?').get(req.params.id);
  if (!report) return res.status(404).json({ error: 'Signalement introuvable.' });
  db.prepare('UPDATE reports SET status=? WHERE id=?').run(status, req.params.id);
  if (status === 'confirmed') recalcTrust(report.target_id);
  res.json({ ok: true });
});

app.get('/api/dashboard', auth, (req, res) => {
  const listings = db.prepare('SELECT COUNT(*) n FROM listings WHERE owner_id=?').get(req.dbUser.id).n;
  const bookings = db.prepare(`SELECT COUNT(*) n FROM bookings b LEFT JOIN listings l ON l.id=b.listing_id WHERE b.renter_id=? OR l.owner_id=?`).get(req.dbUser.id, req.dbUser.id).n;
  const reports = db.prepare('SELECT COUNT(*) n FROM reports WHERE target_id=? AND status IN (\'open\',\'confirmed\')').get(req.dbUser.id).n;
  const reviews = db.prepare('SELECT COUNT(*) n FROM reviews WHERE target_id=?').get(req.dbUser.id).n;
  res.json({ stats: { listings, bookings, reports, reviews }, user: publicUser(req.dbUser) });
});

app.get('*', (_req, res) => res.sendFile(path.join(ROOT, 'public', 'index.html')));
app.listen(PORT, () => console.log(`Locly running on http://localhost:${PORT}`));
