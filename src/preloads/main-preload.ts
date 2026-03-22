/* eslint-disable */

import { contextBridge, ipcRenderer } from 'electron';

const api = {
  askAI: (query: string) => ipcRenderer.invoke('ask-ai', query),
  setTheme: (theme: string) => ipcRenderer.send('set-theme', theme),
  onThemeUpdated: (callback: any) => ipcRenderer.on('theme-updated', (event, theme) => callback(theme)),
};

const electronProcess = process as NodeJS.Process & { contextIsolated?: boolean };

if (electronProcess.contextIsolated) {
  contextBridge.exposeInMainWorld('api', api);
} else {
  (globalThis as typeof globalThis & { api: typeof api }).api = api;
}
