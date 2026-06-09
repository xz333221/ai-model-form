import { computed } from 'vue';
import zhCN from './zh-CN.js';
import enUS from './en-US.js';

const DICTS = {
  'zh-CN': zhCN,
  'en-US': enUS,
};

export const SUPPORTED_LOCALES = Object.keys(DICTS);
export const DEFAULT_LOCALE = 'zh-CN';

export function resolveLocale(input) {
  if (!input) return DEFAULT_LOCALE;
  return DICTS[input] ? input : DEFAULT_LOCALE;
}

export function useI18n(localeRef) {
  const dict = computed(() => DICTS[resolveLocale(localeRef.value)] || DICTS[DEFAULT_LOCALE]);

  function t(key) {
    const segs = key.split('.');
    let cur = dict.value;
    for (const s of segs) {
      if (cur == null) return key;
      cur = cur[s];
    }
    return cur == null ? key : cur;
  }

  return { t, locale: computed(() => resolveLocale(localeRef.value)) };
}
