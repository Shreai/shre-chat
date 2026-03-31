import {
  app,
  BrowserWindow,
  shell,
  globalShortcut,
  Menu,
  net,
  session,
  systemPreferences,
} from 'electron';
import * as path from 'path';
import { fork, type ChildProcess } from 'child_process';

let win: BrowserWindow | null = null;
let server: ChildProcess | null = null;
let ownsServer = false;

const isDev = !app.isPackaged;
const SERVER_PORT = 5510;
const SERVER_URL = `https://localhost:${SERVER_PORT}`;

// Check if serve.js is already running (LaunchAgent)
async function isServerRunning(): Promise<boolean> {
  return new Promise((resolve) => {
    const request = net.request({ url: SERVER_URL, method: 'HEAD' });
    request.on('response', () => resolve(true));
    request.on('error', () => resolve(false));
    request.end();
  });
}

function startServer(): void {
  const servePath = isDev
    ? path.join(__dirname, '..', '..', 'serve.js')
    : path.join(process.resourcesPath, 'serve.js');

  server = fork(servePath, [], {
    env: { ...process.env, PORT: String(SERVER_PORT) },
    stdio: 'pipe',
  });

  ownsServer = true;
  server.stdout?.on('data', (d) => console.log('[serve]', d.toString().trim()));
  server.stderr?.on('data', (d) => console.error('[serve]', d.toString().trim()));
  server.on('exit', (code) => {
    console.log('[serve] exited:', code);
    ownsServer = false;
  });
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 480,
    height: 780,
    minWidth: 380,
    minHeight: 500,
    title: 'Shre',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 14, y: 14 },
    backgroundColor: '#0a1628',
    hasShadow: true,
    roundedCorners: true,
    vibrancy: 'under-window',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.loadURL(SERVER_URL);

  // Grant microphone permission for voice input
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    if (permission === 'media' || (permission as string) === 'microphone') {
      callback(true);
    } else {
      callback(true); // Allow all permissions for local app
    }
  });

  // On macOS, request mic access at OS level if needed
  if (process.platform === 'darwin') {
    systemPreferences.askForMediaAccess('microphone').catch(() => {});
  }

  // Open external links in browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  win.on('closed', () => {
    win = null;
  });
}

// ── App Menu ──

function buildMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'Shre',
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
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
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { role: 'resetZoom' },
      ],
    },
    {
      label: 'Window',
      submenu: [{ role: 'minimize' }, { role: 'zoom' }, { role: 'close' }],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ── Lifecycle ──

app.on('certificate-error', (event, _webContents, _url, _error, _cert, callback) => {
  // Trust local self-signed certs (mkcert localhost)
  event.preventDefault();
  callback(true);
});

app.on('ready', async () => {
  buildMenu();

  // Trust self-signed certs (mkcert) for ALL requests — webContents + net.request
  session.defaultSession.setCertificateVerifyProc((_request, callback) => {
    callback(0); // 0 = trust
  });

  // Clear HTTP cache to always load fresh builds
  await session.defaultSession.clearCache();

  const running = await isServerRunning();
  if (running) {
    console.log('[shre] Server already running on port', SERVER_PORT);
  } else {
    console.log('[shre] Starting server...');
    startServer();
    // Wait for server to be ready
    await new Promise<void>((resolve) => setTimeout(resolve, 1200));
  }

  createWindow();

  // Cmd+Shift+S to focus
  globalShortcut.register('CommandOrControl+Shift+S', () => {
    if (win) {
      win.show();
      win.focus();
    }
  });
});

app.on('activate', () => {
  if (win === null) createWindow();
  else win.show();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  // Only kill server if we started it
  if (ownsServer && server) {
    server.kill();
  }
});
