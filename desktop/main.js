const { app, BrowserWindow, Menu, dialog, shell, ipcMain, clipboard, nativeImage } = require('electron');
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

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

function extensionPath() {
  if (!app.isPackaged) return path.resolve(__dirname, '..', 'extension');
  // Packaged: extension/ sits next to the app folder, one level above the exe dir
  const sibling = path.join(path.dirname(process.execPath), '..', 'extension');
  if (fs.existsSync(sibling)) return sibling;
  // Fallback: legacy inside resources/
  return path.join(process.resourcesPath, 'extension');
}

function appWritableRoot() {
  if (!app.isPackaged) return path.resolve(__dirname, '..');
  if (process.env.PORTABLE_EXECUTABLE_DIR) return process.env.PORTABLE_EXECUTABLE_DIR;
  return path.dirname(process.execPath);
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
  const exeName = process.platform === 'win32' ? 'prompt-studio-server.exe' : 'prompt-studio-server';
  const candidates = [
    resourcePath('server', exeName),
    path.join(__dirname, 'server-dist', exeName),
  ];
  const command = candidates.find((candidate) => fs.existsSync(candidate));
  return command ? { command, args: [String(PORT)] } : null;
}

function pythonServerCommand() {
  const serverPy = resourcePath('studio', 'server.py');
  const python = process.platform === 'win32' ? 'python' : 'python3';
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
  // Copy image bitmap to system clipboard
  ipcMain.handle('clipboard:copy-image', (_event, uploadPath) => {
    try {
      const localPath = resolveUploadPath(uploadPath);
      if (!localPath) return false;
      const img = nativeImage.createFromPath(localPath);
      if (img.isEmpty()) return false;
      clipboard.writeImage(img);
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
  ipcMain.on('drag:start', (event, uploadPath) => {
    try {
      const localPath = resolveUploadPath(uploadPath);
      if (localPath) event.sender.startDrag({ file: localPath, icon: getDragIcon() });
    } catch (e) { logLine('drag:start error ' + e.message); }
    event.returnValue = null;
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
    width: 1280,
    height: 840,
    minWidth: 980,
    minHeight: 680,
    title: 'Prompt Studio Desktop',
    frame: false,
    autoHideMenuBar: true,
    backgroundColor: '#f5f6f8',
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

  await mainWindow.loadURL(SERVER_URL);
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
  proc.kill();
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
    registerClipboardHandlers();
    registerDragHandlers();
    buildMenu();
    await createWindow();
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
}
