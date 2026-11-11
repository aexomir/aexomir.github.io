// Builds aexomir.me from content.json: validates it, renders every page into layout.html, writes _site/.
// No dependencies, so it runs anywhere with Node 20+.
import { existsSync, readFileSync } from 'node:fs';
import { copyFile, cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export const TYPES = ['Apps', 'Research', 'Open Source'];

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const isUrl = (s) => /^(https:\/\/|mailto:)\S+$/.test(s);
const isHttps = (s) => /^https:\/\/\S+$/.test(s);
// Relative path inside assets/; no segment may start with a dot, so no ../ or hidden files.
const isAsset = (s) => /^assets\/(?:[\w-][\w.-]*\/)*[\w-][\w.-]*\.(png|webp|svg)$/.test(s);
const text = (v) => typeof v === 'string' && v.trim() !== '';
const paras = (s) => s.trim().split(/\n\s*\n/).map((p) => `<p>${esc(p.trim())}</p>`).join('');

// Required case-study sections, in reading order. `role` and `retrospective` are optional.
const CASE = [['problem', 'Problem'], ['approach', 'Approach'], ['decisions', 'Key decisions'], ['results', 'Results']];
/** A project gets its own page once any case-study section has text (Pages CMS may save empty ones). */
export const hasCaseStudy = (p) => CASE.some(([k]) => text(p?.caseStudy?.[k]));

/** Returns a list of problems; empty means the content is valid. */
export function validate(c) {
  const errors = [];
  const need = (obj, keys, where) => {
    for (const k of keys) if (!text(obj?.[k])) errors.push(`${where}: "${k}" is required`);
  };
  const optText = (obj, keys, where) => {
    for (const k of keys) if (obj?.[k] != null && typeof obj[k] !== 'string') errors.push(`${where}: "${k}" must be text`);
  };
  const optUrl = (v, where) => { if (v && !isHttps(v)) errors.push(`${where}: "${v}" must start with https://`); };
  const optList = (v, where) => (v == null ? [] : Array.isArray(v) ? v : (errors.push(`${where} must be a list`), []));
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
    optList(p?.facts, `${where} facts`).forEach((f, j) => need(f, ['label', 'value'], `${where} facts[${j}]`));
    if (hasCaseStudy(p)) need(p.caseStudy, CASE.map(([k]) => k), `${where} caseStudy`);
    optText(p?.caseStudy, ['role', 'retrospective'], `${where} caseStudy`);
    optList(p?.images, `${where} images`).forEach((m, j) => {
      need(m, ['src', 'alt'], `${where} images[${j}]`);
      if (m?.src && !isAsset(m.src)) errors.push(`${where} images[${j}]: src "${m.src}" must be a .png, .webp or .svg under assets/, like assets/projects/${p?.slug}/shot.png`);
    });
  });
  list('experience').forEach((e, i) => { need(e, ['years', 'role', 'company'], `experience[${i}]`); optText(e, ['impact'], `experience[${i}]`); });
  list('certificates').forEach((x, i) => { need(x, ['name', 'issuer', 'year'], `certificates[${i}]`); optUrl(x?.url, `certificates[${i}]`); });
  list('links').forEach((l, i) => {
    need(l, ['label', 'value', 'href'], `links[${i}]`);
    if (l?.href && !isUrl(l.href)) errors.push(`links[${i}]: href must start with https:// or mailto:`);
  });
  // App status (read by the iPhone app only). Optional; missing fields fall back to defaults in the app.
  const app = c?.app;
  if (app != null) {
    const bool = (v, where) => { if (v != null && typeof v !== 'boolean') errors.push(`${where} must be true or false`); };
    bool(app.maintenance?.enabled, 'app.maintenance.enabled');
    if (app.maintenance?.enabled && !app.maintenance?.message?.trim()) errors.push('app.maintenance: "message" is required while maintenance is on');
    if (app.latestVersion && !/^\d+\.\d+\.\d+$/.test(app.latestVersion)) errors.push(`app.latestVersion "${app.latestVersion}" must look like 1.2.0`);
    optUrl(app.updateUrl, 'app');
    for (const [k, v] of Object.entries(app.features ?? {})) bool(v, `app.features.${k}`);
  }
  return errors;
}

