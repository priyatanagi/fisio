(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.CmsAutoFillLib = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const FIELD_KEYS = ['title', 'slug', 'category', 'date', 'excerpt', 'tags', 'keywords', 'meta', 'body'];

  const ID_SECTION_KEYS = ['title', 'excerpt', 'tags', 'meta', 'body'];

  const CATEGORY_MAP = {
    'Equipment Guide': 'equipment-guide',
    'Gym Planning': 'gym-planning',
    Maintenance: 'maintenance',
    'Industry Insights': 'industry-insights'
  };

  const SLUG_RE = /^[a-z0-9]+(?:[-_.][a-z0-9]+)*$/;
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

  function parseJsonSafe(text) {
    let data;
    try {
      data = JSON.parse(text);
    } catch (err) {
      return { ok: false, data: null, error: 'Invalid JSON: ' + err.message };
    }
    if (data === null || typeof data !== 'object' || Array.isArray(data)) {
      return { ok: false, data: null, error: 'Invalid JSON: expected a top-level object' };
    }
    return { ok: true, data, error: null };
  }

  function validatePackage(pkg, opts) {
    const fields = (opts && opts.fields) || FIELD_KEYS;
    const issues = [];
    const add = (code, severity, field) => issues.push({ code, severity, field });

    for (const field of ['title', 'slug', 'excerpt']) {
      if (!fields.includes(field)) continue;
      const v = pkg[field];
      if (v === undefined || v === null || (typeof v === 'string' && !v.trim())) {
        add('missing_' + field, 'error', field);
      }
    }

    if (fields.includes('date') && pkg.date !== undefined && pkg.date !== '' && !DATE_RE.test(String(pkg.date))) {
      add('bad_date', 'warning', 'date');
    }

    if (fields.includes('slug') && typeof pkg.slug === 'string' && pkg.slug.trim() && !SLUG_RE.test(pkg.slug.trim())) {
      add('bad_slug', 'warning', 'slug');
    }

    return { ok: issues.every(i => i.severity !== 'error'), issues };
  }

  function resolveCategory(value) {
    const raw = String(value || '').trim();
    if (!raw) return { slug: '', known: false };
    if (CATEGORY_MAP[raw]) return { slug: CATEGORY_MAP[raw], known: true };
    const slug = raw.toLowerCase().replace(/\s+/g, '-');
    return { slug, known: Object.values(CATEGORY_MAP).includes(slug) };
  }

  function toTagList(value) {
    if (Array.isArray(value)) return value.map(v => String(v).trim()).filter(Boolean);
    if (typeof value === 'string') return value.split(',').map(v => v.trim()).filter(Boolean);
    return [];
  }

  function buildFillPlan(pkg, extras) {
    extras = extras || {};
    const keys = extras.keys || FIELD_KEYS;
    const plan = [];
    const has = (v) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0);

    for (const key of keys) {
      if (key === 'body') {
        if (extras.companionBody) {
          plan.push({ key, status: 'ready', source: 'file', value: extras.companionBody });
        } else if (has(pkg.body)) {
          plan.push({ key, status: 'ready', source: 'json', value: pkg.body });
        } else {
          plan.push({ key, status: 'missing', source: null, value: '' });
        }
        continue;
      }

      if (key === 'category') {
        if (!has(pkg.category)) {
          plan.push({ key, status: 'missing', source: null, value: '' });
        } else {
          const r = resolveCategory(pkg.category);
          plan.push({ key, status: r.known ? 'ready' : 'warning', source: 'json', value: r.slug, original: pkg.category });
        }
        continue;
      }

      if (key === 'tags' || key === 'keywords') {
        const list = toTagList(pkg[key]);
        plan.push({ key, status: list.length ? 'ready' : 'missing', source: list.length ? 'json' : null, value: list });
        continue;
      }

      if (has(pkg[key])) {
        plan.push({ key, status: 'ready', source: 'json', value: pkg[key] });
      } else {
        plan.push({ key, status: 'missing', source: null, value: '' });
      }
    }

    return plan;
  }

  function escapeHtml(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escapeAttr(text) {
    return text.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function inline(text) {
    let out = escapeHtml(text);
    out = out.replace(/`([^`]+)`/g, (_, c) => '<code>' + c + '</code>');
    out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, url) => '<a href="' + escapeAttr(url) + '">' + label + '</a>');
    out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    return out;
  }

  function mdToHtml(markdown) {
    const lines = String(markdown).replace(/\r\n?/g, '\n').split('\n');
    const out = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      if (/^\s*$/.test(line)) {
        i++;
        continue;
      }

      if (/^```/.test(line)) {
        const buf = [];
        i++;
        while (i < lines.length && !/^```/.test(lines[i])) {
          buf.push(lines[i]);
          i++;
        }
        i++;
        out.push('<pre><code>' + escapeHtml(buf.join('\n')) + '</code></pre>');
        continue;
      }

      const h = line.match(/^(#{1,6})\s+(.*)$/);
      if (h) {
        out.push('<h' + h[1].length + '>' + inline(h[2].trim()) + '</h' + h[1].length + '>');
        i++;
        continue;
      }

      if (/^\s*[-*+]\s+/.test(line)) {
        const items = [];
        while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
          items.push('<li>' + inline(lines[i].replace(/^\s*[-*+]\s+/, '')) + '</li>');
          i++;
        }
        out.push('<ul>' + items.join('') + '</ul>');
        continue;
      }

      if (/^\s*\d+[.)]\s+/.test(line)) {
        const items = [];
        while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
          items.push('<li>' + inline(lines[i].replace(/^\s*\d+[.)]\s+/, '')) + '</li>');
          i++;
        }
        out.push('<ol>' + items.join('') + '</ol>');
        continue;
      }

      if (/^>\s?/.test(line)) {
        const buf = [];
        while (i < lines.length && /^>\s?/.test(lines[i])) {
          buf.push(lines[i].replace(/^>\s?/, ''));
          i++;
        }
        out.push('<blockquote><p>' + inline(buf.join(' ')) + '</p></blockquote>');
        continue;
      }

      if (/^(---|\*\*\*|___)\s*$/.test(line)) {
        out.push('<hr>');
        i++;
        continue;
      }

      const buf = [];
      while (
        i < lines.length &&
        !/^\s*$/.test(lines[i]) &&
        !/^(#{1,6})\s+/.test(lines[i]) &&
        !/^\s*[-*+]\s+/.test(lines[i]) &&
        !/^\s*\d+[.)]\s+/.test(lines[i]) &&
        !/^```/.test(lines[i]) &&
        !/^>\s?/.test(lines[i])
      ) {
        buf.push(lines[i]);
        i++;
      }
      if (buf.length) out.push('<p>' + inline(buf.join(' ')) + '</p>');
    }

    return out.join('\n');
  }

  function detectJsonLang(fileName) {
    const base = String(fileName || '')
      .toLowerCase()
      .replace(/\.json$/, '');
    if (/(^|[-_.])id$/.test(base)) return 'id';
    return 'en';
  }

  const FIELD_LABEL_PATTERNS = [
    [/^title$/, 'title'],
    [/^(url slug|slug)$/, 'slug'],
    [/^category$/, 'category'],
    [/^(publish date|date)$/, 'date'],
    [/^excerpt$/, 'excerpt'],
    [/^tags$/, 'tags'],
    [/^(seo keywords|keywords)$/, 'keywords'],
    [/^(meta description|meta)$/, 'meta'],
    [/^(article body|body)$/, 'body']
  ];

  function matchFieldLabel(text) {
    const norm = String(text || '')
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!norm) return null;
    for (const [re, key] of FIELD_LABEL_PATTERNS) {
      if (re.test(norm)) return key;
    }
    return null;
  }

  function parseIdTagIndex(ariaLabel) {
    const m = /^tags\s+(\d+)\s+in\s+indonesian$/i.exec(String(ariaLabel || '').trim());
    return m ? Number(m[1]) : null;
  }

  return {
    FIELD_KEYS,
    ID_SECTION_KEYS,
    CATEGORY_MAP,
    parseJsonSafe,
    validatePackage,
    resolveCategory,
    toTagList,
    buildFillPlan,
    mdToHtml,
    detectJsonLang,
    matchFieldLabel,
    parseIdTagIndex
  };
});
