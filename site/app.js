import { marked } from './vendor/marked.esm.js';
import { aggregate } from './lib/shopping.mjs';
import { markTried, insertCookLogEntry, writePlan } from './lib/edits.mjs';
import { loadSettings, saveSettings, canWrite, editFile } from './github.mjs';

const $ = (sel) => document.querySelector(sel);
const app = $('#app');

// ---------- data ----------
const data = await fetch('./index.json').then((r) => r.json());
const recipes = data.recipes;
const plan = data.plan || { name: 'Current plan', updated: '', recipes: [], notes: '' };
const bySlug = (s) => recipes.find((r) => r.slug === s);

// ---------- helpers ----------
const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const today = () => new Date().toISOString().slice(0, 10);

const GRADIENTS = [
  ['#C4491D', '#8F2F0E'], ['#D9902A', '#A8641A'], ['#5E7C42', '#3F5A2C'],
  ['#8C4A2F', '#5F2F1B'], ['#B0713A', '#7E4A21'], ['#C9A24E', '#96742E'],
];
function tint(slug) {
  let h = 0;
  for (const c of slug) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const [a, b] = GRADIENTS[h % GRADIENTS.length];
  return `linear-gradient(135deg,${a},${b})`;
}
const initials = (title) => title.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').slice(0, 2);
const thumbStyle = (r) =>
  r.photos.length ? `background-image:url('${esc(r.photos[0])}')` : `background:${tint(r.slug)}`;
const fmtDate = (iso) =>
  new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const ingText = (i) => [i.qty, i.unit, i.name].filter(Boolean).join(' ');
const servingsOf = (e) => e.servings ?? bySlug(e.slug)?.servings ?? null;

// ---------- transient UI state ----------
const ui = {
  query: '', status: 'All', tag: null,
  cooking: false, checkedIng: {}, timers: {},
  logOpen: false, saveState: '',
};

// shopping-list checks persist, keyed by the plan's updated date
const shopKey = () => `cookbook.shop.${plan.updated}`;
const loadShop = () => { try { return JSON.parse(localStorage.getItem(shopKey()) || '{}'); } catch { return {}; } };
let checkedShop = loadShop();

// ---------- toast / banner ----------
let toastTimer;
function toast(msg, kind) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = kind === 'err' ? 'err' : '';
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
}

function renderBanner() {
  $('#banner').innerHTML = canWrite()
    ? ''
    : `Read-only mode — browsing without a GitHub token. <a href="#/settings">Add one in Settings</a> to save changes.`;
}

// ---------- write actions ----------
function setSave(state) {
  ui.saveState = state;
  const el = $('#savestate');
  if (el) { el.textContent = state; el.className = 'savestate' + (state === 'Saved ✓' ? ' ok' : ''); }
}

async function commit(path, transform, message, onOk) {
  setSave('Saving…');
  try {
    await editFile(path, transform, message);
    onOk();
    setSave('Saved ✓');
    setTimeout(() => setSave(''), 1800);
    return true;
  } catch (e) {
    setSave('');
    if (e.kind === 'auth') { toast('Token invalid — check Settings', 'err'); location.hash = '#/settings'; }
    else toast(e.message, 'err');
    return false;
  }
}

const doMarkTried = (r) =>
  commit(`recipes/${r.slug}.md`, markTried, `site: mark ${r.slug} as tried`, () => {
    r.status = 'tried';
    render();
    toast(`${r.title} marked as tried ✓`);
  });

const doCookLog = (r, entry) =>
  commit(`recipes/${r.slug}.md`, (raw) => insertCookLogEntry(raw, entry), `site: cook log for ${r.slug}`, () => {
    r.cook_log.unshift(entry);
    if (r.status !== 'tried') r.status = 'tried';
    ui.logOpen = false;
    render();
    toast('Cook logged ✓');
  });

function doPlan(entries, note) {
  return commit('plans/current.md', (raw) => writePlan(raw, entries, today()), 'site: update meal plan', () => {
    plan.recipes = entries;
    plan.updated = today();
    checkedShop = loadShop();
    render();
    toast(note);
  });
}

// ---------- shared bits ----------
function actionBtn(cls, action, label, extra = '') {
  const ro = !canWrite();
  return `<button class="btn ${cls}" data-action="${action}" ${extra} ${ro ? 'disabled title="Add a GitHub token in Settings to save changes"' : ''}>${label}</button>`;
}