/** Pixel size of a PNG, WebP or SVG file, so every <img> can reserve its space before it loads. */
export function imageSize(buf) {
  const ascii = (a, b) => buf.toString('latin1', a, b);
  if (ascii(1, 4) === 'PNG') return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') {
    const chunk = ascii(12, 16);
    if (chunk === 'VP8 ') return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
    if (chunk === 'VP8L') { const b = buf.readUInt32LE(21); return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 }; }
    if (chunk === 'VP8X') return { width: buf.readUIntLE(24, 3) + 1, height: buf.readUIntLE(27, 3) + 1 };
  }
  const box = ascii(0, Math.min(buf.length, 2048)).match(/<svg[^>]*\bviewBox="\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/);
  if (box) return { width: Math.round(+box[1]), height: Math.round(+box[2]) };
  throw new Error('unsupported image (use PNG, WebP or an SVG with a viewBox)');
}

const MAX_FIGURE_HEIGHT = 640;
const NAV = [['/projects/', 'Projects'], ['/experience/', 'Experience'], ['/contact/', 'Contact']];

const nameTag = (p) => `view-transition-name:p-${p.slug}`;
const repoLink = (p, label = 'GitHub ↗') => (p.repo ? `<a class="ul" href="${esc(p.repo)}">${label}</a>` : '');
// Every page ends by pointing to the next step of the journey: home → projects → case studies → experience → contact.
const onward = (href, label, kicker = 'Next') => `<a class="onward" href="${href}"><span class="lbl">${kicker}</span><span>${esc(label)} <span class="arrow">→</span></span></a>`;

function homeBody(c) {
  // Spaces stay out of the weight wave: a space gets narrower as it gets bolder, which would reflow the name.
  const letters = [...c.profile.name].map((ch, i) => (ch === ' ' ? ' '
    : `<span class="l" data-c="${esc(ch)}" style="--i:${i}"><span>${esc(ch)}</span></span>`)).join('');
  return `<section class="home">
  <div>
    <p class="lbl kicker">${esc(c.profile.title)}</p>
    <h1 class="hero" aria-label="${esc(c.profile.name)}"><span aria-hidden="true">${letters}</span></h1>
  </div>
  <div class="intro">
    <div class="now"><div><span class="lbl">Currently</span><span>${esc(c.profile.currently)}</span></div><div><span class="lbl">Status</span><span class="status"><i></i>${esc(c.profile.status)}</span></div></div>
    <p>${esc(c.profile.intro)}</p>
  </div>
  ${onward('/projects/', 'See my work', 'Start here')}
</section>`;
}

function projectsBody(c) {
  const used = TYPES.filter((t) => c.projects.some((p) => p.type === t));
  const filters = [['All', c.projects.length], ...used.map((t) => [t, c.projects.filter((p) => p.type === t).length])]
    .map(([t, n], i) => `<button type="button" data-filter="${esc(t)}" aria-pressed="${i === 0}">${esc(t)}<small>${n}</small></button>`)
    .join('\n    ');
  const rows = c.projects.map((p) => {
    const cs = hasCaseStudy(p);
    const href = `/projects/${esc(p.slug)}/`;
    return `<div class="row proj" data-type="${esc(p.type)}">${cs ? `<span class="name" style="${nameTag(p)}"><a href="${href}">${esc(p.name)}</a></span>` : `<span class="name">${esc(p.name)}</span>`}<span class="sub">${esc(p.summary)}</span><span class="yr">${esc(p.year)}</span><span class="links">${cs ? `<a class="ul" href="${href}">Case study →</a>` : ''}${repoLink(p)}</span></div>`;
  }).join('\n  ');
  const first = c.projects.find(hasCaseStudy);
  return `<section class="page">
  <h1 class="ttl">Projects</h1>
  <div class="filters" role="group" aria-label="Filter projects">
    ${filters}
  </div>
  ${rows}
  ${first ? onward(`/projects/${esc(first.slug)}/`, first.name, 'Start with a case study') : onward('/experience/', 'Experience')}
</section>`;
}

