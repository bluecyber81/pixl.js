const localeFor = locale => String(locale).startsWith('de') ? 'de-DE' : 'en-US';

export function storageUsage(drive) {
  if (!drive || drive.status !== 0 || !Number.isSafeInteger(drive.totalBytes) || drive.totalBytes <= 0 ||
      !Number.isSafeInteger(drive.freeBytes) || drive.freeBytes < 0 || drive.freeBytes > drive.totalBytes) return null;
  return { total: drive.totalBytes, free: drive.freeBytes, used: drive.totalBytes - drive.freeBytes };
}

export function storageAmount(bytes, locale) {
  const unit = bytes >= 1048576 ? ['MiB', 1048576] : bytes >= 1024 ? ['KiB', 1024] : ['B', 1];
  return new Intl.NumberFormat(localeFor(locale), { maximumFractionDigits: 2 }).format(bytes / unit[1]) + ' ' + unit[0];
}

export function occupiedPercent({ used, total }, locale) {
  if (used > 0 && used / total < 0.01) return '< 1 %';
  if (used < total && used / total > 0.99) return '> 99 %';
  return new Intl.NumberFormat(localeFor(locale), { style: 'percent', maximumFractionDigits: 0 }).format(used / total);
}
