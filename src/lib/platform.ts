type NavigatorWithData = Navigator & { userAgentData?: { platform?: string } };

/** True on Apple platforms, where the modifier is Command rather than Control. */
export function isMac(): boolean {
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as NavigatorWithData;
  const platform = nav.userAgentData?.platform || nav.platform || '';
  return /mac|iphone|ipad|ipod/i.test(platform);
}

/** Display label for a key token; 'mod' is the platform's primary modifier. */
export function keyLabel(key: string): string {
  if (key === 'mod') return isMac() ? '⌘' : 'Ctrl';
  if (key === 'alt') return isMac() ? '⌥' : 'Alt';
  return /^[a-z]$/.test(key) ? key.toUpperCase() : key;
}
