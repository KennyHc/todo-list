import { describe, expect, it } from 'vitest';

import raw from '../../public/manifest.webmanifest?raw';

// Every file under public/, keyed like '../../public/icons/icon-192.png'.
const files = Object.keys(import.meta.glob('../../public/**/*', { query: '?url' }));
const exists = (src: string) => files.includes('../../public/' + src.replace(/^\//, ''));
const manifest = JSON.parse(raw);
type Icon = { src: string; sizes: string; type: string; purpose?: string };

describe('manifest.webmanifest', () => {
  it('has the fields needed to install', () => {
    expect(manifest).toMatchObject({
      name: 'Tasks',
      short_name: 'Tasks',
      id: '/',
      start_url: '/',
      scope: '/',
      display: 'standalone',
    });
    expect(manifest.description).toBeTruthy();
    expect(manifest.background_color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(manifest.theme_color).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it('lists 192, 512 and maskable 512 icons that exist on disk', () => {
    const icons: Icon[] = manifest.icons;
    const find = (sizes: string, purpose: string) =>
      icons.find((i) => i.sizes === sizes && (i.purpose ?? 'any') === purpose);
    expect(find('192x192', 'any')).toBeDefined();
    expect(find('512x512', 'any')).toBeDefined();
    expect(find('512x512', 'maskable')).toBeDefined();
    for (const icon of icons) {
      expect(exists(icon.src), icon.src).toBe(true);
    }
  });

  it('has a New task shortcut that points at a real route', () => {
    expect(manifest.shortcuts).toEqual([
      expect.objectContaining({ name: 'New task', url: '/?new=1' }),
    ]);
  });

  it('ships the iOS touch icon', () => {
    expect(exists('/icons/apple-touch-icon.png')).toBe(true);
  });
});
