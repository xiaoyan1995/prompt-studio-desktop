const { app, BrowserWindow, Menu, dialog, shell, ipcMain, clipboard, nativeImage } = require('electron');
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

// Auto-updater (only active in packaged builds)
let autoUpdater = null;
try { autoUpdater = require('electron-updater').autoUpdater; } catch {}

function setupAutoUpdater() {
  if (!autoUpdater || !app.isPackaged) return;
  autoUpdater.autoDownload = false;
  autoUpdater.logger = { info: logLine, warn: logLine, error: logLine, debug: () => {} };

  autoUpdater.on('update-available', (info) => {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: '发现新版本',
      message: `Prompt Studio Desktop v${info.version} 已发布`,
      detail: '是否现在下载并安装？（下载完成后将自动重启）',
      buttons: ['立即更新', '稍后再说'],
      defaultId: 0,
      cancelId: 1,
    }).then(({ response }) => {
      if (response === 0) autoUpdater.downloadUpdate();
    });
  });

  autoUpdater.on('update-downloaded', () => {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: '更新已就绪',
      message: '新版本已下载完成，点击确认立即重启安装。',
      buttons: ['立即重启', '稍后'],
      defaultId: 0,
      cancelId: 1,
    }).then(({ response }) => {
      if (response === 0) autoUpdater.quitAndInstall();
    });
  });

  autoUpdater.on('error', (err) => {
    logLine(`auto-updater error: ${err.message}`);
  });

  // Check silently 3 seconds after launch
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((e) => logLine(`update check failed: ${e.message}`));
  }, 3000);
}

const PORT = Number(process.env.PROMPT_STUDIO_PORT || 8767);
const SERVER_URL = `http://127.0.0.1:${PORT}`;
const PROTOCOL = 'promptstudio-desktop';

let mainWindow = null;
let serverProcess = null;

function logLine(message) {
  try {
    const line = `[${new Date().toISOString()}] ${message}\n`;
    fs.appendFileSync(path.join(app.getPath('temp'), 'prompt-studio-desktop.log'), line);
  } catch {}
}

function resourcePath(...parts) {
  return app.isPackaged
    ? path.join(process.resourcesPath, ...parts)
    : path.join(__dirname, ...parts);
}

function packagedAppRoot() {
  if (!app.isPackaged) return path.resolve(__dirname, '..');
  if (process.env.PORTABLE_EXECUTABLE_DIR) return process.env.PORTABLE_EXECUTABLE_DIR;
  if (process.platform === 'darwin') {
    return path.resolve(path.dirname(process.execPath), '..', '..', '..');
  }
  return path.dirname(process.execPath);
}

function extensionPath() {
  if (!app.isPackaged) return path.resolve(__dirname, '..', 'extension');
  // Packaged: prefer extension/ next to the app bundle or portable app folder.
  const sibling = path.join(packagedAppRoot(), 'extension');
  if (fs.existsSync(sibling)) return sibling;
  // Fallback: legacy inside resources/
  return path.join(process.resourcesPath, 'extension');
}

function appWritableRoot() {
  if (!app.isPackaged) return path.resolve(__dirname, '..');
  return packagedAppRoot();
}

function dataPath() {
  return path.join(appWritableRoot(), 'studio-data');
}


function prepareDataDir() {
  const target = dataPath();
  fs.mkdirSync(target, { recursive: true });
  return target;
}

function requestOk(url, timeoutMs = 800) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve(res.statusCode >= 200 && res.statusCode < 500);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForServer(timeoutMs = 12000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await requestOk(`${SERVER_URL}/api/projects`, 1200)) return true;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return false;
}

function bundledServerCommand() {
  // In dev mode always use python server.py so code changes take effect immediately
  if (!app.isPackaged) return null;
  const exeName = process.platform === 'win32' ? 'prompt-studio-server.exe' : 'prompt-studio-server';
  const candidates = [
    resourcePath('server', exeName),
    path.join(__dirname, 'server-dist', exeName),
  ];
  const command = candidates.find((candidate) => fs.existsSync(candidate));
  return command ? { command, args: [String(PORT)] } : null;
}

