import '@testing-library/jest-dom/vitest';
import { MotionGlobalConfig } from 'framer-motion';
import { vi } from 'vitest';

MotionGlobalConfig.skipAnimations = true;

// Unit tests never talk to Firebase: the bootstrap module is replaced by inert stubs.
vi.mock('../lib/firebase', () => ({ app: {}, auth: {}, googleProvider: {}, popupRedirect: {} }));
vi.mock('../lib/firestore', () => ({ db: {} }));
