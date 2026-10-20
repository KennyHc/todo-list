import { useUIStore } from '../store/ui';
import { InfoToast } from './InfoToast';

/** Info toast for `ui.showNotice(...)`, e.g. "Backup copied". */
export function NoticeToast() {
  const notice = useUIStore((s) => s.notice);
  return (
    <InfoToast
      id={notice?.n ?? 0}
      message={notice?.text ?? null}
      action={notice?.action}
      persistent={notice?.persistent}
      onDismiss={() => {
        const current = useUIStore.getState().notice;
        useUIStore.getState().clearNotice();
        // Only the notice on screen: a stale callback from a replaced one must not fire.
        if (current === notice) notice?.onDismiss?.();
      }}
    />
  );
}
