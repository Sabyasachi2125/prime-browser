/* eslint-disable no-console */

import { Store } from 'vuex';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rename,
  writeFile,
  writeFileSync,
} from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as dotenv from 'dotenv';
import {
  app,
  BrowserWindow,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  MenuItem,
  net,
  nativeImage,
  protocol,
  shell,
  screen,
  systemPreferences,
} from 'electron';
import collect from 'collect.js';
import { is } from 'electron-util';

import localshortcut from 'electron-localshortcut';
import autoUpdater from './lib/auto-updater';
import constants from './constants';
import menu from './lib/menu';
import promisify from './lib/promisify';
import fetchText from './lib/fetch';
import View from './lib/view';

const { openProcessManager } = require('electron-process-manager');

dotenv.config({
  path: path.join(__dirname, '../../.env'),
});

const isTesting = process.env.NODE_ENV === 'test';
const startTime = new Date().getTime();
const globalObject = global as unknown as Lulumi.API.GlobalObject;

// Suppress Chromium network errors (ERR_FAILED, ERR_ABORTED) that surface as
// unhandled rejections or uncaught exceptions from SimpleURLLoaderWrapper —
// these are benign navigation failures (e.g. loading a download page that
// returns a non-200 and triggers a file download instead).
const isIgnorableNetworkError = (reason: unknown): boolean => {
  if (!(reason instanceof Error)) {
    return false;
  }
  return (
    reason.message.includes('ERR_FAILED') ||
    reason.message.includes('ERR_ABORTED') ||
    reason.message.includes('net::') ||
    reason.message.includes('Object has been destroyed')
  );
};

process.on('unhandledRejection', (reason) => {
  if (isIgnorableNetworkError(reason)) {
    return;
  }
  console.error('[unhandledRejection]', reason);
});

process.on('uncaughtException', (error) => {
  if (isIgnorableNetworkError(error)) {
    return;
  }
  console.error('[uncaughtException]', error);
  // Do NOT re-throw — re-throwing would still invoke the default Electron
  // fatal-error dialog for non-network errors.
});

/*
 * Set `__static` path to static files in production
 * https://simulatedgreg.gitbooks.io/electron-vue/content/en/using-static-assets.html
 */
if (process.env.NODE_ENV !== 'development') {
  globalObject.__static = path.resolve(__dirname, '../static');
}

const { nativeTheme } = require('electron');
nativeTheme.themeSource = 'dark'; // Initialize deeply routed Chromium theme styling to default

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.exit();
}

let shuttingDown: boolean = isTesting;

if (process.env.NODE_ENV === 'development') {
  app.setPath('userData', constants.devUserData);
} else if (isTesting) {
  app.setPath('userData', constants.testUserData);
}

const storagePath: string = path.join(app.getPath('userData'), 'lulumi-state');
const langPath: string = path.join(app.getPath('userData'), 'lulumi-lang');

function getDefaultLang(): string {
  const countryCode = app.getLocaleCountryCode();
  if (countryCode === 'TW') {
    return 'zh-TW';
  }
  if (countryCode === 'CN') {
    return 'zh-CN';
  }
  return 'en-US';
}

function ensureUserDataFiles(): void {
  const userDataPath = app.getPath('userData');
  if (!existsSync(userDataPath)) {
    mkdirSync(userDataPath, { recursive: true });
  }
  if (!existsSync(langPath)) {
    writeFileSync(langPath, JSON.stringify(getDefaultLang()));
  }
}

ensureUserDataFiles();

let lulumiStateSaveHandler: any = null;
let setLanguage = false;

const autoHideMenuBarSetting: boolean = is.macos;
const swipeGesture: boolean = is.macos
  ? systemPreferences.isSwipeTrackingFromScrollEventsEnabled()
  : false;

const winURL: string = process.env.NODE_ENV === 'development'
  ? `http://localhost:${require('../../.electron-vue/config').port}`
  : `file://${__dirname}/index.html`;
const cpURL: string = process.env.NODE_ENV === 'development'
  ? `http://localhost:${require('../../.electron-vue/config').port}/cp.html`
  : `file://${__dirname}/cp.html`;

// ./lib/session.ts
const { default: session } = require('./lib/session');

// ../shared/store/mainStore.ts
const { default: mainStore } = require('../shared/store/mainStore');
mainStore.register(storagePath, swipeGesture);
const store: Store<any> = mainStore.getStore();
const windows: Electron.BrowserWindow[] = mainStore.getWindows();
const viewByBrowserViewId: Map<number, View> = new Map();
const browserViewIdByTabId: Map<number, number> = new Map();

// ./api/lulumi-extension.ts
const { default: lulumiExtension } = require('./api/lulumi-extension');
interface SecureJsonRequestOptions {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
}

const buildSecureError = (message: string) => ({ ok: false, error: message });

