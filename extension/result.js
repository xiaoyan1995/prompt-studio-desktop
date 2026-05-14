// result.js – Quick reverse prompt popup
const params    = new URLSearchParams(location.search);
let launchParams = Object.fromEntries(params.entries());
let mediaUrl    = '';
let mediaType   = 'image';
let pageTitle   = '';
let tabId       = '';
let referer     = '';
let requestCookie = '';

let settings   = {};
let serverUrl  = 'http://127.0.0.1:8767';
let generatedPrompt = '';
let selectedCategory = 'image_prompts';
let saveExpanded = false;

const CATEGORIES = [
  { id: 'image_prompts',  label: '🖼️ 图片提示词' },
  { id: 'video_prompts',  label: '🎬 视频提示词' },
  { id: 'skill_prompts',  label: '🤖 Skills'     }
];

function readLaunchParams() {
  mediaUrl = launchParams.mediaUrl || '';
  mediaType = launchParams.mediaType || 'image';
  pageTitle = launchParams.pageTitle || '';
  tabId = launchParams.tabId || '';
  referer = launchParams.referer || launchParams.pageUrl || '';
  requestCookie = launchParams.cookie || '';
  selectedCategory = mediaType === 'video' ? 'video_prompts' : 'image_prompts';
}

async function hydrateLaunchParams() {
  const key = params.get('payloadKey');
  if (!key) {
    readLaunchParams();
    return;
  }
  try {
    const stored = await new Promise(r => chrome.storage.local.get(key, r));
    if (stored && stored[key]) launchParams = { ...launchParams, ...stored[key] };
    chrome.storage.local.remove(key, () => void chrome.runtime.lastError);
  } catch {}
  readLaunchParams();
}

readLaunchParams();

function bgMsg(msg) {
  return new Promise(resolve => chrome.runtime.sendMessage(msg, resolve));
}

async function resolveVideoMedia() {
  if (mediaType !== 'video') return;
  try {
    const res = await bgMsg({ type: 'resolve-media-url', tabId, mediaUrl, mediaType, referer });
    if (res?.mediaUrl) mediaUrl = res.mediaUrl;
    if (res?.referer) referer = res.referer;
    if (res?.cookie) requestCookie = res.cookie;
  } catch {}
}

function showLoading(msg) {
  document.getElementById('loadingArea').style.display = 'flex';
  document.getElementById('resultArea').classList.remove('visible');
  document.getElementById('errorArea').classList.remove('visible');
  document.getElementById('loadingMsg').textContent = msg;
}

function showResult(prompt) {
  document.getElementById('loadingArea').style.display = 'none';
  document.getElementById('errorArea').classList.remove('visible');
  document.getElementById('promptBox').value = prompt;
  document.getElementById('resultArea').classList.add('visible');
}

function showError(msg) {
  document.getElementById('loadingArea').style.display = 'none';
  document.getElementById('resultArea').classList.remove('visible');
  document.getElementById('errorArea').classList.add('visible');
  document.getElementById('errorMsg').textContent = msg;
}

function setCategory(id) {
  selectedCategory = id;
  document.querySelectorAll('#categoryRow .radio-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.cat === id);
  });
}

async function loadProjects() {
  try {
    const r = await fetch(`${serverUrl}/api/projects`);
    const projects = await r.json();
    const sel = document.getElementById('projectSel');
    sel.innerHTML = projects.map(p =>
      `<option value="${p.id}">${p.name}</option>`
    ).join('');
  } catch {
    document.getElementById('projectSel').innerHTML = '<option value="">⚠️ 无法连接服务器</option>';
  }
}

