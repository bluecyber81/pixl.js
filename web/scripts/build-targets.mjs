export const buildTargets = {
  root: ['dist', '/'],
  pages: ['dist-pages', '/pixl.js/'],
  'test-app670': ['dist-test-app670', '/pixl.js/test/app670/'],
  'test-transfer4': ['dist-test-transfer4', '/pixl.js/test/transfer4/']
}

export function buildTarget(mode) {
  if (!Object.hasOwn(buildTargets, mode)) throw new Error('Unknown build target: ' + mode)
  return buildTargets[mode]
}