function findPython() {
  const { execSync } = require('child_process');
  // Try Windows py launcher first, then where python
  const candidates = process.platform === 'win32'
    ? ['py', 'python', 'python3']
    : ['python3', 'python'];
  for (const cmd of candidates) {
    try {
      const full = execSync(
        process.platform === 'win32' ? `where ${cmd}` : `which ${cmd}`,
        { timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] }
      ).toString().trim().split(/\r?\n/)[0];
      if (full && fs.existsSync(full)) return full;
    } catch {}
  }
  // Last resort: common install paths
  const fallbacks = process.platform === 'win32'
    ? [
        'C:\\Python312\\python.exe', 'C:\\Python311\\python.exe',
        'C:\\Python310\\python.exe',
        path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python312', 'python.exe'),
        path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python311', 'python.exe'),
        path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python310', 'python.exe'),
      ]
    : ['/usr/bin/python3', '/usr/local/bin/python3'];
  for (const p of fallbacks) { if (fs.existsSync(p)) return p; }
  return process.platform === 'win32' ? 'python' : 'python3';
}

function pythonServerCommand() {
  const serverPy = resourcePath('studio', 'server.py');
  const python = findPython();
  logLine(`python executable: ${python}`);
  return { command: python, args: [serverPy, String(PORT)] };
}

async function ensureServer() {
  logLine(`ensureServer start ${SERVER_URL}`);
  if (await requestOk(`${SERVER_URL}/api/projects`, 500)) return true;

  const cmd = bundledServerCommand() || pythonServerCommand();
  logLine(`server command ${cmd.command} ${cmd.args.join(' ')}`);
  const localDataPath = prepareDataDir();
  logLine(`data path ${localDataPath}`);
  serverProcess = spawn(cmd.command, cmd.args, {
    cwd: resourcePath('studio'),
    env: {
      ...process.env,
      PROMPT_STUDIO_DATA_DIR: localDataPath,
      PROMPT_STUDIO_STATIC_DIR: resourcePath('studio'),
      PYTHONUNBUFFERED: '1',
    },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  serverProcess.stdout.on('data', (chunk) => {
    const text = `[studio] ${chunk}`.trim();
    console.log(text);
    logLine(text);
  });
  serverProcess.stderr.on('data', (chunk) => {
    const text = `[studio] ${chunk}`.trim();
    console.error(text);
    logLine(text);
  });
  serverProcess.on('error', (err) => {
    logLine(`server spawn error ${err.message}`);
  });
  serverProcess.on('exit', () => {
    logLine('server process exited');
    serverProcess = null;
  });

  const ok = await waitForServer();
  logLine(`server ready ${ok}`);
  return ok;
}

function registerProtocol() {
  try {
    if (process.defaultApp) {
      app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [path.resolve(process.argv[1])]);
    } else {
      app.setAsDefaultProtocolClient(PROTOCOL);
    }
    logLine('protocol registered');
  } catch (err) {
    logLine(`protocol registration failed ${err.message}`);
  }
}

function buildMenu() {
  const template = [
    {
      label: 'Prompt Studio',
      submenu: [
        {
          label: '设置',
          accelerator: 'CmdOrCtrl+,',
          click: () => mainWindow?.webContents.executeJavaScript('window.openDesktopSettings && window.openDesktopSettings()'),
        },
        {
          label: '打开插件目录',
          click: () => shell.openPath(extensionPath()),
        },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: process.platform === 'darwin' ? 'close' : 'quit' },
      ],
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function registerDialogHandlers() {
  ipcMain.handle('dialog:pick-folder', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory', 'createDirectory'],
      title: '选择数据存储目录',
    });
    return result.canceled ? null : result.filePaths[0];
  });
}

function registerWindowControls() {
  ipcMain.handle('window:minimize', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize();
  });
  ipcMain.handle('window:toggle-maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });
  ipcMain.handle('window:close', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
  });
  ipcMain.handle('window:set-always-on-top', (event, flag) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.setAlwaysOnTop(flag, 'floating');
    return flag;
  });
  ipcMain.handle('shell:open-external', (_event, url) => {
    if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
      shell.openExternal(url);
    }
  });
}

// ── Upload path resolver ───────────────────────────────────────────────────
function resolveUploadPath(uploadPath) {
  if (!uploadPath || !uploadPath.startsWith('/uploads/')) return null;
  const rel = decodeURIComponent(uploadPath.slice('/uploads/'.length)).replace(/\\/g, '/');
  if (rel.includes('../') || rel.includes('/..')) return null;
  const parts = rel.split('/').filter(Boolean);
  const absPath = path.join(appWritableRoot(), 'studio-data', 'uploads', ...parts);
  return fs.existsSync(absPath) ? absPath : null;
}

