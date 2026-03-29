<template lang="pug">
.downloads-page
  .downloads-header
    .downloads-title-row
      h1.downloads-title Downloads
    .downloads-actions
      button.clear-btn(
        @click="clearAll"
        :disabled="downloads.length === 0"
      ) Clear All
  .downloads-content
    .downloads-empty(v-if="downloads.length === 0")
      p No downloads yet
    .downloads-list(v-else)
      .download-item(v-for="item in downloads" :key="item.id")
        .download-card
          .download-card__header
            .download-card__header-copy
              h2.download-card__title
                | {{ item.status === 'downloading'
                |   ? 'Downloading your file...'
                |   : 'Download details' }}
              p.download-card__subtitle {{ formatTime(item.timestamp) }}
            span.download-status-pill(:class="`is-${item.status}`") {{ item.status }}
          .download-card__body
            .download-card__row
              .download-card__file
                .download-card__icon FILE
                .download-card__file-meta
                  .download-name {{ item.fileName }}
                  .download-url {{ item.url }}
              .download-card__status
                .download-card__percentage
                  | {{ percentageLabel(item) }}
                .download-card__bytes {{ formatTransferred(item) }}
                .download-card__speed(:class="{ 'is-idle': item.status !== 'downloading' }")
                  | {{ item.status === 'downloading'
                  |   ? formatSpeed(item.speed)
                  |   : statusMessage(item) }}
              button.download-card__close(
                @click="handlePrimaryAction(item)"
                :title="primaryActionLabel(item)"
              ) {{ primaryActionLabel(item) }}
            .download-card__progress-track
              .download-card__progress-fill(
                :class="progressClasses(item)"
                :style="`width: ${progressWidth(item)}%`"
              )
        .download-actions
          button.action-btn(
            @click="openFile(item.filePath)"
            :disabled="!item.filePath || item.status === 'downloading'"
          ) Open File
          button.action-btn(
            @click="showInFolder(item.filePath)"
            :disabled="!item.filePath"
          ) Show In Folder
          button.action-btn.delete-btn(
            @click="deleteDownload(item.id)"
          ) Delete
</template>

<script lang="ts">
/* global Electron, Lulumi */

import { Component, Vue } from 'vue-property-decorator';

import downloadsService from '../../../services/downloads';

interface DownloadEntry {
  id: string;
  fileName: string;
  url: string;
  filePath: string;
  status: 'downloading' | 'completed' | 'interrupted';
  progress: number;
  speed: number;
  totalBytes: number;
  receivedBytes: number;
  timestamp: number;
}

interface DownloadsWindow extends Lulumi.API.GlobalObject {
  ipcRenderer: Electron.IpcRenderer;
}

declare const window: DownloadsWindow;

@Component({
})
export default class Downloads extends Vue {
  downloads: DownloadEntry[] = [];
  storageListener: ((event: StorageEvent) => void) | null = null;
  downloadEventHandler: ((event: Electron.Event, payload: DownloadEntry) => void) | null = null;
  ipcListener: ((event: Electron.Event, ret: DownloadEntry[]) => void) | null = null;
  refreshTimer: ReturnType<typeof setInterval> | null = null;

  loadDownloads(): void {
    const storedDownloads = downloadsService.getDownloads();
    if (storedDownloads.length > 0) {
      this.downloads = storedDownloads;
    }

    window.ipcRenderer.send('guest-want-data', 'downloads');
  }

  normalizeStatus(status: string): DownloadEntry['status'] {
    switch (status) {
      case 'completed':
        return 'completed';
      case 'interrupted':
      case 'cancelled':
        return 'interrupted';
      case 'progressing':
      case 'downloading':
      default:
        return 'downloading';
    }
  }

