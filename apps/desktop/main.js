const { app, BrowserWindow, dialog } = require('electron');
const fs = require('fs');
const path = require('path');
const { fork } = require('child_process');
const { resolveAppPaths } = require('../server/app_paths');

const APP_PORT = Number(process.env.PORT || 3001);
const HEALTH_URL = `http://127.0.0.1:${APP_PORT}/api/health`;
const PANEL_URL = `http://127.0.0.1:${APP_PORT}/painel`;
const SERVER_ROOT = path.resolve(__dirname, '../server');
const DEFAULT_MODULAR_DATA_ROOT = path.resolve(__dirname, '..', '..', 'runtime');
const COMMERCIAL_PATHS = resolveAppPaths(SERVER_ROOT, {
  ...process.env,
  HIMEFIT_PROFILE: process.env.HIMEFIT_PROFILE || 'commercial',
  HIMEFIT_DATA_ROOT: process.env.HIMEFIT_DATA_ROOT || DEFAULT_MODULAR_DATA_ROOT
}, process.platform);
const COMMERCIAL_DATA_ROOT = COMMERCIAL_PATHS.DATA_ROOT_DIR;
const FALLBACK_LOG_DIR = COMMERCIAL_PATHS.LOGS_DIR;

let backendProcess = null;
let win = null;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function ensureDirSafe(dir) {
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  } catch (_) {}
}

function getMainLogDir() {
  try {
    const userData = app.getPath('userData');
    if (userData) return path.join(userData, 'logs');
  } catch (_) {}
  return FALLBACK_LOG_DIR;
}

function getMainLogFile() {
  return path.join(getMainLogDir(), 'desktop-main.log');
}

function appendMainLog(message, error) {
  try {
    const logDir = getMainLogDir();
    ensureDirSafe(logDir);
    const ts = new Date().toISOString();
    const details = error ? ` | ${error.stack || error.message || String(error)}` : '';
    fs.appendFileSync(getMainLogFile(), `[${ts}] ${message}${details}\n`, 'utf8');
  } catch (_) {}
}

async function waitForBackend(timeoutMs = 45000) {
  const startedAt = Date.now();
  while ((Date.now() - startedAt) < timeoutMs) {
    try {
      const res = await fetch(HEALTH_URL);
      if (res.ok) return true;
    } catch (_) {}
    await sleep(500);
  }
  return false;
}

function getCommercialDataRoot() {
  return COMMERCIAL_DATA_ROOT;
}

function resolveBackendEntry() {
  if (!app.isPackaged) {
    return path.resolve(__dirname, '../server/index.js');
  }
  const unpacked = path.join(process.resourcesPath, 'app', 'apps', 'server', 'index.js');
  if (fs.existsSync(unpacked)) return unpacked;
  return path.join(process.resourcesPath, 'app.asar', 'apps', 'server', 'index.js');
}

function resolveBackendCwd(serverEntry) {
  if (!app.isPackaged) {
    return SERVER_ROOT;
  }
  const preferred = path.join(process.resourcesPath, 'app', 'apps', 'server');
  if (fs.existsSync(preferred)) return preferred;
  if (String(serverEntry).includes(`${path.sep}app.asar${path.sep}`)) {
    return process.resourcesPath;
  }
  const fallback = path.dirname(serverEntry);
  if (fs.existsSync(fallback)) return fallback;
  return process.resourcesPath;
}

function startBackendProcess() {
  if (backendProcess && !backendProcess.killed) return;
  const serverEntry = resolveBackendEntry();
  const backendCwd = resolveBackendCwd(serverEntry);
  if (!fs.existsSync(serverEntry)) {
    throw new Error(`Backend entry nao encontrado: ${serverEntry}`);
  }
  const env = {
    ...process.env,
    PORT: String(APP_PORT),
    HIMEFIT_PROFILE: 'commercial',
    HIMEFIT_DATA_ROOT: getCommercialDataRoot(),
    ELECTRON_RUN_AS_NODE: '1'
  };
  backendProcess = fork(serverEntry, [], {
    cwd: backendCwd,
    env,
    execPath: process.execPath,
    silent: true,
    windowsHide: true
  });

  if (backendProcess?.stdout) {
    backendProcess.stdout.on('data', (chunk) => {
      appendMainLog(`backend.stdout ${String(chunk || '').trim()}`);
    });
  }
  if (backendProcess?.stderr) {
    backendProcess.stderr.on('data', (chunk) => {
      appendMainLog(`backend.stderr ${String(chunk || '').trim()}`);
    });
  }
  backendProcess.on('error', (error) => {
    appendMainLog('backend child process error', error);
  });
  backendProcess.on('exit', (code, signal) => {
    appendMainLog(`backend child process exit code=${code ?? 'null'} signal=${signal || 'none'}`);
  });

  appendMainLog(`backend iniciado pid=${backendProcess?.pid || 'n/a'} entry=${serverEntry} cwd=${backendCwd} cwdExists=${fs.existsSync(backendCwd)}`);
}

function stopBackendProcess() {
  if (!backendProcess) return;
  try {
    backendProcess.kill('SIGTERM');
  } catch (_) {}
  backendProcess = null;
}

async function createMainWindow() {
  appendMainLog('iniciando app desktop');
  startBackendProcess();
  const ok = await waitForBackend();
  if (!ok) {
    appendMainLog('backend nao respondeu /api/health em tempo');
    dialog.showErrorBox(
      'Himefit',
      `Nao foi possivel iniciar o backend local. Verifique permissao de pasta e antivirus.\n\nLog: ${getMainLogFile()}`
    );
    app.quit();
    return;
  }

  win = new BrowserWindow({
    width: 1420,
    height: 940,
    minWidth: 1200,
    minHeight: 760,
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.once('ready-to-show', () => win?.show());
  win.on('closed', () => { win = null; });
  await win.loadURL(PANEL_URL);
  appendMainLog('janela principal carregada');
}

app.whenReady().then(createMainWindow);

app.on('window-all-closed', () => {
  stopBackendProcess();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  stopBackendProcess();
});

process.on('uncaughtException', (error) => {
  appendMainLog('uncaughtException no main process', error);
});

process.on('unhandledRejection', (reason) => {
  appendMainLog('unhandledRejection no main process', reason instanceof Error ? reason : new Error(String(reason)));
});
