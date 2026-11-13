const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

const NEST = 140;   // yuva boyutu (sayfa içi px, ölçek 1)
const MENU_W = 46;  // menü açılınca eklenen genişlik
const SIZES = [
  { label: 'Küçük', scale: 0.8 },
  { label: 'Normal', scale: 1 },
  { label: 'Büyük', scale: 1.3 },
  { label: 'Dev', scale: 1.6 },
];

let win = null;
let tray = null;
let rebuildTray = () => {};
let menuOpen = false;
let menuSide = 'right';
let drag = null;
let scale = 1;
let onTop = false;   // false: masaüstünde, diğer pencerelerin arkasında (bileşen gibi)

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const nestPx = () => Math.round(NEST * scale);
const menuPx = () => Math.round(MENU_W * scale);

if (!app.requestSingleInstanceLock()) app.quit();

const posFile = () => path.join(app.getPath('userData'), 'konum.json');
const settingsFile = () => path.join(app.getPath('userData'), 'ayarlar.json');

function loadSettings() {
  try {
    const s = JSON.parse(fs.readFileSync(settingsFile(), 'utf8'));
    if (typeof s.scale === 'number') scale = clamp(s.scale, 0.6, 2);
    if (typeof s.onTop === 'boolean') onTop = s.onTop;
  } catch (_) {}
}
function saveSettings() {
  try { fs.writeFileSync(settingsFile(), JSON.stringify({ scale, onTop })); } catch (_) {}
}

// Varsayılan: masaüstü bileşeni gibi davranır, diğer pencerelerin arkasında kalır.
// "Her zaman üstte" açıksa eskisi gibi her şeyin (tam ekran uygulamalar dahil) üstünde durur.
function applyOnTop() {
  if (!win) return;
  win.setAlwaysOnTop(onTop, 'floating');
  // macOS'ta tam ekran üstünde görünmek için süreç tipi değiştirilir; bileşen modunda buna gerek yok
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: onTop, skipTransformProcessType: !onTop });
}
// menüden "göster" denince öne getir; odak çalmadan
function reveal() {
  if (!win) return;
  win.showInactive();
  if (!onTop) win.moveTop();
}

function loadPos() {
  try {
    const p = JSON.parse(fs.readFileSync(posFile(), 'utf8'));
    const n = nestPx();
    // kaydedilen konum hâlâ bir ekranın içinde mi?
    const d = screen.getDisplayMatching({ x: p.x, y: p.y, width: n, height: n }).workArea;
    if (p.x >= d.x - 20 && p.y >= d.y - 20 && p.x + n <= d.x + d.width + 20 && p.y + n <= d.y + d.height + 20) return p;
  } catch (_) {}
  return null;
}

function defaultPos() {
  const wa = screen.getPrimaryDisplay().workArea;
  return { x: wa.x + wa.width - nestPx() - 28, y: wa.y + wa.height - nestPx() - 28 };
}

function nestX(b) { return menuOpen && menuSide === 'left' ? b.x + menuPx() : b.x; }

function savePos() {
  if (!win) return;
  const b = win.getBounds();
  try { fs.writeFileSync(posFile(), JSON.stringify({ x: nestX(b), y: b.y })); } catch (_) {}
}

