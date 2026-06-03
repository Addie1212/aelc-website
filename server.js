const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const express = require('express');
const fs = require('fs');
const fsp = require('fs/promises');
const multer = require('multer');
const path = require('path');
const session = require('express-session');

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const ADMIN_USER_FILE = path.join(DATA_DIR, 'admin-user.json');
const SESSION_SECRET_FILE = path.join(DATA_DIR, 'session-secret.txt');
const LEADS_FILE = path.join(DATA_DIR, 'leads.json');
const PHOTOS_DIR = path.join(ROOT, 'photos');
const BACKUP_DIR = path.join(ROOT, 'backups');

const IMAGE_AND_VIDEO_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/webm',
  'video/quicktime'
]);

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function jsonForScript(value) {
  return JSON.stringify(value)
    .replaceAll('&', '\\u0026')
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e');
}

function titleFromFile(file) {
  return file
    .replace(/\.html$/i, '')
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function safeHtmlFile(file) {
  const basename = path.basename(file || '');
  if (!/^[a-z0-9][a-z0-9-]*\.html$/i.test(basename)) {
    return null;
  }
  return basename;
}

function safeCategory(category) {
  const clean = slugify(category);
  return clean || 'uploads';
}

function categoriesFromMedia(media) {
  return [...new Set(media.map((item) => item.path.split('/')[1]).filter(Boolean))].sort();
}

function page(title, body, options = {}) {
  const active = options.active || '';
  const nav = hasAdminUserSync()
    ? `<nav class="topbar">
        <a class="brand" href="/admin">AELC Admin</a>
        <div class="navlinks">
          <a class="${active === 'dashboard' ? 'active' : ''}" href="/admin">Dashboard</a>
          <a class="${active === 'pages' ? 'active' : ''}" href="/admin/pages">Pages</a>
          <a class="${active === 'media' ? 'active' : ''}" href="/admin/media">Media</a>
          <a class="${active === 'leads' ? 'active' : ''}" href="/admin/leads">Leads</a>
          <a href="/" target="_blank" rel="noreferrer">View Site</a>
          <form method="post" action="/admin/logout"><button type="submit">Logout</button></form>
        </div>
      </nav>`
    : '';

  return `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>${escapeHtml(title)} - AELC Admin</title>
      <link rel="stylesheet" href="/admin-assets/admin.css">
    </head>
    <body>
      ${nav}
      <main class="shell">${body}</main>
      <script src="/admin-assets/admin.js"></script>
    </body>
  </html>`;
}

function hasAdminUserSync() {
  return fs.existsSync(ADMIN_USER_FILE);
}

async function ensureFolders() {
  await fsp.mkdir(DATA_DIR, { recursive: true });
  await fsp.mkdir(PHOTOS_DIR, { recursive: true });
  await fsp.mkdir(BACKUP_DIR, { recursive: true });
}

async function getSessionSecret() {
  await ensureFolders();
  if (fs.existsSync(SESSION_SECRET_FILE)) {
    return fsp.readFile(SESSION_SECRET_FILE, 'utf8');
  }
  const secret = crypto.randomBytes(48).toString('hex');
  await fsp.writeFile(SESSION_SECRET_FILE, secret, 'utf8');
  return secret;
}

async function readAdminUser() {
  try {
    return JSON.parse(await fsp.readFile(ADMIN_USER_FILE, 'utf8'));
  } catch {
    return null;
  }
}

async function readLeads() {
  try {
    return JSON.parse(await fsp.readFile(LEADS_FILE, 'utf8'));
  } catch {
    return [];
  }
}

async function writeLeads(leads) {
  await fsp.writeFile(LEADS_FILE, JSON.stringify(leads, null, 2), 'utf8');
}

async function listHtmlPages() {
  const files = await fsp.readdir(ROOT, { withFileTypes: true });
  return files
    .filter((entry) => entry.isFile() && entry.name.endsWith('.html'))
    .map((entry) => ({
      file: entry.name,
      title: titleFromFile(entry.name)
    }))
    .sort((a, b) => a.title.localeCompare(b.title));
}

async function walkMedia(dir = PHOTOS_DIR, base = 'photos') {
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  const items = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relative = `${base}/${entry.name}`.replaceAll('\\', '/');
    if (entry.isDirectory()) {
      items.push(...await walkMedia(fullPath, relative));
    } else if (/\.(jpe?g|png|webp|gif|mp4|webm|mov)$/i.test(entry.name)) {
      const stat = await fsp.stat(fullPath);
      items.push({
        name: entry.name,
        path: relative,
        type: /\.(mp4|webm|mov)$/i.test(entry.name) ? 'video' : 'image',
        size: stat.size,
        updatedAt: stat.mtime
      });
    }
  }
  return items.sort((a, b) => b.updatedAt - a.updatedAt);
}

