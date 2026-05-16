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

document.getElementById('batchCollectBtn').addEventListener('click', async () => {
  // Remember which tab triggered the collect so collect.js knows where to scan
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    await chrome.storage.session.set({ collectTabSource: tab.id }).catch(() => {});
  }
  chrome.tabs.create({ url: chrome.runtime.getURL('collect.html') });
  window.close();
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