  toDownloadEntry(payload: any): DownloadEntry {
    const id = payload.id || (
      payload.startTime
        ? String(payload.startTime)
        : `${payload.name || payload.fileName || 'download'}-${Date.now()}`
    );
    const fileName = payload.fileName || payload.name || 'Unknown';
    const url = payload.url || '';
    const filePath = payload.filePath || payload.savePath || '';
    const status = this.normalizeStatus(
      payload.status || payload.dataState || payload.state || 'downloading'
    );

    let progress = 0;
    if (typeof payload.progress === 'number') {
      progress = payload.progress;
    } else if (typeof payload.getReceivedBytes === 'number' &&
      typeof payload.totalBytes === 'number' &&
      payload.totalBytes > 0) {
      const ratio = payload.getReceivedBytes / payload.totalBytes;
      progress = Math.min(100, Math.max(0, Math.round(ratio * 100)));
    }
    if (status === 'completed') {
      progress = 100;
    }

    const rawTimestamp = payload.timestamp || payload.startTime || Date.now();
    const normalizedTimestamp =
      rawTimestamp < 1000000000000 ? rawTimestamp * 1000 : rawTimestamp;
    const speed = Number(payload.speed);
    const totalBytes = Number(payload.totalBytes);
    const receivedBytes = Number(payload.getReceivedBytes || payload.receivedBytes);

    return {
      id,
      fileName,
      url,
      filePath,
      status,
      progress,
      speed: Number.isFinite(speed) ? speed : 0,
      totalBytes: Number.isFinite(totalBytes) ? Math.max(0, totalBytes) : 0,
      receivedBytes: Number.isFinite(receivedBytes) ? Math.max(0, receivedBytes) : 0,
      timestamp: normalizedTimestamp,
    };
  }

  applyDownloadsSnapshot(snapshot: any[]): void {
    const entries = snapshot
      .map(payload => this.toDownloadEntry(payload))
      .filter(Boolean);

    downloadsService.clearDownloads();
    entries.forEach(entry => downloadsService.upsertDownload(entry));
    this.downloads = [...downloadsService.getDownloads()];
  }

  handleDownloadEvent(payload: any): void {
    const entry = this.toDownloadEntry(payload);
    downloadsService.upsertDownload(entry);
    this.downloads = [...downloadsService.getDownloads()];
  }

  clearAll(): void {
    this.downloads = downloadsService.clearDownloads();
    window.ipcRenderer.send('set-downloads', []);
  }
  deleteDownload(id: string): void {
    this.downloads = downloadsService.removeDownload(id);
    window.ipcRenderer.send('set-downloads', this.downloads);
  }

  formatTime(timestamp: number): string {
    if (!timestamp) {
      return '';
    }

    return new Date(timestamp).toLocaleString();
  }

