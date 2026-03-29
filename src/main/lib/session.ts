/* eslint-disable max-len */
/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-unused-vars */

import { BrowserView, BrowserWindow, ipcMain, session } from 'electron';
import * as forge from 'node-forge';
import { customAlphabet } from 'nanoid';

import mainStore from '../../shared/store/mainStore';

ipcMain.setMaxListeners(0);

const generateRequestId = customAlphabet('1234567890', 32);
const pendingDownloadPaths: Array<{
  savePath: string;
  url: string;
  webContentsId: number;
}> = [];

const downloadMetricsById: Map<string, {
  lastReceivedBytes: number;
  lastTimestampMs: number;
  speed: number;
}> = new Map();

const register = (eventName: any, sess: Electron.Session, eventLispCaseName: string, id: number, digest: string, filter): void => {
  if ((eventName === 'onBeforeRequest') || (eventName === 'onBeforeSendHeaders')) {
    sess.webRequest[eventName](filter, (details, callback) => {
      const requestId = generateRequestId();
      if (details.resourceType === 'mainFrame') {
        details.type = 'main_frame';
      } else if (details.resourceType === 'subFrame') {
        details.type = 'sub_frame';
      } else if (details.resourceType === 'xhr') {
        details.type = 'xmlhttprequest';
      } else if (details.resourceType === 'cspReport') {
        details.type = 'csp_report';
      } else {
        details.type = details.resourceType;
      }
      if (details.requestHeaders) {
        const requestHeaders: any = [];
        Object.keys(details.requestHeaders).forEach((k) => {
          requestHeaders.push({ name: k, value: details.requestHeaders[k] });
        });
        details.requestHeaders = requestHeaders;
      }
      ipcMain.once(`lulumi-web-request-${eventLispCaseName}-response-${digest}-${requestId}`, (event: Electron.Event, request) => {
        if (request) {
          if (request.cancel) {
            callback({ cancel: true });
          } else if (request.requestHeaders) {
            const requestHeaders: any = {};
            request.requestHeaders.forEach((requestHeader) => {
              requestHeaders[requestHeader.name] = requestHeader.value;
            });
            callback({ requestHeaders, cancel: false });
          } else if (request.redirectUrl) {
            callback({ redirectURL: request.redirectUrl, cancel: false });
          }
        } else {
          callback({ cancel: false });
        }
      });
      const window = BrowserWindow.getAllWindows()[0];
      window.webContents.send('lulumi-web-request-intercepted', {
        eventLispCaseName,
        digest,
        requestId,
        details,
        webContentsId: id,
      });
    });
  } else if (eventName === 'onHeadersReceived') {
    sess.webRequest[eventName](filter, (details, callback) => {
      const requestId = generateRequestId();
      if (details.resourceType === 'mainFrame') {
        details.type = 'main_frame';
      } else if (details.resourceType === 'subFrame') {
        details.type = 'sub_frame';
      } else if (details.resourceType === 'xhr') {
        details.type = 'xmlhttprequest';
      } else if (details.resourceType === 'cspReport') {
        details.type = 'csp_report';
      } else {
        details.type = details.resourceType;
      }
      if (details.responseHeaders) {
        const responseHeaders: any[] = [];
        Object.keys(details.responseHeaders).forEach((k) => {
          responseHeaders.push({ name: k, value: details.responseHeaders[k][0] });
        });
        details.responseHeaders = responseHeaders;
      }

      ipcMain.once(`lulumi-web-request-${eventLispCaseName}-response-${digest}-${requestId}`, (event: Electron.Event, response) => {
        if (response) {
          if (response.cancel) {
            callback({ cancel: true });
          } else if (response.responseHeaders) {
            const responseHeaders: any = {};
            response.responseHeaders.forEach((responseHeader) => {
              responseHeaders[responseHeader.name] = responseHeader.value;
            });
            if (response.statusLine) {
              callback({ responseHeaders, statusLine: response.statusLine, cancel: false });
            } else {
              callback({ responseHeaders, statusLine: details.statusLine, cancel: false });
            }
          }
        } else {
          callback({ cancel: false });
        }
      });
      const window = BrowserWindow.getAllWindows()[0];
      window.webContents.send('lulumi-web-request-intercepted', {
        eventLispCaseName,
        digest,
        requestId,
        details,
        webContentsId: id,
      });
    });
  } else {
    sess.webRequest[eventName](filter, (details) => {
      if (details.resourceType === 'mainFrame') {
        details.type = 'main_frame';
      } else if (details.resourceType === 'subFrame') {
        details.type = 'sub_frame';
      } else if (details.resourceType === 'xhr') {
        details.type = 'xmlhttprequest';
      } else if (details.resourceType === 'cspReport') {
        details.type = 'csp_report';
      } else {
        details.type = details.resourceType;
      }
      if (details.requestHeaders) {
        const requestHeaders: any = [];
        Object.keys(details.requestHeaders).forEach((k) => {
          requestHeaders.push({ name: k, value: details.requestHeaders[k] });
        });
        details.requestHeaders = requestHeaders;
      }
      if (details.responseHeaders) {
        const responseHeaders: any = [];
        Object.keys(details.responseHeaders).forEach((k) => {
          responseHeaders.push({ name: k, value: details.responseHeaders[k][0] });
        });
        details.responseHeaders = responseHeaders;
      }

      const window = BrowserWindow.getAllWindows()[0];
      window.webContents.send('lulumi-web-request-intercepted', {
        requestId: 0,
        eventLispCaseName,
        digest,
        details,
        webContentsId: id,
      });
    });
  }
};

