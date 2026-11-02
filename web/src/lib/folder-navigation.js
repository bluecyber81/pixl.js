// Breadcrumbs are derived exclusively from the currently listed device path.
// Do not URL-decode, case-fold, or normalize user folder names.
export function directoryBreadcrumbs(path) {
  const root = [{ path: '', name: null }];
  if (typeof path !== 'string' || !/^[A-Z]:\//.test(path) || /[\0\\]/.test(path)) return root;
  const drive = path.slice(0, 3), tail = path.slice(3);
  const segments = tail ? tail.split('/') : [];
  if (segments.some(name => !name || name === '.' || name === '..')) return root;
  root.push({ path: drive, name: drive });
  let current = drive;
  for (const name of segments) {
    current += (current.endsWith('/') ? '' : '/') + name;
    root.push({ path: current, name });
  }
  return root;
}

export function checkedPageSize(value) {
  const size = Number(value);
  return [25, 50, 100].includes(size) ? size : 100;
}