function requireSetup(req, res, next) {
  if (!hasAdminUserSync() && req.path !== '/admin/setup') {
    return res.redirect('/admin/setup');
  }
  next();
}

function requireLogin(req, res, next) {
  if (req.session && req.session.admin) {
    return next();
  }
  return res.redirect('/admin/login');
}

function notice(req) {
  const message = req.session.notice;
  delete req.session.notice;
  return message ? `<div class="notice">${escapeHtml(message)}</div>` : '';
}

function authForm(mode, message = '') {
  const isSetup = mode === 'setup';
  return page(isSetup ? 'Create Admin' : 'Login', `
    <section class="auth-panel">
      <div>
        <p class="eyebrow">${isSetup ? 'First time setup' : 'Protected area'}</p>
        <h1>${isSetup ? 'Create your admin login' : 'Login to manage your website'}</h1>
        <p class="muted">${isSetup
          ? 'Choose a private username and strong password. This account will control page edits and media uploads.'
          : 'Use the admin account created during setup.'}</p>
      </div>
      ${message ? `<div class="error">${escapeHtml(message)}</div>` : ''}
      <form method="post" class="stacked-form">
        <label>Username
          <input name="username" autocomplete="username" required minlength="3">
        </label>
        <label>Password
          <input name="password" type="password" autocomplete="${isSetup ? 'new-password' : 'current-password'}" required minlength="8">
        </label>
        <button class="primary" type="submit">${isSetup ? 'Create Admin' : 'Login'}</button>
      </form>
    </section>
  `);
}

function dashboardView(req, pages, media, leads) {
  const newLeads = leads.filter(l => !l.read).length;
  return page('Dashboard', `
    ${notice(req)}
    <section class="hero">
      <div>
        <p class="eyebrow">Website control panel</p>
        <h1>Update pages and pictures without opening the code editor.</h1>
        <p>Manage the static site through a local backend, with login protection, automatic backups, and upload folders for photos and videos.</p>
      </div>
      <div class="stats">
        <div><strong>${pages.length}</strong><span>Pages</span></div>
        <div><strong>${media.length}</strong><span>Media files</span></div>
        <div><strong style="color:var(--accent)">${leads.length}</strong><span>Total Leads</span></div>
        <div><strong style="color:#e85d04">${newLeads}</strong><span>New Leads</span></div>
      </div>
    </section>
    <section class="actions-grid">
      <a class="action-card" href="/admin/pages">
        <span>Edit Pages</span>
        <p>Open any website page, update HTML, insert uploaded media, preview, and save.</p>
      </a>
      <a class="action-card" href="/admin/media">
        <span>Add Pictures</span>
        <p>Upload photos or videos into organized folders under the existing photos directory.</p>
      </a>
      <a class="action-card leads-card" href="/admin/leads">
        <span>View Leads ${newLeads > 0 ? `<span class="badge-new">${newLeads} new</span>` : ''}</span>
        <p>See every enquiry submitted through the website contact form, sorted newest first.</p>
      </a>
    </section>
  `, { active: 'dashboard' });
}

