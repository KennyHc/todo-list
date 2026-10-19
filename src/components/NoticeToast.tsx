import { useUIStore } from '../store/ui';
import { InfoToast } from './InfoToast';

/** Info toast for `ui.showNotice(...)`, e.g. "Backup copied". */
export function NoticeToast() {
  const notice = useUIStore((s) => s.notice);
  return (
    <InfoToast
      id={notice?.n ?? 0}
      message={notice?.text ?? null}
      onDismiss={() => useUIStore.getState().clearNotice()}
    />
  );
}
