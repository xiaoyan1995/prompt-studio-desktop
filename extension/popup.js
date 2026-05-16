// popup.js
const DEFAULT_SERVER = 'http://127.0.0.1:8767';

async function checkServer() {
  const dot     = document.getElementById('statusDot');
  const text    = document.getElementById('statusText');
  const startSec = document.getElementById('startSection');

  const settings = await new Promise(r =>
    chrome.storage.sync.get({ serverUrl: DEFAULT_SERVER, toolPath: '' }, r)
  );
  const serverUrl = settings.serverUrl || DEFAULT_SERVER;

  dot.className = 'dot checking';
  text.textContent = '正在检查服务器…';
  startSec.style.display = 'none';

  try {
    const r = await fetch(`${serverUrl}/api/projects`, {
      signal: AbortSignal.timeout(3000)
    });
    const projects = await r.json();
    dot.className = 'dot ok';
    text.textContent = `✅ 服务器运行中 · ${projects.length} 个项目`;
  } catch {
    dot.className = 'dot err';
    text.textContent = '❌ 桌面端未运行';
    startSec.style.display = 'block';
  }
}

document.getElementById('openStudioBtn').addEventListener('click', async () => {
  const { serverUrl = DEFAULT_SERVER } = await new Promise(r =>
    chrome.storage.sync.get({ serverUrl: DEFAULT_SERVER }, r)
  );
  chrome.tabs.create({ url: serverUrl });
});

document.getElementById('openSettingsBtn').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

// ── Inline Batch Collect ──────────────────────────────────────────────────────
const SERVER_URL = 'http://127.0.0.1:8767';
let cAllImages = [], cSelected = new Set(), cFilters = { fmt: 'all', size: 0, minW: 0, minH: 0 };

function fmtFromUrl(url) {
  const m = url.toLowerCase().split('?')[0].match(/\.(jpe?g|png|webp|gif|avif|svg)(\b|$)/);
  if (!m) return 'other';
  return m[1] === 'jpeg' ? 'jpg' : m[1];
}
function cApplyFilters() {
  const { fmt, size, minW, minH } = cFilters;
  cAllImages.forEach(img => {
    img.visible = (fmt === 'all' || img.fmt === fmt)
      && (size === 0 || Math.min(img.width, img.height) >= size)
      && (minW === 0 || img.width >= minW)
      && (minH === 0 || img.height >= minH);
  });
  cSelected.forEach(i => { if (!cAllImages[i]?.visible) cSelected.delete(i); });
  cUpdateStats(); cRenderGrid();
}
function cUpdateStats() {
  const vis = cAllImages.filter(i => i.visible).length;
  document.getElementById('cTotal').textContent    = cAllImages.length;
  document.getElementById('cFiltered').textContent = vis;
  document.getElementById('cSelected').textContent = cSelected.size;
  document.getElementById('cStats').style.display  = cAllImages.length ? '' : 'none';
  const sendBtn = document.getElementById('cSendBtn');
  sendBtn.disabled = cSelected.size === 0;
  sendBtn.style.opacity = cSelected.size ? '1' : '.4';
}
function cRenderGrid() {
  const grid = document.getElementById('cGrid');
  const visible = cAllImages.filter(i => i.visible);
  document.getElementById('cNoResult').style.display = (visible.length === 0 && cAllImages.length > 0) ? '' : 'none';
  if (visible.length === 0) { grid.style.display = 'none'; return; }
  grid.style.display = 'grid';
  grid.innerHTML = '';
  cAllImages.forEach((img, idx) => {
    if (!img.visible) return;
    const card = document.createElement('div');
    card.style.cssText = `position:relative;border-radius:6px;overflow:hidden;cursor:pointer;border:2px solid ${cSelected.has(idx) ? 'var(--primary)' : 'var(--border)'};aspect-ratio:1`;
    card.innerHTML = `<img src="${img.url.replace(/"/g,'')}" style="width:100%;height:100%;object-fit:cover" loading="lazy" onerror="this.style.background='#eee'">
      <div style="position:absolute;inset:0;background:${cSelected.has(idx)?'rgba(27,103,218,.15)':'transparent'}"></div>
      <div style="position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:4px;background:${cSelected.has(idx)?'var(--primary)':'rgba(0,0,0,.4)'};border:1.5px solid ${cSelected.has(idx)?'var(--primary)':'rgba(255,255,255,.7)'};display:flex;align-items:center;justify-content:center;font-size:10px;color:#fff">${cSelected.has(idx)?'✓':''}</div>
      <div style="position:absolute;bottom:2px;right:3px;font-size:9px;font-weight:700;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.8)">${img.width}×${img.height}</div>`;
    card.addEventListener('click', () => {
      if (cSelected.has(idx)) cSelected.delete(idx); else cSelected.add(idx);
      cUpdateStats(); cRenderGrid();
    });
    grid.appendChild(card);
  });
}

