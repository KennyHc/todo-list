import { PointerSensor, type PointerSensorOptions } from '@dnd-kit/core';

/** Mouse and pen drag after 4px; touch has its own sensor (press and hold) so scrolling works. */
export class MousePenSensor extends PointerSensor {
  static activators = [
    {
      eventName: 'onPointerDown' as const,
      handler: (
        { nativeEvent: event }: { nativeEvent: PointerEvent },
        { onActivation }: PointerSensorOptions,
      ) => {
        if (!event.isPrimary || event.button !== 0 || event.pointerType === 'touch') return false;
        onActivation?.({ event });
        return true;
      },
    },
  ];
}

/** Activation for MousePenSensor and for the TouchSensor's long press. Shared by Tree and Week. */
export const MOUSE_ACTIVATION = { distance: 4 };
export const TOUCH_ACTIVATION = { delay: 350, tolerance: 5 };
