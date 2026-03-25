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
        .download-main
          .download-name {{ item.fileName }}
          .download-url {{ item.url }}
        .download-meta
          span.download-status(:class="`is-${item.status}`") {{ item.status }}
          span.download-time {{ formatTime(item.timestamp) }}
        .download-progress(v-if="item.status === 'downloading'")
          el-progress(
            :percentage="item.progress"
            :stroke-width="10"
            :show-text="true"
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
</template>

<script lang="ts">
/* global Electron, Lulumi */

import { Component, Vue } from 'vue-property-decorator';

import { Progress } from 'element-ui';

import downloadsService from '../../../services/downloads';

interface DownloadEntry {
  id: string;
  fileName: string;
  url: string;
  filePath: string;
  status: 'downloading' | 'completed' | 'interrupted';
  progress: number;
  timestamp: number;
}

interface DownloadsWindow extends Lulumi.API.GlobalObject {
  ipcRenderer: Electron.IpcRenderer;
}

declare const window: DownloadsWindow;

@Component({
  components: {
    'el-progress': Progress,
  },
})
export default class Downloads extends Vue {
  downloads: DownloadEntry[] = [];
  storageListener: ((event: StorageEvent) => void) | null = null;
  startListener: ((event: Electron.Event, payload: DownloadEntry) => void) | null = null;
  progressListener: ((event: Electron.Event, payload: DownloadEntry) => void) | null = null;
  completeListener: ((event: Electron.Event, payload: DownloadEntry) => void) | null = null;

  loadDownloads(): void {
    this.downloads = downloadsService.getDownloads();
  }

  handleDownloadEvent(payload: DownloadEntry): void {
    downloadsService.upsertDownload(payload);
    this.downloads = downloadsService.getDownloads();
  }

  clearAll(): void {
    this.downloads = downloadsService.clearDownloads();
    window.ipcRenderer.send('set-downloads', []);
  }

  formatTime(timestamp: number): string {
    if (!timestamp) {
      return '';
    }

    return new Date(timestamp).toLocaleString();
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
    this.startListener = (_event, payload) => {
      this.handleDownloadEvent(payload);
    };
    this.progressListener = (_event, payload) => {
      this.handleDownloadEvent(payload);
    };
    this.completeListener = (_event, payload) => {
      this.handleDownloadEvent(payload);
    };
    window.ipcRenderer.on('download-started', this.startListener);
    window.ipcRenderer.on('download-progress', this.progressListener);
    window.ipcRenderer.on('download-completed', this.completeListener);
    this.storageListener = (event: StorageEvent) => {
      if (event.key === downloadsService.DOWNLOADS_KEY || event.key === null) {
        this.loadDownloads();
      }
    };
    (window as any).addEventListener('storage', this.storageListener);
  }

  beforeDestroy(): void {
    if (this.startListener) {
      window.ipcRenderer.removeListener('download-started', this.startListener);
    }
    if (this.progressListener) {
      window.ipcRenderer.removeListener('download-progress', this.progressListener);
    }
    if (this.completeListener) {
      window.ipcRenderer.removeListener('download-completed', this.completeListener);
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
  gap: 14px;
}

.download-item {
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--card-bg);
  padding: 16px;
}

.download-main {
  min-width: 0;
}

.download-name {
  font-weight: 600;
  margin-bottom: 6px;
  word-break: break-word;
}

.download-url {
  color: var(--text-secondary);
  font-size: 12px;
  word-break: break-all;
}

.download-meta {
  display: flex;
  gap: 12px;
  margin: 10px 0;
  font-size: 12px;
  color: var(--text-secondary);
}

.download-status.is-completed {
  color: #22c55e;
}

.download-status.is-downloading {
  color: var(--accent-color);
}

.download-status.is-interrupted {
  color: #ef4444;
}

.download-progress {
  margin-bottom: 12px;
}

.download-actions {
  display: flex;
  gap: 10px;
}
</style>