// Toggle panel
document.getElementById('batchCollectBtn').addEventListener('click', () => {
  const panel = document.getElementById('collectPanel');
  const arrow = document.getElementById('collectArrow');
  const isOpen = panel.style.display !== 'none';
  panel.style.display = isOpen ? 'none' : '';
  arrow.style.transform = isOpen ? '' : 'rotate(90deg)';
  document.body.classList.toggle('collect-open', !isOpen);
  if (!isOpen) cLoadProjects();
});

// Filter tags
document.querySelectorAll('.ctag[data-fmt]').forEach(tag => {
  tag.addEventListener('click', () => {
    document.querySelectorAll('.ctag[data-fmt]').forEach(t => t.classList.remove('on'));
    tag.classList.add('on'); cFilters.fmt = tag.dataset.fmt; cApplyFilters();
  });
});
document.querySelectorAll('.ctag[data-size]').forEach(tag => {
  tag.addEventListener('click', () => {
    const val = parseInt(tag.dataset.size);
    if (cFilters.size === val) { cFilters.size = 0; tag.classList.remove('on'); }
    else { document.querySelectorAll('.ctag[data-size]').forEach(t => t.classList.remove('on')); tag.classList.add('on'); cFilters.size = val; }
    cApplyFilters();
  });
});
['cMinW','cMinH'].forEach(id => {
  document.getElementById(id).addEventListener('input', () => {
    cFilters.minW = parseInt(document.getElementById('cMinW').value) || 0;
    cFilters.minH = parseInt(document.getElementById('cMinH').value) || 0;
    cApplyFilters();
  });
});

// Scan
document.getElementById('cScanBtn').addEventListener('click', async () => {
  const scanBtn = document.getElementById('cScanBtn');
  scanBtn.disabled = true;
  document.getElementById('cEmpty').style.display = 'none';
  document.getElementById('cNoResult').style.display = 'none';
  document.getElementById('cGrid').style.display = 'none';
  document.getElementById('cScanning').style.display = '';
  cAllImages = []; cSelected.clear(); cUpdateStats();

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // 1. Get network-captured images (includes full-size clicked images)
    const captured = await new Promise(resolve => {
      chrome.runtime.sendMessage({ type: 'get-captured-images', tabId: tab.id }, r => resolve(r?.images || []));
    });

    // 2. Get DOM-scanned images (with CDN URL cleanup + dimension probe)
    let domImages = [];
    try {
      const resp = await chrome.tabs.sendMessage(tab.id, { type: 'scan-images' });
      domImages = resp?.images || [];
    } catch {}

    // 3. Merge: network-captured first (higher quality), then DOM fills gaps
    const seen = new Set();
    const merged = [];
    captured.forEach(({ url, size }) => {
      if (!url || seen.has(url)) return;
      seen.add(url);
      merged.push({ url, width: 0, height: 0, size, source: 'net', fmt: fmtFromUrl(url), visible: true });
    });
    domImages.forEach(img => {
      if (!img.url || seen.has(img.url)) return;
      seen.add(img.url);
      merged.push({ ...img, source: 'dom', fmt: fmtFromUrl(img.url), visible: true });
    });
    cAllImages = merged;
  } catch(e) {
    document.getElementById('cScanning').style.display = 'none';
    document.getElementById('cEmpty').style.display = '';
    document.getElementById('cEmpty').textContent = '扫描失败，请刷新页面后重试';
    scanBtn.disabled = false; return;
  }

  document.getElementById('cScanning').style.display = 'none';
  if (cAllImages.length === 0) {
    document.getElementById('cEmpty').style.display = '';
    document.getElementById('cEmpty').textContent = '未找到图片';
  }
  cApplyFilters(); scanBtn.disabled = false;
});

// Select all / none
document.getElementById('cSelAll').addEventListener('click', () => {
  cAllImages.forEach((img, i) => { if (img.visible) cSelected.add(i); });
  cUpdateStats(); cRenderGrid();
});
document.getElementById('cSelNone').addEventListener('click', () => {
  cSelected.clear(); cUpdateStats(); cRenderGrid();
});

// Load projects
async function cLoadProjects() {
  const sel = document.getElementById('cProjSel');
  try {
    const r = await fetch(`${SERVER_URL}/api/projects`);
    const data = await r.json();
    const projects = data.projects || data;
    sel.innerHTML = '<option value="">（选择项目）</option>' +
      projects.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
  } catch { sel.innerHTML = '<option value="">⚠️ 未连接</option>'; }
}

