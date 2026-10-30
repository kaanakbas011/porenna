'use strict';
/*
  SAHA RAPOR – Elektrik firmaları için iş bitirme raporu uygulaması
  Bağımlılıksız Node.js sunucusu (Node >= 22.5, yerleşik SQLite kullanır).

  Çalıştırma:  node --no-warnings server.js
  Ortam değişkenleri: PORT (varsayılan 3000), MAX_UPLOAD_MB (varsayılan 300)
*/

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { TEMPLATES, USERS } = require('./seed');

const PORT = Number(process.env.PORT) || 3000;
const MAX_UPLOAD = (Number(process.env.MAX_UPLOAD_MB) || 300) * 1024 * 1024;
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const UPLOAD_DIR = path.join(ROOT, 'uploads');
const PUBLIC_DIR = path.join(ROOT, 'public');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

/* ----------------------------- Veritabanı ----------------------------- */

const db = new DatabaseSync(path.join(DATA_DIR, 'saha-rapor.db'));
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id          INTEGER PRIMARY KEY,
    username    TEXT UNIQUE NOT NULL,
    name        TEXT NOT NULL,
    role        TEXT NOT NULL CHECK (role IN ('teknisyen','mudur')),
    pass_hash   TEXT NOT NULL,
    active      INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token       TEXT PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS templates (
    id          INTEGER PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    category    TEXT NOT NULL DEFAULT '',
    fields      TEXT NOT NULL,
    owner_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
    is_default  INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS reports (
    id            INTEGER PRIMARY KEY,
    title         TEXT NOT NULL,
    customer      TEXT NOT NULL DEFAULT '',
    address       TEXT NOT NULL DEFAULT '',
    job_date      TEXT,
    template_id   INTEGER REFERENCES templates(id) ON DELETE SET NULL,
    template_name TEXT NOT NULL DEFAULT '',
    fields        TEXT NOT NULL,
    data          TEXT NOT NULL,
    notes         TEXT NOT NULL DEFAULT '',
    status        TEXT NOT NULL DEFAULT 'taslak'
                  CHECK (status IN ('taslak','gonderildi','incelendi','onaylandi','revizyon')),
    technician_id INTEGER NOT NULL REFERENCES users(id),
    manager_note  TEXT NOT NULL DEFAULT '',
    reviewed_by   INTEGER REFERENCES users(id),
    reviewed_at   TEXT,
    submitted_at  TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS attachments (
    id         INTEGER PRIMARY KEY,
    report_id  INTEGER NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    filename   TEXT NOT NULL,
    stored     TEXT NOT NULL,
    mime       TEXT NOT NULL DEFAULT '',
    size       INTEGER NOT NULL DEFAULT 0,
    kind       TEXT NOT NULL DEFAULT 'dosya',
    caption    TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );

  CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
  CREATE INDEX IF NOT EXISTS idx_reports_tech   ON reports(technician_id);
  CREATE INDEX IF NOT EXISTS idx_att_report     ON attachments(report_id);
`);

/* Şifre */
function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(pw), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}
function verifyPassword(pw, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(String(pw), salt, 64);
  const buf = Buffer.from(hash, 'hex');
  return buf.length === test.length && crypto.timingSafeEqual(buf, test);
}

/* İlk veri */
function seed() {
  const userCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (userCount === 0) {
    const ins = db.prepare('INSERT INTO users (username, name, role, pass_hash) VALUES (?,?,?,?)');
    for (const u of USERS) ins.run(u.username, u.name, u.role, hashPassword(u.password));
    console.log('[seed] İlk kullanıcılar oluşturuldu: ' + USERS.map((u) => `${u.username}/${u.password}`).join(', '));
  }
  const tplCount = db.prepare('SELECT COUNT(*) AS c FROM templates').get().c;
  if (tplCount === 0) {
    const ins = db.prepare('INSERT INTO templates (name, description, category, fields, owner_id, is_default) VALUES (?,?,?,?,NULL,1)');
    for (const t of TEMPLATES) ins.run(t.name, t.description, t.category, JSON.stringify(t.fields));
    console.log(`[seed] ${TEMPLATES.length} hazır şablon yüklendi.`);
  }
}
seed();

/* ----------------------------- Yardımcılar ----------------------------- */

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon', '.mp4': 'video/mp4',
  '.webm': 'video/webm', '.mov': 'video/quicktime', '.m4v': 'video/x-m4v', '.heic': 'image/heic', '.pdf': 'application/pdf',
  '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(payload);
}

function readBody(req, limit = 5 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new HttpError(413, 'İstek çok büyük')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJson(req) {
  const raw = await readBody(req);
  if (!raw.length) return {};
  try { return JSON.parse(raw.toString('utf8')); } catch { throw new HttpError(400, 'Geçersiz JSON'); }
}

function parseCookies(req) {
  const out = {};
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function now() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function publicUser(u) {
  return { id: u.id, username: u.username, name: u.name, role: u.role, active: !!u.active, created_at: u.created_at };
}

function getUser(req) {
  const token = parseCookies(req).sr_token;
  if (!token) return null;
  const row = db.prepare(`SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND u.active = 1`).get(token);
  return row || null;
}

function requireUser(req) {
  const u = getUser(req);
  if (!u) throw new HttpError(401, 'Giriş yapmanız gerekiyor');
  return u;
}

function requireManager(req) {
  const u = requireUser(req);
  if (u.role !== 'mudur') throw new HttpError(403, 'Bu işlem için müdür yetkisi gerekli');
  return u;
}

const FIELD_TYPES = new Set(['section', 'text', 'textarea', 'number', 'date', 'time', 'select', 'checkbox', 'checklist', 'signature']);

function sanitizeFields(fields) {
  if (!Array.isArray(fields)) throw new HttpError(400, 'Alanlar bir liste olmalı');
  const seen = new Set();
  return fields.map((raw, i) => {
    const type = FIELD_TYPES.has(raw.type) ? raw.type : 'text';
    let key = String(raw.key || '').trim().replace(/[^a-z0-9_]/gi, '_').toLowerCase() || `alan_${i + 1}`;
    while (seen.has(key)) key += '_';
    seen.add(key);
    const fld = {
      key,
      label: String(raw.label || '').trim() || `Alan ${i + 1}`,
      type,
      required: !!raw.required,
      placeholder: String(raw.placeholder || '').slice(0, 200),
      help: String(raw.help || '').slice(0, 300),
    };
    if (type === 'select' || type === 'checklist') {
      fld.options = (Array.isArray(raw.options) ? raw.options : String(raw.options || '').split('\n'))
        .map((o) => String(o).trim()).filter(Boolean);
    }
    return fld;
  });
}

function parseRow(row, jsonCols) {
  if (!row) return row;
  const out = { ...row };
  for (const c of jsonCols) {
    try { out[c] = JSON.parse(row[c] || 'null'); } catch { out[c] = null; }
  }
  return out;
}

/* ----------------------------- Canlı olaylar (SSE) ----------------------------- */

const sseClients = new Set();
function broadcast(event, payload, filter = () => true) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const c of sseClients) {
    if (filter(c.user)) { try { c.res.write(msg); } catch { sseClients.delete(c); } }
  }
}
setInterval(() => { for (const c of sseClients) { try { c.res.write(': ping\n\n'); } catch { sseClients.delete(c); } } }, 25000).unref();

/* ----------------------------- Rapor sorguları ----------------------------- */

const REPORT_SELECT = `
  SELECT r.*, u.name AS technician_name, u.username AS technician_username,
         m.name AS reviewer_name,
         (SELECT COUNT(*) FROM attachments a WHERE a.report_id = r.id) AS attachment_count
  FROM reports r
  JOIN users u ON u.id = r.technician_id
  LEFT JOIN users m ON m.id = r.reviewed_by
`;

function loadReport(id, user) {
  const row = db.prepare(`${REPORT_SELECT} WHERE r.id = ?`).get(id);
  if (!row) throw new HttpError(404, 'Rapor bulunamadı');
  if (user.role !== 'mudur' && row.technician_id !== user.id) throw new HttpError(403, 'Bu rapora erişim yetkiniz yok');
  if (user.role === 'mudur' && row.status === 'taslak' && row.technician_id !== user.id) throw new HttpError(403, 'Taslak raporlar gönderilene kadar sadece sahibi görebilir');
  const report = parseRow(row, ['fields', 'data']);
  report.attachments = db.prepare('SELECT * FROM attachments WHERE report_id = ? ORDER BY id').all(id)
    .map((a) => ({ ...a, url: `/uploads/${a.stored}` }));
  return report;
}

function canEditReport(report, user) {
  if (user.role === 'mudur' && report.technician_id !== user.id) return false;
  if (report.technician_id !== user.id) return false;
  return report.status === 'taslak' || report.status === 'revizyon';
}

/* ----------------------------- Yönlendirme ----------------------------- */

const routes = [];
function route(method, pattern, handler) {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
  routes.push({ method, re, keys, handler });
}

/* --- Kimlik --- */

route('POST', '/api/login', async (req, res) => {
  const { username, password } = await readJson(req);
  const u = db.prepare('SELECT * FROM users WHERE username = ?').get(String(username || '').trim().toLowerCase());
  if (!u || !u.active || !verifyPassword(password || '', u.pass_hash)) throw new HttpError(401, 'Kullanıcı adı veya şifre hatalı');
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').run(token, u.id);
  res.setHeader('Set-Cookie', `sr_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 90}`);
  sendJson(res, 200, { user: publicUser(u) });
});

route('POST', '/api/logout', async (req, res) => {
  const token = parseCookies(req).sr_token;
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  res.setHeader('Set-Cookie', 'sr_token=; Path=/; HttpOnly; Max-Age=0');
  sendJson(res, 200, { ok: true });
});

route('GET', '/api/me', async (req, res) => {
  const u = getUser(req);
  sendJson(res, 200, { user: u ? publicUser(u) : null });
});

route('POST', '/api/me/password', async (req, res) => {
  const u = requireUser(req);
  const { current, next } = await readJson(req);
  if (!verifyPassword(current || '', u.pass_hash)) throw new HttpError(400, 'Mevcut şifre hatalı');
  if (!next || String(next).length < 4) throw new HttpError(400, 'Yeni şifre en az 4 karakter olmalı');
  db.prepare('UPDATE users SET pass_hash = ? WHERE id = ?').run(hashPassword(next), u.id);
  sendJson(res, 200, { ok: true });
});

/* --- Kullanıcılar (müdür) --- */

route('GET', '/api/users', async (req, res) => {
  requireManager(req);
  const rows = db.prepare('SELECT * FROM users ORDER BY role, name').all();
  sendJson(res, 200, { users: rows.map(publicUser) });
});

route('POST', '/api/users', async (req, res) => {
  requireManager(req);
  const b = await readJson(req);
  const username = String(b.username || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,30}$/.test(username)) throw new HttpError(400, 'Kullanıcı adı 3-30 karakter, sadece harf/rakam/nokta/tire');
  if (!b.name || !String(b.name).trim()) throw new HttpError(400, 'Ad soyad gerekli');
  if (!b.password || String(b.password).length < 4) throw new HttpError(400, 'Şifre en az 4 karakter olmalı');
  const role = b.role === 'mudur' ? 'mudur' : 'teknisyen';
  try {
    const r = db.prepare('INSERT INTO users (username, name, role, pass_hash) VALUES (?,?,?,?)').run(username, String(b.name).trim(), role, hashPassword(b.password));
    sendJson(res, 201, { user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(r.lastInsertRowid)) });
  } catch (e) {
    if (/UNIQUE/.test(e.message)) throw new HttpError(409, 'Bu kullanıcı adı zaten var');
    throw e;
  }
});

route('PATCH', '/api/users/:id', async (req, res, p) => {
  const me = requireManager(req);
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(p.id));
  if (!u) throw new HttpError(404, 'Kullanıcı bulunamadı');
  const b = await readJson(req);
  const name = b.name !== undefined ? String(b.name).trim() || u.name : u.name;
  const role = b.role === 'mudur' || b.role === 'teknisyen' ? b.role : u.role;
  let active = b.active !== undefined ? (b.active ? 1 : 0) : u.active;
  if (u.id === me.id) { active = 1; }
  if (u.id === me.id && role !== 'mudur') throw new HttpError(400, 'Kendi müdür yetkinizi kaldıramazsınız');
  db.prepare('UPDATE users SET name = ?, role = ?, active = ? WHERE id = ?').run(name, role, active, u.id);
  if (b.password) {
    if (String(b.password).length < 4) throw new HttpError(400, 'Şifre en az 4 karakter olmalı');
    db.prepare('UPDATE users SET pass_hash = ? WHERE id = ?').run(hashPassword(b.password), u.id);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id);
  }
  if (!active) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id);
  sendJson(res, 200, { user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(u.id)) });
});

/* --- Şablonlar --- */

route('GET', '/api/templates', async (req, res) => {
  const u = requireUser(req);
  const rows = u.role === 'mudur'
    ? db.prepare(`SELECT t.*, o.name AS owner_name FROM templates t LEFT JOIN users o ON o.id = t.owner_id ORDER BY t.owner_id IS NOT NULL, t.is_default DESC, t.name`).all()
    : db.prepare(`SELECT t.*, o.name AS owner_name FROM templates t LEFT JOIN users o ON o.id = t.owner_id WHERE t.owner_id IS NULL OR t.owner_id = ? ORDER BY t.owner_id IS NOT NULL, t.is_default DESC, t.name`).all(u.id);
  sendJson(res, 200, { templates: rows.map((r) => parseRow(r, ['fields'])) });
});

route('POST', '/api/templates', async (req, res) => {
  const u = requireUser(req);
  const b = await readJson(req);
  const name = String(b.name || '').trim();
  if (!name) throw new HttpError(400, 'Şablon adı gerekli');
  const fields = sanitizeFields(b.fields || []);
  if (!fields.length) throw new HttpError(400, 'En az bir alan ekleyin');
  // Müdür "firma şablonu" (owner_id NULL) oluşturabilir; teknisyen sadece kendine ait şablon.
  const shared = u.role === 'mudur' && b.shared !== false;
  const r = db.prepare('INSERT INTO templates (name, description, category, fields, owner_id) VALUES (?,?,?,?,?)')
    .run(name, String(b.description || '').trim(), String(b.category || '').trim(), JSON.stringify(fields), shared ? null : u.id);
  sendJson(res, 201, { template: parseRow(db.prepare('SELECT * FROM templates WHERE id = ?').get(r.lastInsertRowid), ['fields']) });
});

route('PUT', '/api/templates/:id', async (req, res, p) => {
  const u = requireUser(req);
  const t = db.prepare('SELECT * FROM templates WHERE id = ?').get(Number(p.id));
  if (!t) throw new HttpError(404, 'Şablon bulunamadı');
  if (u.role !== 'mudur' && t.owner_id !== u.id) throw new HttpError(403, 'Firma şablonlarını sadece müdür değiştirebilir. Kendi kopyanızı oluşturabilirsiniz.');
  const b = await readJson(req);
  const name = String(b.name ?? t.name).trim() || t.name;
  const fields = b.fields ? sanitizeFields(b.fields) : JSON.parse(t.fields);
  if (!fields.length) throw new HttpError(400, 'En az bir alan ekleyin');
  let owner = t.owner_id;
  if (u.role === 'mudur' && b.shared !== undefined) owner = b.shared ? null : (t.owner_id ?? u.id);
  db.prepare(`UPDATE templates SET name = ?, description = ?, category = ?, fields = ?, owner_id = ?, updated_at = ? WHERE id = ?`)
    .run(name, String(b.description ?? t.description).trim(), String(b.category ?? t.category).trim(), JSON.stringify(fields), owner, now(), t.id);
  sendJson(res, 200, { template: parseRow(db.prepare('SELECT * FROM templates WHERE id = ?').get(t.id), ['fields']) });
});

route('DELETE', '/api/templates/:id', async (req, res, p) => {
  const u = requireUser(req);
  const t = db.prepare('SELECT * FROM templates WHERE id = ?').get(Number(p.id));
  if (!t) throw new HttpError(404, 'Şablon bulunamadı');
  if (u.role !== 'mudur' && t.owner_id !== u.id) throw new HttpError(403, 'Bu şablonu silme yetkiniz yok');
  db.prepare('DELETE FROM templates WHERE id = ?').run(t.id);
  sendJson(res, 200, { ok: true });
});

/* --- Raporlar --- */

route('GET', '/api/reports', async (req, res, _p, url) => {
  const u = requireUser(req);
  const status = url.searchParams.get('status') || '';
  const q = (url.searchParams.get('q') || '').trim();
  const where = [];
  const args = [];
  if (u.role === 'mudur') { where.push('(r.status != ? OR r.technician_id = ?)'); args.push('taslak', u.id); }
  else { where.push('r.technician_id = ?'); args.push(u.id); }
  if (status) {
    const list = status.split(',').filter(Boolean);
    where.push(`r.status IN (${list.map(() => '?').join(',')})`); args.push(...list);
  }
  if (q) {
    where.push('(r.title LIKE ? OR r.customer LIKE ? OR r.address LIKE ? OR u.name LIKE ? OR r.template_name LIKE ?)');
    for (let i = 0; i < 5; i++) args.push(`%${q}%`);
  }
  const rows = db.prepare(`${REPORT_SELECT} WHERE ${where.join(' AND ')} ORDER BY COALESCE(r.submitted_at, r.updated_at) DESC, r.id DESC LIMIT 500`).all(...args);
  sendJson(res, 200, { reports: rows.map((r) => { const o = parseRow(r, []); delete o.fields; delete o.data; return o; }) });
});

route('GET', '/api/stats', async (req, res) => {
  const u = requireUser(req);
  const mine = u.role !== 'mudur';
  const base = mine ? 'WHERE technician_id = ?' : "WHERE status != 'taslak'";
  const args = mine ? [u.id] : [];
  const byStatus = db.prepare(`SELECT status, COUNT(*) AS c FROM reports ${base} GROUP BY status`).all(...args);
  const today = db.prepare(`SELECT COUNT(*) AS c FROM reports ${base} AND date(COALESCE(submitted_at, created_at)) = date('now','localtime')`).get(...args).c;
  const week = db.prepare(`SELECT COUNT(*) AS c FROM reports ${base} AND date(COALESCE(submitted_at, created_at)) >= date('now','localtime','-6 days')`).get(...args).c;
  const stats = { taslak: 0, gonderildi: 0, incelendi: 0, onaylandi: 0, revizyon: 0 };
  for (const r of byStatus) stats[r.status] = r.c;
  const topTech = mine ? [] : db.prepare(`SELECT u.name, COUNT(*) AS c FROM reports r JOIN users u ON u.id = r.technician_id WHERE r.status != 'taslak' AND date(COALESCE(r.submitted_at, r.created_at)) >= date('now','localtime','-29 days') GROUP BY u.id ORDER BY c DESC LIMIT 6`).all();
  sendJson(res, 200, { stats, today, week, topTech });
});

route('POST', '/api/reports', async (req, res) => {
  const u = requireUser(req);
  const b = await readJson(req);
  let fields = [];
  let templateId = null;
  let templateName = '';
  if (b.template_id) {
    const t = db.prepare('SELECT * FROM templates WHERE id = ?').get(Number(b.template_id));
    if (!t) throw new HttpError(404, 'Şablon bulunamadı');
    if (t.owner_id && t.owner_id !== u.id && u.role !== 'mudur') throw new HttpError(403, 'Bu şablonu kullanamazsınız');
    fields = JSON.parse(t.fields);
    templateId = t.id;
    templateName = t.name;
  }
  if (Array.isArray(b.fields)) fields = sanitizeFields(b.fields);
  const title = String(b.title || '').trim() || (templateName || 'Yeni Rapor');
  const r = db.prepare(`INSERT INTO reports (title, customer, address, job_date, template_id, template_name, fields, data, notes, technician_id)
                        VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run(title, String(b.customer || '').trim(), String(b.address || '').trim(), b.job_date || new Date().toISOString().slice(0, 10),
      templateId, templateName || 'Serbest', JSON.stringify(fields), JSON.stringify(b.data && typeof b.data === 'object' ? b.data : {}), String(b.notes || ''), u.id);
  sendJson(res, 201, { report: loadReport(r.lastInsertRowid, u) });
});