const unregister = (eventName: string, sess: Electron.Session): void => {
  sess.webRequest[eventName]({}, null);
};

const registerWebRequestListeners = (): void => {
  const sess = session.fromPartition('persist:lulumi') as Electron.Session;
  ipcMain.on('lulumi-web-request-add-listener-on-before-request', (event: Electron.IpcMainEvent, extensionName, eventLispCaseName: string, digest: string, filter): void => {
    register('onBeforeRequest', sess, eventLispCaseName, event.sender.id, digest, filter);
  });
  ipcMain.on('lulumi-web-request-remove-listener-on-before-request', (event, extensionName, eventLispCaseName): void => {
    unregister('onBeforeRequest', sess);
  });
  ipcMain.on('lulumi-web-request-add-listener-on-before-send-headers', (event: Electron.IpcMainEvent, extensionName, eventLispCaseName: string, digest: string, filter): void => {
    register('onBeforeSendHeaders', sess, eventLispCaseName, event.sender.id, digest, filter);
  });
  ipcMain.on('lulumi-web-request-remove-listener-on-before-send-headers', (event, extensionName, eventLispCaseName): void => {
    unregister('onBeforeSendHeaders', sess);
  });
  ipcMain.on('lulumi-web-request-add-listener-on-send-headers', (event: Electron.IpcMainEvent, extensionName, eventLispCaseName: string, digest: string, filter): void => {
    register('onSendHeaders', sess, eventLispCaseName, event.sender.id, digest, filter);
  });
  ipcMain.on('lulumi-web-request-remove-listener-on-send-headers', (event, extensionName, eventLispCaseName): void => {
    unregister('onSendHeaders', sess);
  });
  ipcMain.on('lulumi-web-request-add-listener-on-headers-received', (event: Electron.IpcMainEvent, extensionName, eventLispCaseName: string, digest: string, filter): void => {
    register('onHeadersReceived', sess, eventLispCaseName, event.sender.id, digest, filter);
  });
  ipcMain.on('lulumi-web-request-remove-listener-on-headers-received', (event, extensionName, eventLispCaseName): void => {
    unregister('onHeadersReceived', sess);
  });
  ipcMain.on('lulumi-web-request-add-listener-on-response-started', (event: Electron.IpcMainEvent, extensionName, eventLispCaseName: string, digest: string, filter): void => {
    register('onResponseStarted', sess, eventLispCaseName, event.sender.id, digest, filter);
  });
  ipcMain.on('lulumi-web-request-remove-listener-on-response-started', (event, extensionName, eventLispCaseName): void => {
    unregister('onResponseStarted', sess);
  });
  ipcMain.on('lulumi-web-request-add-listener-on-before-redirect', (event: Electron.IpcMainEvent, extensionName, eventLispCaseName: string, digest: string, filter): void => {
    register('onBeforeRedirect', sess, eventLispCaseName, event.sender.id, digest, filter);
  });
  ipcMain.on('lulumi-web-request-remove-listener-on-before-redirect', (event, extensionName, eventLispCaseName): void => {
    unregister('onBeforeRedirect', sess);
  });
  ipcMain.on('lulumi-web-request-add-listener-on-completed', (event: Electron.IpcMainEvent, extensionName, eventLispCaseName: string, digest: string, filter): void => {
    register('onCompleted', sess, eventLispCaseName, event.sender.id, digest, filter);
  });
  ipcMain.on('lulumi-web-request-remove-listener-on-completed', (event, extensionName, eventLispCaseName): void => {
    unregister('onCompleted', sess);
  });
  ipcMain.on('lulumi-web-request-add-listener-on-error-occurred', (event: Electron.IpcMainEvent, extensionName, eventLispCaseName: string, digest: string, filter): void => {
    register('onErrorOccurred', sess, eventLispCaseName, event.sender.id, digest, filter);
  });
  ipcMain.on('lulumi-web-request-remove-listener-on-error-occurred', (event, extensionName, eventLispCaseName): void => {
    unregister('onErrorOccurred', sess);
  });
};

