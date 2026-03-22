<!-- eslint-disable max-len -->
<template lang="pug">
.history-page
  .history-header
    .history-title-row
      .history-icon
        svg(
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        )
          circle(cx="12" cy="12" r="10")
          polyline(points="12 6 12 12 16 14")
      h1.history-title Browsing History
    .history-actions
      button.clear-btn(
        @click="confirmClear"
        :disabled="displayedHistory.length === 0"
      )
        svg(
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        )
          polyline(points="3 6 5 6 21 6")
          path(d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6")
          path(d="M10 11v6")
          path(d="M14 11v6")
          path(d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2")
        span Clear All
  .history-search
    .search-icon
      svg(
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      )
        circle(cx="11" cy="11" r="8")
        line(x1="21" y1="21" x2="16.65" y2="16.65")
    input.search-input(
      v-model="filterText"
      type="text"
      placeholder="Search history..."
    )
    button.search-clear(v-if="filterText" @click="filterText = ''")
      svg(
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      )
        line(x1="18" y1="6" x2="6" y2="18")
        line(x1="6" y1="6" x2="18" y2="18")
  .history-content
    .history-empty(v-if="displayedHistory.length === 0")
      svg(
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      )
        circle(cx="12" cy="12" r="10")
        polyline(points="12 6 12 12 16 14")
      p(v-if="filterText") No results for "{{ filterText }}"
      p(v-else) Your browsing history is empty
    template(v-else)
      .history-group(v-for="(group, date) in groupedHistory" :key="date")
        .group-date {{ date }}
        .history-item(
          v-for="item in group"
          :key="item.timestamp + item.url"
          @click="openUrl(item.url)"
        )
          .item-favicon
            img(
              v-if="item.favIconUrl && item.favIconUrl.startsWith('data:')"
              :src="item.favIconUrl"
              @error="onFaviconError($event)"
            )
            .favicon-fallback(v-else)
              svg(
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              )
                circle(cx="12" cy="12" r="10")
                line(x1="2" y1="12" x2="22" y2="12")
                path(
                  d=`
                    M12 2a15.3 15.3 0 0 1 4 10
                    15.3 15.3 0 0 1-4 10 15.3 15.3
                    0 0 1-4-10 15.3 15.3 0 0 1 4-10z
                  `
                )
          .item-content
            .item-title {{ item.title || item.url }}
            .item-url {{ item.url }}
          .item-time {{ formatTime(item.mtime || item.timestamp) }}
          .item-actions
            button.item-open-btn(
              @click.stop="openUrl(item.url)"
              title="Open in new tab"
            )
              svg(
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              )
                path(d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6")
                polyline(points="15 3 21 3 21 9")
                line(x1="10" y1="14" x2="21" y2="3")
</template>

<script lang="ts">
/* global Electron, Lulumi */

import { Component, Vue } from 'vue-property-decorator';

interface HistoryEntry {
  url: string;
  title: string;
  favIconUrl?: string;
  mtime?: number;
  timestamp?: number;
  label?: string;
  time?: string;
}

interface HistoryWindow extends Lulumi.API.GlobalObject {
  ipcRenderer: Electron.IpcRenderer;
}

declare const window: HistoryWindow;

const HISTORY_STORAGE_KEY = 'prime_browser_history';

@Component
export default class History extends Vue {
  history: HistoryEntry[] = [];
  filterText = '';
  storageListener: ((event: StorageEvent) => void) | null = null;
  ipcListener: ((event: Electron.Event, ret: HistoryEntry[]) => void) | null = null;

  // ── computed ──────────────────────────────────────────────────────────────

  get filteredHistory(): HistoryEntry[] {
    const q = this.filterText.toLowerCase().trim();
    if (!q) return this.history;
    return this.history.filter(
      item => (item.title && item.title.toLowerCase().includes(q)) ||
        (item.url && item.url.toLowerCase().includes(q)),
    );
  }

  get displayedHistory(): HistoryEntry[] {
    return this.filteredHistory;
  }

  get groupedHistory(): Record<string, HistoryEntry[]> {
    const groups: Record<string, HistoryEntry[]> = {};
    this.filteredHistory.forEach((item) => {
      const label = this.getDateLabel(item.mtime || item.timestamp || 0);
      if (!groups[label]) {
        groups[label] = [];
      }
      groups[label].push(item);
    });
    return groups;
  }

  normalizeHistoryEntry(entry: any): HistoryEntry | null {
    if (!entry || typeof entry.url !== 'string' || entry.url.trim() === '') {
      return null;
    }

    const mtime = Number(entry.mtime);
    const timestamp = Number(entry.timestamp);

    return {
      url: entry.url,
      title:
        typeof entry.title === 'string' && entry.title.trim() ? entry.title : entry.url,
      favIconUrl:
        typeof entry.favIconUrl === 'string' ? entry.favIconUrl : undefined,
      mtime: Number.isFinite(mtime) ? mtime : undefined,
      timestamp: Number.isFinite(timestamp) ? timestamp : Date.now(),
      label: entry.label,
      time: entry.time,
    };
  }

  readStoredHistory(): HistoryEntry[] {
    try {
      const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
      if (!raw) {
        return [];
      }

      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed
        .map(entry => this.normalizeHistoryEntry(entry))
        .filter((entry): entry is HistoryEntry => entry !== null)
        .sort(
          (a, b) => (b.mtime || b.timestamp || 0) - (a.mtime || a.timestamp || 0),
        );
    } catch (error) {
      return [];
    }
  }

  // ── watchers ──────────────────────────────────────────────────────────────

  // ── methods ───────────────────────────────────────────────────────────────

  formatTime(ts: number): string {
    if (!ts) return '';
    const d = new Date(ts);
    const hours = d.getHours().toString().padStart(2, '0');
    const mins = d.getMinutes().toString().padStart(2, '0');
    return `${hours}:${mins}`;
  }

  getDateLabel(ts: number): string {
    if (!ts) return 'Unknown date';
    const d = new Date(ts);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 86400000);
    const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    if (day.getTime() === today.getTime()) return 'Today';
    if (day.getTime() === yesterday.getTime()) return 'Yesterday';
    return d.toLocaleDateString(
      undefined,
      { weekday: 'long', month: 'long', day: 'numeric' },
    );
  }

  openUrl(url: string): void {
    if (!url) return;

    const currentWindow = this.$electron.remote.getCurrentWindow();
    if (currentWindow && currentWindow.webContents) {
      currentWindow.webContents.send('new-tab', { url, follow: true });
      currentWindow.focus();
    }
  }

  confirmClear(): void {
    try {
      localStorage.removeItem(HISTORY_STORAGE_KEY);
    } catch (error) {
      // ignore storage failures and still clear the visible list
    }

    this.history = [];
    window.ipcRenderer.send('set-history', []);
  }

  onFaviconError(event: Event): void {
    const img = event.target as HTMLImageElement;
    if (img) {
      img.style.display = 'none';
      const parent = img.parentElement;
      if (parent) {
        const fallback = document.createElement('div');
        fallback.className = 'favicon-fallback';
        fallback.innerHTML = [
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"',
          ' stroke-width="2" stroke-linecap="round" stroke-linejoin="round">',
          '<circle cx="12" cy="12" r="10"></circle>',
          '<line x1="2" y1="12" x2="22" y2="12"></line>',
          '<path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10',
          ' 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>',
        ].join('');
        parent.appendChild(fallback);
      }
    }
  }

  loadHistory(): void {
    const storedHistory = this.readStoredHistory();
    if (storedHistory.length > 0) {
      this.history = storedHistory;
      return;
    }

    window.ipcRenderer.send('guest-want-data', 'history');
  }

  // ── lifecycle ─────────────────────────────────────────────────────────────

  mounted(): void {
    this.loadHistory();
    this.ipcListener = (event: Electron.Event, ret: HistoryEntry[]) => {
      if (Array.isArray(ret) && ret.length > 0) {
        this.history = ret
          .map(entry => this.normalizeHistoryEntry(entry))
          .filter((entry): entry is HistoryEntry => entry !== null)
          .sort(
            (a, b) => (b.mtime || b.timestamp || 0) - (a.mtime || a.timestamp || 0),
          );
      }
    };
    window.ipcRenderer.on('guest-here-your-data', this.ipcListener);
    this.storageListener = (event: StorageEvent) => {
      if (event.key === HISTORY_STORAGE_KEY || event.key === null) {
        this.loadHistory();
      }
    };
    (window as any).addEventListener('storage', this.storageListener);
  }

  beforeDestroy(): void {
    if (this.ipcListener) {
      window.ipcRenderer.removeListener('guest-here-your-data', this.ipcListener);
    }
    if (this.storageListener) {
      (window as any).removeEventListener('storage', this.storageListener);
    }
  }
}
</script>

<style scoped>
.history-page {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background-color: var(--bg-primary);
  color: var(--text-primary);
  font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
  padding: 0;
}

/* ── Header ─────────────────────────────────────────────────────────────── */
.history-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 28px 32px 16px;
  border-bottom: 1px solid var(--border-color);
  background: linear-gradient(180deg, var(--bg-secondary) 0%, var(--bg-primary) 100%);
}

.history-title-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.history-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--accent-color);
  color: #fff;
  flex-shrink: 0;
}

