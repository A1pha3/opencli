import { describe, expect, it, vi } from 'vitest';
import { getRegistry } from '@jackwener/opencli/registry';
import './publish.js';

describe('zhihu publish', () => {
  it('rejects missing titles before opening the editor', async () => {
    const cmd = getRegistry().get('zhihu/publish');
    expect(cmd?.func).toBeTypeOf('function');

    const page = {
      goto: vi.fn().mockResolvedValue(undefined),
      evaluate: vi.fn(),
    } as any;

    await expect(
      cmd!.func!(page, { text: 'hello', execute: true }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });

    expect(page.goto).not.toHaveBeenCalled();
    expect(page.evaluate).not.toHaveBeenCalled();
  });

  it('rejects editor states that are not proven fresh and publishable', async () => {
    const cmd = getRegistry().get('zhihu/publish');
    const page = {
      goto: vi.fn().mockResolvedValue(undefined),
      evaluate: vi.fn()
        .mockResolvedValueOnce({ slug: 'alice' })
        .mockResolvedValueOnce({ currentUrl: 'https://zhuanlan.zhihu.com/write', entryPathSafe: false }),
    } as any;

    await expect(
      cmd!.func!(page, { title: '标题', text: '正文', execute: true }),
    ).rejects.toMatchObject({ code: 'ACTION_NOT_AVAILABLE' });
  });

  it('publishes when the editor read-back and final article proof both match', async () => {
    const cmd = getRegistry().get('zhihu/publish');
    const page = {
      goto: vi.fn().mockResolvedValue(undefined),
      evaluate: vi.fn()
        .mockResolvedValueOnce({ slug: 'alice' })
        .mockResolvedValueOnce({ currentUrl: 'https://zhuanlan.zhihu.com/write', entryPathSafe: true })
        .mockResolvedValueOnce({ titleValue: '标题', bodyValue: '正文', titleMatches: true, bodyMatches: true })
        .mockResolvedValueOnce({
          createdTarget: 'article:99',
          createdUrl: 'https://zhuanlan.zhihu.com/p/99',
          authorIdentity: 'alice',
          titleMatches: true,
          bodyMatches: true,
          authorMatches: true,
        }),
    } as any;

    await expect(
      cmd!.func!(page, { title: '标题', text: '正文', execute: true }),
    ).resolves.toEqual([
      expect.objectContaining({
        outcome: 'created',
        created_target: 'article:99',
        created_url: 'https://zhuanlan.zhihu.com/p/99',
        author_identity: 'alice',
      }),
    ]);

    expect(page.goto).toHaveBeenCalledWith('https://zhuanlan.zhihu.com/write');
    expect(page.evaluate.mock.calls[1][0]).toContain('titleCandidates.length === 1');
    expect(page.evaluate.mock.calls[2][0]).toContain("document.execCommand('insertText', false, value)");
    expect(page.evaluate.mock.calls[3][0]).toContain("const directMatch = currentUrl.match(/zhuanlan\\.zhihu\\.com\\/p\\/(\\d+)/);");
  });
});