const statusPill = (r) =>
  r.status === 'tried'
    ? `<span class="pill tried">✓ ×${r.cook_log.length || 1}</span>`
    : `<span class="pill wish">To try</span>`;

// ---------- views ----------
function viewGrid(wishlistOnly) {
  const q = ui.query.toLowerCase();
  const list = recipes.filter((r) => {
    if (wishlistOnly && r.status !== 'wishlist') return false;
    if (!wishlistOnly && ui.status !== 'All' && r.status !== ui.status.toLowerCase()) return false;
    if (ui.tag && !r.tags.includes(ui.tag)) return false;
    if (q) {
      const hay = [r.title, ...r.tags, ...r.ingredients.map((i) => i.name)].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const allTags = [...new Set(recipes.flatMap((r) => r.tags))].sort();
  const head = wishlistOnly
    ? `<div class="page-head">
         <h1>The to-try queue</h1>
         <p>${recipes.filter((r) => r.status === 'wishlist').length} recipes waiting for a free evening.</p>
       </div>`
    : `<div class="filters">
         <input type="search" id="q" placeholder="Search recipes or ingredients…" value="${esc(ui.query)}">
         <div class="segmented">
           ${['All', 'Wishlist', 'Tried'].map((s) =>
             `<button data-status="${s}" class="${ui.status === s ? 'on' : ''}">${s}</button>`).join('')}
         </div>
       </div>
       <div class="tagbar">
         ${allTags.map((t) => `<button data-tag="${esc(t)}" class="${ui.tag === t ? 'on' : ''}">${esc(t)}</button>`).join('')}
       </div>`;

  const empty = `<div class="empty">
      <div>Nothing on the menu.</div>
      <p>No recipes match — try clearing the search or filters.</p>
      <button class="btn outline" data-action="clear">Clear filters</button>
    </div>`;

  const cards = list.map((r) => `
    <a class="card" href="#/recipe/${r.slug}">
      <div class="thumb" style="${thumbStyle(r)}">${r.photos.length ? '' : `<span>${esc(initials(r.title))}</span>`}</div>
      <div class="card-body">
        <div class="card-title"><h3>${esc(r.title)}</h3>${statusPill(r)}</div>
        <div class="tags">${r.tags.map((t) => `<span>${esc(t)}</span>`).join('')}</div>
        ${wishlistOnly ? actionBtn('outline', 'made-it', 'I made it!', `data-slug="${r.slug}"`) : ''}
      </div>
    </a>`).join('');

  return head + (list.length ? `<div class="grid">${cards}</div>` : empty);
}

// Pull a duration out of a step: "simmer for 35–40 minutes" -> 2400s (upper bound).
function stepTimer(text) {
  let secs = null;
  const re = /(\d+)(?:\s*[–-]\s*(\d+))?\s*(second|minute|hour)s?\b/gi;
  for (const m of text.matchAll(re)) {
    const n = Number(m[2] || m[1]);
    const mult = { second: 1, minute: 60, hour: 3600 }[m[3].toLowerCase()];
    secs = Math.max(secs ?? 0, n * mult);
  }
  return secs;
}
const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

function viewRecipe(slug) {
  const r = bySlug(slug);
  if (!r) return `<div class="empty"><div>No such recipe.</div><p>${esc(slug)}</p></div>`;

  let lastSection = Symbol();
  const ings = r.ingredients.map((i, idx) => {
    const header = i.section !== lastSection && i.section
      ? `<div class="ing-section">${esc(i.section)}</div>` : '';
    lastSection = i.section;
    const on = !!ui.checkedIng[idx];
    return `${header}<label class="check ${on ? 'done' : ''}">
        <input type="checkbox" data-ing="${idx}" ${on ? 'checked' : ''}><span>${esc(ingText(i))}</span>
      </label>`;
  }).join('');

  const steps = r.steps.map((text, i) => {
    const dur = stepTimer(text);
    const t = ui.timers[i];
    let timer = '';
    if (dur != null) {
      const done = t && t.remaining === 0;
      const cls = done ? 'done' : t && t.running ? 'running' : '';
      const label = done ? 'Done — reset'
        : t ? `${mmss(t.remaining)} · ${t.running ? 'pause' : 'resume'}`
        : `${mmss(dur)} · start`;
      timer = `<button class="timer ${cls}" data-timer="${i}" data-dur="${dur}">⏱ ${label}</button>`;
    }
    return `<li><span class="n">${i + 1}</span><div>
        <p>${marked.parseInline(text)}</p>${timer}
      </div></li>`;
  }).join('');

  const inPlan = plan.recipes.some((e) => e.slug === r.slug);
  const logForm = ui.logOpen ? `
    <form class="log-form" id="logform">
      <input type="date" name="date" value="${today()}" required>
      <input name="note" placeholder="How did it go? e.g. used less sugar, great" autocomplete="off">
      <button class="btn" type="submit">Save</button>
      <button class="btn link" type="button" data-action="log-close">Cancel</button>
    </form>` : '';

  const photos = r.photos.length
    ? `<div class="photos">${r.photos.map((p) => `<img src="${esc(p)}" alt="${esc(r.title)}" loading="lazy">`).join('')}</div>`
    : `<div class="hero-fallback" style="background:${tint(r.slug)}"><span>${esc(initials(r.title))}</span></div>`;

  return `
    <a class="back" href="#/">← All recipes</a>
    <div class="recipe-head">
      <div>
        <h1>${esc(r.title)}</h1>
        <div class="meta">
          <span class="tags">${r.tags.map((t) => `<span>${esc(t)}</span>`).join('')}</span>
          ${r.servings ? `<span class="muted">Serves ${r.servings}</span>` : ''}
          ${r.source_url ? `<a href="${esc(r.source_url)}" target="_blank" rel="noopener">${esc(new URL(r.source_url).hostname.replace(/^www\./, ''))} ↗</a>` : ''}
          ${r.status === 'tried' ? `<span class="pill tried">✓ Cooked${r.cook_log.length > 1 ? ` ×${r.cook_log.length}` : ''}</span>` : ''}
          ${r.status === 'wishlist' ? `<span class="pill wish">To try</span>` : ''}
        </div>
      </div>
      <div class="actions">
        ${actionBtn('', inPlan ? 'plan-remove' : 'plan-add', inPlan ? '− Meal plan' : '+ Meal plan', `data-slug="${r.slug}"`)}
        ${actionBtn('ghost', 'log-open', 'Log a cook')}
        ${r.status === 'wishlist' ? actionBtn('ghost', 'made-it', 'Mark as tried', `data-slug="${r.slug}"`) : ''}
        <button class="btn ghost ${ui.cooking ? 'on' : ''}" data-action="cooking">${ui.cooking ? '✕ Exit cooking mode' : '🍳 Cooking mode'}</button>
        <span id="savestate" class="savestate">${esc(ui.saveState)}</span>
      </div>
    </div>
    ${ui.cooking ? '' : photos}
    <div class="recipe-cols">
      <aside><h2>Ingredients</h2><div>${ings}</div></aside>
      <section>
        <h2>Method</h2>
        <ol class="steps">${steps}</ol>
        ${ui.cooking || !r.notes ? '' : `<div class="notes"><h2>Notes</h2>${marked.parse(r.notes)}</div>`}
        ${ui.cooking ? '' : `
        <div class="log">
          <div class="log-head">
            <h2>Cook log</h2>
            ${actionBtn('ghost', 'log-open', '+ New entry')}
          </div>
          ${logForm}
          <div>${r.cook_log.map((e) => `
            <div class="log-entry">
              <span class="date">${esc(fmtDate(e.date))}</span>
              <div><p>${esc(e.note)}</p></div>
            </div>`).join('') || '<p class="sub" style="color:var(--muted)">Not cooked yet.</p>'}
          </div>
        </div>`}
      </section>
    </div>`;
}

function viewPlan() {
  const entries = plan.recipes.filter((e) => bySlug(e.slug));
  const rows = entries.map((e) => {
    const r = bySlug(e.slug);
    return `<div class="plan-row">
        <a class="sq" href="#/recipe/${r.slug}" style="${thumbStyle(r)}">${r.photos.length ? '' : `<span>${esc(initials(r.title))}</span>`}</a>
        <div style="flex:1">
          <div class="t"><a href="#/recipe/${r.slug}" style="color:inherit">${esc(r.title)}</a></div>
          <div class="s">Serves ${servingsOf(e) ?? '—'}</div>
        </div>
        <button class="x" data-action="plan-remove" data-slug="${r.slug}" title="Remove"
          ${canWrite() ? '' : 'disabled title="Add a GitHub token in Settings to save changes"'}>✕</button>
      </div>`;
  }).join('');

  const groups = aggregate(entries.map((e) => ({ recipe: bySlug(e.slug), servings: servingsOf(e) })));

  return `
    <div class="plan-head">
      <div class="page-head" style="margin:0">
        <h1>This week's plan</h1>
        <p>${entries.length} recipes · shopping list builds itself.</p>
      </div>
      <button class="btn ghost" data-action="print">🖨 Print list</button>
    </div>
    <div class="plan-cols">
      <section>
        <h2>Recipes</h2>
        ${rows || '<div class="plan-empty">Nothing planned yet. Add recipes from their pages.</div>'}
      </section>
      <section class="shop">
        <h2>Shopping list</h2>
        <p class="sub">Merged across ${entries.length} recipes</p>
        ${groups.map((g) => `
          <div class="shop-group">
            <div>${esc(g.name)}</div>
            ${g.items.map((it) => {
              const on = !!checkedShop[it.key];
              return `<label class="check ${on ? 'done' : ''}">
                  <input type="checkbox" data-shop="${esc(it.key)}" ${on ? 'checked' : ''}>
                  <span>${esc(it.text)}</span><span class="from">${esc(it.from)}</span>
                </label>`;
            }).join('')}
          </div>`).join('') || '<p class="sub">Add recipes to the plan to build a list.</p>'}
      </section>
    </div>`;
}

function renderSettings(open) {
  const m = $('#modal');
  if (!open) { m.innerHTML = ''; return; }
  const s = loadSettings();
  m.innerHTML = `
    <div class="overlay" data-action="settings-close">
      <form class="dialog" id="settingsform">
        <div class="dialog-head">
          <h2>Settings</h2>
          <button type="button" class="x-close" data-action="settings-close">✕</button>
        </div>
        <p>Recipes live in a GitHub repo. Add a personal access token to save changes; without one the site is read-only.</p>
        <label for="tok">GitHub token</label>
        <input id="tok" name="token" type="password" placeholder="github_pat_…" value="${s.token ? '••••••••••••' : ''}" autocomplete="off">
        <label for="repo">Repository</label>
        <input id="repo" name="repo" placeholder="username/my-cookbook" value="${esc(s.owner && s.repo ? `${s.owner}/${s.repo}` : '')}">
        <label for="branch">Branch</label>
        <input id="branch" name="branch" placeholder="main" value="${esc(s.branch || 'main')}">
        <div class="row">
          <button type="button" class="btn link" data-action="settings-close">Cancel</button>
          <button type="submit" class="btn">Save</button>
        </div>
      </form>
    </div>`;
}

// ---------- router ----------
function route() {
  const h = location.hash.replace(/^#\/?/, '');
  if (h.startsWith('recipe/')) return { view: 'recipe', slug: decodeURIComponent(h.slice(7)) };
  if (h === 'wishlist' || h === 'plan' || h === 'settings') return { view: h };
  return { view: 'browse' };
}

function render() {
  const r = route();
  renderBanner();
  renderSettings(r.view === 'settings');

  document.querySelectorAll('#nav a').forEach((a) => {
    const key = a.dataset.nav;
    a.classList.toggle('active', key === r.view || (key === 'browse' && ['browse', 'recipe'].includes(r.view)));
  });

  if (r.view === 'settings') {
    if (!app.innerHTML) app.innerHTML = viewGrid(false); // deep-linked: show something behind the modal
    return;
  }

  app.className = r.view === 'recipe' ? (ui.cooking ? 'cooking' : 'wide') : '';
  if (r.view === 'recipe') app.innerHTML = viewRecipe(r.slug);
  else if (r.view === 'plan') app.innerHTML = viewPlan();
  else app.innerHTML = viewGrid(r.view === 'wishlist');
}

// ---------- events ----------
document.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-action], [data-status], [data-tag], [data-timer]');
  if (!el) return;

  if (el.dataset.status) { ui.status = el.dataset.status; return render(); }
  if (el.dataset.tag) { ui.tag = ui.tag === el.dataset.tag ? null : el.dataset.tag; return render(); }
  if (el.dataset.timer) { ev.preventDefault(); return tick(Number(el.dataset.timer), Number(el.dataset.dur)); }

  const action = el.dataset.action;
  if (action === 'settings-close' && ev.target !== el) return; // overlay click only, not its children
  ev.preventDefault();

  switch (action) {
    case 'clear': ui.query = ''; ui.status = 'All'; ui.tag = null; return render();
    case 'cooking': ui.cooking = !ui.cooking; return render();
    case 'print': return window.print();
    case 'log-open': ui.logOpen = true; return render();
    case 'log-close': ui.logOpen = false; return render();
    case 'settings-close': location.hash = lastHash; return;
    case 'made-it': return doMarkTried(bySlug(el.dataset.slug));
    case 'plan-add': {
      const next = [...plan.recipes, { slug: el.dataset.slug }];
      return doPlan(next, `${bySlug(el.dataset.slug).title} added to plan ✓`);
    }
    case 'plan-remove': {
      const next = plan.recipes.filter((e) => e.slug !== el.dataset.slug);
      return doPlan(next, `${bySlug(el.dataset.slug).title} removed from plan`);
    }
  }
});

document.addEventListener('input', (ev) => {
  const t = ev.target;
  if (t.id === 'q') { ui.query = t.value; return render(); }
  if (t.dataset.ing != null) {
    ui.checkedIng[t.dataset.ing] = t.checked;
    return t.closest('.check').classList.toggle('done', t.checked);
  }
  if (t.dataset.shop != null) {
    checkedShop[t.dataset.shop] = t.checked;
    localStorage.setItem(shopKey(), JSON.stringify(checkedShop));
    return t.closest('.check').classList.toggle('done', t.checked);
  }
});

document.addEventListener('submit', (ev) => {
  ev.preventDefault();
  const f = ev.target;
  if (f.id === 'logform') {
    const r = bySlug(route().slug);
    return doCookLog(r, { date: f.date.value, note: f.note.value.trim() || '(no notes)' });
  }
  if (f.id === 'settingsform') {
    const [owner, repo] = f.repo.value.trim().split('/');
    if (!owner || !repo) return toast('Repository must look like username/my-cookbook', 'err');
    const patch = { owner, repo, branch: f.branch.value.trim() || 'main' };
    if (!f.token.value.startsWith('•')) patch.token = f.token.value.trim();
    saveSettings(patch);
    location.hash = lastHash;
    toast('Settings saved ✓');
  }
});

// ---------- step timers ----------
// ponytail: the ticking clock repaints only its own button; a full render() each
// second would wipe whatever is typed in the cook-log form.
let interval;

function paintTimers() {
  document.querySelectorAll('[data-timer]').forEach((btn) => {
    const t = ui.timers[btn.dataset.timer];
    const dur = Number(btn.dataset.dur);
    const done = t && t.remaining === 0;
    btn.className = 'timer ' + (done ? 'done' : t && t.running ? 'running' : '');
    btn.textContent = '⏱ ' + (done ? 'Done — reset'
      : t ? `${mmss(t.remaining)} · ${t.running ? 'pause' : 'resume'}`
      : `${mmss(dur)} · start`);
  });
}

function tick(i, dur) {
  const t = ui.timers[i];
  if (t && t.remaining === 0) delete ui.timers[i];
  else if (t) t.running = !t.running;
  else ui.timers[i] = { remaining: dur, running: true };

  if (!interval) {
    interval = setInterval(() => {
      let any = false;
      for (const v of Object.values(ui.timers)) {
        if (v.running && v.remaining > 0) { v.remaining--; any = true; }
        if (v.running && v.remaining === 0) v.running = false;
      }
      if (!any) { clearInterval(interval); interval = null; }
      paintTimers();
    }, 1000);
  }
  paintTimers();
}

let lastHash = '#/';
window.addEventListener('hashchange', (ev) => {
  const from = new URL(ev.oldURL).hash || '#/';
  if (!from.startsWith('#/settings')) lastHash = from;
  const r = route();
  if (r.view !== 'recipe' || r.slug !== lastRecipe) { ui.checkedIng = {}; ui.timers = {}; }
  lastRecipe = r.view === 'recipe' ? r.slug : null;
  ui.logOpen = false;
  render();
});

let lastRecipe = route().view === 'recipe' ? route().slug : null;
render();