route('GET', '/api/reports/:id', async (req, res, p) => {
  const u = requireUser(req);
  sendJson(res, 200, { report: loadReport(Number(p.id), u) });
});

route('PUT', '/api/reports/:id', async (req, res, p) => {
  const u = requireUser(req);
  const r = loadReport(Number(p.id), u);
  if (!canEditReport(r, u)) throw new HttpError(403, 'Gönderilmiş rapor düzenlenemez. Müdür revizyon isterse yeniden açılır.');
  const b = await readJson(req);
  const fields = Array.isArray(b.fields) ? sanitizeFields(b.fields) : r.fields;
  const data = b.data && typeof b.data === 'object' ? b.data : r.data;
  db.prepare(`UPDATE reports SET title = ?, customer = ?, address = ?, job_date = ?, fields = ?, data = ?, notes = ?, updated_at = ? WHERE id = ?`)
    .run(String(b.title ?? r.title).trim() || r.title, String(b.customer ?? r.customer).trim(), String(b.address ?? r.address).trim(),
      b.job_date ?? r.job_date, JSON.stringify(fields), JSON.stringify(data), String(b.notes ?? r.notes), now(), r.id);
  sendJson(res, 200, { report: loadReport(r.id, u) });
});

route('POST', '/api/reports/:id/submit', async (req, res, p) => {
  const u = requireUser(req);
  const r = loadReport(Number(p.id), u);
  if (!canEditReport(r, u)) throw new HttpError(403, 'Bu rapor zaten gönderilmiş');
  const missing = r.fields.filter((f) => f.required && f.type !== 'section').filter((f) => {
    const v = r.data[f.key];
    if (f.type === 'checklist') return !Array.isArray(v) || !v.length;
    if (f.type === 'checkbox') return !v;
    return v === undefined || v === null || String(v).trim() === '';
  });
  if (missing.length) throw new HttpError(400, 'Zorunlu alanlar boş: ' + missing.map((f) => f.label).join(', '));
  const ts = now();
  db.prepare(`UPDATE reports SET status = 'gonderildi', submitted_at = ?, updated_at = ?, manager_note = '', reviewed_by = NULL, reviewed_at = NULL WHERE id = ?`).run(ts, ts, r.id);
  const report = loadReport(r.id, u);
  broadcast('report.submitted', {
    id: report.id, title: report.title, technician_name: report.technician_name, customer: report.customer,
    submitted_at: report.submitted_at, attachment_count: report.attachments.length,
  }, (usr) => usr.role === 'mudur');
  sendJson(res, 200, { report });
});

