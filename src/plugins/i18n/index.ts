/*
 * @Author: June 1601745371@qq.com
 * @Date: 2024-03-08 10:20:49
 * @LastEditors: June 1601745371@qq.com
 * @LastEditTime: 2024-03-11 11:59:37
 * @FilePath: \github\yft-design\src\plugins\locale\index.ts
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
 */

import { createI18n } from 'vue-i18n';
import { LANG, LANG_CHOSEN } from '@/configs/key'
import { getLocal, setLocal } from '@/utils/local';
import type { App } from 'vue';
import type { I18n, I18nOptions } from 'vue-i18n';

export let i18n: I18n | undefined;

const supportedLangs = ['vi', 'en', 'zh'];
const DEFAULT_LANG = 'vi';

// Chỉ tin giá trị CACHE_LANG khi người dùng đã tự chọn (có CACHE_LANG_CHOSEN).
// Không tự ghi localStorage khi lấy mặc định; giá trị hỏng hoặc ngôn ngữ không còn hỗ trợ quay về 'vi'.
const getLocalLang = (): string => {
  try {
    if (getLocal(LANG_CHOSEN)) {
      const localLang = getLocal(LANG);
      if (supportedLangs.includes(localLang)) return localLang;
    }
  } catch (e) {
    // localStorage bị chặn hoặc giá trị không phải JSON hợp lệ
  }
  return DEFAULT_LANG;
}

const createI18nOptions = (): I18nOptions => {
  const locale = getLocalLang();
  const modules: Record<string, any> = import.meta.glob('./lang/*', { eager: true })
  const messages: Record<string, any> = {}
  Object.keys(modules).forEach((i: any) => {
    const key = i.replace('./lang/', '').split('.')[0]
    messages[key] = modules[i].default
  })
  return {
    legacy: false,
    locale,
    fallbackLocale: 'en',
    messages,
    allowComposition: true,
    globalInjection: true,
    silentTranslationWarn: true, // true - warning off
    missingWarn: false,
    silentFallbackWarn: false,
  };
}

const setI18nLanguage = (locale: string) => {
  if (i18n?.mode === 'legacy') {
    i18n.global.locale = locale;
  } else {
    (i18n?.global.locale as any).value = locale;
  }
  setLocal(LANG, locale);
  document.documentElement.setAttribute('lang', locale);
}

export const changeLocale = async (locale: string) => {
  const globalI18n = i18n?.global;
  if(!globalI18n) return
  const currentLocale = globalI18n.locale;
  if (currentLocale === locale) return;
  setI18nLanguage(locale);
  return locale;
}

export const setupI18n = async (app: App) => {
  const options = createI18nOptions();
  i18n = createI18n(options) as I18n;
  document.documentElement.setAttribute('lang', options.locale as string);
  app.use(i18n);
}

// Trả về instance dùng chung để theo đúng ngôn ngữ đang chọn;
// chỉ tạo instance mới khi gọi trước setupI18n.
export const i18nObj = (): I18n => {
  return i18n ?? (createI18n(createI18nOptions()) as I18n)
}

  