.history-icon svg {
  width: 20px;
  height: 20px;
}

.history-title {
  font-size: 22px;
  font-weight: 700;
  margin: 0;
  color: var(--text-primary);
  letter-spacing: -0.3px;
}

.clear-btn {
  display: flex;
  align-items: center;
  gap: 7px;
  background: transparent;
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  padding: 8px 16px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: background 0.18s, border-color 0.18s, color 0.18s;
}

.clear-btn svg {
  width: 15px;
  height: 15px;
}

.clear-btn:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.12);
  border-color: rgba(239, 68, 68, 0.5);
  color: #ef4444;
}

.clear-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* ── Search ─────────────────────────────────────────────────────────────── */
.history-search {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px 32px;
  background: var(--bg-primary);
  position: sticky;
  top: 0;
  z-index: 10;
  border-bottom: 1px solid var(--border-color);
}

.search-icon {
  display: flex;
  align-items: center;
  color: var(--text-secondary);
  flex-shrink: 0;
}

.search-icon svg {
  width: 18px;
  height: 18px;
}

.search-input {
  flex: 1;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 9px 14px;
  font-size: 14px;
  color: var(--text-primary);
  outline: none;
  transition: border-color 0.18s, box-shadow 0.18s;
}

.search-input::placeholder {
  color: var(--text-secondary);
  opacity: 0.6;
}