const requestJson = (options: SecureJsonRequestOptions): Promise<any> => (
  new Promise((resolve, reject) => {
    const request = net.request({
      method: options.method || 'GET',
      url: options.url,
    });
    const timeoutMs = options.timeoutMs || 10000;
    const timer = setTimeout(() => {
      request.abort();
      reject(new Error('timeout'));
    }, timeoutMs);
    let responseBody = '';

    if (options.headers) {
      Object.keys(options.headers).forEach((key) => {
        request.setHeader(key, options.headers![key]);
      });
    }

    request.on('response', (response) => {
      response.on('data', (chunk) => {
        responseBody += chunk.toString();
      });
      response.on('end', () => {
        clearTimeout(timer);
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`status_${response.statusCode}`));
          return;
        }
        try {
          resolve(JSON.parse(responseBody));
        } catch (parseError) {
          reject(new Error('invalid_json'));
        }
      });
      response.on('error', () => {
        clearTimeout(timer);
        reject(new Error('response_error'));
      });
    });

    request.on('error', () => {
      clearTimeout(timer);
      reject(new Error('request_error'));
    });

    if (options.body) {
      request.write(options.body);
    }
    request.end();
  })
);

let globalCurrentTheme = 'dark'; // Track the global theme setting
ipcMain.on('set-theme', (event, theme) => {
  globalCurrentTheme = theme;
  const { webContents } = require('electron');
  nativeTheme.themeSource = theme;
  webContents.getAllWebContents().forEach((wc) => {
    wc.send('theme-updated', theme);
  });
});
ipcMain.on('get-current-theme', (event) => {
  event.returnValue = globalCurrentTheme;
});

function lulumiStateSave(soft = true, windowCount = Object.keys(windows).length): void {
  if (!soft) {
    let count = 0;
    Object.keys(windows).forEach((key) => {
      const id = parseInt(key, 10);
      const window = windows[id];
      window.once('closed', () => {
        count += 1;
        if (count === windowCount) {
          if (setLanguage) {
            // don't count in 'command-palette'
            mainStore.bumpWindowIds(windowCount - 1);
          }
        }
      });
      window.close();
      // https://github.com/electron/electron/issues/22290
      (window as any).removeAllListeners('close');
    });
  }
  if (setLanguage) {
    return;
  }
  mainStore.saveLulumiState(soft)
    .then((state) => {
      if (state) {
        promisify(writeFile, storagePath, JSON.stringify(state)).then(() => {
          if (lulumiStateSaveHandler === null) {
            shuttingDown = true;
            app.quit();
          }
        });
      }
    });
}

