// Prompt Studio Desktop Companion – Background Service Worker

const DEFAULT_SERVER = 'http://127.0.0.1:8767';
const MEDIA_CACHE_LIMIT = 80;
const IMAGE_CACHE_LIMIT = 500;
const PLAYLIST_EXT_RE = /\.(m3u8|mpd)(?:[?#]|$)/i;
const mediaByTab = new Map();
const imagesByTab = new Map();
const refererByRequest = new Map();

const IMAGE_MIME_RE = /^image\/(jpeg|png|webp|gif|avif|svg\+xml|bmp)/i;
const IMAGE_EXT_RE  = /\.(jpe?g|png|webp|gif|avif|svg|bmp)(?:[?#]|$)/i;

function isImageResponse(data) {
  if (!data.url || !data.url.startsWith('http')) return false;
  const ct = headerValue(data.responseHeaders, 'content-type').split(';')[0].trim();
  const size = parseInt(headerValue(data.responseHeaders, 'content-length') || '0', 10) || 0;
  if (size > 0 && size < 2048) return false; // skip tiny icons/tracking pixels
  return IMAGE_MIME_RE.test(ct) || IMAGE_EXT_RE.test(data.url);
}

function cleanImageCdnUrl(url) {
  try {
    const u = new URL(url);
    const h = u.hostname;
    if (h.includes('xhscdn.com') || h.includes('xiaohongshu.com')) { u.search = ''; return u.href; }
    if (h.includes('sinaimg.cn') || h.includes('weibo.com')) {
      u.pathname = u.pathname.replace(/\/(thumb\d+|orj\d+|woriginal|mw\d+)\//, '/large/');
      u.search = ''; return u.href;
    }
    if (h.includes('hdslb.com') || h.includes('biliimg.com') || h.includes('bilibili.com')) {
      u.pathname = u.pathname.replace(/@[^/]*$/, '');
      u.search = ''; return u.href;
    }
    if (h.includes('douyinpic.com') || h.includes('tiktokcdn.com') || h.includes('byteimg.com')) {
      u.pathname = u.pathname.replace(/~tplv-[^.]+(\.\w+)$/i, '$1');
      u.search = ''; return u.href;
    }
    return url;
  } catch { return url; }
}

function rememberImage(data) {
  if (!isImageResponse(data)) return;
  const tabId = data.tabId;
  if (tabId == null || tabId < 0) return;
  const url = cleanImageCdnUrl(data.url);
  const size = parseInt(headerValue(data.responseHeaders, 'content-length') || '0', 10) || 0;
  const list = imagesByTab.get(tabId) || [];
  if (list.some(x => x.url === url)) return; // deduplicate
  list.unshift({ url, size, time: Date.now() });
  imagesByTab.set(tabId, list.slice(0, IMAGE_CACHE_LIMIT));
}

chrome.action.setBadgeText({ text: '' }, () => void chrome.runtime.lastError);

function headerValue(headers = [], name) {
  const found = headers.find(h => h.name && h.name.toLowerCase() === name.toLowerCase());
  return found ? (found.value || '') : '';
}

function mediaExt(url = '') {
  try {
    const path = new URL(url).pathname;
    const m = path.match(/\.([a-z0-9]{2,5})$/i);
    return m ? m[1].toLowerCase() : '';
  } catch {
    const m = String(url).match(/\.([a-z0-9]{2,5})(?:[?#]|$)/i);
    return m ? m[1].toLowerCase() : '';
  }
}

function isUsableMediaUrl(url) {
  return !!url && !url.startsWith('blob:') && !url.startsWith('data:') && !url.startsWith('chrome-extension:');
}

function isMediaResponse(data) {
  const url = data.url || '';
  if (!/^https?:\/\//i.test(url)) return false;
  const contentType = headerValue(data.responseHeaders, 'content-type').split(';')[0].trim().toLowerCase();
  const ext = mediaExt(url);
  if (['mp4', 'webm', 'mov', 'm4v', 'm3u8', 'mpd'].includes(ext)) return true;
  if (/^(video|audio)\//i.test(contentType)) return true;
  if (/mpegurl|m3u8|dash\+xml|mpd/i.test(contentType)) return true;
  return data.type === 'media' && /octet-stream/i.test(contentType);
}

function mediaKind(item) {
  if (PLAYLIST_EXT_RE.test(item.url) || /mpegurl|dash\+xml|mpd/i.test(item.mime || '')) return 'stream';
  if (/^audio\//i.test(item.mime || '')) return 'audio';
  return 'video';
}

function scoreMedia(item) {
  const ext = item.ext || mediaExt(item.url);
  const extScore = { mp4: 120, webm: 115, mov: 110, m4v: 105, m3u8: 95, mpd: 85 }[ext] || 50;
  const sizeScore = Math.min(40, Math.floor((item.size || 0) / (1024 * 1024)));
  return extScore + sizeScore + Math.min(20, Math.floor((Date.now() - item.time) / -30000) + 20);
}

function rememberMedia(data) {
  if (!isMediaResponse(data)) return;
  const tabId = data.tabId;
  if (tabId == null || tabId < 0) return;
  const mime = headerValue(data.responseHeaders, 'content-type').split(';')[0].trim().toLowerCase();
  const size = parseInt(headerValue(data.responseHeaders, 'content-length') || '0', 10) || 0;
  const requestInfo = refererByRequest.get(data.requestId) || {};
  const referer = requestInfo.referer || data.initiator || '';
  refererByRequest.delete(data.requestId);

  const item = {
    url: data.url,
    ext: mediaExt(data.url),
    mime,
    size,
    kind: '',
    tabId,
    referer,
    cookie: requestInfo.cookie || '',
    time: Date.now()
  };
  item.kind = mediaKind(item);

  const list = mediaByTab.get(tabId) || [];
  const existing = list.find(x => x.url === item.url);
  if (existing) Object.assign(existing, item);
  else list.unshift(item);
  list.sort((a, b) => scoreMedia(b) - scoreMedia(a));
  mediaByTab.set(tabId, list.slice(0, MEDIA_CACHE_LIMIT));
  const publicItems = mediaByTab.get(tabId).map(({ cookie, ...rest }) => rest);
  chrome.storage.local.set({ [`psc_media_${tabId}`]: publicItems }, () => void chrome.runtime.lastError);
}

function mediaForTab(tabId) {
  return (mediaByTab.get(Number(tabId)) || []).filter(item => item.kind === 'video' || item.kind === 'stream');
}

function bestMediaForTab(tabId) {
  return mediaForTab(tabId)[0] || null;
}

function addWebRequestListener(event, handler, filter, specs) {
  try {
    event.addListener(handler, filter, specs);
  } catch (e) {
    const fallbackSpecs = (specs || []).filter(s => s !== 'extraHeaders');
    try {
      event.addListener(handler, filter, fallbackSpecs);
    } catch (err) {
      console.warn('Prompt Studio webRequest listener disabled', err?.message || err);
    }
  }
}

addWebRequestListener(chrome.webRequest.onSendHeaders, (data) => {
  const referer = headerValue(data.requestHeaders, 'referer') || headerValue(data.requestHeaders, 'origin');
  const cookie = headerValue(data.requestHeaders, 'cookie');
  if (referer || cookie) {
    refererByRequest.set(data.requestId, { referer, cookie });
    setTimeout(() => refererByRequest.delete(data.requestId), 30000);
  }
}, { urls: ['<all_urls>'] }, ['requestHeaders', 'extraHeaders']);

addWebRequestListener(chrome.webRequest.onResponseStarted, (data) => {
  try { rememberMedia(data); } catch (e) { console.warn('Prompt Studio media sniff failed', e); }
  try { rememberImage(data); } catch (e) {}
}, { urls: ['<all_urls>'] }, ['responseHeaders', 'extraHeaders']);

// Track the current URL for each tab (to detect SPA navigation)
const tabUrlMap = new Map();

function clearTabMedia(tabId) {
  mediaByTab.delete(tabId);
  imagesByTab.delete(tabId);
  chrome.storage.local.remove(`psc_media_${tabId}`, () => void chrome.runtime.lastError);
}

// Full page navigation
chrome.webNavigation.onCommitted.addListener(({ tabId, frameId, url }) => {
  if (frameId !== 0) return;
  clearTabMedia(tabId);
  tabUrlMap.set(tabId, url);
});

// SPA navigation (pushState / replaceState) — catches YouTube, Bilibili, etc.
chrome.webNavigation.onHistoryStateUpdated.addListener(({ tabId, frameId, url }) => {
  if (frameId !== 0) return;
  const prev = tabUrlMap.get(tabId);
  // Only clear if the URL actually changed (not just hash fragment)
  const prevOriginPath = prev ? prev.replace(/#.*$/, '') : '';
  const newOriginPath = url.replace(/#.*$/, '');
  if (prevOriginPath !== newOriginPath) {
    clearTabMedia(tabId);
  }
  tabUrlMap.set(tabId, url);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  clearTabMedia(tabId);
  tabUrlMap.delete(tabId);
});

// ── Context Menus ────────────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'save-image',    title: '💾 保存图片到 Prompt Studio Desktop',        contexts: ['image'] });
    chrome.contextMenus.create({ id: 'reverse-image', title: '✨ 反推提示词 → Prompt Studio Desktop',       contexts: ['image'] });
    chrome.contextMenus.create({ id: 'save-video',    title: '💾 保存视频到 Prompt Studio Desktop',        contexts: ['video'] });
    chrome.contextMenus.create({ id: 'reverse-video', title: '✨ 反推提示词 → Prompt Studio Desktop',       contexts: ['video'] });
    chrome.contextMenus.create({ id: 'save-skill',    title: '🤖 保存为 Skills 提示词 → Prompt Studio Desktop', contexts: ['selection'] });
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const id = info.menuItemId;

  if (id === 'save-skill') {
    // Get full selection text from content script, fall back to info.selectionText
    chrome.tabs.sendMessage(tab.id, { type: 'get-selection' }, (text) => {
      const selText = (text && text.length > 0) ? text : (info.selectionText || '');
      chrome.storage.local.set({ _psc_skill_text: selText }, () => {
        openDialog({ mediaType: 'text', mode: 'skill', pageUrl: tab.url, pageTitle: tab.title });
      });
    });
    return;
  }

  const rawMediaUrl = info.srcUrl || info.mediaUrl || '';
  const mediaType = (id.includes('video') || (info.mediaType || '').includes('video')) ? 'video' : 'image';
  const sniffed = mediaType === 'video' ? bestMediaForTab(tab?.id) : null;
  const mediaUrl = mediaType === 'video' && !isUsableMediaUrl(rawMediaUrl) && sniffed ? sniffed.url : rawMediaUrl;
  const baseParams = {
    mediaUrl,
    mediaType,
    pageUrl: tab.url,
    pageTitle: tab.title,
    tabId: tab.id || '',
    referer: sniffed?.referer || tab.url || ''
  };
  if (id.startsWith('reverse')) {
    chrome.tabs.sendMessage(tab.id, { type: 'psc-show-panel', ...baseParams });
  } else {
    openDialog({ ...baseParams, mode: 'save' });
  }
});

// ── Window helpers ────────────────────────────────────────────────────────────
function buildQs(params) {
  return new URLSearchParams(
    Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)]))
  ).toString();
}

function openLaunchPage(page, params, size) {
  const key = `psc_payload_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  chrome.storage.local.set({ [key]: params }, () => {
    const stored = !chrome.runtime.lastError;
    const qs = stored ? `payloadKey=${encodeURIComponent(key)}` : buildQs(params);
    chrome.windows.create({
      url: chrome.runtime.getURL(`${page}?${qs}`),
      type: 'popup',
      width: size.width,
      height: size.height,
      focused: true
    }, () => {
      if (chrome.runtime.lastError) {
        console.warn('Prompt Studio popup open failed', chrome.runtime.lastError.message);
      }
    });
  });
}

function openDialog(params) {
  openLaunchPage('dialog.html', params, { width: 500, height: 640 });
}

function openResult(params) {
  openLaunchPage('result.html', params, { width: 480, height: 520 });
}

// ── Message Handler ───────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // From content.js: hover toolbar button clicked
  if (msg.type === 'open-dialog') {
    const pageUrl   = msg.pageUrl   || sender.tab?.url   || '';
    const pageTitle = msg.pageTitle || sender.tab?.title || '';
    const tabId = msg.tabId || sender.tab?.id || '';
    if (msg.mode === 'reverse') {
      openResult({ mediaUrl: msg.mediaUrl, mediaType: msg.mediaType, pageUrl, pageTitle, tabId, referer: msg.referer || pageUrl });
    } else {
      openDialog({ mediaUrl: msg.mediaUrl, mediaType: msg.mediaType, mode: msg.mode, pageUrl, pageTitle, tabId, referer: msg.referer || pageUrl });
    }
    return false;
  }

  if (msg.type === 'get-captured-images') {
    const tabId = Number(msg.tabId || sender.tab?.id || -1);
    const list = (imagesByTab.get(tabId) || []).map(({ url, size }) => ({ url, size }));
    sendResponse({ images: list });
    return false;
  }

  if (msg.type === 'get-media-candidates') {
    const tabId = Number(msg.tabId || sender.tab?.id || -1);
    sendResponse({ items: mediaForTab(tabId).map(({ cookie, ...rest }) => rest) });
    return false;
  }

  if (msg.type === 'resolve-media-url') {
    const tabId = Number(msg.tabId || sender.tab?.id || -1);
    const best = bestMediaForTab(tabId);
    const currentExt = mediaExt(msg.mediaUrl || '');
    const useBest = msg.mediaType === 'video' && best && (
      !isUsableMediaUrl(msg.mediaUrl || '') ||
      !['mp4', 'webm', 'mov', 'm4v', 'm3u8', 'mpd'].includes(currentExt)
    );
    sendResponse({
      mediaUrl: useBest && best ? best.url : (msg.mediaUrl || ''),
      referer: best?.referer || msg.referer || '',
      cookie: best?.cookie || '',
      item: best ? (({ cookie, ...rest }) => rest)(best) : null
    });
    return false;
  }

  if (msg.type === 'get-server-url') {
    chrome.storage.sync.get({ serverUrl: DEFAULT_SERVER }, ({ serverUrl }) => {
      sendResponse({ serverUrl });
    });
    return true;
  }

  if (msg.type === 'get-settings') {
    chrome.storage.sync.get({
      serverUrl:    DEFAULT_SERVER,
      imageApiBase: 'https://api.openai.com/v1',
      imageApiKey:  '',
      imageModel:   'gpt-4o',
      videoApiBase: 'https://generativelanguage.googleapis.com/v1beta',
      videoApiKey:  '',
      videoModel:   'gemini-2.5-pro',
      imageReverseInstruction: '',
      videoReverseInstruction: '',
      domainBlacklist: '',
      toolPath:     ''
    }, async (settings) => {
      try {
        const r = await fetch(`${settings.serverUrl}/api/desktop/settings`, { signal: AbortSignal.timeout(2500) });
        const data = await r.json();
        if (data.ok && data.settings) settings = { ...settings, ...data.settings, serverUrl: settings.serverUrl };
      } catch {}
      sendResponse({ settings });
    });
    return true;
  }

  if (msg.type === 'notify') {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon48.png'),
      title: 'Prompt Studio Desktop',
      message: msg.message || ''
    });
    return false;
  }
});