.search-input:focus {
  border-color: var(--accent-color);
  box-shadow: 0 0 0 3px rgba(255, 140, 0, 0.15);
}

.search-clear {
  display: flex;
  align-items: center;
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--text-secondary);
  padding: 4px;
  border-radius: 50%;
  transition: background 0.15s;
}

.search-clear svg {
  width: 16px;
  height: 16px;
}

.search-clear:hover {
  background: var(--card-bg);
  color: var(--text-primary);
}

/* ── Content ─────────────────────────────────────────────────────────────── */
.history-content {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0 40px;
}

/* ── Empty State ─────────────────────────────────────────────────────────── */
.history-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 20px;
  text-align: center;
  color: var(--text-secondary);
  gap: 16px;
  opacity: 0.6;
}

.history-empty svg {
  width: 60px;
  height: 60px;
}

.history-empty p {
  font-size: 15px;
  margin: 0;
}

/* ── Groups ─────────────────────────────────────────────────────────────── */
.history-group {
  margin-bottom: 4px;
}

.group-date {
  padding: 12px 32px 6px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.8px;
  text-transform: uppercase;
  color: var(--accent-color);
  opacity: 0.85;
}

/* ── Item ───────────────────────────────────────────────────────────────── */
.history-item {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 32px;
  cursor: pointer;
  transition: background 0.14s;
  border-radius: 0;
}

.history-item:hover {
  background: var(--card-bg);
}

.history-item:hover .item-actions {
  opacity: 1;
}

.item-favicon {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.item-favicon img {
  width: 16px;
  height: 16px;
  object-fit: contain;
  border-radius: 2px;
}

.favicon-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  opacity: 0.5;
}

.favicon-fallback svg {
  width: 16px;
  height: 16px;
}

.item-content {
  flex: 1;
  min-width: 0;
}

.item-title {
  font-size: 13.5px;
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 2px;
  line-height: 1.3;
}

.item-url {
  font-size: 11.5px;
  color: var(--text-secondary);
  opacity: 0.7;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.3;
}

.item-time {
  font-size: 11.5px;
  color: var(--text-secondary);
  opacity: 0.55;
  flex-shrink: 0;
  min-width: 38px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.item-actions {
  display: flex;
  align-items: center;
  opacity: 0;
  transition: opacity 0.14s;
  margin-left: 4px;
}

.item-open-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 5px;
  cursor: pointer;
  color: var(--text-secondary);
  transition: background 0.14s, color 0.14s, border-color 0.14s;
}

.item-open-btn svg {
  width: 14px;
  height: 14px;
}

.item-open-btn:hover {
  background: var(--accent-color);
  border-color: var(--accent-color);
  color: #fff;
}
</style>