route('POST', '/api/reports/:id/review', async (req, res, p) => {
  const m = requireManager(req);
  const r = loadReport(Number(p.id), m);
  if (r.status === 'taslak') throw new HttpError(400, 'Taslak rapor incelenemez');
  const b = await readJson(req);
  const status = ['incelendi', 'onaylandi', 'revizyon'].includes(b.status) ? b.status : null;
  if (!status) throw new HttpError(400, 'Geçersiz durum');
  const note = String(b.note || '').trim();
  if (status === 'revizyon' && !note) throw new HttpError(400, 'Revizyon isterken teknisyene bir not yazın');
  const ts = now();
  db.prepare('UPDATE reports SET status = ?, manager_note = ?, reviewed_by = ?, reviewed_at = ?, updated_at = ? WHERE id = ?').run(status, note, m.id, ts, ts, r.id);
  const report = loadReport(r.id, m);
  broadcast('report.reviewed', { id: report.id, title: report.title, status, note, reviewer_name: m.name }, (usr) => usr.id === report.technician_id);
  sendJson(res, 200, { report });
});

route('DELETE', '/api/reports/:id', async (req, res, p) => {
  const u = requireUser(req);
  const r = loadReport(Number(p.id), u);
  const own = r.technician_id === u.id && (r.status === 'taslak' || r.status === 'revizyon');
  if (!own && u.role !== 'mudur') throw new HttpError(403, 'Sadece taslak raporlarınızı silebilirsiniz');
  for (const a of r.attachments) { try { fs.unlinkSync(path.join(UPLOAD_DIR, a.stored)); } catch { /* yok say */ } }
  db.prepare('DELETE FROM reports WHERE id = ?').run(r.id);
  sendJson(res, 200, { ok: true });
});