// eslint-disable-next-line max-len
function createWindow(options?: Electron.BrowserWindowConstructorOptions, callback?: (eventName: string) => void): Electron.BrowserWindow {
  let mainWindow: Electron.BrowserWindow;
  const defaultOption: Record<string, any> = {
    autoHideMenuBar: autoHideMenuBarSetting,
    frame: !is.windows,
    fullscreenWindowTitle: true,
    title: 'Prime Browser',
    icon: path.join(
      __dirname,
      process.env.NODE_ENV === 'development'
        ? '../../static/icons/logo.ico'
        : '../static/icons/logo.ico'
    ),
    minWidth: 320,
    minHeight: 500,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, '../dist/preloads/main-preload.js'),
      enableRemoteModule: true,
      worldSafeExecuteJavaScript: true,
      contextIsolation: false,
      nodeIntegration: true,
      webSecurity: false,
      webviewTag: true,
    },
  };
  if (options && Object.keys(options).length !== 0) {
    mainWindow = new BrowserWindow(Object.assign({}, defaultOption, options));
  } else {
    /**
     * Initial window options
     */
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;
    mainWindow = new BrowserWindow(Object.assign({}, defaultOption, {
      width,
      height,
    }));
  }

  try {
    const maybeLoadPromise = mainWindow.loadURL(winURL);
    if (maybeLoadPromise && typeof maybeLoadPromise.catch === 'function') {
      maybeLoadPromise.catch((err: Error) => {
        if (!err.message.includes('ERR_FAILED') && !err.message.includes('ERR_ABORTED')) {
          console.error('(lulumi-browser) mainWindow.loadURL failed:', err);
        }
      });
    }
  } catch (loadErr) {
    const e = loadErr as Error;
    if (!e.message.includes('ERR_FAILED') && !e.message.includes('ERR_ABORTED')) {
      console.error('(lulumi-browser) mainWindow.loadURL threw:', loadErr);
    }
  }
  mainWindow.webContents.once('dom-ready', () => {
    console.log('Main renderer loaded. Preload should now expose window.api');
  });
  for (let index = 1; index < 9; index += 1) {
    localshortcut.register(mainWindow, `CmdOrCtrl+${index}`, () => {
      mainWindow.webContents.send('tab-click', index - 1);
    });
  }
  if (!is.macos) {
    /*
    * On Windows and Linux, there're two shortcuts registered
    * to jump to the next and previous open tab.
    * However, it's not possible to add multiple accelerators in
    * Electron currently; therefore, we need to register another one here.
    * Ref: https://github.com/electron/electron/issues/5256
    */
    localshortcut.register(mainWindow, 'Ctrl+Tab', () => {
      mainWindow.webContents.send('tab-select', 'next');
    });
    localshortcut.register(mainWindow, 'Ctrl+Shift+Tab', () => {
      mainWindow.webContents.send('tab-select', 'previous');
    });
  }
  // register 'Escape' shortcut
  localshortcut.register(mainWindow, 'Escape', () => {
    mainWindow.webContents.send('escape-full-screen');
  });
  // special case: go to the last tab
  localshortcut.register(mainWindow, 'CmdOrCtrl+9', () => {
    mainWindow.webContents.send('tab-click', -1);
  });
  // register the shortcut for opening the tab closed recently
  localshortcut.register(mainWindow, 'CmdOrCtrl+Shift+T', () => {
    mainWindow.webContents.send('restore-recently-closed-tab');
  });
  localshortcut.register(mainWindow, 'CmdOrCtrl+Shift+S', () => {
    mainWindow.webContents.send('summarize-page');
  });

  menu.init();

  /*
  mainWindow.webContents.on('will-attach-webview', (event, webPreferences, params) => {
    webPreferences.nativeWindowOpen = false;
    webPreferences.enableBlinkFeatures = 'OverlayScrollbars';
    webPreferences.nodeIntegrationInSubFrames = true;

    const backgroundRegExp = new RegExp(/^lulumi-extension:\/\/.+\/.*background.*\.html$/);
    if (params.src.startsWith('lulumi-extension://')) {
      if (params.src.match(backgroundRegExp)) {
        webPreferences.preload = path.join(constants.lulumiPreloadPath, 'extension-preload.js');
      } else {
        webPreferences.preload = path.join(constants.lulumiPreloadPath, 'popup-preload.js');
      }
    }
  });
  */

  mainWindow.on('close', () => {
    // https://github.com/electron/electron/issues/22290
    (mainWindow as any).removeAllListeners('will-attach-webview');
  });
  mainWindow.on('closed', () => ((mainWindow as any) = null));

  if (!isTesting) {
    // the first window
    if (lulumiStateSaveHandler === null) {
      // save app-state every 5 mins
      lulumiStateSaveHandler = setInterval(lulumiStateSave, 1000 * 60 * 5);

      // reset the setLanguage variable
      if (setLanguage) {
        setLanguage = false;
      }
    }
  }
  if (callback) {
    (mainWindow as any).callback = callback;
  } else {
    (mainWindow as any).callback = (eventName) => {
      ipcMain.once(eventName, (event: Electron.IpcMainEvent) => {
        event.sender.send(eventName.substr(4), { url: 'about:newtab', follow: true });
      });
    };
  }
  return mainWindow;
}

// register the method to BrowserWindow
(BrowserWindow as any).createWindow = createWindow;

// register 'lulumi' and 'lulumi-extension' as standard protocols that are secure
protocol.registerSchemesAsPrivileged([
  { scheme: 'lulumi', privileges: { standard: true, secure: true } },
  { scheme: 'lulumi-extension', privileges: { standard: true, secure: true } },
]);

app.whenReady().then(() => {
  // autoUpdater
  if (process.env.NODE_ENV !== 'development') {
    autoUpdater.init();
    autoUpdater.listen(windows);
  }

  // session related operations
  session.onWillDownload(windows, constants.lulumiPDFJSPath);
  session.setPermissionRequestHandler(windows);
  session.registerScheme(constants.lulumiPagesCustomProtocol);
  session.registerCertificateVerifyProc();
  session.registerWebRequestListeners();

  // load persisted extensions
  lulumiExtension.loadExtensions();

  // load lulumi-state
  let data: any = '""';
  try {
    data = readFileSync(storagePath, 'utf8');
  } catch (readError) {
    console.error(`(lulumi-browser) Could not read data from ${storagePath}, ${readError}`);
  }
  try {
    data = JSON.parse(data);
  } catch (parseError) {
    console.error(`(lulumi-browser) Could not parse data from ${storagePath}, ${parseError}`);
  } finally {
    if (data) {
      store.dispatch('setLulumiState', data);
      session.registerProxy(store.getters.proxyConfig);
    }
    try {
      const { width, height } = screen.getPrimaryDisplay().workAreaSize;

      globalObject.commandPalette = new BrowserWindow({
        width: width / 2,
        height: height / 1.94,
        show: false,
        frame: false,
        alwaysOnTop: true,
        fullscreenable: false,
        resizable: false,
        webPreferences: {
          partition: 'command-palette',
          nodeIntegration: true,
        },
      });

      globalObject.commandPalette.setVisibleOnAllWorkspaces(false);
      globalObject.commandPalette.loadURL(cpURL);
      globalShortcut.register('CmdOrCtrl+Shift+K', () => {
        if (globalObject.commandPalette.isVisible()) {
          globalObject.commandPalette.hide();
        } else {
          globalObject.commandPalette.show();
          globalObject.commandPalette.webContents.send('send-focus');
        }
      });
      globalShortcut.register('CmdOrCtrl+Shift+S', () => {
        const focusedWindow = BrowserWindow.getFocusedWindow();
        if (focusedWindow && focusedWindow.getTitle() !== 'command-palette') {
          focusedWindow.webContents.send('summarize-page');
        }
      });
      globalObject.commandPalette.on('blur', () => globalObject.commandPalette.hide());
      createWindow();
    } catch (createWindowError) {
      console.error(`(lulumi-browser) Could not create a window: ${createWindowError}`);
      app.exit(1);
    }
  }
});

