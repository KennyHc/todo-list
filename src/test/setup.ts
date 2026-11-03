import '@testing-library/jest-dom/vitest';
import { MotionGlobalConfig } from 'framer-motion';
import { vi } from 'vitest';

MotionGlobalConfig.skipAnimations = true;

// happy-dom rejects `finished` when an animation is cancelled (framer-motion cancels on unmount);
// browsers do too, but nobody awaits it here, so the rejection would surface as an unhandled error.
const animate = Element.prototype.animate;
Element.prototype.animate = function (...args: Parameters<typeof animate>) {
  const animation = animate.apply(this, args);
  animation.finished.catch(() => undefined);
  return animation;
};

// Unit tests never talk to Firebase: the bootstrap module is replaced by inert stubs.
vi.mock('../lib/firebase', () => ({ app: {}, auth: {}, googleProvider: {}, popupRedirect: {} }));
vi.mock('../lib/firestore', () => ({ db: {} }));