/* --- Ekler (fotoğraf / video) --- */

const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif', '.mp4', '.webm', '.mov', '.m4v', '.3gp', '.pdf']);

route('POST', '/api/reports/:id/attachments', async (req, res, p) => {
  const u = requireUser(req);
  const r = loadReport(Number(p.id), u);
  if (!canEditReport(r, u)) throw new HttpError(403, 'Gönderilmiş rapora ek eklenemez');
  const filename = decodeURIComponent(req.headers['x-filename'] || 'dosya').replace(/[\\/]/g, '_').slice(0, 180);
  const mime = String(req.headers['content-type'] || 'application/octet-stream').split(';')[0].trim();
  let ext = path.extname(filename).toLowerCase();
  if (!ext) ext = mime.startsWith('video/') ? '.mp4' : mime.startsWith('image/') ? '.jpg' : '';
  if (!ALLOWED_EXT.has(ext)) throw new HttpError(400, 'Sadece fotoğraf, video veya PDF yüklenebilir');
  const kind = mime.startsWith('video/') || ['.mp4', '.webm', '.mov', '.m4v', '.3gp'].includes(ext) ? 'video' : mime.startsWith('image/') || ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif'].includes(ext) ? 'foto' : 'dosya';
  const declared = Number(req.headers['content-length'] || 0);
  if (declared > MAX_UPLOAD) throw new HttpError(413, `Dosya çok büyük (en fazla ${Math.round(MAX_UPLOAD / 1024 / 1024)} MB)`);

  const stored = `${r.id}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`;
  const dest = path.join(UPLOAD_DIR, stored);
  const size = await new Promise((resolve, reject) => {
    let total = 0;
    const ws = fs.createWriteStream(dest);
    req.on('data', (c) => { total += c.length; if (total > MAX_UPLOAD) { ws.destroy(); req.destroy(); reject(new HttpError(413, 'Dosya çok büyük')); } });
    req.on('error', reject);
    ws.on('error', reject);
    ws.on('finish', () => resolve(total));
    req.pipe(ws);
  }).catch((e) => { try { fs.unlinkSync(dest); } catch { /* yok say */ } throw e; });

  const ins = db.prepare('INSERT INTO attachments (report_id, filename, stored, mime, size, kind, caption) VALUES (?,?,?,?,?,?,?)')
    .run(r.id, filename, stored, mime, size, kind, '');
  db.prepare('UPDATE reports SET updated_at = ? WHERE id = ?').run(now(), r.id);
  const a = db.prepare('SELECT * FROM attachments WHERE id = ?').get(ins.lastInsertRowid);
  sendJson(res, 201, { attachment: { ...a, url: `/uploads/${a.stored}` } });
});

