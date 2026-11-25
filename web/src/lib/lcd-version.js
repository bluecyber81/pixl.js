// Compare upstream and DE version numbers. A board-specific trial suffix is
// outside the LCD release numbering scheme and has its own profile.
export function compareLcdVersions(installed, target) {
  const parts = value => {
    if (typeof value !== 'string' || value.length > 64) return null;
    // The signed DE4.2 release retains its original b2 version string.
    if (value === '2.22.0-DE4.2-b2') value = '2.22.0-DE4.2';
    const match = /^(\d+)\.(\d+)\.(\d+)(?:-DE(\d+)\.(\d+)(?:-PREP|t[1-9]\d*)?)?$/u.exec(value);
    if (!match) return null;
    const numbers = match.slice(1, match[4] === undefined ? 4 : 6).map(Number);
    return numbers.every(Number.isSafeInteger) ? numbers : null;
  };
  const left = parts(installed), right = parts(target);
  if (!left || !right) return null;
  for (let i = 0; i < Math.min(left.length, right.length); i++) {
    if (left[i] !== right[i]) return Math.sign(left[i] - right[i]);
  }
  return 0;
}
