/**
 * Handles the manifest shortcut (`/?new=1`): returns true once if the param is present and
 * removes it from the URL so a reload doesn't repeat it.
 */
export function consumeNewTaskParam(): boolean {
  const url = new URL(window.location.href);
  if (!url.searchParams.has('new')) return false;
  url.searchParams.delete('new');
  window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
  return true;
}
