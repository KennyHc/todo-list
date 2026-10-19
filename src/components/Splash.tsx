import styles from './Splash.module.css';

/** The app's mark, centered and softly pulsing, while auth or the first sync is pending. */
export function Splash() {
  return (
    <div className={styles.splash} role="status" aria-label="Loading">
      <svg className={styles.mark} viewBox="0 0 192 192" aria-hidden="true">
        <rect width="192" height="192" rx="44" fill="#A9C6F5" />
        <path
          d="M 60 96 L 84 120 L 132 72"
          stroke="white"
          strokeWidth="16"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