function pagesView(req, pages) {
  return page('Pages', `
    ${notice(req)}
    <section class="section-head">
      <div>
        <p class="eyebrow">Pages</p>
        <h1>Edit website pages</h1>
      </div>
    </section>
    <div class="table-list">
      ${pages.map((item) => `
        <a class="row-link" href="/admin/pages/${encodeURIComponent(item.file)}">
          <span>${escapeHtml(item.title)}</span>
          <code>${escapeHtml(item.file)}</code>
        </a>
      `).join('')}
    </div>
  `, { active: 'pages' });
}

function editorView(req, file, html, media) {
  const categories = categoriesFromMedia(media);
  const uploadDefault = categories.includes('activities') ? 'activities' : categories[0] || 'activities';

  return page(`Edit ${file}`, `
    ${notice(req)}
    <section class="section-head split">
      <div>
        <p class="eyebrow">Editing</p>
        <h1>${escapeHtml(titleFromFile(file))}</h1>
        <code>${escapeHtml(file)}</code>
      </div>
      <div class="button-row">
        <a class="button ghost" href="/${encodeURIComponent(file)}" target="_blank" rel="noreferrer">Open Live Page</a>
        <a class="button ghost" href="/admin/pages">Back</a>
      </div>
    </section>
    <form method="post" id="visual-editor-form" class="visual-editor-form">
      <input type="hidden" name="html" id="html-editor" value="">
      <textarea id="html-source" hidden>${escapeHtml(html)}</textarea>
      <div class="builder-layout">
        <section class="canvas-panel">
          <div class="builder-toolbar">
            <div>
              <strong>Visual page editor</strong>
              <span>Click anything on the page to edit, replace, duplicate, or delete it.</span>
            </div>
            <div class="button-row">
              <button type="button" class="button ghost" id="add-text-block">Add Text</button>
              <button type="button" class="button ghost" id="duplicate-element" disabled>Duplicate</button>
              <button type="button" class="button danger" id="delete-element" disabled>Delete</button>
              <button class="primary" type="submit">Save Changes</button>
            </div>
          </div>
          <iframe id="visual-page-frame" title="Visual page editor"></iframe>
        </section>
        <aside class="inspector-panel">
          <section class="inspector-card">
            <p class="eyebrow">Selected element</p>
            <h2 id="selected-label">Nothing selected</h2>
            <p class="selection-help" id="selection-help">Click any visible part of the page, or choose an item from the element list below.</p>
            <label>Text / Price / Heading
              <textarea id="selected-text" class="small-textarea" disabled placeholder="Click text on the page, then edit it here."></textarea>
            </label>
            <label>Link URL
              <input id="selected-link" disabled placeholder="Only appears when a link is selected">
            </label>
            <label>Image Alt Text
              <input id="selected-alt" disabled placeholder="Only appears when an image is selected">
            </label>
            <label>Media Source
              <input id="selected-source" disabled placeholder="Select an image or video">
            </label>
          </section>

          <section class="inspector-card element-browser">
            <div class="section-head compact">
              <div>
                <p class="eyebrow">Page elements</p>
                <h2>Select anything</h2>
              </div>
            </div>
            <div class="element-filter-row">
              <button type="button" class="button ghost active-filter" data-element-filter="all">All</button>
              <button type="button" class="button ghost" data-element-filter="text">Text & Prices</button>
              <button type="button" class="button ghost" data-element-filter="media">Images</button>
            </div>
            <input id="element-search" placeholder="Search text, price, image, section">
            <div id="page-element-list" class="page-element-list"></div>
          </section>

          <section class="inspector-card">
            <p class="eyebrow">Upload media</p>
            <div id="quick-upload-form">
              <label>Folder / Category
                <input name="category" id="quick-upload-category" list="media-categories" value="${escapeHtml(uploadDefault)}" required>
              </label>
              <datalist id="media-categories">
                ${categories.map((category) => `<option value="${escapeHtml(category)}"></option>`).join('')}
                <option value="activities"></option>
                <option value="achievement"></option>
                <option value="art"></option>
                <option value="birthday"></option>
                <option value="classroom"></option>
                <option value="graduation"></option>
                <option value="music"></option>
              </datalist>
              <label>Pictures or Videos
                <input name="media" type="file" accept="image/*,video/*" multiple required>
              </label>
              <button class="primary" type="button" id="quick-upload-button">Upload To Folder</button>
              <p class="muted" id="upload-status"></p>
            </div>
          </section>

          <section class="inspector-card media-browser">
            <div class="section-head compact">
              <div>
                <p class="eyebrow">Media library</p>
                <h2>Choose by category</h2>
              </div>
            </div>
            <label>Show folder
              <select id="media-category-filter">
                <option value="all">All folders</option>
                ${categories.map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join('')}
              </select>
            </label>
            <div class="button-row media-actions">
              <button type="button" class="button ghost" id="replace-with-media" disabled>Replace Selected</button>
              <button type="button" class="button ghost" id="insert-media-after" disabled>Insert After Selected</button>
            </div>
            <div class="media-chip-grid" id="visual-media-list"></div>
          </section>
        </aside>
      </div>
    </form>
    <script type="application/json" id="media-data">${jsonForScript(media)}</script>
  `, { active: 'pages' });
}

