/** The §12 allow-list, SPDX-style. The single place the licence rule lives in code. */
export const LICENSES = ['CC0-1.0', 'CC-BY-3.0', 'CC-BY-4.0', 'OGA-BY-3.0', 'OFL-1.1', 'original', 'CC-BY-SA-4.0'] as const;
export type License = (typeof LICENSES)[number];

/** Author string every piece drawn from scratch carries. Change it here and in the manifest together. */
export const OWNER_AUTHOR = 'FTLite project owner';

export const LICENSE_URLS: Readonly<Record<Exclude<License, 'original'>, string>> = {
  'CC0-1.0': 'https://creativecommons.org/publicdomain/zero/1.0/',
  'CC-BY-3.0': 'https://creativecommons.org/licenses/by/3.0/',
  'CC-BY-4.0': 'https://creativecommons.org/licenses/by/4.0/',
  'OGA-BY-3.0': 'https://static.opengameart.org/OGA-BY-3.0.txt',
  'OFL-1.1': 'https://openfontlicense.org/open-font-license-official-text/',
  'CC-BY-SA-4.0': 'https://creativecommons.org/licenses/by-sa/4.0/'
};

/** CC-BY-SA is allowed only unmodified (a modified SA asset would put the share-alike condition on the game). */
export function licenseAllowed(license: string, modifications: string): boolean {
  if (!(LICENSES as readonly string[]).includes(license)) return false;
  if (license === 'CC-BY-SA-4.0') return modifications === 'none';
  return true;
}
