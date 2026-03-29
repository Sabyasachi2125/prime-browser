const DOWNLOADS_KEY = 'prime_browser_downloads';

function normalizeTimestamp(value) {
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return Date.now();
  }

  // Electron download start times in this app can arrive in seconds.
  return timestamp < 1000000000000 ? timestamp * 1000 : timestamp;
}

function normalizeStatus(status) {
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

function readDownloads() {
  try {
    const raw = localStorage.getItem(DOWNLOADS_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function sortDownloads(downloads) {
  return downloads.sort((a, b) => {
    const aTime = Number(a && a.timestamp) || 0;
    const bTime = Number(b && b.timestamp) || 0;
    return bTime - aTime;
  });
}

function writeDownloads(downloads) {
  const normalized = sortDownloads(downloads.slice());

  try {
    localStorage.setItem(DOWNLOADS_KEY, JSON.stringify(normalized));
  } catch (error) {
    return normalized;
  }

  return normalized;
}

function normalizeDownload(entry) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const id = typeof entry.id === 'string' && entry.id ? entry.id : null;
  const fileNameSource = entry.fileName || entry.name;
  const fileName =
    typeof fileNameSource === 'string' && fileNameSource.trim() ? fileNameSource : null;
  const url = typeof entry.url === 'string' ? entry.url : '';
  const filePathSource = entry.filePath || entry.savePath;
  const filePath = typeof filePathSource === 'string' ? filePathSource : '';
  let rawStatus = 'downloading';
  if (typeof entry.status === 'string') {
    rawStatus = entry.status;
  } else if (typeof entry.dataState === 'string') {
    rawStatus = entry.dataState;
  } else if (typeof entry.state === 'string') {
    rawStatus = entry.state;
  }
  const progress = Number(entry.progress);
  const speed = Number(entry.speed) || 0;
  const timestamp = normalizeTimestamp(entry.timestamp || entry.startTime);
  const status = normalizeStatus(rawStatus);
  const totalBytes = Number(entry.totalBytes);
  const receivedBytes = Number(entry.getReceivedBytes || entry.receivedBytes);

  if (!id || !fileName) {
    return null;
  }

  let normalizedProgress = Math.max(0, Math.min(100, Number.isFinite(progress) ? progress : 0));
  if (status === 'completed') {
    normalizedProgress = 100;
  }

  // Legacy broken entries can linger forever as "downloading" with no progress.
  // Only apply this to entries where totalBytes is known (> 0) to avoid wrongly
  // marking streaming/unknown-size downloads as interrupted.
  if (
    status === 'downloading' &&
    normalizedProgress === 0 &&
    speed === 0 &&
    Number.isFinite(totalBytes) && totalBytes > 0 &&
    timestamp < (Date.now() - (60 * 60 * 1000))
  ) {
    return {
      id,
      fileName,
      url,
      filePath,
      status: 'interrupted',
      progress: 0,
      speed: 0,
      totalBytes: Number.isFinite(totalBytes) ? Math.max(0, totalBytes) : 0,
      receivedBytes: Number.isFinite(receivedBytes) ? Math.max(0, receivedBytes) : 0,
      timestamp,
    };
  }

  return {
    id,
    fileName,
    url,
    filePath,
    status,
    progress: normalizedProgress,
    speed,
    totalBytes: Number.isFinite(totalBytes) ? Math.max(0, totalBytes) : 0,
    receivedBytes: Number.isFinite(receivedBytes) ? Math.max(0, receivedBytes) : 0,
    timestamp,
  };
}

function getDownloads() {
  return sortDownloads(
    readDownloads()
      .map(normalizeDownload)
      .filter(download => download !== null)
  );
}

function upsertDownload(entry) {
  const normalizedEntry = normalizeDownload(entry);
  if (!normalizedEntry) {
    return getDownloads();
  }

  const downloads = getDownloads();
  const index = downloads.findIndex(download => download.id === normalizedEntry.id);

  if (index === -1) {
    downloads.unshift(normalizedEntry);
  } else {
    const existing = downloads[index];
    downloads[index] = {
      ...existing,
      ...normalizedEntry,
      progress: normalizedEntry.status === 'completed'
        ? 100
        : Math.max(existing.progress || 0, normalizedEntry.progress || 0),
      speed: normalizedEntry.status === 'downloading'
        ? normalizedEntry.speed
        : 0,
      totalBytes: normalizedEntry.totalBytes || existing.totalBytes || 0,
      receivedBytes: Math.max(existing.receivedBytes || 0, normalizedEntry.receivedBytes || 0),
      timestamp: normalizedEntry.timestamp || existing.timestamp,
    };
  }

  return writeDownloads(downloads);
}

function addDownload(download) {
  const normalized = normalizeDownload({ ...download, status: 'downloading' });
  if (!normalized) return getDownloads();
  const downloads = getDownloads();
  downloads.unshift(normalized);
  return writeDownloads(downloads);
}

function updateDownload(id, data) {
  const downloads = getDownloads();
  const index = downloads.findIndex(d => d.id === id);
  if (index === -1) return downloads;
  const existing = downloads[index];
  const updated = normalizeDownload({ ...existing, ...data });
  if (!updated) return downloads;
  downloads[index] = updated;
  return writeDownloads(downloads);
}

function removeDownload(id) {
  const downloads = getDownloads().filter(download => download.id !== id);
  return writeDownloads(downloads);
}

function clearDownloads() {
  try {
    localStorage.removeItem(DOWNLOADS_KEY);
  } catch (error) {
    return [];
  }

  return [];
}

module.exports = {
  DOWNLOADS_KEY,
  clearDownloads,
  getDownloads,
  addDownload,
  updateDownload,
  removeDownload,
  upsertDownload,
};
