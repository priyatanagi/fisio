const test = require('node:test');
const assert = require('node:assert/strict');
const { parseJsonSafe, validatePackage, resolveCategory, buildFillPlan, mdToHtml, detectJsonLang, matchFieldLabel, parseIdTagIndex, ID_SECTION_KEYS } = require('./lib.js');

test('detectJsonLang detects FitSEO id suffix', () => {
  assert.equal(detectJsonLang('my-article-json-id.json'), 'id');
});

test('detectJsonLang detects FitSEO en suffix', () => {
  assert.equal(detectJsonLang('my-article-json-en.json'), 'en');
});

test('detectJsonLang detects .id.json convention', () => {
  assert.equal(detectJsonLang('example-content.id.json'), 'id');
  assert.equal(detectJsonLang('example-content.en.json'), 'en');
});

test('detectJsonLang defaults to en', () => {
  assert.equal(detectJsonLang('example-content.json'), 'en');
  assert.equal(detectJsonLang('data.json'), 'en');
});

test('detectJsonLang is case-insensitive and does not match inside words', () => {
  assert.equal(detectJsonLang('ARTICLE-ID.JSON'), 'id');
  assert.equal(detectJsonLang('indonesia-guide.json'), 'en');
  assert.equal(detectJsonLang('keyword-targeting.json'), 'en');
});

test('matchFieldLabel maps CMS label texts to field keys', () => {
  assert.equal(matchFieldLabel('Title*'), 'title');
  assert.equal(matchFieldLabel('URL Slug'), 'slug');
  assert.equal(matchFieldLabel('Category'), 'category');
  assert.equal(matchFieldLabel('Publish Date'), 'date');
  assert.equal(matchFieldLabel('Excerpt'), 'excerpt');
  assert.equal(matchFieldLabel('Tags'), 'tags');
  assert.equal(matchFieldLabel('SEO Keywords'), 'keywords');
  assert.equal(matchFieldLabel('Meta Description'), 'meta');
  assert.equal(matchFieldLabel('Article Body'), 'body');
});

test('matchFieldLabel returns null for unknown labels', () => {
  assert.equal(matchFieldLabel('Cover Image'), null);
  assert.equal(matchFieldLabel(''), null);
});

test('parseJsonSafe returns data for valid JSON', () => {
  const r = parseJsonSafe('{"title":"Hello"}');
  assert.deepEqual(r, { ok: true, data: { title: 'Hello' }, error: null });
});

test('parseJsonSafe returns error message for invalid JSON', () => {
  const r = parseJsonSafe('{nope');
  assert.equal(r.ok, false);
  assert.equal(r.data, null);
  assert.match(r.error, /JSON/);
});

test('parseJsonSafe returns error for non-object JSON', () => {
  const r = parseJsonSafe('[1,2,3]');
  assert.equal(r.ok, false);
  assert.match(r.error, /object/i);
});

test('validatePackage reports missing required fields', () => {
  const r = validatePackage({});
  const codes = r.issues.map(i => i.code);
  assert.ok(codes.includes('missing_title'));
  assert.ok(codes.includes('missing_slug'));
  assert.ok(codes.includes('missing_excerpt'));
  assert.equal(r.ok, false);
});

test('validatePackage reports invalid date format', () => {
  const r = validatePackage({ date: '07-10-2026' });
  const issue = r.issues.find(i => i.code === 'bad_date');
  assert.ok(issue);
  assert.equal(issue.severity, 'warning');
});

test('validatePackage reports invalid slug format', () => {
  const r = validatePackage({ slug: 'Hello World!' });
  const issue = r.issues.find(i => i.code === 'bad_slug');
  assert.ok(issue);
  assert.equal(issue.severity, 'warning');
});

test('validatePackage passes with complete valid package', () => {
  const r = validatePackage({
    title: 'T', slug: 'my-slug', excerpt: 'E', date: '2026-10-07',
    category: 'Gym Planning', tags: ['a'], keywords: ['b'], meta: 'M', body: '<p>x</p>'
  });
  assert.equal(r.ok, true);
  assert.deepEqual(r.issues, []);
});

test('validatePackage does not flag valid slug variants', () => {
  assert.equal(validatePackage({ slug: 'a-1_b.c' }).issues.some(i => i.code === 'bad_slug'), false);
});

test('resolveCategory maps label to slug', () => {
  assert.deepEqual(resolveCategory('Equipment Guide'), { slug: 'equipment-guide', known: true });
  assert.deepEqual(resolveCategory('Industry Insights'), { slug: 'industry-insights', known: true });
});

test('resolveCategory passes through valid slugs', () => {
  assert.deepEqual(resolveCategory('maintenance'), { slug: 'maintenance', known: true });
});

test('resolveCategory marks unknown categories', () => {
  assert.deepEqual(resolveCategory('Cooking'), { slug: 'cooking', known: false });
});

test('resolveCategory handles empty input', () => {
  assert.deepEqual(resolveCategory(''), { slug: '', known: false });
});