// ── Clipboard IPC handlers (TODO3) ────────────────────────────────────────
function registerClipboardHandlers() {
  // Copy image to clipboard: write bitmap (for image editors/apps) + CF_HDROP (for Explorer paste)
  ipcMain.handle('clipboard:copy-image', (_event, uploadPath) => {
    try {
      const localPath = resolveUploadPath(uploadPath);
      if (!localPath) return false;
      const img = nativeImage.createFromPath(localPath);
      if (img.isEmpty()) return false;
      // Primary: bitmap for image editors / chat apps
      clipboard.writeImage(img);
      // Also write CF_HDROP so Ctrl+V works in Windows Explorer / Desktop
      if (process.platform === 'win32') {
        const p = localPath;
        const filesBuf = Buffer.concat([
          (() => { const b = Buffer.alloc((p.length + 1) * 2); b.write(p, 0, 'utf16le'); return b; })(),
          Buffer.alloc(2), // double-null terminator
        ]);
        const header = Buffer.alloc(20);
        header.writeUInt32LE(20, 0); header.writeUInt32LE(1, 16);
        clipboard.writeBuffer('CF_HDROP', Buffer.concat([header, filesBuf]));
      }
      return true;
    } catch { return false; }
  });

  // Copy plain text to clipboard
  ipcMain.handle('clipboard:copy-text', (_event, text) => {
    try { clipboard.writeText(String(text || '')); return true; }
    catch { return false; }
  });

  // Copy file(s) to clipboard — writes CF_HDROP on Windows so Ctrl+V works in Explorer
  ipcMain.handle('clipboard:copy-files', (_event, uploadPaths) => {
    try {
      const paths = (uploadPaths || []).map(resolveUploadPath).filter(Boolean);
      if (!paths.length) return false;
      if (process.platform === 'win32') {
        // Build CF_HDROP buffer for Windows native file clipboard
        const filesBuf = Buffer.concat(
          paths.map(p => {
            const b = Buffer.alloc((p.length + 1) * 2);
            b.write(p, 0, 'utf16le');
            return b;
          }).concat([Buffer.alloc(2)])  // double-null terminator
        );
        const header = Buffer.alloc(20);
        header.writeUInt32LE(20, 0);  // pFiles offset
        header.writeUInt32LE(1,  16); // fWide = true
        clipboard.writeBuffer('CF_HDROP', Buffer.concat([header, filesBuf]));
      }
      // Always write text fallback (full path, one per line)
      clipboard.writeText(paths.join('\n'));
      return true;
    } catch { return false; }
  });
}

// ── Native file drag-out IPC (TODO2) ─────────────────────────────────────
let _dragIcon = null;
function getDragIcon() {
  if (_dragIcon) return _dragIcon;
  const size = 48;
  const buf  = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    buf[i*4]=59; buf[i*4+1]=130; buf[i*4+2]=246; buf[i*4+3]=220;
  }
  _dragIcon = nativeImage.createFromBuffer(buf, { width: size, height: size });
  return _dragIcon;
}
function registerDragHandlers() {
  ipcMain.on('drag:start', (event, uploadPathOrPaths) => {
    try {
      const paths = Array.isArray(uploadPathOrPaths) ? uploadPathOrPaths : [uploadPathOrPaths];
      const localPaths = paths.map(resolveUploadPath).filter(Boolean);
      if (localPaths.length === 1) {
        event.sender.startDrag({ file: localPaths[0], icon: getDragIcon() });
      } else if (localPaths.length > 1) {
        event.sender.startDrag({ files: localPaths, icon: getDragIcon() });
      }
    } catch (e) { logLine('drag:start error ' + e.message); }
    event.returnValue = null;
  });
  // Drag local (non-uploads) file to OS/editing software
  ipcMain.on('drag:start-local', (event, absPathOrPaths) => {
    try {
      const paths = Array.isArray(absPathOrPaths) ? absPathOrPaths : [absPathOrPaths];
      const valid = paths.filter(p => { try { return fs.existsSync(p) && fs.statSync(p).isFile(); } catch { return false; } });
      if (valid.length === 1) {
        event.sender.startDrag({ file: valid[0], icon: getDragIcon() });
      } else if (valid.length > 1) {
        event.sender.startDrag({ files: valid, icon: getDragIcon() });
      }
    } catch (e) { logLine('drag:start-local error ' + e.message); }
  });
}