function experienceBody(c) {
  return `<section class="page">
  <h1 class="ttl">Experience</h1>
  <div class="list">
  ${c.experience.map((e) => `<div class="row exp"><span class="yr">${esc(e.years)}</span><div><h2>${esc(e.role)}</h2><p class="co">${esc(e.company)}</p>${text(e.impact) ? `<p>${esc(e.impact.trim())}</p>` : ''}</div></div>`).join('\n  ')}
  </div>
  <section class="sec" id="certificates" aria-labelledby="certs">
    <div class="sec-head"><h2 class="lbl" id="certs">Certificates</h2></div>
    ${c.certificates.map((x) => `<div class="row cert"><span class="name">${esc(x.name)}</span><span class="sub">${esc(x.issuer)}</span><span class="yr">${esc(x.year)}</span>${x.url ? `<a href="${esc(x.url)}">${x.url.includes('github.com') ? 'Repo' : 'Verify'} ↗</a>` : '<span></span>'}</div>`).join('\n    ')}
  </section>
  ${onward('/contact/', 'Get in touch')}
</section>`;
}

function contactBody(c) {
  return `<section class="page contact">
  <h1 class="ttl">Contact</h1>
  <p class="lead"><span class="status"><i></i>${esc(c.profile.status)}</span></p>
  <div class="ct">
  ${c.links.map((l) => `<a href="${esc(l.href)}"><span class="lbl">${esc(l.label)}</span><span>${esc(l.value)}</span><span>↗</span></a>`).join('\n  ')}
  </div>
</section>`;
}

function notFoundBody() {
  return `<section class="page">
  <h1 class="ttl">Page not found</h1>
  <p class="lead">This page doesn’t exist, or it moved when the site was rebuilt.</p>
  ${onward('/', 'Back to the start', 'Home')}
</section>`;
}

function caseStudyBody(p, next, sizeOf) {
  const cs = p.caseStudy;
  const section = (title, body) => `<section><h2 class="lbl">${title}</h2><div>${body}</div></section>`;
  const figures = (p.images ?? []).map((m) => {
    const { width, height } = sizeOf(m.src);
    // Tall screenshots are shown at most MAX_FIGURE_HEIGHT tall; the attributes reserve that box before the image loads.
    const w = Math.min(width, Math.round((width * MAX_FIGURE_HEIGHT) / height));
    return `<figure><img src="/${esc(m.src)}" alt="${esc(m.alt)}" width="${w}" height="${Math.round((height * w) / width)}" loading="lazy" decoding="async">${text(m.caption) ? `<figcaption>${esc(m.caption)}</figcaption>` : ''}</figure>`;
  }).join('\n  ');
  const facts = [...(text(cs.role) ? [{ label: 'Role', value: cs.role }] : []), ...(p.facts ?? [])]
    .map((f) => `<div><dt>${esc(f.label)}</dt><dd>${esc(f.value)}</dd></div>`).join('');
  return `<article class="page">
  <a class="back" href="/projects/" data-back><span class="arrow">←</span> Projects</a>
  <div class="cs-head">
    <p class="lbl">${esc(p.type)} · ${esc(p.year)}</p>
    <h1 class="ttl" style="${nameTag(p)}">${esc(p.name)}</h1>
    <p class="lead">${esc(p.summary)}</p>
    ${p.repo ? `<p class="repo">${repoLink(p, 'View on GitHub ↗')}</p>` : ''}
  </div>
  ${facts ? `<dl class="facts">${facts}</dl>` : ''}
  <div class="story">
  ${CASE.map(([k, title]) => section(title, paras(cs[k]))).join('\n  ')}
  </div>
  ${figures}
  ${text(cs.retrospective) ? `<div class="story">${section('What I’d do differently', paras(cs.retrospective))}</div>` : ''}
  ${next ? onward(`/projects/${esc(next.slug)}/`, next.name, 'Next case study') : onward('/experience/', 'Experience')}
</article>`;
}