if (process.env.TEST_ENV !== 'e2e') {
  app.on('remote-require', (event, webContents) => {
    console.error(
      `(lulumi-browser) Invalid module to require at webContents ${webContents.id}`
    );
    event.preventDefault();
  });
  app.on('remote-get-global', (event: Electron.IpcMainEvent, webContents, globalName) => {
    if (globalName === 'commandPalette') {
      event.returnValue = globalObject.commandPalette;
    } else {
      console.error(
        `(lulumi-browser) Invalid object to get at webContents ${webContents.id}`
      );
      event.preventDefault();
    }
  });
}

app.on('login', (event, webContents, request, authInfo, callback) => {
  const { auth } = store.getters;
  if (auth.username && auth.password) {
    callback(auth.username, auth.password);
  } else {
    dialog.showMessageBox(null!, {
      type: 'warning',
      buttons: ['OK'],
      title: 'Require authentication',
      // eslint-disable-next-line max-len
      message: 'The server requires a username and password. You can set them in "Preferences / Auth".',
      detail: `Server: ${request.url}\nRealm: ${authInfo.realm}`,
    });
  }
});

app.on('window-all-closed', () => {
  if (isTesting || !is.macos) {
    app.quit();
  }
});

app.on('activate', () => {
  if (Object.keys(windows).length === 0) {
    createWindow();
  }
});

app.on('before-quit', (event: Electron.Event) => {
  if (shuttingDown) {
    return;
  }
  event.preventDefault();
  mainStore.updateWindowStates();
  if (lulumiStateSaveHandler !== null) {
    clearInterval(lulumiStateSaveHandler);
    lulumiStateSaveHandler = null;
  }
  lulumiStateSave(false);
});

// https://github.com/electron/electron/pull/12782
app.on('second-instance', () => {
  // Someone tried to run a second instance, we should focus our window.
  for (let id = 0; id < Object.keys(windows).length; id += 1) {
    const window = windows[id] as Electron.BrowserWindow;
    if (window.getTitle() !== 'command-palette') {
      if (window.isMinimized()) {
        window.restore();
      }
      window.focus();
      return;
    }
  }
});

// load windowProperties
ipcMain.on('get-window-properties', (event: Electron.IpcMainEvent) => {
  const windowProperties: any = [];
  const baseDir = path.dirname(storagePath);
  const collection = collect(readdirSync(baseDir, 'utf8'));
  let windowPropertyFilenames =
    collection.filter(v => (v.match(/lulumi-state-window-\d+/) !== null));
  if (windowPropertyFilenames.isNotEmpty()) {
    windowPropertyFilenames = windowPropertyFilenames.sort((a, b) => (
      (b.split('-') as any).pop() - (a.split('-') as any).pop()
    ));
    windowPropertyFilenames.all().forEach((windowPropertyFilename) => {
      const windowPropertyFile = path.join(baseDir, windowPropertyFilename);
      const windowProperty = JSON.parse(readFileSync(windowPropertyFile, 'utf8'));
      windowProperty.path = windowPropertyFile;
      windowProperty.mtime = startTime;
      windowProperties.push(windowProperty);
    });
  }
  event.returnValue = windowProperties;
});
// restore windowProperties
ipcMain.on('restore-window-property', (event: Electron.Event, windowProperty: any) => {
  const options: Electron.BrowserWindowConstructorOptions = {};
  const { window } = windowProperty;
  const windowState: string = window.state;
  options.width = window.width;
  options.height = window.height;
  options.x = window.left;
  options.y = window.top;

  const tmpWindow = createWindow(options, (eventName) => {
    ipcMain.once(eventName, (event2: Electron.IpcMainEvent) => {
      event2.sender.send(eventName.substr(4), null);
      windowProperty.tabs.forEach((tab, index) => {
        tmpWindow.webContents.send(
          'new-tab', { url: tab.url, follow: index === windowProperty.currentTabIndex }
        );
      });
      const windowPropertyFilename = path.basename(windowProperty.path);
      const windowPropertyTmp = path.resolve(app.getPath('temp'), windowPropertyFilename);
      rename(windowProperty.path, windowPropertyTmp, (renameError) => {
        if (renameError) {
          console.error(`(lulumi-browser) ${renameError}`);
        }
      });
    });
  });
  if (window.focused) {
    tmpWindow.focus();
  }
  if (windowState === 'minimized') {
    tmpWindow.minimize();
  } else if (windowState === 'maximized') {
    tmpWindow.maximize();
  } else if (windowState === 'fullscreen') {
    tmpWindow.setFullScreen(true);
  }
});

