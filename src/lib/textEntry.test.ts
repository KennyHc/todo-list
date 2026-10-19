import { describe, expect, it, vi } from 'vitest';
import { ignoreTextEntry, isTextEntryTarget } from './textEntry';

const el = (html: string) => {
  const host = document.createElement('div');
  host.innerHTML = html;
  document.body.append(host);
  return host;
};

describe('isTextEntryTarget', () => {
  it('recognises fields and anything inside an editable region', () => {
    const host = el(
      '<input id="i"><textarea id="t"></textarea><select id="s"></select>' +
        '<div contenteditable="true"><span id="inner">x</span></div>',
    );
    for (const id of ['i', 't', 's', 'inner']) {
      expect(isTextEntryTarget(host.querySelector(`#${id}`))).toBe(true);
    }
    host.remove();
  });

  it('ignores buttons, plain elements, contenteditable=false and null', () => {
    const host = el(
      '<button id="b"></button><div id="d"></div><div contenteditable="false" id="f"></div>',
    );
    for (const id of ['b', 'd', 'f']) {
      expect(isTextEntryTarget(host.querySelector(`#${id}`))).toBe(false);
    }
    expect(isTextEntryTarget(null)).toBe(false);
    host.remove();
  });
});

describe('ignoreTextEntry', () => {
  it('drops events that start in a text field and forwards the rest', () => {
    const host = el('<input id="i"><button id="b"></button>');
    const onKeyDown = vi.fn();
    const wrapped = ignoreTextEntry({ onKeyDown }) as { onKeyDown: (e: unknown) => void };

    // Space typed into the title editor must never reach dnd-kit's KeyboardSensor.
    wrapped.onKeyDown({ target: host.querySelector('#i'), key: ' ' });
    expect(onKeyDown).not.toHaveBeenCalled();

    const fromButton = { target: host.querySelector('#b'), key: ' ' };
    wrapped.onKeyDown(fromButton);
    expect(onKeyDown).toHaveBeenCalledWith(fromButton);
    host.remove();
  });

  it('passes undefined listeners through and skips non-function entries', () => {
    expect(ignoreTextEntry(undefined)).toBeUndefined();
    const wrapped = ignoreTextEntry({ onPointerDown: vi.fn(), role: 'button' } as object);
    expect(Object.keys(wrapped)).toEqual(['onPointerDown']);
  });
});