test('buildFillPlan lists all fields with ready status for full package', () => {
  const plan = buildFillPlan({
    title: 'T', slug: 's', excerpt: 'E', date: '2026-10-07',
    category: 'Gym Planning', tags: ['a'], keywords: ['b'], meta: 'M', body: '<p>x</p>'
  });
  const byKey = Object.fromEntries(plan.map(f => [f.key, f]));
  assert.equal(plan.length, 9);
  assert.equal(byKey.title.status, 'ready');
  assert.equal(byKey.category.status, 'ready');
  assert.equal(byKey.body.status, 'ready');
});

test('buildFillPlan marks missing fields and unknown category', () => {
  const plan = buildFillPlan({ title: 'T', category: 'Cooking' });
  const byKey = Object.fromEntries(plan.map(f => [f.key, f]));
  assert.equal(byKey.slug.status, 'missing');
  assert.equal(byKey.category.status, 'warning');
  assert.equal(byKey.body.status, 'missing');
});

test('buildFillPlan accepts body from companion html file', () => {
  const plan = buildFillPlan({ title: 'T' }, { companionBody: '<p>from file</p>' });
  const body = plan.find(f => f.key === 'body');
  assert.equal(body.status, 'ready');
  assert.equal(body.source, 'file');
});

test('buildFillPlan normalizes string tags to arrays', () => {
  const plan = buildFillPlan({ tags: 'a, b', keywords: 'c' });
  const byKey = Object.fromEntries(plan.map(f => [f.key, f]));
  assert.equal(byKey.tags.status, 'ready');
  assert.deepEqual(byKey.tags.value, ['a', 'b']);
  assert.deepEqual(byKey.keywords.value, ['c']);
});

test('mdToHtml converts headings and paragraphs', () => {
  const html = mdToHtml('# Title\n\nSome text.');
  assert.match(html, /<h1>Title<\/h1>/);
  assert.match(html, /<p>Some text.<\/p>/);
});

test('mdToHtml converts bold, italic and links', () => {
  const html = mdToHtml('**bold** and *italic* and [link](https://x.com)');
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /<em>italic<\/em>/);
  assert.match(html, /<a href="https:\/\/x\.com">link<\/a>/);
});

test('mdToHtml converts ordered and unordered lists', () => {
  const html = mdToHtml('- one\n- two\n\n1. first\n2. second');
  assert.match(html, /<ul><li>one<\/li><li>two<\/li><\/ul>/);
  assert.match(html, /<ol><li>first<\/li><li>second<\/li><\/ol>/);
});

test('mdToHtml escapes raw HTML in markdown', () => {
  const html = mdToHtml('hello <script>alert(1)</script>');
  assert.ok(!html.includes('<script>'));
  assert.match(html, /&lt;script&gt;/);
});

test('mdToHtml converts inline code', () => {
  const html = mdToHtml('use `npm install`');
  assert.match(html, /<code>npm install<\/code>/);
});

test('ID_SECTION_KEYS only lists fields that exist in the Bahasa Indonesia section', () => {
  assert.deepEqual(ID_SECTION_KEYS, ['title', 'excerpt', 'tags', 'meta', 'body']);
});

test('buildFillPlan restricts plan to given keys', () => {
  const plan = buildFillPlan({
    title: 'T', slug: 's', excerpt: 'E', category: 'Gym Planning',
    tags: ['a'], meta: 'M', body: '<p>x</p>'
  }, { keys: ID_SECTION_KEYS });
  assert.deepEqual(plan.map(f => f.key), ID_SECTION_KEYS);
  const byKey = Object.fromEntries(plan.map(f => [f.key, f]));
  assert.equal(byKey.title.status, 'ready');
  assert.equal(byKey.body.status, 'ready');
});

test('validatePackage skips slug requirement for Indonesian section fields', () => {
  const r = validatePackage(
    { title: 'T', excerpt: 'E', tags: ['a'], meta: 'M', body: '<p>x</p>' },
    { fields: ID_SECTION_KEYS }
  );
  assert.equal(r.ok, true);
  assert.deepEqual(r.issues, []);
});

test('validatePackage still reports missing title for Indonesian section fields', () => {
  const r = validatePackage({ excerpt: 'E' }, { fields: ID_SECTION_KEYS });
  assert.deepEqual(r.issues.map(i => i.code), ['missing_title']);
});

test('validatePackage ignores bad date and slug when restricted to Indonesian fields', () => {
  const r = validatePackage({ title: 'T', excerpt: 'E', date: 'bad', slug: 'Bad Slug!' }, { fields: ID_SECTION_KEYS });
  assert.deepEqual(r.issues, []);
});

test('parseIdTagIndex reads aria-label of Indonesian tag boxes', () => {
  assert.equal(parseIdTagIndex('Tags 1 in Indonesian'), 1);
  assert.equal(parseIdTagIndex('Tags 12 in Indonesian'), 12);
  assert.equal(parseIdTagIndex('Cover Image'), null);
  assert.equal(parseIdTagIndex(''), null);
});
