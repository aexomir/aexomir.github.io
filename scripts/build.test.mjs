import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { render, validate } from './build.mjs';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const content = JSON.parse(read('content.json'));
const template = read('template.html');

test('the real content.json is valid and fills every placeholder', () => {
  assert.deepEqual(validate(content), []);
  const html = render(content, template, 2026);
  assert.doesNotMatch(html, /\{\{|<!-- @/);
  for (const p of content.projects) assert.ok(html.includes(`<span class="name">${p.name}</span>`), p.name);
  assert.equal((html.match(/class="row proj"/g) ?? []).length, content.projects.length);
  assert.ok(html.includes(`data-filter="All" aria-pressed="true">All<small>${content.projects.length}</small>`));
});

test('text is HTML-escaped', () => {
  const c = structuredClone(content);
  c.projects[0].name = '<script>alert(1)</script> & "x"';
  const html = render(c, template, 2026);
  assert.ok(!html.includes('<script>alert(1)'));
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;x&quot;'));
});

test('bad content is rejected with readable errors', () => {
  const c = structuredClone(content);
  c.projects[1].slug = c.projects[0].slug;
  c.projects[2].type = 'Games';
  c.projects[3].repo = 'javascript:alert(1)';
  delete c.profile.intro;
  const errors = validate(c);
  assert.ok(errors.some((e) => e.includes('duplicate slug')));
  assert.ok(errors.some((e) => e.includes('type must be one of')));
  assert.ok(errors.some((e) => e.includes('must start with https://')));
  assert.ok(errors.some((e) => e.includes('"intro" is required')));
  assert.throws(() => render(c, template), /content.json is invalid/);
});

test('optional fields can be missing or null, as Pages CMS may save them', () => {
  const c = structuredClone(content);
  delete c.projects[0].repo;
  c.projects[1].repo = null;
  delete c.projects[2].facts;
  delete c.certificates[1].url;
  assert.deepEqual(validate(c), []);
  const html = render(c, template, 2026);
  assert.ok(html.includes(`<span class="name">${c.projects[0].name}</span>`));
});

test('app status is checked', () => {
  const c = structuredClone(content);
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