const registerScheme = (scheme: string): void => {
  let sess: Electron.Session | null = null;
  if (scheme === 'lulumi') {
    sess = session.fromPartition('persist:lulumi');
  }
  if (sess) {
    if (process.env.NODE_ENV !== 'development') {
      sess.protocol.registerFileProtocol(scheme, (request, callback) => {
        const url: string = request.url.substr(`${scheme}://`.length);
        const [type, ...params] = url.split('/');
        if (params[0] === '#') {
          callback(`${__dirname}/${type}.html`);
        } else {
          callback(`${__dirname}/${params.join('/')}`);
        }
      });
    }
  }
};

const registerCertificateVerifyProc: () => void = () => {
  const sess = session.fromPartition('persist:lulumi') as Electron.Session;
  const store = mainStore.getStore();
  sess.setCertificateVerifyProc((request, callback) => {
    try {
      const cert = forge.pki.certificateFromPem(request.certificate.data);
      store.dispatch('updateCertificate', {
        hostname: cert.subject.getField('CN').value,
        certificate: request.certificate,
        verificationResult: request.verificationResult,
        errorCode: request.errorCode,
      });
      if (cert.getExtension('subjectAltName').altNames.length > 0) {
        cert.getExtension('subjectAltName').altNames.forEach((altName) => {
          store.dispatch('updateCertificate', {
            hostname: altName.value,
            certificate: request.certificate,
            verificationResult: request.verificationResult,
            errorCode: request.errorCode,
          });
        });
      }
    } catch (err) {
      if (err.toString() === 'Error: Cannot read public key. OID is not RSA.') {
        console.error('(lulumi-browser) `node-forge` doesn\'t support ECC for now, so we fallback to the old method.');
        store.dispatch('updateCertificate', {
          hostname: request.hostname,
          certificate: request.certificate,
          verificationResult: request.verificationResult,
          errorCode: request.errorCode,
        });
      } else {
        console.error(`(node-forge) ${err}`);
      }
    }

    if (request.verificationResult !== 'net::OK') {
      callback(-3);
    } else {
      callback(0);
    }
  });
};

const normalizeDownloadStatus = (state: string): 'downloading' | 'completed' | 'interrupted' => {
  switch (state) {
    case 'completed':
      return 'completed';
    case 'interrupted':
    case 'cancelled':
      return 'interrupted';
    default:
      return 'downloading';
  }
};

const normalizeDownloadDataState = (state: string): string => {
  switch (state) {
    case 'completed':
      return 'completed';
    case 'cancelled':
      return 'cancelled';
    case 'interrupted':
      return 'interrupted';
    default:
      return 'progressing';
  }
};

const getDownloadOwnerWebContentsId = (webContents: Electron.WebContents): number => {
  const { hostWebContents } = (webContents as Electron.WebContents & {
    hostWebContents?: Electron.WebContents;
  });

  return hostWebContents ? hostWebContents.id : webContents.id;
};

