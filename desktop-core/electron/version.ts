/** Convert the sortable SemVer build number back to the public calendar version. */
export function toBusinessVersion(version: string): string {
  const parts = version.trim().replace(/^v/i, '').split('.');
  const encodedDay = Number(parts[2]);
  if (parts.length === 3 && Number.isInteger(encodedDay) && encodedDay >= 1000) {
    const day = Math.floor(encodedDay / 1000);
    const revision = encodedDay % 1000;
    return revision > 0
      ? `${parts[0]}.${parts[1]}.${day}.${revision}`
      : `${parts[0]}.${parts[1]}.${day}`;
  }
  return version;
}

export function compareVersions(left: string, right: string): number {
  const normalize = (value: string): number[] => {
    const core = value.trim().replace(/^v/i, '').split('-')[0] ?? '';
    if (!/^\d+(?:\.\d+)*$/.test(core)) return [];
    return core.split('.').map((part) => Number.parseInt(part, 10));
  };

  const leftParts = normalize(left);
  const rightParts = normalize(right);
  if (leftParts.length === 0 || rightParts.length === 0) return 0;

  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return difference > 0 ? 1 : -1;
  }
  return 0;
}

export function isNewerVersion(candidate: string, current: string): boolean {
  return compareVersions(candidate, current) > 0;
}
