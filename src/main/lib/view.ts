/* eslint-disable @typescript-eslint/no-unused-vars */

import { app, BrowserView } from 'electron';
import { Store } from 'vuex';
import * as fs from 'fs';
import * as path from 'path';
import urlUtil from '../../renderer/lib/url-util';
import constants from '../constants';
import fetch from './fetch';

const { default: mainStore } = require('../../shared/store/mainStore');
const store: Store<any> = mainStore.getStore();

export default class View {
  public browserView: BrowserView;
  public tabId: number;
  public tabIndex: number;

  private window: Electron.BrowserWindow;
  private preloadCachePath: string;

  public constructor(window: Electron.BrowserWindow, tabIndex: number, tabId: number, url: string) {
    this.preloadCachePath = '';
    const bundledPreloadPath = path.resolve(constants.lulumiRootPath, 'dist', 'webview-preload.js');
    if (process.env.NODE_ENV === 'development') {
      this.fetchPreload(`${constants.lulumiPreloadPath}/webview-preload.js`);
    }
    this.browserView = new BrowserView({
      webPreferences: {
        preload: fs.existsSync(bundledPreloadPath)
          ? bundledPreloadPath
          : this.preloadCachePath,
        enableRemoteModule: true,
        nodeIntegration: false,
        nodeIntegrationInSubFrames: true,
        worldSafeExecuteJavaScript: false,
        contextIsolation: true,
        sandbox: false,
        partition: 'persist:lulumi',
        plugins: true,
        nativeWindowOpen: false,
        webSecurity: true,
        javascript: true,
      },
    });

    this.tabId = tabId;
    this.tabIndex = tabIndex;

    store.dispatch('setBrowserViewId', {
      browserViewId: this.browserView.id,
      tabId: this.tabId,
    });

    this.window = window;

    this.webContents.addListener('did-start-loading', (event) => {
      this.sendToWindow('browser-view-did-start-loading', {
        event: {},
        eventName: 'onDidStartLoading',
        tabId: this.tabId,
        tabIndex: this.tabIndex,
      });
    });
    // eslint-disable-next-line no-shadow
    this.webContents.addListener('did-navigate', (event, url) => {
      this.sendToWindow('browser-view-did-navigate', {
        event: { url },
        eventName: 'onDidNavigate',
        tabId: this.tabId,
        tabIndex: this.tabIndex,
      });
    });
    this.webContents.addListener('page-title-updated', (event, title) => {
      this.sendToWindow('browser-view-page-title-updated', {
        event: { title },
        eventName: 'onPageTitleUpdated',
        tabId: this.tabId,
        tabIndex: this.tabIndex,
      });
    });
    this.webContents.addListener('dom-ready', (event) => {
      this.sendToWindow('browser-view-dom-ready', {
        event: {},
        eventName: 'onDomReady',
        tabId: this.tabId,
        tabIndex: this.tabIndex,
      });
    });
    this.webContents.addListener('did-frame-finish-load', (event, isMainFrame) => {
      this.sendToWindow('browser-view-did-frame-finish-load', {
        event: { isMainFrame },
        eventName: 'onDidFrameFinishLoad',
        tabId: this.tabId,
        tabIndex: this.tabIndex,
      });
    });
    this.webContents.addListener('page-favicon-updated', (event, favicons) => {
      this.sendToWindow('browser-view-page-favicon-updated', {
        event: { favicons },
        eventName: 'onPageFaviconUpdated',
        tabId: this.tabId,
        tabIndex: this.tabIndex,
      });
    });
    this.webContents.addListener('did-stop-loading', (event) => {
      this.sendToWindow('browser-view-did-stop-loading', {
        event: {},
        eventName: 'onDidStopLoading',
        tabId: this.tabId,
        tabIndex: this.tabIndex,
      });
    });
    // eslint-disable-next-line max-len
    this.webContents.addListener('did-fail-load', (event, errorCode, _, validatedURL, isMainFrame) => {
      this.sendToWindow('browser-view-did-fail-load', {
        event: { errorCode, validatedURL, isMainFrame, url: this.window.webContents.getURL() },
        eventName: 'onDidFailLoad',
        tabId: this.tabId,
        tabIndex: this.tabIndex,
      });
    });
    this.webContents.addListener('ipc-message', (event, channel) => {
      this.sendToWindow('browser-view-ipc-message', {
        event: { channel },
        eventName: 'onIpcMessage',
        tabId: this.tabId,
        tabIndex: this.tabIndex,
      });
    });
    // eslint-disable-next-line no-shadow
    this.webContents.addListener('update-target-url', (event, url) => {
      this.sendToWindow('browser-view-update-target-url', {
        event: { url },
        eventName: 'onUpdateTargetUrl',
        tabId: this.tabId,
        tabIndex: this.tabIndex,
      });
    });
    this.webContents.addListener('media-started-playing', (event) => {
      this.sendToWindow('browser-view-media-started-playing', {
        event: {},
        eventName: 'onMediaStartedPlaying',
        tabId: this.tabId,
        tabIndex: this.tabIndex,
      });
    });
    this.webContents.addListener('media-paused', (event) => {
      this.sendToWindow('browser-view-media-paused', {
        event: {},
        eventName: 'onMediaPaused',
        tabId: this.tabId,
        tabIndex: this.tabIndex,
      });
    });
    this.webContents.addListener('enter-html-full-screen', (event) => {
      this.sendToWindow('browser-view-enter-html-full-screen', {
        event: {},
        eventName: 'onEnterHtmlFullScreen',
        tabId: this.tabId,
        tabIndex: this.tabIndex,
      });
    });
    this.webContents.addListener('leave-html-full-screen', (event) => {
      this.sendToWindow('browser-view-leave-html-full-screen', {
        event: {},
        eventName: 'onLeaveHtmlFullScreen',
        tabId: this.tabId,
        tabIndex: this.tabIndex,
      });
    });
    this.webContents.addListener('new-window', (event) => {
      this.sendToWindow('browser-view-new-window', {
        event: {},
        eventName: 'onNewWindow',
        tabId: this.tabId,
        tabIndex: this.tabIndex,
      });
    });
    this.webContents.on('before-input-event', (event, input) => {
      const key = typeof input.key === 'string' ? input.key.toLowerCase() : '';
      const isSummarizeShortcut = input.type === 'keyDown' &&
        key === 's' &&
        input.shift &&
        (input.control || input.meta);

      if (isSummarizeShortcut) {
        event.preventDefault();
        this.sendToWindow('summarize-page');
      }
    });
    this.webContents.addListener('context-menu', (event, params) => {
      this.sendToWindow('browser-view-context-menu', {
        event: { params },
        eventName: 'onContextMenu',
        tabId: this.tabId,
        tabIndex: this.tabIndex,
      });
    });
    // eslint-disable-next-line no-shadow
    this.webContents.addListener('will-navigate', (event, url) => {
      this.sendToWindow('browser-view-will-navigate', {
        event: { url },
        eventName: 'onWillNavigate',
        tabId: this.tabId,
        tabIndex: this.tabIndex,
      });
    });

    this.browserView.setAutoResize({
      width: true,
      height: true,
      horizontal: false,
      vertical: false,
    });
    this.browserView.setBackgroundColor('#00000000');
    this.fitWindow();
    this.safeLoadURL(urlUtil.getUrlFromInput(url));
  }