// Placeholders are filled in the layout before the page blocks go in, so text from content.json is never read as a placeholder.
const fill = (template, data, blocks) => template
  .replace(/\{\{([\w.]+)\}\}/g, (m, path) => {
    const value = path.split('.').reduce((o, k) => o?.[k], data);
    if (typeof value !== 'string' && typeof value !== 'number') throw new Error(`layout: no value for ${m}`);
    return esc(value);
  })
  .replace(/<!-- @(\w+) -->/g, (m, name) => {
    if (!(name in blocks)) throw new Error(`layout: unknown block ${m}`);
    return blocks[name];
  });

/**
 * Renders every page. Returns [{ path, html }], where path is the URL path ("/", "/projects/chrona/").
 * sizeOf(src) returns { width, height } for an image under assets/.
 * Throws on invalid content or a layout placeholder with no value.
 */
export function renderSite(content, layout, { year = new Date().getFullYear(), sizeOf }) {
  const errors = validate(content);
  if (errors.length) throw new Error(`content.json is invalid:\n- ${errors.join('\n- ')}`);
  const c = content;
  const name = c.profile.name;
  const studies = c.projects.filter(hasCaseStudy);
  const pages = [
    { path: '/', section: '', title: `${name} · ${c.profile.title}`, description: c.profile.description, body: homeBody(c) },
    { path: '/projects/', section: '/projects/', title: `Projects · ${name}`, description: `Apps and research projects by ${name}, with case studies.`, body: projectsBody(c) },
    // Case studies read as a chain; the last one hands over to Experience.
    ...studies.map((p, i) => ({
      path: `/projects/${p.slug}/`, section: '/projects/', title: `${p.name} · ${name}`, description: p.summary,
      body: caseStudyBody(p, studies[i + 1], sizeOf),
    })),
    { path: '/experience/', section: '/experience/', title: `Experience · ${name}`, description: `${name}'s experience and certificates.`, body: experienceBody(c) },
    { path: '/contact/', section: '/contact/', title: `Contact · ${name}`, description: `How to reach ${name}.`, body: contactBody(c) },
    // GitHub Pages serves this for any unknown path.
    { path: '/404.html', section: '', title: `Page not found · ${name}`, description: c.profile.description, body: notFoundBody() },
  ];
  const site = { studies: studies.map((p) => p.slug).join(' ') };
  return pages.map((page) => {
    const nav = NAV.map(([href, label]) => {
      const current = href === page.path ? ' aria-current="page"' : href === page.section ? ' aria-current="true"' : '';
      return `<a href="${href}"${current}>${label}</a>`;
    }).join('\n      ');
    return { path: page.path, html: fill(layout, { page, profile: c.profile, site, year }, { nav, body: page.body }) };
  });
}

// CLI: node scripts/build.mjs  →  _site/
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = new URL('..', import.meta.url);
  const out = new URL('_site/', root);
  const raw = await readFile(new URL('content.json', root), 'utf8');
  const sizeOf = (src) => {
    const file = new URL(src, root);
    if (!existsSync(file)) throw new Error(`image ${src} does not exist`);
    try { return imageSize(readFileSync(file)); } catch (e) { throw new Error(`image ${src}: ${e.message}`); }
  };
  const pages = renderSite(JSON.parse(raw), await readFile(new URL('layout.html', root), 'utf8'), { sizeOf });
  for (const { path, html } of pages) {
    const file = new URL(path.endsWith('/') ? `.${path}index.html` : `.${path}`, out);
    await mkdir(new URL('.', file), { recursive: true });
    await writeFile(file, html);
  }
  // Markdown in assets/ is working notes, not site content.
  if (existsSync(new URL('assets', root))) await cp(new URL('assets', root), new URL('assets', out), { recursive: true, filter: (f) => !f.endsWith('.md') });
  await cp(new URL('fonts', root), new URL('fonts', out), { recursive: true });
  // Published so the iPhone app can download the same content.
  await writeFile(new URL('content.json', out), raw);
  for (const f of ['CNAME', 'favicon.svg', 'apple-touch-icon.png', 'og.png', 'site.css', 'site.js']) await copyFile(new URL(f, root), new URL(f, out));
  console.log(`Built _site/ with ${pages.length} pages.`);
}