route('PATCH', '/api/attachments/:id', async (req, res, p) => {
  const u = requireUser(req);
  const a = db.prepare('SELECT * FROM attachments WHERE id = ?').get(Number(p.id));
  if (!a) throw new HttpError(404, 'Ek bulunamadı');
  const r = loadReport(a.report_id, u);
  if (!canEditReport(r, u)) throw new HttpError(403, 'Gönderilmiş rapor düzenlenemez');
  const b = await readJson(req);
  db.prepare('UPDATE attachments SET caption = ? WHERE id = ?').run(String(b.caption || '').slice(0, 300), a.id);
  sendJson(res, 200, { ok: true });
});

route('DELETE', '/api/attachments/:id', async (req, res, p) => {
  const u = requireUser(req);
  const a = db.prepare('SELECT * FROM attachments WHERE id = ?').get(Number(p.id));
  if (!a) throw new HttpError(404, 'Ek bulunamadı');
  const r = loadReport(a.report_id, u);
  if (!canEditReport(r, u) && u.role !== 'mudur') throw new HttpError(403, 'Gönderilmiş rapordan ek silinemez');
  db.prepare('DELETE FROM attachments WHERE id = ?').run(a.id);
  try { fs.unlinkSync(path.join(UPLOAD_DIR, a.stored)); } catch { /* yok say */ }
  sendJson(res, 200, { ok: true });
});

