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
      wait: vi.fn().mockResolvedValue(undefined),
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
      wait: vi.fn().mockResolvedValue(undefined),
      evaluate: vi.fn()
        .mockResolvedValueOnce({ slug: 'alice' })
        .mockResolvedValueOnce({ currentUrl: 'https://zhuanlan.zhihu.com/write', entryPathSafe: true })
        .mockResolvedValueOnce({ titleValue: '标题', bodyValue: '正文', titleMatches: true, bodyMatches: true })
        .mockResolvedValueOnce({ publishTriggered: true, currentUrl: 'https://zhuanlan.zhihu.com/write' })
        .mockResolvedValueOnce({ currentUrl: 'https://zhuanlan.zhihu.com/p/99', articleUrl: 'https://zhuanlan.zhihu.com/p/99', articleId: '99', isEditUrl: false })
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
    expect(page.evaluate.mock.calls[2][0]).toContain('const readRichTextValue = (root) =>');
    expect(page.evaluate.mock.calls[2][0]).toContain("const normalizeForComparison = (value) => normalize(value).replace(/\\s+/g, ' ');");
    expect(page.evaluate.mock.calls[2][0]).toContain("return readRichTextValue(node) || node.textContent || '';");
    expect(page.evaluate.mock.calls[3][0]).toContain('publishTriggered');
    expect(page.evaluate.mock.calls[4][0]).toContain("articleUrl: articleId ? ('https://zhuanlan.zhihu.com/p/' + articleId) : linkedArticle");
    expect(page.evaluate.mock.calls[5][0]).toContain("const directMatch = currentUrl.match(/zhuanlan\\.zhihu\\.com\\/p\\/(\\d+)/);");
  });

  it('follows a discovered article link before final proof when publish lands on an intermediate page', async () => {
    const cmd = getRegistry().get('zhihu/publish');
    const page = {
      goto: vi.fn().mockResolvedValue(undefined),
      wait: vi.fn().mockResolvedValue(undefined),
      evaluate: vi.fn()
        .mockResolvedValueOnce({ slug: 'alice' })
        .mockResolvedValueOnce({ currentUrl: 'https://zhuanlan.zhihu.com/write', entryPathSafe: true })
        .mockResolvedValueOnce({ titleValue: '标题', bodyValue: '正文', titleMatches: true, bodyMatches: true })
        .mockResolvedValueOnce({ publishTriggered: true, currentUrl: 'https://zhuanlan.zhihu.com/write' })
        .mockResolvedValueOnce({
          currentUrl: 'https://zhuanlan.zhihu.com/write/success',
          articleUrl: 'https://zhuanlan.zhihu.com/p/101',
          articleId: '101',
          isEditUrl: false,
        })
        .mockResolvedValueOnce({
          createdTarget: 'article:101',
          createdUrl: 'https://zhuanlan.zhihu.com/p/101',
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
        created_target: 'article:101',
        created_url: 'https://zhuanlan.zhihu.com/p/101',
      }),
    ]);

    expect(page.goto).toHaveBeenNthCalledWith(1, 'https://zhuanlan.zhihu.com/write');
    expect(page.goto).toHaveBeenNthCalledWith(2, 'https://zhuanlan.zhihu.com/p/101');
    expect(page.wait).toHaveBeenCalledWith(2);
  });

  it('clicks publish again when the first publish only lands on the draft edit page', async () => {
    const cmd = getRegistry().get('zhihu/publish');
    const page = {
      goto: vi.fn().mockResolvedValue(undefined),
      wait: vi.fn().mockResolvedValue(undefined),
      evaluate: vi.fn()
        .mockResolvedValueOnce({ slug: 'alice' })
        .mockResolvedValueOnce({ currentUrl: 'https://zhuanlan.zhihu.com/write', entryPathSafe: true })
        .mockResolvedValueOnce({ titleValue: '标题', bodyValue: '正文', titleMatches: true, bodyMatches: true })
        .mockResolvedValueOnce({ publishTriggered: true, currentUrl: 'https://zhuanlan.zhihu.com/write' })
        .mockResolvedValueOnce({ currentUrl: 'https://zhuanlan.zhihu.com/p/101/edit', articleUrl: 'https://zhuanlan.zhihu.com/p/101', articleId: '101', isEditUrl: true })
        .mockResolvedValueOnce({ currentUrl: 'https://zhuanlan.zhihu.com/p/101/edit', articleUrl: 'https://zhuanlan.zhihu.com/p/101', articleId: '101', isEditUrl: true })
        .mockResolvedValueOnce({ currentUrl: 'https://zhuanlan.zhihu.com/p/101/edit', articleUrl: 'https://zhuanlan.zhihu.com/p/101', articleId: '101', isEditUrl: true })
        .mockResolvedValueOnce({ publishTriggered: true, currentUrl: 'https://zhuanlan.zhihu.com/p/101/edit' })
        .mockResolvedValueOnce({ currentUrl: 'https://zhuanlan.zhihu.com/p/101', articleUrl: 'https://zhuanlan.zhihu.com/p/101', articleId: '101', isEditUrl: false })
        .mockResolvedValueOnce({
          createdTarget: 'article:101',
          createdUrl: 'https://zhuanlan.zhihu.com/p/101',
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
        created_target: 'article:101',
        created_url: 'https://zhuanlan.zhihu.com/p/101',
      }),
    ]);

    expect(page.evaluate.mock.calls[3][0]).toContain('确认并发布');
    expect(page.evaluate.mock.calls[7][0]).toContain('确认并发布');
    expect(page.wait).toHaveBeenCalledWith(0.75);
  });
});