  formatSpeed(speed: number): string {
    const normalizedSpeed = Number(speed);
    if (!Number.isFinite(normalizedSpeed) || normalizedSpeed <= 0) {
      return '0 B/s';
    }

    if (normalizedSpeed >= 1024 * 1024) {
      return `${(normalizedSpeed / (1024 * 1024)).toFixed(1)} MB/s`;
    }
    if (normalizedSpeed >= 1024) {
      return `${(normalizedSpeed / 1024).toFixed(1)} KB/s`;
    }
    return `${Math.round(normalizedSpeed)} B/s`;
  }
  formatBytes(bytes: number): string {
    const normalizedBytes = Number(bytes);
    if (!Number.isFinite(normalizedBytes) || normalizedBytes <= 0) {
      return '0 B';
    }

    if (normalizedBytes >= 1024 * 1024 * 1024) {
      return `${(normalizedBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    }
    if (normalizedBytes >= 1024 * 1024) {
      return `${(normalizedBytes / (1024 * 1024)).toFixed(1)} MB`;
    }
    if (normalizedBytes >= 1024) {
      return `${(normalizedBytes / 1024).toFixed(1)} KB`;
    }

    return `${Math.round(normalizedBytes)} B`;
  }
  formatTransferred(item: DownloadEntry): string {
    if (item.totalBytes > 0) {
      return `${this.formatBytes(item.receivedBytes)} / ${this.formatBytes(item.totalBytes)}`;
    }

    return `${this.formatBytes(item.receivedBytes)} downloaded`;
  }
  formatProgress(item: DownloadEntry): number | null {
    if (item.status === 'completed') {
      return 100;
    }
    const received = item.receivedBytes || 0;
    if (item.totalBytes > 0 && received > 0) {
      return Math.min(100, Math.max(0, Math.round((received / item.totalBytes) * 100)));
    }
    if (item.totalBytes <= 0) {
      return null;
    }
    if (typeof item.progress === 'number' && Number.isFinite(item.progress)) {
      return Math.max(0, Math.min(100, Math.round(item.progress)));
    }
    return 0;
  }
  percentageLabel(item: DownloadEntry): string {
    if (item.status === 'completed') {
      return 'Completed';
    }
    if (item.status === 'interrupted') {
      return 'Interrupted';
    }
    if (item.totalBytes <= 0) {
      return 'Calculating...';
    }
    const pct = this.formatProgress(item);
    return `${pct !== null ? pct : 0}%`;
  }
  progressWidth(item: DownloadEntry): number {
    if (item.status === 'completed') {
      return 100;
    }
    if (item.status === 'downloading' && item.totalBytes <= 0) {
      return 0;
    }
    const p = this.formatProgress(item);
    return p !== null ? p : 0;
  }
  progressClasses(item: DownloadEntry): Record<string, unknown> {
    const isIndeterminate = item.status === 'downloading' && item.totalBytes <= 0;
    return {
      [`is-${item.status}`]: true,
      'is-indeterminate': isIndeterminate,
    };
  }
  statusMessage(item: DownloadEntry): string {
    switch (item.status) {
      case 'completed':
        return 'Completed';
      case 'interrupted':
        return 'Interrupted';
      case 'downloading':
      default:
        return 'In progress';
    }
  }
  primaryActionLabel(item: DownloadEntry): string {
    return item.status === 'downloading' ? 'Cancel' : 'Delete';
  }
  handlePrimaryAction(item: DownloadEntry): void {
    if (item.status === 'downloading') {
      window.ipcRenderer.send('cancel-downloads-progress', Number(item.id));
      return;
    }
    this.deleteDownload(item.id);
  }

  openFile(filePath: string): void {
    if (filePath) {
      window.ipcRenderer.send('open-path', filePath);
    }
  }

  showInFolder(filePath: string): void {
    if (filePath) {
      window.ipcRenderer.send('show-item-in-folder', filePath);
    }
  }

  mounted(): void {
    this.loadDownloads();

    this.refreshTimer = setInterval(() => {
      window.ipcRenderer.send('guest-want-data', 'downloads');
    }, 1000);

    this.ipcListener = (_event: Electron.Event, ret: DownloadEntry[]) => {
      if (Array.isArray(ret)) {
        this.applyDownloadsSnapshot(ret);
      }
    };
    window.ipcRenderer.on('guest-here-your-data', this.ipcListener);

    this.downloadEventHandler = (_event: Electron.Event, payload: DownloadEntry) => {
      this.handleDownloadEvent(payload);
      this.$forceUpdate();
    };

    window.ipcRenderer.on('download-started', this.downloadEventHandler);
    window.ipcRenderer.on('download-progress', this.downloadEventHandler);
    window.ipcRenderer.on('download-completed', this.downloadEventHandler);
    window.ipcRenderer.on('will-download-any-file', this.downloadEventHandler);
    window.ipcRenderer.on('update-downloads-progress', this.downloadEventHandler);
    window.ipcRenderer.on('complete-downloads-progress', this.downloadEventHandler);

    this.storageListener = (event: StorageEvent) => {
      if (event.key === downloadsService.DOWNLOADS_KEY || event.key === null) {
        this.loadDownloads();
      }
    };
    (window as any).addEventListener('storage', this.storageListener);
  }

  beforeDestroy(): void {
    if (this.refreshTimer !== null) {
      clearInterval(this.refreshTimer);
    }

    if (this.ipcListener) {
      window.ipcRenderer.removeListener('guest-here-your-data', this.ipcListener);
    }

    if (this.downloadEventHandler) {
      window.ipcRenderer.removeListener('download-started', this.downloadEventHandler);
      window.ipcRenderer.removeListener('download-progress', this.downloadEventHandler);
      window.ipcRenderer.removeListener('download-completed', this.downloadEventHandler);
      window.ipcRenderer.removeListener('will-download-any-file', this.downloadEventHandler);
      window.ipcRenderer.removeListener('update-downloads-progress', this.downloadEventHandler);
      window.ipcRenderer.removeListener('complete-downloads-progress', this.downloadEventHandler);
    }

    if (this.storageListener) {
      (window as any).removeEventListener('storage', this.storageListener);
    }
  }
}
</script>

<style scoped>
.downloads-page {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: var(--bg-primary);
  color: var(--text-primary);
}

.downloads-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 28px 32px 16px;
  border-bottom: 1px solid var(--border-color);
  background: linear-gradient(180deg, var(--bg-secondary) 0%, var(--bg-primary) 100%);
}

.downloads-title {
  margin: 0;
  font-size: 22px;
}

.clear-btn,
.action-btn {
  background: transparent;
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  border-radius: 8px;
  padding: 8px 14px;
  cursor: pointer;
}

.clear-btn:disabled,
.action-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.downloads-content {
  flex: 1;
  padding: 20px 32px 40px;
}

.downloads-empty {
  color: var(--text-secondary);
}

.downloads-list {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.download-item {
  border: 0;
  border-radius: 18px;
  background: transparent;
  padding: 0;
}

.download-card {
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 18px;
  box-shadow: 0 18px 40px var(--shadow-color);
  overflow: hidden;
}

.download-card__header {
  align-items: center;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 22px;
}

.download-card__title {
  color: var(--text-primary);
  font-size: 16px;
  font-weight: 700;
  margin: 0;
}

.download-card__subtitle {
  color: var(--text-secondary);
  font-size: 12px;
  margin: 6px 0 0;
}

.download-status-pill {
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  padding: 7px 10px;
  text-transform: uppercase;
}

.download-status-pill.is-completed {
  background: rgba(34, 197, 94, 0.14);
  color: #15803d;
}

.download-status-pill.is-downloading {
  background: rgba(59, 130, 246, 0.14);
  color: #2563eb;
}

.download-status-pill.is-interrupted {
  background: rgba(239, 68, 68, 0.12);
  color: #dc2626;
}

.download-card__body {
  padding: 22px;
}

.download-card__row {
  align-items: flex-start;
  display: flex;
  gap: 18px;
  justify-content: space-between;
  margin-bottom: 18px;
}

.download-card__file {
  align-items: flex-start;
  display: flex;
  flex: 1;
  gap: 12px;
  min-width: 0;
}

.download-card__icon {
  align-items: center;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  color: var(--accent-color);
  display: inline-flex;
  font-size: 11px;
  font-weight: 800;
  height: 38px;
  justify-content: center;
  letter-spacing: 0.08em;
  min-width: 38px;
}

.download-card__file-meta {
  min-width: 0;
}

.download-name {
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 700;
  margin-bottom: 6px;
  word-break: break-word;
}

.download-url {
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.45;
  word-break: break-all;
}

.download-card__status {
  align-items: flex-end;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 140px;
}

.download-card__percentage {
  color: var(--text-primary);
  font-size: 15px;
  font-weight: 700;
}

.download-card__bytes {
  color: var(--text-secondary);
  font-size: 12px;
}

.download-card__speed {
  color: #16a34a;
  font-size: 12px;
  font-weight: 700;
}

.download-card__speed.is-idle {
  color: #7c869d;
}

.download-card__close {
  align-items: center;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  color: var(--text-primary);
  cursor: pointer;
  display: inline-flex;
  font-size: 12px;
  font-weight: 700;
  justify-content: center;
  min-height: 34px;
  min-width: 70px;
  padding: 0 12px;
  transition: background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease;
}

.download-card__close:hover {
  background: var(--card-bg);
  border-color: var(--accent-color);
}

.download-card__progress-track {
  background: var(--bg-secondary);
  border-radius: 999px;
  height: 10px;
  overflow: hidden;
  width: 100%;
}

.download-card__progress-fill {
  border-radius: 999px;
  box-shadow: 0 0 12px rgba(34, 197, 94, 0.4);
  height: 100%;
  min-width: 0;
  transition: width 0.2s linear;
}

.download-card__progress-fill.is-downloading {
  background: linear-gradient(90deg, #16a34a 0%, #4ade80 100%);
}

.download-card__progress-fill.is-completed {
  background: linear-gradient(90deg, #16a34a 0%, #4ade80 100%);
}

.download-card__progress-fill.is-interrupted {
  background: linear-gradient(90deg, #ef4444 0%, #f87171 100%);
}

@keyframes download-indeterminate {
  0% { transform: translateX(-100%); width: 50%; opacity: 0.6; }
  50% { opacity: 1; }
  100% { transform: translateX(300%); width: 50%; opacity: 0.6; }
}

.download-card__progress-fill.is-indeterminate {
  background: linear-gradient(90deg, #22c55e 0%, #86efac 100%);
  width: 50% !important;
  animation: download-indeterminate 1.5s infinite ease-in-out;
}

.download-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 12px;
}

.delete-btn {
  color: #ef4444;
  border-color: rgba(239, 68, 68, 0.35);
}

@media (max-width: 760px) {
  .downloads-header {
    align-items: flex-start;
    flex-direction: column;
    gap: 14px;
    padding: 24px 20px 16px;
  }

  .downloads-content {
    padding: 18px 20px 32px;
  }

  .download-card__header,
  .download-card__body {
    padding-left: 16px;
    padding-right: 16px;
  }

  .download-card__row {
    flex-direction: column;
  }

  .download-card__status {
    align-items: flex-start;
    min-width: 0;
  }

  .download-card__close {
    width: 100%;
  }
}
</style>