function registerAudioHandlers() {
  const AUDIO_EXTS = new Set(['.mp3','.wav','.ogg','.flac','.aac','.m4a','.opus','.weba','.m4r','.aiff','.au']);
  ipcMain.handle('folder:scan-audio', async (_event, folderPath) => {
    function scanDir(dirPath, subPath, depth) {
      if (depth > 8) return [];
      const results = [];
      let entries;
      try { entries = fs.readdirSync(dirPath, { withFileTypes: true }); } catch { return []; }
      entries.sort((a, b) => {
        if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
        return a.name.localeCompare(b.name, 'zh');
      });
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;
        const absPath = path.join(dirPath, entry.name);
        const relPath = subPath ? subPath + '/' + entry.name : entry.name;
        if (entry.isDirectory()) {
          results.push({ type: 'folder', name: entry.name, relPath, absPath, subPath: subPath || '' });
          results.push(...scanDir(absPath, relPath, depth + 1));
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (AUDIO_EXTS.has(ext)) {
            let size = 0;
            try { size = fs.statSync(absPath).size; } catch {}
            results.push({ type: 'file', name: entry.name,
              nameNoExt: path.basename(entry.name, ext),
              ext: ext.slice(1), relPath, absPath, size, subPath: subPath || '' });
          }
        }
      }
      return results;
    }
    try { return { ok: true, items: scanDir(folderPath, '', 0) }; }
    catch (e) { return { ok: false, error: e.message, items: [] }; }
  });
}

async function createWindow() {
  logLine(`createWindow resources=${process.resourcesPath || ''}`);
  const serverReady = await ensureServer();
  if (!serverReady) {
    logLine('server failed to become ready');
    dialog.showErrorBox('Prompt Studio', '本地服务启动失败。请确认已安装 Python 3，或使用带 sidecar 的正式安装包。');
    return;
  }

  mainWindow = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 1040,
    minHeight: 720,
    title: 'Prompt Studio Desktop',
    frame: false,
    autoHideMenuBar: true,
    backgroundColor: '#10151c',
    icon: process.platform === 'win32'
      ? resourcePath('prompt_studio_icon.ico')
      : resourcePath('prompt_studio_icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  mainWindow.setMenuBarVisibility(false);

  // Prevent drag-drop from navigating the main window away from the application
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== SERVER_URL && !url.startsWith(`${SERVER_URL}/`)) {
      event.preventDefault();
    }
  });

  // Clear HTTP cache so a freshly installed version always loads new files
  await mainWindow.webContents.session.clearCache();
  await mainWindow.loadURL(SERVER_URL, { extraHeaders: 'pragma: no-cache\n' });
  logLine('main window loaded');
  if (process.argv.some((arg) => arg.startsWith(`${PROTOCOL}://`))) {
    mainWindow.webContents.once('did-finish-load', () => {
      mainWindow.webContents.executeJavaScript('window.openDesktopSettings && window.openDesktopSettings()');
    });
  }
}

function stopServer() {
  if (!serverProcess) return;
  const proc = serverProcess;
  serverProcess = null;
  try {
    if (process.platform === 'win32') {
      // Kill the entire process tree (covers py.exe → python.exe chains)
      const { execSync } = require('child_process');
      try { execSync(`taskkill /pid ${proc.pid} /T /F`, { timeout: 4000, stdio: 'ignore' }); } catch {}
    } else {
      // Unix: SIGTERM first, then SIGKILL
      try { proc.kill('SIGTERM'); } catch {}
      setTimeout(() => { try { proc.kill('SIGKILL'); } catch {} }, 1500);
    }
  } catch {}
  // Fallback: always try direct kill too
  try { proc.kill(); } catch {}
  logLine('stopServer called, pid=' + proc.pid);
}

const gotLock = app.requestSingleInstanceLock();
logLine(`gotLock ${gotLock}`);
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      if (argv.some((arg) => arg.startsWith(`${PROTOCOL}://`))) {
        mainWindow.webContents.executeJavaScript('window.openDesktopSettings && window.openDesktopSettings()');
      }
    }
  });

  app.whenReady().then(async () => {
    logLine('app ready');
    registerProtocol();
    registerWindowControls();
    registerDialogHandlers();
    registerClipboardHandlers();
    registerDragHandlers();
    registerAudioHandlers();
    buildMenu();
    await createWindow();
    setupAutoUpdater();
  }).catch((err) => {
    logLine(`app ready error ${err.stack || err.message}`);
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('before-quit', stopServer);
  app.on('will-quit', stopServer);

  // Final safety net: if Node process itself exits for any reason
  process.on('exit', () => {
    if (serverProcess) {
      try {
        if (process.platform === 'win32') {
          require('child_process').execSync(
            `taskkill /pid ${serverProcess.pid} /T /F`,
            { timeout: 2000, stdio: 'ignore' }
          );
        } else {
          serverProcess.kill('SIGKILL');
        }
      } catch {}
    }
  });
}