// Send
document.getElementById('cSendBtn').addEventListener('click', async () => {
  const list = [...cSelected].map(i => cAllImages[i]).filter(Boolean);
  if (!list.length) return;
  const projId = document.getElementById('cProjSel').value;
  const sendBtn = document.getElementById('cSendBtn');
  sendBtn.disabled = true; sendBtn.textContent = `发送中 0/${list.length}…`;
  let ok = 0;
  for (let i = 0; i < list.length; i++) {
    sendBtn.textContent = `发送中 ${i+1}/${list.length}…`;
    try {
      await fetch(`${SERVER_URL}/api/cli/push`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projId || undefined, type: 'image_prompts', image_url: list[i].url, title: '', prompt: '' }),
      });
      ok++;
    } catch {}
  }
  sendBtn.textContent = `✅ 已保存 ${ok}/${list.length} 张`;
  sendBtn.style.background = '#166534';
  setTimeout(() => {
    sendBtn.textContent = '💾 发送到 Prompt Studio';
    sendBtn.style.background = '#16a34a';
    cSelected.clear(); cUpdateStats(); cRenderGrid();
  }, 2000);
});

document.getElementById('startServerBtn').addEventListener('click', () => {
  // Trigger the desktop app protocol.
  chrome.tabs.create({ url: 'promptstudio-desktop://start' }, (tab) => {
    // Close the tab immediately after protocol dispatch (it won't load any page)
    setTimeout(() => {
      chrome.tabs.remove(tab.id).catch(() => {});
    }, 1500);
  });
  // Poll until server is up
  const dot  = document.getElementById('statusDot');
  const text = document.getElementById('statusText');
  dot.className = 'dot checking';
  text.textContent = '正在启动工具，请稍候…';
  document.getElementById('startSection').style.display = 'none';
  let tries = 0;
  const poll = setInterval(async () => {
    tries++;
    const { serverUrl = DEFAULT_SERVER } = await new Promise(r =>
      chrome.storage.sync.get({ serverUrl: DEFAULT_SERVER }, r)
    );
    try {
      const r = await fetch(`${serverUrl}/api/projects`, { signal: AbortSignal.timeout(2000) });
      if (r.ok) { clearInterval(poll); checkServer(); }
    } catch {}
    if (tries >= 20) { clearInterval(poll); checkServer(); }
  }, 1500);
});

document.getElementById('reloadBtn').addEventListener('click', checkServer);

// ── Block / Unblock current site ──────────────────────────────────────────────
let currentHost = '';
let siteBlocked = false;

function updateBlockBtn() {
  const btn  = document.getElementById('blockSiteBtn');
  const icon = document.getElementById('blockIcon');
  icon.textContent  = siteBlocked ? '✅' : '🚫';
  btn.title         = siteBlocked ? `取消屏蔽 ${currentHost}` : `屏蔽 ${currentHost} 工具栏`;
  btn.style.display = 'inline-block';
}

async function initBlockBtn() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url) return;
    const url = new URL(tab.url);
    if (!url.hostname || url.protocol.startsWith('chrome')) return;
    currentHost = url.hostname.toLowerCase().replace(/^www\./, '');
    const { domainBlacklist = '' } = await new Promise(r =>
      chrome.storage.sync.get({ domainBlacklist: '' }, r)
    );
    const domains = (domainBlacklist || '').split('\n').map(d => d.trim().toLowerCase()).filter(Boolean);
    siteBlocked = domains.some(d => currentHost === d || currentHost.endsWith('.' + d) || d.endsWith('.' + currentHost));
    updateBlockBtn();
  } catch {}
}

document.getElementById('blockSiteBtn').addEventListener('click', async () => {
  const { domainBlacklist = '' } = await new Promise(r =>
    chrome.storage.sync.get({ domainBlacklist: '' }, r)
  );
  let domains = (domainBlacklist || '').split('\n').map(d => d.trim().toLowerCase()).filter(Boolean);
  if (siteBlocked) {
    domains = domains.filter(d => !(currentHost === d || currentHost.endsWith('.' + d) || d.endsWith('.' + currentHost)));
  } else {
    if (!domains.includes(currentHost)) domains.push(currentHost);
  }
  try {
    await chrome.storage.sync.set({ domainBlacklist: domains.join('\n') });
    siteBlocked = !siteBlocked;
    updateBlockBtn();
    const btn = document.getElementById('blockSiteBtn');
    const orig = btn.title;
    btn.title = siteBlocked ? '✅ 已屏蔽' : '✅ 已取消屏蔽';
    setTimeout(() => { btn.title = orig; }, 1500);
  } catch(e) {
    console.error('blockSite save failed', e);
  }
});

checkServer();
initBlockBtn();
