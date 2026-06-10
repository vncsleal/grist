import { ui, defaultLang, type Lang } from './ui';

export function useTranslations(lang: Lang) {
  return (key: keyof typeof ui[typeof defaultLang]): string => {
    const dict = ui[lang];
    if (!(key in dict)) {
      throw new Error(`Missing translation key "${String(key)}" for locale "${lang}"`);
    }
    return dict[key];
  };
}

export function getLangFromUrl(url: URL): Lang {
  const [, lang] = url.pathname.split('/');
  if (lang && lang in ui) return lang as Lang;
  return defaultLang;
}
