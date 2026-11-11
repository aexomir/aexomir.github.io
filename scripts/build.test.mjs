import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { hasCaseStudy, imageSize, renderSite, validate } from './build.mjs';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const content = JSON.parse(read('content.json'));
const layout = read('layout.html');
const sizeOf = () => ({ width: 540, height: 1174 });
const site = (c = content) => Object.fromEntries(renderSite(c, layout, { year: 2026, sizeOf }).map((p) => [p.path, p.html]));
const caseSlugs = content.projects.filter(hasCaseStudy).map((p) => p.slug);
const onward = (html) => [...html.matchAll(/<a class="onward" href="([^"]+)"/g)].map((m) => m[1]);

// The CMS can reorder, add or remove projects, so the tests below never assume a project's position.
// Mutation tests work on a copy and pick their targets by what they need (with or without a case study).
const copy = () => {
  const c = structuredClone(content);
  return { c, study: c.projects.find(hasCaseStudy), plain: c.projects.filter((p) => !hasCaseStudy(p)) };
};

test('the real content.json is valid and renders every page with no placeholder left', () => {
  assert.deepEqual(validate(content), []);
  const pages = site();
  assert.deepEqual(Object.keys(pages), ['/', '/projects/', ...caseSlugs.map((s) => `/projects/${s}/`), '/experience/', '/contact/', '/404.html']);
  for (const [path, html] of Object.entries(pages)) {
    assert.doesNotMatch(html, /\{\{|<!-- @/, path);
    assert.ok(html.includes(`<link rel="canonical" href="https://aexomir.me${path}">`), path);
    assert.equal((html.match(/<h1/g) ?? []).length, 1, `${path} has one h1`);
    for (const img of html.match(/<img [^>]*>/g) ?? []) assert.match(img, /width="\d+" height="\d+"/, `${path}: ${img}`);
  }
});

test('each page does one job and ends with one step forward: home → projects → case studies → experience → contact', () => {
  const pages = site();
  assert.deepEqual(onward(pages['/']), ['/projects/']);
  assert.deepEqual(onward(pages['/projects/']), caseSlugs.length ? [`/projects/${caseSlugs[0]}/`] : ['/experience/']);
  caseSlugs.forEach((s, i) => assert.deepEqual(onward(pages[`/projects/${s}/`]), [caseSlugs[i + 1] ? `/projects/${caseSlugs[i + 1]}/` : '/experience/'], s));
  assert.deepEqual(onward(pages['/experience/']), ['/contact/']);
  assert.deepEqual(onward(pages['/contact/']), []);
  assert.deepEqual(onward(pages['/404.html']), ['/']);
  // Home is an introduction only; contact details live on the contact page alone.
  assert.ok(!pages['/'].includes('class="row'));
  for (const [path, html] of Object.entries(pages)) {
    for (const l of content.links) assert.equal(html.includes(`href="${l.href}"`), path === '/contact/', `${l.label} on ${path}`);
  }
});

test('reordering projects in the CMS keeps the build and the journey working', () => {
  const { c } = copy();
  c.projects.reverse();
  assert.deepEqual(validate(c), []);
  const pages = site(c);
  const order = c.projects.filter(hasCaseStudy).map((p) => p.slug);
  assert.deepEqual(onward(pages['/projects/']), [`/projects/${order[0]}/`]);
  assert.deepEqual(onward(pages[`/projects/${order.at(-1)}/`]), ['/experience/']);
});

test('the projects page lists everything with filter counts', () => {
  const pages = site();
  assert.equal((pages['/projects/'].match(/class="row proj"/g) ?? []).length, content.projects.length);
  assert.ok(pages['/projects/'].includes(`data-filter="All" aria-pressed="true">All<small>${content.projects.length}</small>`));
  for (const p of content.projects) assert.equal(pages['/projects/'].includes(`href="/projects/${p.slug}/"`), hasCaseStudy(p), p.slug);
});

test('a project title carries the same view-transition-name on the list and its case study', () => {
  const pages = site();
  for (const s of caseSlugs) {
    const tag = `view-transition-name:p-${s}"`;
    for (const path of ['/projects/', `/projects/${s}/`]) assert.equal(pages[path].split(tag).length - 1, 1, `${s} once on ${path}`);
  }
});

test('case-study pages have every section, the role, and figures that reserve their size', () => {
  const pages = site();
  for (const p of content.projects.filter(hasCaseStudy)) {
    const html = pages[`/projects/${p.slug}/`];
    for (const h of ['Problem', 'Approach', 'Key decisions', 'Results']) assert.ok(html.includes(`<h2 class="lbl">${h}</h2>`), `${p.slug} ${h}`);
    assert.equal(html.includes('What I’d do differently'), Boolean(p.caseStudy.retrospective?.trim()), p.slug);
    if (p.caseStudy.role) assert.ok(html.includes('<dt>Role</dt>'), p.slug);
    // 540×1174 is capped at 640px tall: 294×639.
    for (const m of p.images ?? []) assert.ok(html.includes(`<img src="/${m.src}" alt="`) && html.includes('width="294" height="639"'), m.src);
  }
});

test('a project with a paper links to it from the list', () => {
  const { c, plain } = copy();
  const p = plain[0] ?? c.projects[0];
  p.paper = 'https://example.com/paper.pdf';
  assert.ok(site(c)['/projects/'].includes('<a class="ul" href="https://example.com/paper.pdf">Paper ↗</a>'));
  p.paper = 'http://example.com/paper.pdf';
  assert.ok(validate(c).some((e) => e.includes('must start with https://')));
});

test('the current section is marked in the nav', () => {
  const pages = site();
  assert.ok(pages['/projects/'].includes('<a href="/projects/" aria-current="page">'));
  for (const s of caseSlugs) assert.ok(pages[`/projects/${s}/`].includes('<a href="/projects/" aria-current="true">'), s);
  assert.ok(pages['/contact/'].includes('<a href="/contact/" aria-current="page">'));
  assert.ok(!pages['/'].includes('aria-current'));
});

test('old single-page links know which projects have a case study', () => {
  assert.ok(site()['/'].includes(`var studies = '${caseSlugs.join(' ')}'.split(' ');`));
});

test('text is HTML-escaped and never read as a layout placeholder', () => {
  const { c, study, plain } = copy();
  study.name = '<script>alert(1)</script> & "x"';
  study.caseStudy.problem = 'First <b>one</b>.\n\nSecond & last.';
  study.summary = 'Uses {{page.title}} and {{handlebars}} literally.';
  c.experience[0].impact = '<i>big</i>';
  const pages = site(c);
  for (const html of Object.values(pages)) assert.ok(!html.includes('<script>alert(1)'));
  assert.ok(pages['/projects/'].includes('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;x&quot;'));
  assert.ok(pages[`/projects/${study.slug}/`].includes('<p>First &lt;b&gt;one&lt;/b&gt;.</p><p>Second &amp; last.</p>'));
  assert.ok(pages['/projects/'].includes('Uses {{page.title}} and {{handlebars}} literally.'));
  assert.ok(pages['/experience/'].includes('&lt;i&gt;big&lt;/i&gt;'));
  assert.ok(plain.length === 0 || pages['/projects/'].includes(plain[0].name));
});

test('bad content is rejected with readable errors, not crashes', () => {
  const { c, study, plain } = copy();
  const [a, b, d] = c.projects;
  b.slug = a.slug;
  study.type = 'Games';
  d.repo = 'javascript:alert(1)';
  study.facts = { label: 'x' };
  (plain[0] ?? a).images = 'nope';
  c.certificates[0].url = 'mailto:me@example.com';
  c.experience[0].impact = 42;
  delete c.profile.intro;
  const errors = validate(c);
  assert.ok(errors.some((e) => e.includes('duplicate slug')));
  assert.ok(errors.some((e) => e.includes('type must be one of')));
  assert.ok(errors.some((e) => e.includes('"javascript:alert(1)" must start with https://')));
  assert.ok(errors.some((e) => e.includes('"mailto:me@example.com" must start with https://')));
  assert.ok(errors.some((e) => e.includes('facts must be a list')));
  assert.ok(errors.some((e) => e.includes('images must be a list')));
  assert.ok(errors.some((e) => e.includes('"impact" must be text')));
  assert.ok(errors.some((e) => e.includes('"intro" is required')));
  assert.throws(() => site(c), /content.json is invalid/);
});

test('optional fields can be missing or null, as Pages CMS may save them', () => {
  const { c, study } = copy();
  for (const p of c.projects) { delete p.repo; p.facts = null; }
  study.caseStudy.role = null;
  study.caseStudy.retrospective = '';
  c.experience[0].impact = null;
  delete c.certificates[0].url;
  assert.deepEqual(validate(c), []);
  assert.ok(!site(c)[`/projects/${study.slug}/`].includes('What I’d do differently'));
});

test('case study and images are checked', () => {
  const { c, study } = copy();
  study.caseStudy.results = '  ';
  study.images = [
    { src: 'assets/projects/x/ok.png', alt: '' },
    { src: '../secret.png', alt: 'a' },
    { src: '/assets/x.png', alt: 'a' },
    { src: 'https://example.com/x.png', alt: 'a' },
    { src: 'assets/../x.png', alt: 'a' },
    { src: 'assets/projects/x/photo.jpg', alt: 'a' },
  ];
  const errors = validate(c);
  assert.ok(errors.some((e) => e.includes('caseStudy: "results" is required')));
  assert.ok(errors.some((e) => e.includes('images[0]: "alt" is required')));
  for (const j of [1, 2, 3, 4, 5]) assert.ok(errors.some((e) => e.includes(`images[${j}]: src`)), `images[${j}]`);
  assert.ok(!errors.some((e) => e.includes('images[0]: src')));
});

test('an empty or missing case study means no page and no link, as Pages CMS may save it', () => {
  const { c } = copy();
  c.projects.forEach((p, i) => { if (i % 2) p.caseStudy = null; else p.caseStudy = { problem: '', approach: '', decisions: '', results: '' }; p.images = []; });
  assert.deepEqual(validate(c), []);
  const pages = site(c);
  assert.deepEqual(Object.keys(pages), ['/', '/projects/', '/experience/', '/contact/', '/404.html']);
  assert.ok(!pages['/projects/'].includes('Case study'));
  assert.deepEqual(onward(pages['/projects/']), ['/experience/']);
});

test('app status is checked', () => {
  const { c } = copy();
  c.app.maintenance = { enabled: true, message: '' };
  c.app.latestVersion = 'v2';
  c.app.features.nameWave = 'yes';
  const errors = validate(c);
  assert.ok(errors.some((e) => e.includes('"message" is required while maintenance is on')));
  assert.ok(errors.some((e) => e.includes('must look like 1.2.0')));
  assert.ok(errors.some((e) => e.includes('app.features.nameWave must be true or false')));
  delete c.app;
  assert.deepEqual(validate(c), []);
});

test('image sizes are read from PNG, every WebP flavour and SVG', () => {
  const buf = (f) => readFileSync(new URL(`../${f}`, import.meta.url));
  assert.deepEqual(imageSize(buf('assets/projects/chrona/hero.webp')), { width: 2400, height: 1200 });
  assert.deepEqual(imageSize(buf('assets/projects/heart-disease/shap-summary.png')), { width: 1545, height: 1800 });
  assert.deepEqual(imageSize(buf('assets/projects/semantic-correspondence/pck-by-backbone.svg')), { width: 760, height: 420 });
  // Lossless (VP8L) and extended (VP8X) headers, built by hand for 300×200.
  const webp = (chunk, body) => Buffer.concat([Buffer.from('RIFF\0\0\0\0WEBP' + chunk, 'latin1'), Buffer.alloc(4), body]);
  const vp8l = Buffer.alloc(9); vp8l[0] = 0x2f; vp8l.writeUInt32LE((299) | (199 << 14), 1);
  assert.deepEqual(imageSize(webp('VP8L', vp8l)), { width: 300, height: 200 });
  const vp8x = Buffer.alloc(10); vp8x.writeUIntLE(299, 4, 3); vp8x.writeUIntLE(199, 7, 3);
  assert.deepEqual(imageSize(webp('VP8X', vp8x)), { width: 300, height: 200 });
  assert.throws(() => imageSize(Buffer.from('GIF89a')), /unsupported image/);
});
