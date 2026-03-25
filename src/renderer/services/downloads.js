const DOWNLOADS_KEY = 'prime_browser_downloads';

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

function getDownloads() {
  return sortDownloads(readDownloads());
}

function normalizeDownload(entry) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const id = typeof entry.id === 'string' && entry.id ? entry.id : null;
  const fileName =
    typeof entry.fileName === 'string' && entry.fileName.trim() ? entry.fileName : null;
  const url = typeof entry.url === 'string' ? entry.url : '';
  const filePath = typeof entry.filePath === 'string' ? entry.filePath : '';
  const rawStatus = typeof entry.status === 'string' ? entry.status : 'downloading';
  const progress = Number(entry.progress);
  const timestamp = Number(entry.timestamp) || Date.now();

  if (!id || !fileName) {
    return null;
  }

  return {
    id,
    fileName,
    url,
    filePath,
    status: ['completed', 'interrupted'].includes(rawStatus) ? rawStatus : 'downloading',
    progress: Math.max(0, Math.min(100, Number.isFinite(progress) ? progress : 0)),
    timestamp,
  };
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
    downloads[index] = {
      ...downloads[index],
      ...normalizedEntry,
    };
  }

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
  upsertDownload,
};