const createDownloadPayload = (
  item: Electron.DownloadItem,
  webContents: Electron.WebContents,
  state: string,
): Record<string, number | string | boolean> => {
  const downloadItemWithSpeed = item as Electron.DownloadItem & {
    getCurrentBytesPerSecond?: () => number;
  };
  const id = String(item.getStartTime());
  const currentTimestampMs = Date.now();
  const receivedBytes = item.getReceivedBytes();
  const totalBytes = item.getTotalBytes();
  const electronSpeed = downloadItemWithSpeed.getCurrentBytesPerSecond
    ? downloadItemWithSpeed.getCurrentBytesPerSecond()
    : 0;
  const previousMetrics = downloadMetricsById.get(id);
  let computedSpeed = Number.isFinite(electronSpeed) && electronSpeed > 0 ? electronSpeed : 0;

  if (previousMetrics) {
    const elapsedMs = currentTimestampMs - previousMetrics.lastTimestampMs;
    const deltaBytes = receivedBytes - previousMetrics.lastReceivedBytes;
    if (computedSpeed <= 0 && elapsedMs > 0 && deltaBytes >= 0) {
      computedSpeed = Math.round((deltaBytes * 1000) / elapsedMs);
    }
  }

  downloadMetricsById.set(id, {
    lastReceivedBytes: receivedBytes,
    lastTimestampMs: currentTimestampMs,
    speed: computedSpeed,
  });

  // Compute progress (0–100). Only meaningful when totalBytes > 0.
  const progress = totalBytes > 0
    ? Math.min(100, Math.max(0, Math.round((receivedBytes / totalBytes) * 100)))
    : 0;
  const normalizedState = normalizeDownloadStatus(state);

  return {
    id,
    webContentsId: webContents.id,
    hostWebContentsId: getDownloadOwnerWebContentsId(webContents),
    startTime: item.getStartTime(),
    totalBytes,
    getReceivedBytes: receivedBytes,
    receivedBytes,
    progress,
    savePath: item.getSavePath() || '',
    filePath: item.getSavePath() || '',
    isPaused: item.isPaused(),
    canResume: item.canResume(),
    name: item.getFilename(),
    fileName: item.getFilename(),
    url: item.getURL(),
    speed: computedSpeed,
    status: normalizedState,
    dataState: normalizeDownloadDataState(state),
    timestamp: item.getStartTime(),
  };
};

const getDownloadTargetWebContentsList = (
  webContents: Electron.WebContents,
): Electron.WebContents[] => {
  const targets: Electron.WebContents[] = [];
  const seen = new Set<number>();
  const pushTarget = (target: Electron.WebContents | null | undefined): void => {
    if (!target || target.isDestroyed() || seen.has(target.id)) {
      return;
    }

    seen.add(target.id);
    targets.push(target);
  };

  const browserView = BrowserView.fromWebContents(webContents);
  if (browserView) {
    const ownerWindow = BrowserWindow.fromBrowserView(browserView);
    if (ownerWindow) {
      pushTarget(ownerWindow.webContents);

      const browserViews = ownerWindow.getBrowserViews
        ? ownerWindow.getBrowserViews()
        : [];

      browserViews.forEach((view) => {
        pushTarget(view.webContents);
      });
    }
  }

  const { hostWebContents } = (webContents as Electron.WebContents & {
    hostWebContents?: Electron.WebContents;
  });

  pushTarget(hostWebContents);
  pushTarget(webContents);

  return targets;
};

const sendDownloadEvent = (
  targets: Electron.WebContents[],
  channel: string,
  payload: Record<string, number | string | boolean>,
): void => {
  if (targets.length === 0) {
    return;
  }

  targets.forEach((target) => {
    target.send(channel, payload);
  });
};

const consumePendingDownloadPath = (
  item: Electron.DownloadItem,
  webContents: Electron.WebContents,
): string | null => {
  const index = pendingDownloadPaths.findIndex(entry => (
    entry.webContentsId === webContents.id &&
    entry.url === item.getURL()
  ));

  if (index === -1) {
    return null;
  }

  const [{ savePath }] = pendingDownloadPaths.splice(index, 1);
  return savePath;
};

ipcMain.on(
  'register-download-path',
  (_event: Electron.Event, data: { savePath: string; url: string; webContentsId: number }) => {
    if (!data || !data.savePath || !data.url || typeof data.webContentsId !== 'number') {
      return;
    }

    pendingDownloadPaths.push({
      savePath: data.savePath,
      url: data.url,
      webContentsId: data.webContentsId,
    });
  }
);

