import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Checkbox } from './Checkbox';

const FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex]';

describe('Checkbox focus', () => {
  it.each([false, true])('is a single Tab stop (checked: %s)', (checked) => {
    const { container } = render(<Checkbox checked={checked} onToggle={() => {}} />);
    const focusable = [...container.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
      (el) => el.tabIndex >= 0,
    );
    expect(focusable).toHaveLength(1);
    expect(focusable[0]).toHaveAttribute('role', 'checkbox');
  });
});
