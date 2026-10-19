import { useEffect, useState } from 'react';

let played = false;

/**
 * True for the first moments after the app first mounts in this page load, so the entrance
 * animation plays on load and reload only — never again when views switch or tasks are added.
 */
export function useIntro(durationMs = 1800): boolean {
  const [active, setActive] = useState(() => !played);
  useEffect(() => {
    if (!active) return;
    played = true;
    const timer = setTimeout(() => setActive(false), durationMs);
    return () => clearTimeout(timer);
  }, [active, durationMs]);
  return active;
}