function leadsView(req, leads) {
  const rows = leads.length === 0
    ? `<p class="muted" style="padding:28px">No enquiries yet. When visitors fill the contact form on the website, submissions will appear here.</p>`
    : leads.map((lead, i) => `
      <div class="lead-card ${lead.read ? '' : 'lead-new'}">
        <div class="lead-meta">
          <span class="lead-badge">${lead.read ? 'Seen' : '🔔 New'}</span>
          <span class="lead-time">${new Date(lead.submittedAt).toLocaleString('en-IN', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })}</span>
        </div>
        <div class="lead-body">
          <div class="lead-field"><span>Name</span><strong>${escapeHtml(lead.name)}</strong></div>
          <div class="lead-field"><span>Phone</span><a href="tel:${escapeHtml(lead.phone)}">${escapeHtml(lead.phone)}</a></div>
          ${lead.email ? `<div class="lead-field"><span>Email</span><a href="mailto:${escapeHtml(lead.email)}">${escapeHtml(lead.email)}</a></div>` : ''}
          <div class="lead-field"><span>Child Age</span><strong>${escapeHtml(lead.childAge || '—')}</strong></div>
          <div class="lead-field"><span>Program</span><strong>${escapeHtml(lead.program || '—')}</strong></div>
          ${lead.message ? `<div class="lead-field lead-field-full"><span>Message</span><strong>${escapeHtml(lead.message)}</strong></div>` : ''}
        </div>
        <div class="lead-actions">
          ${!lead.read ? `<form method="post" action="/admin/leads/${lead.id}/read"><button class="primary" type="submit">Mark Read</button></form>` : ''}
          <form method="post" action="/admin/leads/${lead.id}/delete" onsubmit="return confirm('Delete this lead?')">
            <button class="button danger" type="submit">Delete</button>
          </form>
        </div>
      </div>
    `).join('');

  return page('Leads', `
    ${notice(req)}
    <section class="section-head split">
      <div>
        <p class="eyebrow">Enquiries</p>
        <h1>Website leads &amp; enquiries</h1>
      </div>
    </section>
    <div class="leads-list">${rows}</div>
  `, { active: 'leads' });
}

function mediaView(req, media, categories) {
  return page('Media', `
    ${notice(req)}
    <section class="section-head split">
      <div>
        <p class="eyebrow">Media library</p>
        <h1>Add pictures and videos</h1>
      </div>
    </section>
    <form method="post" action="/admin/media/upload" enctype="multipart/form-data" class="upload-panel">
      <label>Folder
        <input name="category" list="media-categories" placeholder="activities" value="uploads" required>
        <datalist id="media-categories">
          ${categories.map((category) => `<option value="${escapeHtml(category)}"></option>`).join('')}
        </datalist>
      </label>
      <label>Choose files
        <input name="media" type="file" accept="image/*,video/*" multiple required>
      </label>
      <button class="primary" type="submit">Upload</button>
    </form>
    <div class="media-grid">
      ${media.map((item) => `
        <article class="media-card">
          <div class="thumb">
            ${item.type === 'image'
              ? `<img src="/${escapeHtml(item.path)}" alt="${escapeHtml(item.name)}">`
              : `<video src="/${escapeHtml(item.path)}" controls muted></video>`}
          </div>
          <div>
            <strong>${escapeHtml(item.name)}</strong>
            <code>${escapeHtml(item.path)}</code>
          </div>
        </article>
      `).join('') || '<p class="muted">No media files found yet.</p>'}
    </div>
  `, { active: 'media' });
}