// open ProcessManager
ipcMain.on('open-process-manager', () => {
  openProcessManager();
});

// return the number of BrowserWindow
ipcMain.on('get-window-count', (event: Electron.IpcMainEvent) => {
  event.returnValue = Object.keys(windows).length;
});

const getViewIfAlive = (
  view: View | undefined,
  browserViewId?: number,
  tabId?: number,
): View | undefined => {
  if (!view) {
    return undefined;
  }
  if (view.browserView.isDestroyed() || view.webContents.isDestroyed()) {
    if (browserViewId !== undefined) {
      viewByBrowserViewId.delete(browserViewId);
    }
    if (tabId !== undefined) {
      browserViewIdByTabId.delete(tabId);
    }
    return undefined;
  }
  return view;
};

const removeViewFromMaps = (browserViewId: number, tabId: number): void => {
  viewByBrowserViewId.delete(browserViewId);
  browserViewIdByTabId.delete(tabId);
};

const destroyTabView = (view: View, browserViewId: number, tabId: number): void => {
  const activeWindow = BrowserWindow.fromBrowserView(view.browserView);
  if (activeWindow) {
    activeWindow.removeBrowserView(view.browserView);
  }
  if (!view.webContents.isDestroyed()) {
    (view.webContents as any).destroy();
  }
  if (!view.browserView.isDestroyed()) {
    view.browserView.destroy();
  }

  removeViewFromMaps(browserViewId, tabId);
};

const findAliveViewById = (browserViewId: number): View | undefined => {
  const view = viewByBrowserViewId.get(browserViewId);
  return getViewIfAlive(view, browserViewId, view ? view.tabId : undefined);
};

const findAliveViewByTabId = (tabId: number): View | undefined => {
  const browserViewId = browserViewIdByTabId.get(tabId);
  if (browserViewId === undefined) {
    return undefined;
  }
  return findAliveViewById(browserViewId);
};
// create a BrowserView
ipcMain.on('create-browser-view', (event, data) => {
  const { tabId, tabIndex, url }: { tabId: number; tabIndex: number; url: string } = data;

  const window = windows[data.windowId] as Electron.BrowserWindow;
  if (!window) {
    return;
  }

  const existingView = findAliveViewByTabId(tabId);
  if (existingView) {
    const existingBrowserViewId = browserViewIdByTabId.get(tabId);
    if (existingBrowserViewId !== undefined) {
      destroyTabView(existingView, existingBrowserViewId, tabId);
    }
  }

  const view = new View(window, tabIndex, tabId, url);
  const browserViewId = view.id;
  viewByBrowserViewId.set(browserViewId, view);
  browserViewIdByTabId.set(tabId, browserViewId);
});

// destroy a BrowserView
ipcMain.on('destroy-browser-view', (event, browserViewId) => {
  const view = findAliveViewById(browserViewId);
  if (!view) {
    return;
  }

  destroyTabView(view, browserViewId, view.tabId);
});

// resize a BrowserView
ipcMain.on('resize-browser-view', (event, browserViewId) => {
  const view = findAliveViewById(browserViewId);
  if (!view) {
    return;
  }

  if (!view.webContents.isDestroyed()) {
    view.fitWindow();
  }
});

// focus a BrowserView
ipcMain.on('focus-browser-view', (event, data) => {
  const { browserViewId }: { browserViewId: number } = data;

  const window = windows[data.windowId] as Electron.BrowserWindow;
  const view = findAliveViewById(browserViewId);
  if (!window || !view) {
    return;
  }

  const currentView = window.getBrowserView();
  if (currentView && currentView.id !== view.id) {
    window.removeBrowserView(currentView);
  }

  if (!view.webContents.isDestroyed()) {
    window.setBrowserView(view.browserView);
  }
});

// show the certificate
ipcMain.on('show-certificate',
  (event: Electron.IpcMainEvent, certificate: Electron.Certificate, message: string) => {
    const browserWindow = BrowserWindow.fromWebContents(event.sender);
    if (browserWindow) {
      dialog.showCertificateTrustDialog(browserWindow, {
        certificate,
        message,
      }).then();
    }
  });