/* --- Canlı olay akışı --- */

route('GET', '/api/events', async (req, res) => {
  const u = requireUser(req);
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.write(`event: hello\ndata: ${JSON.stringify({ user: publicUser(u) })}\n\n`);
  const client = { res, user: publicUser(u) };
  sseClients.add(client);
  req.on('close', () => sseClients.delete(client));
});

/* ----------------------------- Statik dosyalar ----------------------------- */

function serveFile(res, filePath, extraHeaders = {}) {
  fs.stat(filePath, (err, st) => {
    if (err || !st.isFile()) { sendJson(res, 404, { error: 'Bulunamadı' }); return; }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Content-Length': st.size, ...extraHeaders });
    fs.createReadStream(filePath).pipe(res);
  });
}

function serveRange(req, res, filePath) {
  // Video oynatma için Range desteği
  fs.stat(filePath, (err, st) => {
    if (err || !st.isFile()) { sendJson(res, 404, { error: 'Bulunamadı' }); return; }
    const ext = path.extname(filePath).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    const range = req.headers.range;
    if (!range) {
      res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, max-age=86400' });
      fs.createReadStream(filePath).pipe(res);
      return;
    }
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    let start = m && m[1] ? Number(m[1]) : 0;
    let end = m && m[2] ? Number(m[2]) : st.size - 1;
    if (start >= st.size) { res.writeHead(416, { 'Content-Range': `bytes */${st.size}` }); res.end(); return; }
    end = Math.min(end, st.size - 1);
    res.writeHead(206, { 'Content-Type': type, 'Content-Length': end - start + 1, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Accept-Ranges': 'bytes' });
    fs.createReadStream(filePath, { start, end }).pipe(res);
  });
}

/* ----------------------------- Sunucu ----------------------------- */

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;
  try {
    if (pathname.startsWith('/api/')) {
      for (const r of routes) {
        if (r.method !== req.method) continue;
        const m = r.re.exec(pathname);
        if (!m) continue;
        const params = {};
        r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
        await r.handler(req, res, params, url);
        return;
      }
      sendJson(res, 404, { error: 'API yolu bulunamadı' });
      return;
    }

    if (pathname.startsWith('/uploads/')) {
      if (!getUser(req)) { sendJson(res, 401, { error: 'Giriş gerekli' }); return; }
      const name = path.basename(pathname);
      serveRange(req, res, path.join(UPLOAD_DIR, name));
      return;
    }

    // Statik: public/
    let rel = pathname === '/' ? '/index.html' : pathname;
    const safe = path.normalize(rel).replace(/^(\.\.[/\\])+/, '');
    const filePath = path.join(PUBLIC_DIR, safe);
    if (!filePath.startsWith(PUBLIC_DIR)) { sendJson(res, 403, { error: 'Yasak' }); return; }
    fs.stat(filePath, (err, st) => {
      if (err || !st.isFile()) serveFile(res, path.join(PUBLIC_DIR, 'index.html'), { 'Cache-Control': 'no-cache' });
      else serveFile(res, filePath, { 'Cache-Control': safe.endsWith('.html') ? 'no-cache' : 'public, max-age=3600' });
    });
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    if (status === 500) console.error(e);
    if (!res.headersSent) sendJson(res, status, { error: e.message || 'Sunucu hatası' });
    else res.end();
  }
});

server.listen(PORT, () => {
  console.log(`Saha Rapor çalışıyor: http://localhost:${PORT}`);
});
