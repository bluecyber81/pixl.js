// Build-time paths only: never infer a resource root from query strings,
// device data, a remote catalogue or the worker's /assets/ location.
export function deploymentBase(base = import.meta.env?.BASE_URL || '/') {
  if (typeof base !== 'string' || !/^\/(?:[A-Za-z0-9][A-Za-z0-9._-]*\/)*$/.test(base)) {
    throw new Error('Invalid deployment base path');
  }
  return base;
}

export function deploymentPath(relativePath, base) {
  if (typeof relativePath !== 'string' || !relativePath ||
      relativePath.split('/').some(part => !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(part))) {
    throw new Error('Invalid local resource path');
  }
  return deploymentBase(base) + relativePath;
}
