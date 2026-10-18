// Builds the site from content.json: validates it, fills template.html, writes _site/.
// No dependencies, so it runs anywhere with Node 20+.
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export const TYPES = ['Apps', 'Research', 'Open Source'];

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const isUrl = (s) => /^(https:\/\/|mailto:)\S+$/.test(s);

/** Returns a list of problems; empty means the content is valid. */
export function validate(c) {
  const errors = [];
  const need = (obj, keys, where) => {
    for (const k of keys) if (typeof obj?.[k] !== 'string' || !obj[k].trim()) errors.push(`${where}: "${k}" is required`);
  };
  const optUrl = (v, where) => { if (v && !isUrl(v)) errors.push(`${where}: "${v}" must start with https:// or mailto:`); };
  const list = (key) => (Array.isArray(c?.[key]) ? c[key] : (errors.push(`"${key}" must be a list`), []));

  need(c?.profile, ['name', 'title', 'description', 'intro', 'currently', 'city', 'timeZone', 'status'], 'profile');
  try { new Intl.DateTimeFormat('en-GB', { timeZone: c?.profile?.timeZone }); } catch { errors.push(`profile: unknown time zone "${c?.profile?.timeZone}"`); }

  const slugs = new Set();
  list('projects').forEach((p, i) => {
    const where = `projects[${i}] ${p?.name ?? ''}`.trim();
    need(p, ['slug', 'name', 'type', 'year', 'summary'], where);
    if (p?.slug && !/^[a-z0-9-]+$/.test(p.slug)) errors.push(`${where}: slug may only use a-z, 0-9 and -`);
    if (slugs.has(p?.slug)) errors.push(`${where}: duplicate slug "${p.slug}"`);
    slugs.add(p?.slug);
    if (p?.type && !TYPES.includes(p.type)) errors.push(`${where}: type must be one of ${TYPES.join(', ')}`);
    optUrl(p?.repo, where);
    (p?.facts ?? []).forEach((f, j) => need(f, ['label', 'value'], `${where} facts[${j}]`));
  });
  list('experience').forEach((e, i) => need(e, ['years', 'role', 'company'], `experience[${i}]`));
  list('certificates').forEach((x, i) => { need(x, ['name', 'issuer', 'year'], `certificates[${i}]`); optUrl(x?.url, `certificates[${i}]`); });
  list('links').forEach((l, i) => {
    need(l, ['label', 'value', 'href'], `links[${i}]`);
    if (l?.href && !isUrl(l.href)) errors.push(`links[${i}]: href must start with https:// or mailto:`);
  });
  return errors;
}

const blocks = {
  filters: (c) => {
    const used = TYPES.filter((t) => c.projects.some((p) => p.type === t));
    return [['All', c.projects.length], ...used.map((t) => [t, c.projects.filter((p) => p.type === t).length])]
      .map(([t, n], i) => `<button type="button" data-filter="${esc(t)}" aria-pressed="${i === 0}">${esc(t)}<small>${n}</small></button>`)
      .join('\n      ');
  },
  projects: (c) => c.projects.map((p) =>
    `<div class="row proj" data-type="${esc(p.type)}"><span class="name">${esc(p.name)}</span><span class="sub">${esc(p.summary)}</span><span class="yr">${esc(p.year)}</span><span class="links">${p.repo ? `<a class="ul" href="${esc(p.repo)}">GitHub ↗</a>` : ''}</span></div>`,
  ).join('\n    '),
  experience: (c) => c.experience.map((e) =>
    `<div class="row exp"><span class="yr">${esc(e.years)}</span><span class="name">${esc(e.role)}</span><span class="sub">${esc(e.company)}</span></div>`,
  ).join('\n      '),
  certificates: (c) => c.certificates.map((x) =>
    `<div class="row cert"><span class="name">${esc(x.name)}</span><span class="sub">${esc(x.issuer)}</span><span class="yr">${esc(x.year)}</span>${x.url ? `<a class="ul" href="${esc(x.url)}">${x.url.includes('github.com') ? 'Repo' : 'Verify'} ↗</a>` : '<span></span>'}</div>`,
  ).join('\n      '),
  links: (c) => c.links.map((l) =>
    `<a href="${esc(l.href)}"><span class="lbl">${esc(l.label)}</span><span>${esc(l.value)}</span><span>↗</span></a>`,
  ).join('\n      '),
};

/** Fills the template. Throws on invalid content or a placeholder with no value. */
export function render(content, template, year = new Date().getFullYear()) {
  const errors = validate(content);
  if (errors.length) throw new Error(`content.json is invalid:\n- ${errors.join('\n- ')}`);
  const html = template
    .replace(/<!-- @(\w+) -->/g, (m, name) => {
      if (!blocks[name]) throw new Error(`template: unknown block ${m}`);
      return blocks[name](content);
    })
    .replace(/\{\{([\w.]+)\}\}/g, (m, path) => {
      const value = path === 'year' ? year : path.split('.').reduce((o, k) => o?.[k], content);
      if (typeof value !== 'string' && typeof value !== 'number') throw new Error(`template: no value for ${m}`);
      return esc(value);
    });
  return html;
}

// CLI: node scripts/build.mjs  →  _site/
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = new URL('..', import.meta.url);
  const out = new URL('_site/', root);
  const raw = await readFile(new URL('content.json', root), 'utf8');
  const html = render(JSON.parse(raw), await readFile(new URL('template.html', root), 'utf8'));
  await mkdir(out, { recursive: true });
  await writeFile(new URL('index.html', out), html);
  // Published so the iPhone app can download the same content.
  await writeFile(new URL('content.json', out), raw);
  for (const f of ['CNAME', 'favicon.svg', 'apple-touch-icon.png', 'og.png']) await copyFile(new URL(f, root), new URL(f, out));
  console.log(`Built _site/ with ${JSON.parse(raw).projects.length} projects.`);
}
