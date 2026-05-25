/**
 * ISO 639-1 language codes supported by ElevenLabs text-to-dialogue-v3 / text-to-speech models.
 * Each entry has code, English name, and Chinese name for bilingual display.
 */

export interface AudioLanguage {
  code: string;
  en: string;
  zh: string;
}

export const AUDIO_LANGUAGES: AudioLanguage[] = [
  { code: "af", en: "Afrikaans", zh: "南非荷兰语" },
  { code: "ar", en: "Arabic", zh: "阿拉伯语" },
  { code: "hy", en: "Armenian", zh: "亚美尼亚语" },
  { code: "as", en: "Assamese", zh: "阿萨姆语" },
  { code: "az", en: "Azerbaijani", zh: "阿塞拜疆语" },
  { code: "be", en: "Belarusian", zh: "白俄罗斯语" },
  { code: "bn", en: "Bengali", zh: "孟加拉语" },
  { code: "bs", en: "Bosnian", zh: "波斯尼亚语" },
  { code: "bg", en: "Bulgarian", zh: "保加利亚语" },
  { code: "ca", en: "Catalan", zh: "加泰罗尼亚语" },
  { code: "ceb", en: "Cebuano", zh: "宿务语" },
  { code: "ny", en: "Chichewa", zh: "齐切瓦语" },
  { code: "hr", en: "Croatian", zh: "克罗地亚语" },
  { code: "cs", en: "Czech", zh: "捷克语" },
  { code: "da", en: "Danish", zh: "丹麦语" },
  { code: "nl", en: "Dutch", zh: "荷兰语" },
  { code: "en", en: "English", zh: "英语" },
  { code: "et", en: "Estonian", zh: "爱沙尼亚语" },
  { code: "fil", en: "Filipino", zh: "菲律宾语" },
  { code: "fi", en: "Finnish", zh: "芬兰语" },
  { code: "fr", en: "French", zh: "法语" },
  { code: "gl", en: "Galician", zh: "加利西亚语" },
  { code: "ka", en: "Georgian", zh: "格鲁吉亚语" },
  { code: "de", en: "German", zh: "德语" },
  { code: "el", en: "Greek", zh: "希腊语" },
  { code: "gu", en: "Gujarati", zh: "古吉拉特语" },
  { code: "ha", en: "Hausa", zh: "豪萨语" },
  { code: "he", en: "Hebrew", zh: "希伯来语" },
  { code: "hi", en: "Hindi", zh: "印地语" },
  { code: "hu", en: "Hungarian", zh: "匈牙利语" },
  { code: "is", en: "Icelandic", zh: "冰岛语" },
  { code: "id", en: "Indonesian", zh: "印度尼西亚语" },
  { code: "ga", en: "Irish", zh: "爱尔兰语" },
  { code: "it", en: "Italian", zh: "意大利语" },
  { code: "ja", en: "Japanese", zh: "日语" },
  { code: "jv", en: "Javanese", zh: "爪哇语" },
  { code: "kn", en: "Kannada", zh: "卡纳达语" },
  { code: "kk", en: "Kazakh", zh: "哈萨克语" },
  { code: "ky", en: "Kyrgyz", zh: "吉尔吉斯语" },
  { code: "ko", en: "Korean", zh: "韩语" },
  { code: "lv", en: "Latvian", zh: "拉脱维亚语" },
  { code: "ln", en: "Lingala", zh: "林加拉语" },
  { code: "lt", en: "Lithuanian", zh: "立陶宛语" },
  { code: "lb", en: "Luxembourgish", zh: "卢森堡语" },
  { code: "mk", en: "Macedonian", zh: "马其顿语" },
  { code: "ms", en: "Malay", zh: "马来语" },
  { code: "ml", en: "Malayalam", zh: "马拉雅拉姆语" },
  { code: "zh", en: "Chinese", zh: "中文" },
  { code: "mr", en: "Marathi", zh: "马拉地语" },
  { code: "ne", en: "Nepali", zh: "尼泊尔语" },
  { code: "no", en: "Norwegian", zh: "挪威语" },
  { code: "ps", en: "Pashto", zh: "普什图语" },
  { code: "fa", en: "Persian", zh: "波斯语" },
  { code: "pl", en: "Polish", zh: "波兰语" },
  { code: "pt", en: "Portuguese", zh: "葡萄牙语" },
  { code: "pa", en: "Punjabi", zh: "旁遮普语" },
  { code: "ro", en: "Romanian", zh: "罗马尼亚语" },
  { code: "ru", en: "Russian", zh: "俄语" },
  { code: "sr", en: "Serbian", zh: "塞尔维亚语" },
  { code: "sd", en: "Sindhi", zh: "信德语" },
  { code: "sk", en: "Slovak", zh: "斯洛伐克语" },
  { code: "sl", en: "Slovenian", zh: "斯洛文尼亚语" },
  { code: "so", en: "Somali", zh: "索马里语" },
  { code: "es", en: "Spanish", zh: "西班牙语" },
  { code: "sw", en: "Swahili", zh: "斯瓦希里语" },
  { code: "sv", en: "Swedish", zh: "瑞典语" },
  { code: "ta", en: "Tamil", zh: "泰米尔语" },
  { code: "te", en: "Telugu", zh: "泰卢固语" },
  { code: "th", en: "Thai", zh: "泰语" },
  { code: "tr", en: "Turkish", zh: "土耳其语" },
  { code: "uk", en: "Ukrainian", zh: "乌克兰语" },
  { code: "ur", en: "Urdu", zh: "乌尔都语" },
  { code: "vi", en: "Vietnamese", zh: "越南语" },
  { code: "cy", en: "Welsh", zh: "威尔士语" },
];

/** Lookup map for O(1) access by code */
const BY_CODE = new Map(AUDIO_LANGUAGES.map((l) => [l.code, l]));

/** Get display label for a language code in the given locale */
export function getLanguageLabel(code: string, locale: string): string {
  const lang = BY_CODE.get(code);
  if (!lang) return code;
  return locale === "zh" ? lang.zh : lang.en;
}

/** Get a language entry by code */
export function getLanguageByCode(code: string): AudioLanguage | undefined {
  return BY_CODE.get(code);
}

/** Common languages shown at top of picker (sorted by likely usage) */
export const COMMON_LANGUAGE_CODES = ["zh", "en", "ja", "ko", "fr", "de", "es", "pt", "ru", "ar"];