// focus the window
ipcMain.on('focus-window', (event, windowId) => {
  const window = windows[windowId] as Electron.BrowserWindow;
  if (window) {
    window.focus();
  }
});

// set the title for the focused BrowserWindow
ipcMain.on('set-browser-window-title', (event, data) => {
  const window = windows[data.windowId] as Electron.BrowserWindow;
  if (window) {
    window.setTitle(data.title);
  }
});

// show the item on host
ipcMain.on('show-item-in-folder', (event, itemPath) => {
  if (itemPath) {
    shell.showItemInFolder(itemPath);
  }
});

// open the item on host
ipcMain.on('open-path', (event, itemPath) => {
  if (itemPath) {
    shell.openPath(itemPath);
  }
});
ipcMain.handle('ask-ai', async (event, query: string) => {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

  if (!apiKey) {
    return {
      error: {
        message: 'Missing GEMINI_API_KEY',
        type: 'config_error',
      },
    };
  }

  try {
    const geminiUrl =
      'https://generativelanguage.googleapis.com/v1beta/models/' +
      `${model}:generateContent?key=${apiKey}`;
    const data = await requestJson({
      url: geminiUrl,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: query }],
          },
        ],
      }),
      timeoutMs: 60000,
    });
    const text =
      data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    return {
      choices: [
        {
          message: {
            content: text,
          },
        },
      ],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    return {
      error: {
        message: message || 'Gemini API request failed',
        type: 'network_error',
      },
    };
  }
});
ipcMain.handle('api:get-weather', async (_, payload: any = {}) => {
  if (!process.env.WEATHER_KEY) {
    return buildSecureError('Weather service is not configured.');
  }
  const units = payload.units || 'metric';
  const city = typeof payload.city === 'string' ? payload.city.trim() : '';
  const hasCoords = typeof payload.lat === 'number' && typeof payload.lon === 'number';
  let query = '';

  if (city) {
    query = `q=${encodeURIComponent(city)}`;
  } else if (hasCoords) {
    query = `lat=${payload.lat}&lon=${payload.lon}`;
  } else {
    return buildSecureError('Missing weather location.');
  }

  const url = `https://api.openweathermap.org/data/2.5/weather?${query}` +
    `&units=${encodeURIComponent(units)}` +
    `&appid=${encodeURIComponent(process.env.WEATHER_KEY)}`;

  try {
    const data = await requestJson({
      url,
      timeoutMs: 10000,
    });

    if (!data || !data.main || !Array.isArray(data.weather) || !data.weather[0]) {
      return buildSecureError('Weather data unavailable.');
    }

    return {
      ok: true,
      data: {
        city: data.name || '',
        temp: Math.round(data.main.temp),
        condition: data.weather[0].main || 'Unknown',
        icon: data.weather[0].icon
          ? `https://openweathermap.org/img/wn/${data.weather[0].icon}.png`
          : '',
      },
    };
  } catch (error) {
    return buildSecureError('Weather request failed.');
  }
});

ipcMain.handle('api:ask-ai', async (_, payload: any = {}) => {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const query = typeof payload.query === 'string' ? payload.query.trim() : '';
  if (!apiKey) {
    return buildSecureError('Missing GEMINI_API_KEY');
  }

  try {
    const geminiUrl =
      'https://generativelanguage.googleapis.com/v1beta/models/' +
      `${model}:generateContent?key=${apiKey}`;
    const data = await requestJson({
      url: geminiUrl,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: query }],
          },
        ],
      }),
      timeoutMs: 60000,
    });
    const content = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    if (!content) {
      return buildSecureError('AI returned an empty response.');
    }

    return {
      ok: true,
      data: {
        answer: content,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    return buildSecureError(message || 'Gemini API request failed');
  }
});
// load preference things into global when users accessing 'lulumi' protocol
ipcMain.on('lulumi-scheme-loaded', (event, val) => {
  let type: string = val.substr(`${constants.lulumiPagesCustomProtocol}://`.length).split('/')[0];
  const data: Lulumi.Scheme.LulumiObject = {} as Lulumi.Scheme.LulumiObject;

  if (process.env.NODE_ENV === 'development' && val.startsWith('http://localhost:')) {
    if (require('url').parse(val).pathname === '/about.html') {
      type = 'about';
    }
  }
  if (type === 'about') {
    const { versions } = process;

    data.lulumi = [
      {
        key: 'Prime Browser',
        value: app.getVersion(),
      },
      {
        key: 'rev',
        value: constants.lulumiRev,
      },
      {
        key: 'Electron',
        value: versions.electron,
      },
      {
        key: 'Node',
        value: versions.node,
      },
      {
        key: 'libchromiumcontent',
        value: versions.chrome,
      },
      {
        key: 'V8',
        value: versions.v8,
      },
      {
        key: 'os.platform',
        value: os.platform(),
      },
      {
        key: 'os.release',
        value: os.release(),
      },
      {
        key: 'os.arch',
        value: os.arch(),
      },
      {
        key: 'userData',
        value: app.getPath('userData'),
      },
    ];
    data.preferences = [
      ['Search Engine Provider', 'search'],
      ['Homepage', 'homepage'],
      ['PDFViewer', 'pdfViewer'],
      ['Tab', 'tab'],
      ['Language', 'language'],
      ['Proxy', 'proxy'],
      ['Auth', 'auth'],
    ];
    data.about = [
      [`${constants.lulumiPagesCustomProtocol}://about/#/about`, 'about'],
      [`${constants.lulumiPagesCustomProtocol}://about/#/lulumi`, 'lulumi'],
      [`${constants.lulumiPagesCustomProtocol}://about/#/preferences`, 'preferences'],
      [`${constants.lulumiPagesCustomProtocol}://about/#/downloads`, 'downloads'],
      [`${constants.lulumiPagesCustomProtocol}://about/#/history`, 'history'],
      [`${constants.lulumiPagesCustomProtocol}://about/#/extensions`, 'extensions'],
    ];
  }
  event.returnValue = data;
});