function createWindow() {
  const p = loadPos() || defaultPos();
  win = new BrowserWindow({
    width: nestPx(),
    height: nestPx(),
    x: p.x,
    y: p.y,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    alwaysOnTop: onTop,
    skipTaskbar: true,
    hasShadow: false,
    acceptFirstMouse: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  applyOnTop();
  win.webContents.on('did-finish-load', () => {
    win.webContents.setVisualZoomLevelLimits(1, 1);
    win.webContents.setZoomFactor(scale);
  });
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
  win.once('ready-to-show', () => win.showInactive());
  win.on('blur', () => win.webContents.send('blur'));
  win.on('closed', () => { win = null; });
}

// --- boyut değiştir: yuvanın sağ alt köşesi yerinde kalır ---
function applyScale(s) {
  s = clamp(Number(s) || 1, 0.6, 2);
  if (!win) { scale = s; saveSettings(); return scale; }
  const b = win.getBounds();
  const right = nestX(b) + nestPx(), bottom = b.y + nestPx();
  scale = s;
  saveSettings();
  win.webContents.setZoomFactor(scale);
  const n = nestPx();
  const wa = screen.getDisplayMatching(b).workArea;
  let x = clamp(right - n, wa.x, wa.x + wa.width - n);
  const y = clamp(bottom - n, wa.y, wa.y + wa.height - n);
  let w = n;
  if (menuOpen) { w += menuPx(); if (menuSide === 'left') x -= menuPx(); }
  win.setBounds({ x, y, width: w, height: n });
  savePos();
  win.webContents.send('scale', scale);
  rebuildTray();
  return scale;
}
ipcMain.handle('get-scale', () => scale);
ipcMain.handle('set-scale', (_e, s) => applyScale(s));

// --- menü açılınca pencereyi genişlet ---
ipcMain.handle('menu', (_e, open) => {
  if (!win) return 'right';
  const b = win.getBounds();
  const n = nestPx(), m = menuPx();
  if (open && !menuOpen) {
    const wa = screen.getDisplayMatching(b).workArea;
    menuSide = b.x + n + m > wa.x + wa.width ? 'left' : 'right';
    const x = menuSide === 'left' ? b.x - m : b.x;
    win.setBounds({ x, y: b.y, width: n + m, height: n });
    menuOpen = true;
  } else if (!open && menuOpen) {
    const x = menuSide === 'left' ? b.x + m : b.x;
    win.setBounds({ x, y: b.y, width: n, height: n });
    menuOpen = false;
  }
  return menuSide;
});

// --- sürükleme (imleç konumunu ana süreçten okuyoruz, DPI sorunu olmasın) ---
ipcMain.on('drag-start', () => {
  if (!win) return;
  const [wx, wy] = win.getPosition();
  drag = { mouse: screen.getCursorScreenPoint(), wx, wy };
});
ipcMain.on('drag-move', () => {
  if (!win || !drag) return;
  const c = screen.getCursorScreenPoint();
  win.setPosition(drag.wx + c.x - drag.mouse.x, drag.wy + c.y - drag.mouse.y);
});
ipcMain.on('drag-end', () => { drag = null; savePos(); });

// --- menü çubuğu ikonu ---
function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'trayTemplate.png'));
  icon.setTemplateImage(true);
  tray = new Tray(icon);
  tray.setToolTip('Kedicik');
  rebuildTray = () => {
    const login = isOpenAtLogin();
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Kediyi göster / gizle', click: () => { if (!win) return; win.isVisible() ? win.hide() : reveal(); } },
      { label: 'Köşeye getir', click: () => { if (!win) return; const p = defaultPos(); win.setPosition(p.x, p.y); savePos(); reveal(); } },
      { label: 'Her zaman üstte', type: 'checkbox', checked: onTop, click: (item) => { onTop = item.checked; saveSettings(); applyOnTop(); reveal(); rebuildTray(); } },
      {
        label: 'Boyut',
        submenu: SIZES.map((s) => ({
          label: s.label, type: 'radio', checked: Math.abs(scale - s.scale) < 0.01,
          click: () => applyScale(s.scale),
        })),
      },
      { type: 'separator' },
      { label: 'Bilgisayar açılınca başlat', type: 'checkbox', checked: login, click: (item) => { setOpenAtLogin(item.checked); rebuildTray(); } },
      { type: 'separator' },
      { label: 'Çıkış', click: () => app.quit() },
    ]));
  };
  rebuildTray();
}

// --- bilgisayar açılınca başlat ---
// Windows'taki "portable" .exe her açılışta geçici bir klasöre açılır; başlangıç kaydı
// o geçici yolu değil asıl .exe dosyasını göstermeli (electron-builder bu yolu verir).
const loginOpts = () =>
  (process.platform === 'win32' && process.env.PORTABLE_EXECUTABLE_FILE ? { path: process.env.PORTABLE_EXECUTABLE_FILE } : {});
const isOpenAtLogin = () => app.getLoginItemSettings(loginOpts()).openAtLogin;
const setOpenAtLogin = (on) => app.setLoginItemSettings({ openAtLogin: on, ...loginOpts() });

// ilk kurulumda otomatik başlatmayı aç
function firstRunSetup() {
  const flag = path.join(app.getPath('userData'), '.kuruldu');
  if (app.isPackaged && !fs.existsSync(flag)) {
    setOpenAtLogin(true);
    try { fs.writeFileSync(flag, '1'); } catch (_) {}
  }
}

app.whenReady().then(() => {
  if (process.platform === 'darwin' && app.dock) app.dock.hide();
  loadSettings();
  firstRunSetup();
  createWindow();
  createTray();
});

app.on('second-instance', () => reveal());
app.on('window-all-closed', () => app.quit());
