(function () {
  'use strict';

  const lib = globalThis.CmsAutoFillLib;
  const i18n = globalThis.CmsI18n;

  const FIELD_LABEL = {
    title: 'fieldTitle',
    slug: 'fieldSlug',
    category: 'fieldCategory',
    date: 'fieldDate',
    excerpt: 'fieldExcerpt',
    tags: 'fieldTags',
    keywords: 'fieldKeywords',
    meta: 'fieldMeta',
    body: 'fieldBody'
  };

  const STATUS_MSG = {
    ready: 'statusReady',
    missing: 'statusMissing',
    warning: 'statusWarning',
    filled: 'statusFilled',
    skipped: 'statusSkipped',
    failed: 'statusFailed'
  };

  const ISSUE_MSG = {
    missing_title: 'issueMissingTitle',
    missing_slug: 'issueMissingSlug',
    missing_excerpt: 'issueMissingExcerpt',
    bad_date: 'issueBadDate',
    bad_slug: 'issueBadSlug'
  };

  const REASON_MSG = {
    category_unknown: 'reasonCategoryUnknown',
    body_editor: 'reasonBodyEditor',
    field_missing: 'reasonFieldMissing',
    no_value: 'reasonNoValue',
    empty_list: 'reasonEmptyList',
    id_checkbox: 'reasonIdCheckbox'
  };

  let root = null;
  let shadow = null;
  let styleElm = null;
  let state = {
    view: 'idle',
    en: null,
    id: null,
    companionName: '',
    results: [],
    minimized: false,
    expanded: false,
    toast: null
  };
  let toastTimer = null;
  let dropDepth = 0;
  let zoneElm = null;

  function setDragState(active) {
    if (!zoneElm || !zoneElm.isConnected) return;
    zoneElm.classList.toggle('is-drag', active);
    const title = zoneElm.querySelector('.dz-title');
    if (title) title.textContent = active ? t('dragOverTitle') : t('dropTitle');
  }

  function t(key, subs) {
    return i18n.t(key, subs);
  }

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach((k) => {
        const v = attrs[k];
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k === 'html') node.innerHTML = v;
        else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
        else if (v !== null && v !== undefined) node.setAttribute(k, v);
      });
    }
    (children || []).forEach((c) => {
      if (c) node.appendChild(c);
    });
    return node;
  }

  function toast(type, text) {
    state.toast = { type, text };
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      state.toast = null;
      render();
    }, 4500);
    render();
  }

  function readFile(file) {
    return file.text();
  }

  async function handleFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) {
      toast('error', t('toastNoFiles'));
      return;
    }

    const jsonByLang = { en: null, id: null };
    const jsonNameByLang = { en: '', id: '' };
    let companionText = '';
    let companionName = '';
    let companionIsMd = false;

    for (const file of files) {
      const lower = file.name.toLowerCase();
      if (lower.endsWith('.json')) {
        const lang = lib.detectJsonLang(file.name);
        jsonByLang[lang] = await readFile(file);
        jsonNameByLang[lang] = file.name;
      } else if (lower.endsWith('.html') || lower.endsWith('.htm') || lower.endsWith('.md') || lower.endsWith('.markdown')) {
        companionText = await readFile(file);
        companionName = file.name;
        companionIsMd = lower.endsWith('.md') || lower.endsWith('.markdown');
      }
    }

    if (jsonByLang.en === null && jsonByLang.id === null) {
      toast('error', t('toastNoFiles'));
      return;
    }

    const parsed = { en: null, id: null };
    for (const lang of ['en', 'id']) {
      if (jsonByLang[lang] === null) continue;
      const r = lib.parseJsonSafe(jsonByLang[lang]);
      if (!r.ok) {
        toast('error', t('toastJsonInvalid', r.error));
        return;
      }
      parsed[lang] = r.data;
    }

    if (companionText && companionIsMd) {
      companionText = lib.mdToHtml(companionText);
      toast('info', t('toastMdConverted'));
    }

    const companionTarget = parsed.en ? 'en' : 'id';
    const build = (lang) => {
      if (!parsed[lang]) return null;
      const pkg = parsed[lang];
      const isId = lang === 'id';
      return {
        fileName: jsonNameByLang[lang],
        plan: lib.buildFillPlan(pkg, {
          keys: isId ? lib.ID_SECTION_KEYS : undefined,
          companionBody: companionText && companionTarget === lang ? companionText : ''
        }),
        issues: lib.validatePackage(pkg, isId ? { fields: lib.ID_SECTION_KEYS } : undefined).issues
      };
    };

    state.en = build('en');
    state.id = build('id');
    state.companionName = companionName;
    state.view = 'preview';
    state.results = [];
    render();
  }

  function setNativeValue(elm, value) {
    const proto = elm.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) setter.call(elm, value);
    else elm.value = value;
    elm.dispatchEvent(new Event('input', { bubbles: true }));
    elm.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function setSelectValue(selectElm, value) {
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
    if (setter) setter.call(selectElm, value);
    else selectElm.value = value;
    selectElm.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function setTags(inputElm, tags) {
    tags.forEach((tag) => {
      setNativeValue(inputElm, tag);
      inputElm.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Enter',
          code: 'Enter',
          keyCode: 13,
          which: 13,
          bubbles: true,
          cancelable: true
        })
      );
    });
  }

  function fillTextField(id, value, results, key) {
    const elm = document.getElementById(id);
    if (!elm) {
      results.push({ key, status: 'failed', reason: 'field_missing', arg: '#' + id });
      return;
    }
    if (!value) {
      results.push({ key, status: 'skipped', reason: 'no_value' });
      return;
    }
    setNativeValue(elm, String(value));
    results.push({ key, status: 'filled' });
  }

  async function fillCategory(value, results) {
    const selectElm = document.getElementById('post-category');
    if (!selectElm) {
      results.push({ key: 'category', status: 'failed', reason: 'field_missing', arg: '#post-category' });
      return;
    }
    if (!value) {
      results.push({ key: 'category', status: 'skipped', reason: 'no_value' });
      return;
    }
    const resolved = lib.resolveCategory(value);
    if (!resolved.known) {
      results.push({ key: 'category', status: 'failed', reason: 'category_unknown', arg: value });
      return;
    }
    setSelectValue(selectElm, resolved.slug);
    results.push({ key: 'category', status: 'filled' });
  }

  function fillTagsField(id, tags, results, key) {
    const inputElm = document.getElementById(id);
    if (!inputElm) {
      results.push({ key, status: 'failed', reason: 'field_missing', arg: '#' + id });
      return;
    }
    const list = lib.toTagList(tags);
    if (!list.length) {
      results.push({ key, status: 'skipped', reason: 'empty_list' });
      return;
    }
    setTags(inputElm, list);
    results.push({ key, status: 'filled' });
  }

  function findIndonesianSection() {
    const heading = Array.from(document.querySelectorAll('h1, h2, h3')).find((h) =>
      /bahasa indonesia/i.test(h.textContent)
    );
    if (heading) {
      const section = heading.closest('section');
      if (section) return section;
    }
    const cb = findAddIndonesianCheckbox();
    return cb ? cb.closest('section') : null;
  }

  function bodyContainers() {
    return Array.from(document.querySelectorAll('.overflow-hidden')).filter(
      (c) =>
        c.querySelector('[role="toolbar"]') ||
        c.querySelector('button[title*="Edit the HTML"]') ||
        c.querySelector('button[title*="Back to the visual"]')
    );
  }

  function findBodyContainer(kind) {
    const idSection = findIndonesianSection();
    const all = bodyContainers();
    if (kind === 'id') {
      const inId = all.filter((c) => idSection && idSection.contains(c));
      if (inId.length) return inId[inId.length - 1];
      return null;
    }
    return all.find((c) => !(idSection && idSection.contains(c)) && !c.closest('fieldset')) || null;
  }

  async function fillBodyCore(kind, bodyHtml) {
    let container = findBodyContainer(kind);
    if (!container) return false;
    let ta = container.querySelector('textarea');
    if (!ta) {
      const btn = Array.from(container.querySelectorAll('button')).find((b) =>
        /edit the html/i.test(b.title || '')
      );
      if (!btn) return false;
      btn.click();
      await sleep(300);
      container = findBodyContainer(kind) || container;
      ta = container.querySelector('textarea');
    }
    if (ta) {
      setNativeValue(ta, bodyHtml);
      return true;
    }
    const ce = container.querySelector('[contenteditable="true"]');
    if (ce && ce.isConnected) {
      ce.innerHTML = bodyHtml;
      ce.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }
    return false;
  }

  async function fillBody(bodyHtml, results) {
    if (!bodyHtml) {
      results.push({ key: 'body', status: 'skipped', reason: 'no_value' });
      return;
    }
    const ok = await fillBodyCore('main', bodyHtml);
    results.push(
      ok
        ? { key: 'body', status: 'filled' }
        : { key: 'body', status: 'failed', reason: 'body_editor', arg: t('fieldBody') }
    );
  }

  function findAddIndonesianCheckbox() {
    const byLabel = Array.from(document.querySelectorAll('label')).find((l) =>
      /add\s+indonesian/i.test(l.textContent)
    );
    if (byLabel) {
      const cb = byLabel.querySelector('input[type="checkbox"]');
      if (cb) return cb;
    }
    const heading = Array.from(document.querySelectorAll('h1, h2, h3')).find((h) =>
      /bahasa indonesia/i.test(h.textContent)
    );
    if (heading) {
      const section = heading.closest('section');
      const cb = section && section.querySelector('input[type="checkbox"]');
      if (cb) return cb;
    }
    return null;
  }

  function collectIdSectionFields(section) {
    const fields = {};
    const tagInputs = [];
    let fieldset = null;
    if (!section) return { fields, tagInputs, fieldset };
    for (const label of section.querySelectorAll('label[for]')) {
      const key = lib.matchFieldLabel(label.textContent);
      if (!key || !lib.ID_SECTION_KEYS.includes(key)) continue;
      const elm = document.getElementById(label.getAttribute('for'));
      if (elm && !fields[key]) fields[key] = elm;
    }
    for (const input of section.querySelectorAll('input[aria-label]')) {
      const idx = lib.parseIdTagIndex(input.getAttribute('aria-label'));
      if (idx !== null) tagInputs[idx] = input;
    }
    for (const legend of section.querySelectorAll('fieldset legend')) {
      if (/article body/i.test(legend.textContent)) fieldset = legend.closest('fieldset');
    }
    return { fields, tagInputs, fieldset };
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function idFieldArg(key) {
    return t('groupIndonesian') + ' · ' + t(FIELD_LABEL[key]);
  }

  function pushIdField(results, key, status, extra) {
    results.push(Object.assign({ key, status, group: 'id' }, extra || {}));
  }

  async function waitForIdSectionFields(timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    let collected = collectIdSectionFields(findIndonesianSection());
    while (Date.now() < deadline) {
      const ready =
        Object.keys(collected.fields).length || collected.tagInputs.some(Boolean) || collected.fieldset;
      if (ready) return collected;
      await sleep(150);
      collected = collectIdSectionFields(findIndonesianSection());
    }
    return collected;
  }

  function fillIdTextField(elm, value, results, key) {
    if (!elm) {
      pushIdField(results, key, 'failed', { reason: 'field_missing', arg: idFieldArg(key) });
      return;
    }
    if (!value) {
      pushIdField(results, key, 'skipped', { reason: 'no_value' });
      return;
    }
    setNativeValue(elm, String(value));
    pushIdField(results, key, 'filled');
  }

  function fillIdTagsField(tagInputs, value, results) {
    const inputs = tagInputs.filter(Boolean);
    if (!inputs.length) {
      pushIdField(results, 'tags', 'failed', { reason: 'field_missing', arg: idFieldArg('tags') });
      return;
    }
    const list = lib.toTagList(value);
    if (!list.length) {
      pushIdField(results, 'tags', 'skipped', { reason: 'empty_list' });
      return;
    }
    inputs.forEach((inp, i) => setNativeValue(inp, list[i] !== undefined ? String(list[i]) : ''));
    pushIdField(results, 'tags', 'filled');
  }

  async function fillIdBody(fieldset, bodyHtml, results) {
    if (!bodyHtml) {
      pushIdField(results, 'body', 'skipped', { reason: 'no_value' });
      return;
    }
    if (!fieldset) {
      pushIdField(results, 'body', 'failed', { reason: 'body_editor', arg: idFieldArg('body') });
      return;
    }
    const ok = await fillBodyCore('id', bodyHtml);
    pushIdField(
      results,
      'body',
      ok ? 'filled' : 'failed',
      ok ? {} : { reason: 'body_editor', arg: idFieldArg('body') }
    );
  }

  async function fillIndonesianSection(plan, results) {
    const failAll = (reason) =>
      plan.forEach((f) => results.push({ key: f.key, status: 'failed', reason, group: 'id' }));

    const section = findIndonesianSection();
    const checkbox = findAddIndonesianCheckbox();
    if (!section || !checkbox) {
      failAll('id_checkbox');
      return;
    }

    if (!checkbox.checked) {
      checkbox.click();
      await sleep(300);
    }

    const { fields, tagInputs, fieldset } = await waitForIdSectionFields(section, 2000);
    const byKey = {};
    plan.forEach((f) => {
      byKey[f.key] = f;
    });

    fillIdTextField(fields.title, byKey.title?.value, results, 'title');
    fillIdTextField(fields.excerpt, byKey.excerpt?.value, results, 'excerpt');
    fillIdTextField(fields.meta, byKey.meta?.value, results, 'meta');
    fillIdTagsField(tagInputs, byKey.tags?.value, results);
    await fillIdBody(fieldset, byKey.body?.value, results);
  }

  async function fillMainFromPlan(plan, results) {
    const byKey = {};
    plan.forEach((f) => {
      byKey[f.key] = f;
    });

    const start = results.length;
    fillTextField('post-title', byKey.title?.value, results, 'title');
    fillTextField('post-slug', byKey.slug?.value, results, 'slug');
    fillTextField('post-excerpt', byKey.excerpt?.value, results, 'excerpt');
    fillTextField('post-date', byKey.date?.value, results, 'date');
    fillTextField('post-meta', byKey.meta?.value, results, 'meta');
    const categoryField = byKey.category;
    await fillCategory(categoryField?.original ?? categoryField?.value, results);
    fillTagsField('post-tags', byKey.tags?.value, results, 'tags');
    fillTagsField('post-keywords', byKey.keywords?.value, results, 'keywords');
    await fillBody(byKey.body?.value, results);
    for (let i = start; i < results.length; i++) results[i].group = 'main';
  }

  async function executeFill() {
    const results = [];

    if (state.en) await fillMainFromPlan(state.en.plan, results);
    if (state.id) await fillIndonesianSection(state.id.plan, results);

    const order = lib.FIELD_KEYS;
    results.sort((a, b) => {
      const g = (a.group === 'id' ? 1 : 0) - (b.group === 'id' ? 1 : 0);
      return g !== 0 ? g : order.indexOf(a.key) - order.indexOf(b.key);
    });
    state.results = results;
    state.view = 'report';
    render();
  }

  function statusChip(status) {
    return el('span', { class: 'chip chip-' + status, text: t(STATUS_MSG[status] || 'statusReady') });
  }

  function buildIdleView() {
    const input = el('input', {
      type: 'file',
      accept: '.json,.html,.htm,.md,.markdown,application/json,text/html,text/markdown',
      class: 'file-input',
      onchange: (e) => {
        handleFiles(e.target.files);
        e.target.value = '';
      }
    });

    const zone = el(
      'div',
      {
        class: 'dropzone' + (dropDepth > 0 ? ' is-drag' : ''),
        role: 'button',
        tabindex: '0',
        'aria-label': t('dropTitle'),
        onclick: () => input.click(),
        onkeydown: (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            input.click();
          }
        },
        ondragenter: (e) => {
          e.preventDefault();
          dropDepth++;
          setDragState(true);
        },
        ondragover: (e) => {
          e.preventDefault();
        },
        ondragleave: (e) => {
          e.preventDefault();
          dropDepth = Math.max(0, dropDepth - 1);
          if (dropDepth === 0) setDragState(false);
        },
        ondrop: (e) => {
          e.preventDefault();
          dropDepth = 0;
          setDragState(false);
          handleFiles(e.dataTransfer.files);
        }
      },
      [
        el('div', { class: 'dz-icon', html: ICON_UPLOAD }),
        el('div', { class: 'dz-title', text: t('dropTitle') }),
        el('div', { class: 'dz-sub' }, [
          el('span', { text: t('dropSubtitle') + ' · ' }),
          el('a', {
            class: 'dz-browse',
            text: t('browseLink'),
            onclick: (e) => {
              e.stopPropagation();
              input.click();
            }
          })
        ])
      ]
    );

    zoneElm = zone;
    return el('div', { class: 'view' }, [zone, input]);
  }

  function buildPackageBlock(pkg, group) {
    const readyCount = pkg.plan.filter((f) => f.status === 'ready').length;
    const headingText = group === 'id' ? t('groupIndonesian') : t('groupMain');

    const children = [];

    if (state.en && state.id) {
      children.push(el('div', { class: 'group-title', text: headingText }));
    }

    children.push(
      el('div', { class: 'file-row' }, [
        el('span', { class: 'file-icon', html: ICON_FILE }),
        el('div', { class: 'file-meta' }, [
          el('div', { class: 'file-name', text: pkg.fileName }),
          el('div', {
            class: 'file-count',
            text: t('previewFieldCount', [String(readyCount), String(pkg.plan.length)])
          })
        ]),
        group === 'id' ? el('span', { class: 'lang-tag', text: 'ID' }) : null
      ].filter(Boolean))
    );

    if (pkg.issues.length) {
      children.push(
        el('div', { class: 'issues' }, [
          el('div', { class: 'issues-title', text: t('validationHeading') }),
          el(
            'ul',
            { class: 'issues-list' },
            pkg.issues.map((issue) => el('li', { text: t(ISSUE_MSG[issue.code] || issue.code) }))
          )
        ])
      );
    }

    children.push(
      el(
        'ul',
        { class: 'field-list' },
        pkg.plan.map((f) =>
          el('li', { class: 'field-item' }, [
            el('span', { class: 'field-name', text: t(FIELD_LABEL[f.key]) }),
            statusChip(f.status)
          ])
        )
      )
    );

    return children;
  }

  function buildPreviewView() {
    const children = [el('h2', { class: 'view-title', text: t('previewHeading') })];

    if (state.companionName) {
      children.push(el('div', { class: 'note', text: t('previewCompanionNote', state.companionName) }));
    }

    if (state.en) children.push(...buildPackageBlock(state.en, 'main'));
    if (state.id) children.push(...buildPackageBlock(state.id, 'id'));

    if (state.en && state.id) {
      children.push(el('div', { class: 'note', text: t('dualFillNote') }));
    }

    children.push(
      el('div', { class: 'actions' }, [
        el('button', {
          class: 'btn btn-primary',
          text: t('fillButton'),
          onclick: () => executeFill()
        }),
        el('button', {
          class: 'btn btn-ghost',
          text: t('cancelButton'),
          onclick: () => {
            state.view = 'idle';
            state.en = null;
            state.id = null;
            render();
          }
        })
      ])
    );

    return el('div', { class: 'view' }, children);
  }

  function buildReportGroup(results, group) {
    const heading =
      state.en && state.id
        ? el('div', {
            class: 'group-title',
            text: group === 'id' ? t('groupIndonesian') : t('groupMain')
          })
        : null;
    const list = el(
      'ul',
      { class: 'field-list' },
      results.map((r) => {
        const reasonKey = r.reason && REASON_MSG[r.reason];
        const label = reasonKey ? t(reasonKey, r.arg ? [r.arg] : undefined) : '';
        return el('li', { class: 'field-item' }, [
          el('span', { class: 'field-name', text: t(FIELD_LABEL[r.key]) }),
          statusChip(r.status),
          label ? el('span', { class: 'field-reason', text: label }) : null
        ]);
      })
    );
    return heading ? [heading, list] : [list];
  }

  function buildReportView() {
    const allOk = state.results.every((r) => r.status === 'filled');
    const children = [el('h2', { class: 'view-title', text: t('reportHeading') })];

    const mainResults = state.results.filter((r) => r.group !== 'id');
    const idResults = state.results.filter((r) => r.group === 'id');

    if (mainResults.length) children.push(...buildReportGroup(mainResults, 'main'));
    if (idResults.length) children.push(...buildReportGroup(idResults, 'id'));

    if (allOk) {
      children.push(el('div', { class: 'note note-ok', text: t('reportAllOk') }));
    }

    children.push(
      el('div', { class: 'actions' }, [
        el('button', {
          class: 'btn btn-primary',
          text: t('reportDone'),
          onclick: () => {
            state.view = 'idle';
            state.en = null;
            state.id = null;
            state.results = [];
            render();
          }
        })
      ])
    );

    return el('div', { class: 'view' }, children);
  }

  function buildLangToggle() {
    const current = i18n.getLang();
    const mk = (code, label) =>
      el('button', {
        class: 'lang-btn' + (current === code ? ' is-active' : ''),
        text: label,
        'aria-pressed': current === code ? 'true' : 'false',
        onclick: () => i18n.setLang(code)
      });
    return el('div', { class: 'lang-toggle', role: 'group', 'aria-label': t('langToggleTitle') }, [
      mk('en', 'EN'),
      mk('id', 'ID')
    ]);
  }

  function buildToast() {
    if (!state.toast) return null;
    const icon = state.toast.type === 'error' ? ICON_ALERT : state.toast.type === 'info' ? ICON_INFO : ICON_CHECK;
    return el('div', { class: 'toast toast-' + state.toast.type, role: 'status' }, [
      el('span', { class: 'toast-icon', html: icon }),
      el('span', { class: 'toast-text', text: state.toast.text }),
      el('button', {
        class: 'toast-close',
        text: '×',
        'aria-label': 'close',
        onclick: () => {
          state.toast = null;
          render();
        }
      })
    ]);
  }

  function hideWidgetForSite() {
    const key = siteKey();
    i18n.storageGet('siteOverrides').then((overrides) => {
      const next = Object.assign({}, overrides || {});
      next[key] = false;
      i18n.storageSet({ siteOverrides: next }).then(() => {
        if (root) root.style.display = 'none';
      });
    });
  }

  function buildCard() {
    let view;
    if (state.view === 'preview') view = buildPreviewView();
    else if (state.view === 'report') view = buildReportView();
    else view = buildIdleView();

    const head = el('div', { class: 'card-head' }, [
      el('span', { class: 'brand-mark', html: ICON_MARK }),
      el('span', { class: 'brand-name', text: 'CMS Auto Fill' }),
      el('div', { class: 'head-actions' }, [
        buildLangToggle(),
        el('button', {
          class: 'icon-btn',
          html: state.expanded ? ICON_COLLAPSE : ICON_EXPAND,
          title: state.expanded ? 'collapse' : 'expand',
          'aria-label': state.expanded ? 'collapse' : 'expand',
          onclick: () => {
            state.expanded = !state.expanded;
            render();
          }
        }),
        el('button', {
          class: 'icon-btn',
          html: ICON_MIN,
          title: 'minimize',
          'aria-label': 'minimize',
          onclick: () => {
            state.minimized = true;
            render();
          }
        }),
        el('button', {
          class: 'icon-btn',
          html: ICON_CLOSE,
          title: 'close',
          'aria-label': 'close',
          onclick: hideWidgetForSite
        })
      ])
    ]);

    const toastElm = buildToast();

    return el('div', { class: 'card' + (state.expanded ? ' is-expanded' : '') }, [head, view, toastElm].filter(Boolean));
  }

  function buildFab() {
    return el('button', {
      class: 'fab',
      html: ICON_MARK,
      title: 'CMS Auto Fill',
      'aria-label': 'CMS Auto Fill',
      onclick: () => {
        state.minimized = false;
        render();
      }
    });
  }

  function render() {
    if (!shadow) return;
    shadow.innerHTML = '';
    if (styleElm) shadow.appendChild(styleElm);
    shadow.appendChild(el('div', { class: 'wrap' }, [state.minimized ? buildFab() : buildCard()]));
  }

  function siteKey() {
    return location.hostname || location.protocol.replace(':', '');
  }

  function isSiteEnabled(settings, key) {
    const overrides = settings.siteOverrides || {};
    if (Object.prototype.hasOwnProperty.call(overrides, key)) return overrides[key];
    if (/admin-realleader/.test(location.hostname + location.pathname)) return true;
    if (location.protocol === 'file:') return true;
    const sites = settings.sites || [];
    return sites.some((d) => location.hostname === d || location.hostname.endsWith('.' + d));
  }

  function applyVisibility(settings) {
    if (!root) return;
    root.style.display = isSiteEnabled(settings, siteKey()) ? '' : 'none';
  }

  function mount(settings) {
    if (root) return;
    root = document.createElement('div');
    root.id = 'cms-auto-fill-root';
    root.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:2147483647;';
    shadow = root.attachShadow({ mode: 'open' });
    document.documentElement.appendChild(root);

    fetch(chrome.runtime.getURL('styles.css'))
      .then((r) => r.text())
      .then((css) => {
        styleElm = document.createElement('style');
        styleElm.textContent = css;
        render();
      })
      .catch(() => render());

    applyVisibility(settings);
  }

  function start() {
    Promise.all([
      i18n.load(),
      i18n.storageGet('siteOverrides'),
      i18n.storageGet('sites')
    ]).then(([_, overrides, sites]) => {
      const settings = { siteOverrides: overrides || {}, sites: sites || [] };
      mount(settings);
    });

    i18n.onChange(() => render());

    try {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes.lang) {
          const next = changes.lang.newValue;
          if (next === 'en' || next === 'id') i18n.setLang(next);
        }
        const overrides = changes.siteOverrides ? changes.siteOverrides.newValue : null;
        const sites = changes.sites ? changes.sites.newValue : null;
        if (overrides || sites || changes.lang) {
          i18n.storageGet('siteOverrides').then((ov) =>
            i18n.storageGet('sites').then((st) => {
              const settings = {
                siteOverrides: ov || {},
                sites: st || []
              };
              applyVisibility(settings);
              if (overrides || sites) render();
            })
          );
        }
      });
    } catch (e) {}
  }

  const ICON_UPLOAD =
    '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 16V4m0 0 4 4m-4-4-4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
  const ICON_FILE =
    '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M14 3v5h5" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  const ICON_MARK =
    '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true" width="18" height="18"><rect x="3" y="3" width="18" height="18" rx="5" fill="#e62129"/><path d="M12 7.5v6.2m0 0 2.6-2.6M12 13.7l-2.6-2.6" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 16.8h8" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/></svg>';
  const ICON_MIN =
    '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true"><path d="M3.5 8h9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
  const ICON_EXPAND =
    '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true"><path d="M9.5 2.5h4v4M6.5 13.5h-4v-4M13.5 2.5 9.8 6.2M2.5 13.5l3.7-3.7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const ICON_COLLAPSE =
    '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true"><path d="M13.5 9.5h-4v4M2.5 6.5h4v-4M13.5 6.5 9.8 2.8M2.5 9.5l3.7-3.7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const ICON_CLOSE =
    '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
  const ICON_CHECK =
    '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true"><path d="m3.5 8.5 3 3 6-7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const ICON_ALERT =
    '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true"><path d="M8 4v5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="8" cy="11.6" r="1" fill="currentColor"/><path d="M7.1 2.6 1.9 12a1 1 0 0 0 .9 1.5h10.4a1 1 0 0 0 .9-1.5L8.9 2.6a1 1 0 0 0-1.8 0Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>';
  const ICON_INFO =
    '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="6.2" stroke="currentColor" stroke-width="1.5"/><path d="M8 7.4V11" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="8" cy="5" r="0.9" fill="currentColor"/></svg>';

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