// about:* pages are eager to getting preference datas
ipcMain.on('guest-want-data', (event: Electron.IpcMainEvent, type: string) => {
  const webContentsId: number = event.sender.id;
  Object.keys(windows).forEach((key) => {
    const id = parseInt(key, 10);
    const window = windows[id];
    switch (type) {
      case 'searchEngineProvider':
        window.webContents.send('get-search-engine-provider', webContentsId);
        break;
      case 'homepage':
        window.webContents.send('get-homepage', webContentsId);
        break;
      case 'pdfViewer':
        window.webContents.send('get-pdf-viewer', webContentsId);
        break;
      case 'tabConfig':
        window.webContents.send('get-tab-config', webContentsId);
        break;
      case 'lang':
        window.webContents.send('get-lang', webContentsId);
        break;
      case 'proxyConfig':
        window.webContents.send('get-proxy-config', webContentsId);
        break;
      case 'auth':
        window.webContents.send('get-auth', webContentsId);
        break;
      case 'downloads':
        window.webContents.send('get-downloads', webContentsId);
        break;
      case 'history':
        window.webContents.send('get-history', webContentsId);
        break;
      case 'extensions':
        break;
      default:
        break;
    }
  });
});

ipcMain.on('set-current-search-engine-provider', (event: Electron.IpcMainEvent, val) => {
  store.dispatch('setCurrentSearchEngineProvider', val);
  Object.keys(windows).forEach((key) => {
    const id = parseInt(key, 10);
    const window = windows[id];
    window.webContents.send('get-search-engine-provider', event.sender.id);
  });
});
ipcMain.on('set-homepage', (event: Electron.IpcMainEvent, val) => {
  store.dispatch('setHomepage', val);
  Object.keys(windows).forEach((key) => {
    const id = parseInt(key, 10);
    const window = windows[id];
    window.webContents.send('get-homepage', event.sender.id);
  });
});
ipcMain.on('set-pdf-viewer', (event: Electron.IpcMainEvent, val) => {
  store.dispatch('setPDFViewer', val);
  Object.keys(windows).forEach((key) => {
    const id = parseInt(key, 10);
    const window = windows[id];
    window.webContents.send('get-pdf-viewer', event.sender.id);
  });
});
ipcMain.on('set-tab-config', (event: Electron.IpcMainEvent, val) => {
  store.dispatch('setTabConfig', val);
  Object.keys(windows).forEach((key) => {
    const id = parseInt(key, 10);
    const window = windows[id];
    window.webContents.send('get-tab-config', event.sender.id);
  });
});
ipcMain.on('set-lang', (eventOne: Electron.IpcMainEvent, val) => {
  const webContentsId: number = eventOne.sender.id;
  Object.keys(windows).forEach((key) => {
    const id = parseInt(key, 10);
    const window = windows[id];
    window.webContents.send('request-permission', {
      webContentsId,
      permission: 'setLanguage',
      label: val.label,
    });
  });
  ipcMain.once(`response-permission-${eventOne.sender.id}`, (eventTwo, data) => {
    if (data.accept) {
      store.dispatch('setLang', val);
      promisify(writeFile, langPath, JSON.stringify(val.lang))
        .then(() => {
          setLanguage = true;
          menu.setLocale(val.lang);
          app.quit();
        });
    }
  });
});
ipcMain.on('set-proxy-config', (event: Electron.IpcMainEvent, val) => {
  session.registerProxy(val);
  store.dispatch('setProxyConfig', val);
  Object.keys(windows).forEach((key) => {
    const id = parseInt(key, 10);
    const window = windows[id];
    window.webContents.send('get-proxy-config', event.sender.id);
  });
});
ipcMain.on('set-auth', (event: Electron.IpcMainEvent, val) => {
  store.dispatch('setAuth', val);
  Object.keys(windows).forEach((key) => {
    const id = parseInt(key, 10);
    const window = windows[id];
    window.webContents.send('get-auth', event.sender.id);
  });
});
ipcMain.on('set-downloads', (event: Electron.IpcMainEvent, val) => {
  store.dispatch('setDownloads', val);
  Object.keys(windows).forEach((key) => {
    const id = parseInt(key, 10);
    const window = windows[id];
    window.webContents.send('apply-downloads', val);
    window.webContents.send('get-downloads', event.sender.id);
  });
});
ipcMain.on('set-history', (event: Electron.IpcMainEvent, val) => {
  store.dispatch('setHistory', val);
  Object.keys(windows).forEach((key) => {
    const id = parseInt(key, 10);
    const window = windows[id];
    window.webContents.send('get-history', event.sender.id);
  });
});
// Open a URL in a new tab — sent from the preference/about BrowserView (History page)
ipcMain.on('open-url-in-new-tab', (event: Electron.IpcMainEvent, url: string) => {
  if (!url) return;
  Object.keys(windows).forEach((key) => {
    const id = parseInt(key, 10);
    const window = windows[id];
    if (window && window.getTitle() !== 'command-palette') {
      window.webContents.send('new-tab', { url, follow: true });
      window.focus();
    }
  });
});

