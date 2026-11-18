import i18n from '../i18n.js';

export function t(lang, key, options) {
  if (lang && i18n.hasLoadedNamespace('translation')) {
    return i18n.getFixedT(lang)(`nav.${key}`, {
      defaultValue: i18n.getFixedT(lang)(key, options),
    });
  }
  return i18n.t(key, options);
}

export { i18n };
