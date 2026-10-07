(function (root) {
  'use strict';

  let catalogs = null;
  let lang = null;
  const listeners = new Set();

  function detectDefaultLang() {
    try {
      const ui = chrome.i18n.getUILanguage();
      return ui && ui.toLowerCase().startsWith('id') ? 'id' : 'en';
    } catch (e) {
      return 'en';
    }
  }

  function storageGet(key) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get(key, (items) => resolve(items[key]));
      } catch (e) {
        resolve(undefined);
      }
    });
  }

  function storageSet(obj) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.set(obj, resolve);
      } catch (e) {
        resolve();
      }
    });
  }

  function fetchCatalog(locale) {
    return fetch(chrome.runtime.getURL('_locales/' + locale + '/messages.json'))
      .then((r) => r.json())
      .catch(() => ({}));
  }

  function load() {
    if (catalogs) return Promise.resolve(catalogs);
    return Promise.all([
      storageGet('lang'),
      fetchCatalog('en'),
      fetchCatalog('id')
    ]).then(([stored, en, id]) => {
      catalogs = { en, id };
      lang = stored === 'en' || stored === 'id' ? stored : detectDefaultLang();
      return catalogs;
    });
  }

  function getLang() {
    return lang || detectDefaultLang();
  }

  function setLang(next) {
    lang = next === 'id' ? 'id' : 'en';
    return storageSet({ lang }).then(() => {
      listeners.forEach((fn) => {
        try {
          fn(lang);
        } catch (e) {}
      });
    });
  }

  function onChange(fn) {
    listeners.add(fn);
  }

  function t(key, subs) {
    if (!loadSync()) return key;
    const entry = catalogs[lang][key] || catalogs.en[key];
    if (!entry) return key;
    let msg = entry.message;
    const placeholders = entry.placeholders || {};
    Object.keys(placeholders).forEach((name) => {
      const content = placeholders[name].content || '';
      const re = new RegExp('\\$' + name + '\\$', 'gi');
      msg = msg.replace(re, () => content);
    });
    if (subs !== undefined && subs !== null) {
      const arr = Array.isArray(subs) ? subs : [subs];
      msg = msg.replace(/\$(\d+)/g, (m, d) => {
        const v = arr[Number(d) - 1];
        return v === undefined || v === null ? m : String(v);
      });
    }
    return msg;
  }

  function loadSync() {
    return !!catalogs;
  }

  root.CmsI18n = { load, getLang, setLang, onChange, t, storageGet, storageSet };
})(typeof globalThis !== 'undefined' ? globalThis : this);
