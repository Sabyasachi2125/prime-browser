/* eslint-disable */

import { contextBridge, ipcRenderer } from 'electron';

const api = {
  askAI: (query: string) => ipcRenderer.invoke('ask-ai', query),
};

const electronProcess = process as NodeJS.Process & { contextIsolated?: boolean };

if (electronProcess.contextIsolated) {
  contextBridge.exposeInMainWorld('api', api);
} else {
  (globalThis as typeof globalThis & { api: typeof api }).api = api;
}
