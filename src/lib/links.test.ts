import { describe, expect, it } from 'vitest';
import { linkHost, splitTitleLinks } from './links';

describe('splitTitleLinks', () => {
  it('returns the title untouched when there is no link', () => {
    expect(splitTitleLinks('Buy milk')).toEqual({ text: 'Buy milk', links: [] });
  });

  it('pulls out an http or https link', () => {
    expect(splitTitleLinks('Read this https://example.com/article')).toEqual({
      text: 'Read this',
      links: ['https://example.com/article'],
    });
    expect(splitTitleLinks('http://a.test/x then more')).toEqual({
      text: 'then more',
      links: ['http://a.test/x'],
    });
  });

  it('ignores other schemes', () => {
    expect(splitTitleLinks('open ftp://files.test/a and javascript:alert(1)')).toEqual({
      text: 'open ftp://files.test/a and javascript:alert(1)',
      links: [],
    });
  });

  it('trims trailing punctuation off the link', () => {
    expect(splitTitleLinks('See https://a.com/x.')).toEqual({
      text: 'See.',
      links: ['https://a.com/x'],
    });
    expect(splitTitleLinks('Is it https://a.com/x?')).toEqual({
      text: 'Is it?',
      links: ['https://a.com/x'],
    });
    expect(splitTitleLinks('Both: https://a.com, https://b.com;')).toEqual({
      text: 'Both:,;',
      links: ['https://a.com', 'https://b.com'],
    });
  });

  it('drops the brackets a link was wrapped in, but keeps balanced ones in the URL', () => {
    expect(splitTitleLinks('Docs (https://a.com/x) now')).toEqual({
      text: 'Docs now',
      links: ['https://a.com/x'],
    });
    expect(splitTitleLinks('Wiki https://en.wikipedia.org/wiki/Foo_(bar)')).toEqual({
      text: 'Wiki',
      links: ['https://en.wikipedia.org/wiki/Foo_(bar)'],
    });
  });

  it('finds several links in order', () => {
    expect(splitTitleLinks('Compare https://a.com/1 with https://b.com/2 today')).toEqual({
      text: 'Compare with today',
      links: ['https://a.com/1', 'https://b.com/2'],
    });
  });

  it('leaves an empty text when the title is only a link', () => {
    expect(splitTitleLinks('https://example.com')).toEqual({
      text: '',
      links: ['https://example.com'],
    });
  });

  it('does not treat a bare scheme as a link', () => {
    expect(splitTitleLinks('weird https:// thing')).toEqual({
      text: 'weird https:// thing',
      links: [],
    });
  });
});

describe('linkHost', () => {
  it('is the hostname without www', () => {
    expect(linkHost('https://www.github.com/a/b')).toBe('github.com');
    expect(linkHost('http://sub.example.org:8080/x')).toBe('sub.example.org');
  });
});
