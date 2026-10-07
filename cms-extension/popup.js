(function () {
  'use strict';

  const i18n = globalThis.CmsI18n;
  let currentTab = null;

  function t(key, subs) {
    return i18n.t(key, subs);
  }

  function getActiveTab() {
    return new Promise((resolve) => {
      try {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => resolve(tabs[0] || null));
      } catch (e) {
        resolve(null);
      }
    });
  }

  function tabUrl() {
    if (!currentTab || !currentTab.url) return null;
    try {
      return new URL(currentTab.url);
    } catch (e) {
      return null;
    }
  }

  function siteKey() {
    const u = tabUrl();
    if (!u) return '';
    return u.hostname || u.protocol.replace(':', '');
  }

  function isDefaultEnabled(u) {
    if (!u) return false;
    if (/admin-realleader/.test(u.hostname + u.pathname)) return true;
    if (u.protocol === 'file:') return true;
    return false;
  }

  function effectiveEnabled(settings, u) {
    if (!u) return false;
    const key = u.hostname || u.protocol.replace(':', '');
    const overrides = settings.siteOverrides || {};
    if (Object.prototype.hasOwnProperty.call(overrides, key)) return overrides[key];
    if (isDefaultEnabled(u)) return true;
    const sites = settings.sites || [];
    return sites.some((d) => u.hostname === d || u.hostname.endsWith('.' + d));
  }

  function storageState() {
    return Promise.all([i18n.storageGet('siteOverrides'), i18n.storageGet('sites')]).then(
      ([overrides, sites]) => ({ siteOverrides: overrides || {}, sites: sites || [] })
    );
  }

  function renderLangButtons() {
    const current = i18n.getLang();
    document.querySelectorAll('.lang-btn').forEach((btn) => {
      const active = btn.dataset.lang === current;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function applyStrings() {
    document.getElementById('heading').textContent = t('popupHeading');
    document.getElementById('siteToggleLabel').textContent = t('popupEnableSite');
    document.getElementById('sitesHeading').textContent = t('popupSitesHeading');
    document.getElementById('siteInput').placeholder = t('popupAddPlaceholder');
    document.getElementById('siteAdd').textContent = t('popupAddButton');
    document.getElementById('note').textContent = t('popupDefaultNote');
    renderLangButtons();
  }

  function renderSites(settings) {
    const list = document.getElementById('sitesList');
    const sites = settings.sites || [];
    list.innerHTML = '';

    sites.forEach((host) => {
      const li = document.createElement('li');
      const span = document.createElement('span');
      span.className = 'host';
      span.textContent = host;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = t('popupRemoveLabel');
      btn.setAttribute('aria-label', t('popupRemoveLabel') + ' ' + host);
      btn.addEventListener('click', () => {
        const next = (settings.sites || []).filter((s) => s !== host);
        i18n.storageSet({ sites: next }).then(refresh);
      });
      li.appendChild(span);
      li.appendChild(btn);
      list.appendChild(li);
    });
  }

  function renderToggle(settings) {
    const u = tabUrl();
    const checkbox = document.getElementById('siteToggle');
    const hostEl = document.getElementById('siteHost');
    const enabled = effectiveEnabled(settings, u);
    checkbox.checked = enabled;
    checkbox.disabled = !u;
    hostEl.textContent = u ? u.hostname || u.href : '';
    document.getElementById('siteToggleLabel').textContent = enabled
      ? t('popupDisableSite')
      : t('popupEnableSite');
  }

  function refresh() {
    storageState().then((settings) => {
      renderToggle(settings);
      renderSites(settings);
      applyStrings();
    });
  }

  function toggleSite() {
    storageState().then((settings) => {
      const u = tabUrl();
      if (!u) return;
      const key = u.hostname || u.protocol.replace(':', '');
      const next = Object.assign({}, settings.siteOverrides);
      next[key] = !effectiveEnabled(settings, u);
      i18n.storageSet({ siteOverrides: next }).then(refresh);
    });
  }

  function addSite() {
    const input = document.getElementById('siteInput');
    const value = input.value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!value) return;
    storageState().then((settings) => {
      if (settings.sites.includes(value)) {
        input.value = '';
        return;
      }
      const next = settings.sites.concat(value);
      i18n.storageSet({ sites: next }).then(() => {
        input.value = '';
        refresh();
      });
    });
  }

  function start() {
    i18n.load().then(() => {
      getActiveTab().then((tab) => {
        currentTab = tab;
        refresh();
      });
    });

    document.querySelectorAll('.lang-btn').forEach((btn) => {
      btn.addEventListener('click', () => i18n.setLang(btn.dataset.lang).then(refresh));
    });
    document.getElementById('siteToggle').addEventListener('change', toggleSite);
    document.getElementById('siteAdd').addEventListener('click', addSite);
    document.getElementById('siteInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addSite();
      }
    });
  }

  start();
})();
