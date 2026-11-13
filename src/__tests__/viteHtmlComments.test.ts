import { describe, expect, it } from 'vitest';
import { stripHtmlCommentsFromHtml } from '../../vite.config';

describe('stripHtmlCommentsFromHtml', () => {
  it('remove comentários HTML completos, inclusive multilinha', () => {
    const html = '<!doctype html>\n<!-- segredo interno\nsegunda linha -->\n<html><body>LOLA</body></html>';
    expect(stripHtmlCommentsFromHtml(html)).toBe('<!doctype html>\n<html><body>LOLA</body></html>');
  });

  it('preserva documento sem comentários e marcador incompleto', () => {
    const plain = '<html><body>LOLA</body></html>';
    expect(stripHtmlCommentsFromHtml(plain)).toBe(plain);
    const malformed = '<html><!-- comentário sem fechamento';
    expect(stripHtmlCommentsFromHtml(malformed)).toBe(malformed);
  });

  it('remove mais de um comentário sem apagar conteúdo entre eles', () => {
    const html = 'A<!-- um -->B<!-- dois -->C';
    expect(stripHtmlCommentsFromHtml(html)).toBe('ABC');
  });
});