async function runReverse() {
  const apiKey  = mediaType === 'video' ? settings.videoApiKey  : settings.imageApiKey;
  const apiBase = mediaType === 'video' ? settings.videoApiBase : settings.imageApiBase;
  const model   = mediaType === 'video' ? (settings.videoModel || 'gemini-2.5-pro') : (settings.imageModel || 'gpt-4o');
  const instruction = mediaType === 'video'
    ? settings.videoReverseInstruction
    : settings.imageReverseInstruction;

  if (!apiKey) {
    showError('未配置 API Key，请先在桌面端「设置」里填写。');
    return;
  }

  showLoading(`正在让 ${model} 分析${mediaType === 'video' ? '视频' : '图片'}…`);

  try {
    const res = await fetch(`${serverUrl}/api/reverse-prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: mediaUrl, mediaType,
        referer,
        pageUrl: launchParams.pageUrl || '',
        cookie: requestCookie,
        apiKey, apiBase, model,
        lang: 'zh',
        customInstruction: instruction || undefined
      })
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'AI 反推失败');
    generatedPrompt = data.prompt;
    showResult(generatedPrompt);
  } catch (e) {
    showError(e.message);
  }
}

// ── Init ─────────────────────────────────────────────────────────────────────
(async () => {
  await hydrateLaunchParams();
  // Media chip
  const chip = document.getElementById('mediaChip');
  chip.textContent  = mediaType === 'video' ? '视频' : '图片';
  chip.className    = `chip ${mediaType === 'video' ? 'chip-video' : 'chip-image'}`;

  // Load settings
  const res = await bgMsg({ type: 'get-settings' });
  settings  = res.settings || {};
  serverUrl = settings.serverUrl || 'http://127.0.0.1:8767';
  await resolveVideoMedia();

  // Build category buttons
  const row = document.getElementById('categoryRow');
  CATEGORIES.forEach(c => {
    const b = document.createElement('button');
    b.className    = 'radio-btn';
    b.dataset.cat  = c.id;
    b.textContent  = c.label;
    b.addEventListener('click', () => setCategory(c.id));
    row.appendChild(b);
  });
  setCategory(selectedCategory);

  // Pre-fill title from page title
  document.getElementById('titleInput').value =
    pageTitle ? pageTitle.slice(0, 60) : '';

  // Start reverse immediately
  await runReverse();
})();

// ── Copy ─────────────────────────────────────────────────────────────────────
document.getElementById('copyBtn').addEventListener('click', () => {
  const text = document.getElementById('promptBox').value;
  navigator.clipboard.writeText(text).then(() => {
    const hint = document.getElementById('copiedHint');
    hint.classList.add('show');
    setTimeout(() => hint.classList.remove('show'), 1800);
  });
});

// ── Retry ─────────────────────────────────────────────────────────────────────
document.getElementById('retryBtn').addEventListener('click', runReverse);

// ── Toggle save panel ─────────────────────────────────────────────────────────
document.getElementById('saveToggleBtn').addEventListener('click', async () => {
  saveExpanded = !saveExpanded;
  document.getElementById('saveExpand').classList.toggle('visible', saveExpanded);
  document.getElementById('confirmSaveBtn').style.display = saveExpanded ? '' : 'none';
  if (saveExpanded) await loadProjects();
});

// ── Confirm save ──────────────────────────────────────────────────────────────
document.getElementById('confirmSaveBtn').addEventListener('click', async () => {
  const projectId = document.getElementById('projectSel').value;
  if (!projectId) { alert('请先选择一个项目'); return; }

  const prompt = document.getElementById('promptBox').value.trim();
  const title  = document.getElementById('titleInput').value.trim();
  const btn    = document.getElementById('confirmSaveBtn');

  btn.disabled    = true;
  btn.textContent = '保存中…';

  try {
    const r = await fetch(`${serverUrl}/api/save-media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: mediaUrl, mediaType, projectId,
        category: selectedCategory,
        title, prompt,
        referer,
        pageUrl: launchParams.pageUrl || '',
        cookie: requestCookie,
        model: mediaType === 'video' ? settings.videoModel : settings.imageModel,
        tags: []
      })
    });
    const data = await r.json();
    if (!data.ok) throw new Error(data.error || '保存失败');

    btn.textContent = '✅ 已保存！';
    btn.style.background = '#16a34a';
    setTimeout(() => window.close(), 1200);
  } catch (e) {
    btn.disabled    = false;
    btn.textContent = '💾 确认保存';
    alert('保存失败：' + e.message);
  }
});

// ── Close ─────────────────────────────────────────────────────────────────────
document.getElementById('closeBtn').addEventListener('click', () => window.close());