// listen to new-lulumi-window event
ipcMain.on('new-lulumi-window', (event: Electron.IpcMainEvent, data) => {
  if (data.url) {
    event.returnValue = createWindow({
      width: 800,
      height: 500,
    }, (eventName) => {
      ipcMain.once(eventName, (event2: Electron.IpcMainEvent) => {
        event2.sender.send(eventName.substr(4), { url: data.url, follow: data.follow });
      });
    });
  }
});

// load the lang file
ipcMain.on('request-lang', (event: Electron.IpcMainEvent) => {
  let lang = '';
  try {
    lang = readFileSync(langPath, 'utf8');
  } catch (langError) {
    console.error(`(lulumi-browser) ${langError}`);
    lang = app.getLocaleCountryCode();
    if (lang === 'TW') {
      lang = '"zh-TW"';
    } else if (lang === 'CN') {
      lang = '"zh-CN"';
    } else {
      lang = '"en-US"';
    }
  }
  event.returnValue = JSON.parse(lang);
});

// load extension objects for each BrowserWindow instance
ipcMain.on('register-local-commands', (event: Electron.IpcMainEvent) => {
  Object.keys(windows).forEach((key) => {
    const id = parseInt(key, 10);
    const window = windows[id];
    if (window.getTitle() !== 'command-palette') {
      Object.keys(lulumiExtension.getManifestMap()).forEach((manifest) => {
        lulumiExtension.registerLocalCommands(window, lulumiExtension.getManifestMap()[manifest]);
      });
    }
  });
  event.sender.send('registered-local-commands', lulumiExtension.getManifestMap());
});

ipcMain.on('fetch-search-suggestions',
  (event: Electron.IpcMainEvent, url: string, timestamp: number) => {
    fetchText(url, (result) => {
      event.sender.send(`fetch-search-suggestions-${timestamp}`, result);
    });
  });

ipcMain.on('popup', (event: Electron.IpcMainEvent, popupObject: any) => {
  const popupMenu = new Menu();
  popupObject.menuItems.forEach((popupMenuItem) => {
    if (popupMenuItem.icon) {
      if (popupMenuItem.type === 'base64') {
        popupMenuItem.icon = nativeImage.createFromDataURL(popupMenuItem.icon).resize({
          width: 14,
          height: 14,
        });
        delete popupMenuItem.type;
      }
    }
    if (popupMenuItem.click) {
      if (popupMenuItem.click === 'open-history') {
        popupMenuItem.click = () => (event.sender.send('open-history'));
      } else if (popupMenuItem.click === 'go-to-index') {
        const { index } = popupMenuItem;
        delete popupMenuItem.index;
        popupMenuItem.click = () => {
          event.sender.send('go-to-index', index);
        };
      }
    }
    popupMenu.append(new MenuItem(popupMenuItem));
  });
  popupMenu.popup({
    window: BrowserWindow.fromId(popupObject.windowId),
    x: popupObject.x,
    y: popupObject.y,
  });
});

// reload each BrowserView when we plug in our cable
globalObject.isOnline = true;
ipcMain.on('online-status-changed', (event, status: boolean) => {
  if (status) {
    if (!globalObject.isOnline) {
      Object.keys(windows).forEach((key) => {
        const id = parseInt(key, 10);
        const window = windows[id];
        window.webContents.send('reload');
      });
      globalObject.isOnline = true;
    }
  } else {
    globalObject.isOnline = false;
  }
});