const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      const target = path.join(PHOTOS_DIR, safeCategory(req.body.category));
      await fsp.mkdir(target, { recursive: true });
      cb(null, target);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const parsed = path.parse(file.originalname);
    const ext = parsed.ext.toLowerCase();
    const base = slugify(parsed.name) || 'media';
    cb(null, `${Date.now()}-${base}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 150 * 1024 * 1024, files: 20 },
  fileFilter: (req, file, cb) => {
    if (!IMAGE_AND_VIDEO_TYPES.has(file.mimetype)) {
      return cb(new Error('Only image and video uploads are allowed.'));
    }
    cb(null, true);
  }
});

async function start() {
  await ensureFolders();

  app.disable('x-powered-by');
  app.use(express.urlencoded({ extended: true, limit: '15mb' }));
  app.use(express.json({ limit: '15mb' }));
  app.use(session({
    name: 'aelc_admin',
    secret: await getSessionSecret(),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      maxAge: 1000 * 60 * 60 * 8
    }
  }));

  app.use('/admin-assets', express.static(path.join(ROOT, 'admin-assets')));
  app.use('/photos', express.static(PHOTOS_DIR));

  app.get('/admin/setup', async (req, res) => {
    if (hasAdminUserSync()) return res.redirect('/admin/login');
    res.send(authForm('setup'));
  });

  app.post('/admin/setup', async (req, res) => {
    if (hasAdminUserSync()) return res.redirect('/admin/login');
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '');
    if (username.length < 3 || password.length < 8) {
      return res.status(400).send(authForm('setup', 'Username must be at least 3 characters and password at least 8 characters.'));
    }
    const passwordHash = await bcrypt.hash(password, 12);
    await fsp.writeFile(ADMIN_USER_FILE, JSON.stringify({ username, passwordHash, createdAt: new Date().toISOString() }, null, 2), 'utf8');
    req.session.admin = { username };
    req.session.notice = 'Admin account created.';
    res.redirect('/admin');
  });

  app.use('/admin', requireSetup);

  app.get('/admin/login', (req, res) => {
    if (req.session.admin) return res.redirect('/admin');
    res.send(authForm('login'));
  });

  app.post('/admin/login', async (req, res) => {
    const user = await readAdminUser();
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '');
    if (!user || user.username !== username || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).send(authForm('login', 'Invalid username or password.'));
    }
    req.session.regenerate((error) => {
      if (error) return res.status(500).send('Unable to start session.');
      req.session.admin = { username: user.username };
      res.redirect('/admin');
    });
  });

  app.post('/admin/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/admin/login'));
  });

  app.get('/admin', requireLogin, async (req, res) => {
    const [pages, media, leads] = await Promise.all([listHtmlPages(), walkMedia(), readLeads()]);
    res.send(dashboardView(req, pages, media, leads));
  });

  // ── Leads routes ──────────────────────────────────────────────
  app.get('/admin/leads', requireLogin, async (req, res) => {
    const leads = await readLeads();
    res.send(leadsView(req, leads));
  });

  app.post('/admin/leads/:id/read', requireLogin, async (req, res) => {
    const leads = await readLeads();
    const lead = leads.find(l => l.id === req.params.id);
    if (lead) lead.read = true;
    await writeLeads(leads);
    req.session.notice = 'Lead marked as read.';
    res.redirect('/admin/leads');
  });

  app.post('/admin/leads/:id/delete', requireLogin, async (req, res) => {
    const leads = await readLeads();
    await writeLeads(leads.filter(l => l.id !== req.params.id));
    req.session.notice = 'Lead deleted.';
    res.redirect('/admin/leads');
  });

  // Public contact form submission endpoint
  app.post('/api/contact', async (req, res) => {
    const name = String(req.body.name || '').trim();
    const phone = String(req.body.phone || '').trim();
    const email = String(req.body.email || '').trim();
    const childAge = String(req.body.childAge || '').trim();
    const program = String(req.body.program || '').trim();
    const message = String(req.body.message || '').trim();

    if (!name || !phone) {
      return res.status(400).json({ ok: false, error: 'Name and phone are required.' });
    }

    const leads = await readLeads();
    leads.unshift({
      id: crypto.randomUUID(),
      name, phone, email, childAge, program, message,
      submittedAt: new Date().toISOString(),
      read: false
    });
    await writeLeads(leads);
    res.json({ ok: true });
  });

  app.get('/admin/pages', requireLogin, async (req, res) => {
    res.send(pagesView(req, await listHtmlPages()));
  });

  app.get('/admin/pages/:file', requireLogin, async (req, res) => {
    const file = safeHtmlFile(req.params.file);
    if (!file) return res.status(404).send('Page not found.');
    const fullPath = path.join(ROOT, file);
    if (!fs.existsSync(fullPath)) return res.status(404).send('Page not found.');
    const [html, media] = await Promise.all([
      fsp.readFile(fullPath, 'utf8'),
      walkMedia()
    ]);
    res.send(editorView(req, file, html, media));
  });

  app.post('/admin/pages/:file', requireLogin, async (req, res) => {
    const file = safeHtmlFile(req.params.file);
    if (!file) return res.status(404).send('Page not found.');
    const fullPath = path.join(ROOT, file);
    if (!fs.existsSync(fullPath)) return res.status(404).send('Page not found.');
    const nextHtml = String(req.body.html || '');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    await fsp.copyFile(fullPath, path.join(BACKUP_DIR, `${file}.${timestamp}.bak`));
    await fsp.writeFile(fullPath, nextHtml, 'utf8');
    req.session.notice = `${file} saved. A backup copy was created first.`;
    res.redirect(`/admin/pages/${encodeURIComponent(file)}`);
  });

  app.get('/admin/media', requireLogin, async (req, res) => {
    const media = await walkMedia();
    const categories = categoriesFromMedia(media);
    res.send(mediaView(req, media, categories));
  });

  app.post('/admin/media/upload', requireLogin, upload.array('media', 20), (req, res) => {
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      return walkMedia().then((media) => {
        res.json({
          uploaded: req.files.map((file) => file.filename),
          media,
          categories: categoriesFromMedia(media)
        });
      });
    }
    req.session.notice = `${req.files.length} file${req.files.length === 1 ? '' : 's'} uploaded.`;
    res.redirect('/admin/media');
  });

  app.get('/admin/api/media', requireLogin, async (req, res) => {
    const media = await walkMedia();
    res.json({ media, categories: categoriesFromMedia(media) });
  });

  app.get('/api/gallery-videos', async (req, res) => {
    const media = await walkMedia();
    const videos = media.filter((item) => item.type === 'video').map((item) => item.path);
    res.json({ videos });
  });

  app.get('/api/gallery-media', async (req, res) => {
    const media = await walkMedia();
    res.json({ media });
  });

  app.get('/', (req, res) => {
    res.sendFile(path.join(ROOT, 'index.html'));
  });

  app.get('/:file', (req, res, next) => {
    const file = safeHtmlFile(req.params.file);
    if (!file) return next();
    const fullPath = path.join(ROOT, file);
    if (!fs.existsSync(fullPath)) return next();
    res.sendFile(fullPath);
  });

  app.use((error, req, res, next) => {
    console.error(error);
    res.status(500).send(page('Error', `
      <section class="auth-panel">
        <h1>Something went wrong</h1>
        <p class="error">${escapeHtml(error.message || 'Unknown error')}</p>
        <a class="button ghost" href="/admin">Back to admin</a>
      </section>
    `));
  });

  app.listen(PORT, () => {
    console.log(`AELC website running at http://localhost:${PORT}`);
    console.log(`Admin panel running at http://localhost:${PORT}/admin`);
  });
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