const onWillDownload = (windows: any, path: string): void => {
  const sessions = [
    session.defaultSession,
    session.fromPartition('persist:lulumi'),
  ].filter((sess, index, list): sess is Electron.Session => (
    Boolean(sess) && list.indexOf(sess) === index
  ));

  sessions.forEach(sess => sess.on('will-download', (event, item, webContents) => {
    const itemURL = item.getURL();
    if (item.getMimeType() === 'application/pdf' &&
      itemURL.indexOf('blob:') !== 0 &&
      !itemURL.includes('#pdfjs.action=download') &&
      !itemURL.includes('skip=true')) {
      event.preventDefault();
      const qs = require('querystring');
      const param = qs.stringify({ file: itemURL });
      const pdfViewerURL = `file://${path}/web/viewer.html`;
      Object.keys(windows).forEach((key) => {
        const id = parseInt(key, 10);
        const window = windows[id];
        window.webContents.send('open-pdf', {
          url: `${pdfViewerURL}?${param}`,
          webContentsId: webContents.id,
        });
      });
    } else {
      const pendingSavePath = consumePendingDownloadPath(item, webContents);
      if (pendingSavePath) {
        item.setSavePath(pendingSavePath);
      }

      const targetWebContentsList = getDownloadTargetWebContentsList(webContents);
      const startTime = item.getStartTime();
      const pauseDownload = (_event2: Electron.Event, remoteStartTime: number) => {
        if (startTime === remoteStartTime) {
          item.pause();
        }
      };
      const resumeDownload = (_event2: Electron.Event, remoteStartTime: number) => {
        if (startTime === remoteStartTime) {
          item.resume();
        }
      };
      const cancelDownload = (_event2: Electron.Event, remoteStartTime: number) => {
        if (startTime === remoteStartTime) {
          item.cancel();
        }
      };
      const startPayload = createDownloadPayload(item, webContents, 'progressing');
      sendDownloadEvent(targetWebContentsList, 'will-download-any-file', startPayload);
      sendDownloadEvent(targetWebContentsList, 'download-started', startPayload);

      ipcMain.on('pause-downloads-progress', pauseDownload);
      ipcMain.on('resume-downloads-progress', resumeDownload);
      ipcMain.on('cancel-downloads-progress', cancelDownload);

      item.on('updated', (_event2: Electron.Event, state: string) => {
        const payload = createDownloadPayload(item, webContents, state);
        sendDownloadEvent(targetWebContentsList, 'update-downloads-progress', payload);
        sendDownloadEvent(targetWebContentsList, 'download-progress', payload);
      });

      item.on('done', (_event2: Electron.Event, state: string) => {
        ipcMain.removeListener('pause-downloads-progress', pauseDownload);
        ipcMain.removeListener('resume-downloads-progress', resumeDownload);
        ipcMain.removeListener('cancel-downloads-progress', cancelDownload);
        const payload = createDownloadPayload(item, webContents, state);
        downloadMetricsById.delete(String(item.getStartTime()));
        sendDownloadEvent(targetWebContentsList, 'complete-downloads-progress', payload);
        sendDownloadEvent(targetWebContentsList, 'download-completed', payload);
      });
    }
  }));
};

const setPermissionRequestHandler = (windows: any): void => {
  const sess = session.fromPartition('persist:lulumi') as Electron.Session;
  sess.setPermissionRequestHandler((webContents, permission, callback) => {
    Object.keys(windows).forEach((key) => {
      const id = parseInt(key, 10);
      const window = windows[id];
      window.webContents.send('request-permission', {
        permission,
        webContentsId: webContents.id,
      });
    });
    ipcMain.once(`response-permission-${webContents.id}`, (event: Electron.Event, data) => {
      if (data.accept) {
        callback(true);
      } else {
        callback(false);
      }
    });
  });
};

const registerProxy = (proxyConfig: Electron.Config): void => {
  const sess = session.fromPartition('persist:lulumi') as Electron.Session;
  sess.setProxy(proxyConfig).then();
};

export default {
  registerWebRequestListeners,
  registerScheme,
  registerCertificateVerifyProc,
  onWillDownload,
  setPermissionRequestHandler,
  registerProxy,
};