  public get id(): number {
    return this.browserView.id;
  }

  public get webContents(): Electron.WebContents {
    return this.browserView.webContents;
  }

  public async fitWindow(): Promise<void> {
    if (
      this.window.isDestroyed() ||
      this.webContents.isDestroyed() ||
      this.browserView.isDestroyed()
    ) {
      return;
    }

    const { width } = this.window.getContentBounds();
    let height = 0;
    try {
      height = await this.window.webContents.executeJavaScript(`
        document.getElementById("app").offsetHeight;
      `);
    } catch (error) {
      if (!this.isIgnorableWebContentsError(error)) {
        console.error('Failed to resize browser view.', error);
      }
      return;
    }

    if (this.browserView.isDestroyed()) {
      return;
    }

    this.browserView.setBounds({
      x: 0,
      y: 72,
      width,
      height: height - /* nav */ 72 - /* status-bar */ 22,
    });
  }

  public destroy(): boolean {
    this.browserView.destroy();
    return this.browserView.isDestroyed();
  }

  private fetchPreload(preloadPath: string): void {
    this.preloadCachePath = path.join(app.getPath('userData'), 'webview-preload.js');
    fetch(preloadPath, (result) => {
      if (result.ok) {
        if (!fs.existsSync(path.dirname(this.preloadCachePath))) {
          fs.mkdirSync(path.dirname(this.preloadCachePath));
        }
        fs.writeFileSync(this.preloadCachePath, result.body);
      }
    });
  }

  private sendToWindow(channel: string, payload?: unknown): void {
    if (this.window.isDestroyed() || this.window.webContents.isDestroyed()) {
      return;
    }

    try {
      if (typeof payload === 'undefined') {
        this.window.webContents.send(channel);
      } else {
        this.window.webContents.send(channel, payload);
      }
    } catch (error) {
      if (!this.isIgnorableWebContentsError(error)) {
        console.error(`Failed to send "${channel}" to window.`, error);
      }
    }
  }

  private safeLoadURL(targetURL: string): void {
    try {
      const maybePromise = this.webContents.loadURL(targetURL);
      if (this.isPromiseLike(maybePromise)) {
        maybePromise.catch((error) => {
          if (!this.isIgnorableWebContentsError(error)) {
            console.error(`Failed to load URL: ${targetURL}`, error);
          }
        });
      }
    } catch (error) {
      if (!this.isIgnorableWebContentsError(error)) {
        console.error(`Failed to load URL: ${targetURL}`, error);
      }
    }
  }

  private isPromiseLike(value: unknown): value is Promise<void> {
    return typeof value === 'object' &&
      value !== null &&
      typeof (value as Promise<void>).catch === 'function';
  }

  private isIgnorableWebContentsError(error: unknown): boolean {
    return error instanceof Error &&
      (
        error.message.includes('ERR_FAILED') ||
        error.message.includes('ERR_ABORTED') ||
        error.message.includes('Object has been destroyed')
      );
  }
}
