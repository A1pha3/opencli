import { CliError, CommandExecutionError } from '@jackwener/opencli/errors';
import { cli, Strategy } from '@jackwener/opencli/registry';
import type { IPage } from '@jackwener/opencli/types';
import { buildResultRow, requireExecute, resolveCurrentUserIdentity, resolvePayload } from './write-shared.js';

const PUBLISH_URL = 'https://zhuanlan.zhihu.com/write';
const TITLE_SELECTOR = '.WriteIndex-titleInput textarea, textarea[placeholder*="标题"], textarea[placeholder*="title" i], input[placeholder*="标题"], input[placeholder*="title" i]';
const BODY_SELECTOR = '.ql-editor[contenteditable="true"], .DraftEditor-root [contenteditable="true"], [contenteditable="true"]';

function requireTitle(kwargs: Record<string, unknown>): string {
  const title = typeof kwargs.title === 'string' ? kwargs.title.trim() : '';
  if (!title) throw new CliError('INVALID_INPUT', 'Zhihu article title is required via --title');
  return title;
}

cli({
  site: 'zhihu',
  name: 'publish',
  description: 'Publish a Zhihu column article',
  domain: 'zhuanlan.zhihu.com',
  strategy: Strategy.UI,
  browser: true,
  args: [
    { name: 'title', required: true, help: 'Article title' },
    { name: 'text', positional: true, help: 'Article body text' },
    { name: 'file', help: 'Article body text file path' },
    { name: 'execute', type: 'boolean', help: 'Actually perform the write action' },
  ],
  columns: ['status', 'outcome', 'message', 'target_type', 'target', 'created_target', 'created_url', 'author_identity'],
  func: async (page: IPage | null, kwargs: Record<string, unknown>) => {
    if (!page) throw new CommandExecutionError('Browser session required for zhihu publish');

    requireExecute(kwargs);
    const title = requireTitle(kwargs);
    const payload = await resolvePayload(kwargs);

    await page.goto(PUBLISH_URL);
    const authorIdentity = await resolveCurrentUserIdentity(page);

    const entryPath = await page.evaluate(`(() => {
      const titleSelector = ${JSON.stringify(TITLE_SELECTOR)};
      const bodySelector = ${JSON.stringify(BODY_SELECTOR)};
      const isVisible = (node) => {
        if (!node) return false;
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const readValue = (node) => 'value' in node ? (node.value || '') : (node.textContent || '');
      const titleCandidates = Array.from(document.querySelectorAll(titleSelector))
        .filter(isVisible)
        .map((node) => ({ text: readValue(node).trim() }));
      const bodyCandidates = Array.from(document.querySelectorAll(bodySelector))
        .filter((node) => isVisible(node) && !node.closest('.WriteIndex-titleInput'))
        .map((node) => ({ text: readValue(node).trim() }));
      const publishButton = Array.from(document.querySelectorAll('button')).find((node) => /发布/.test(node.textContent || ''));
      return {
        currentUrl: location.href,
        entryPathSafe: titleCandidates.length === 1
          && bodyCandidates.length === 1
          && !titleCandidates[0].text
          && !bodyCandidates[0].text
          && !!publishButton,
      };
    })()` ) as { currentUrl?: string; entryPathSafe?: boolean };

    if (!entryPath.entryPathSafe) {
      throw new CliError('ACTION_NOT_AVAILABLE', `Zhihu article editor was not proven fresh and ready at ${entryPath.currentUrl || PUBLISH_URL}`);
    }

    const fillState = await page.evaluate(`(() => {
      const titleText = ${JSON.stringify(title)};
      const bodyText = ${JSON.stringify(payload)};
      const titleSelector = ${JSON.stringify(TITLE_SELECTOR)};
      const bodySelector = ${JSON.stringify(BODY_SELECTOR)};
      const isVisible = (node) => {
        if (!node) return false;
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const setControlValue = (node, value) => {
        if ('value' in node) {
          const proto = node.tagName === 'TEXTAREA'
            ? window.HTMLTextAreaElement.prototype
            : window.HTMLInputElement.prototype;
          const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
          if (setter) setter.call(node, value);
          else node.value = value;
          node.dispatchEvent(new Event('input', { bubbles: true }));
          node.dispatchEvent(new Event('change', { bubbles: true }));
          return;
        }
        node.focus();
        node.textContent = '';
        document.execCommand('insertText', false, value);
        node.dispatchEvent(new InputEvent('input', { bubbles: true, data: value, inputType: 'insertText' }));
      };
      const normalize = (value) => String(value || '').replace(/\\r\\n/g, '\\n').replace(/\\u00a0/g, ' ').trim();
      const titleNode = Array.from(document.querySelectorAll(titleSelector)).find(isVisible);
      const bodyNode = Array.from(document.querySelectorAll(bodySelector)).find((node) => isVisible(node) && !node.closest('.WriteIndex-titleInput'));
      if (!titleNode || !bodyNode) return { titleMatches: false, bodyMatches: false, titleValue: '', bodyValue: '' };
      setControlValue(titleNode, titleText);
      setControlValue(bodyNode, bodyText);
      const titleValue = 'value' in titleNode ? titleNode.value || '' : titleNode.textContent || '';
      const bodyValue = 'value' in bodyNode ? bodyNode.value || '' : bodyNode.textContent || '';
      return {
        titleValue,
        bodyValue,
        titleMatches: normalize(titleValue) === normalize(titleText),
        bodyMatches: normalize(bodyValue) === normalize(bodyText),
      };
    })()` ) as { titleValue?: string; bodyValue?: string; titleMatches?: boolean; bodyMatches?: boolean };

    if (!fillState.titleMatches || !fillState.bodyMatches) {
      throw new CliError('OUTCOME_UNKNOWN', 'Zhihu article editor content did not exactly match the requested title/body before publish');
    }

    const proof = await page.evaluate(`(async () => {
      const expectedTitle = ${JSON.stringify(title)};
      const expectedBody = ${JSON.stringify(payload)};
      const expectedAuthor = ${JSON.stringify(authorIdentity)};
      const normalize = (value) => String(value || '').replace(/\\r\\n/g, '\\n').replace(/\\u00a0/g, ' ').replace(/\\s+/g, ' ').trim();
      const isVisible = (node) => {
        if (!node) return false;
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const findPublishButton = (scope = document) => Array.from(scope.querySelectorAll('button')).find((node) => {
        const text = (node.textContent || '').trim();
        return text === '发布' || text === '确认发布' || text === '立即发布';
      });
      const readAuthorSlug = () => {
        const link = Array.from(document.querySelectorAll('a[href^="/people/"], a[href*="www.zhihu.com/people/"]')).find((node) => {
          const text = (node.textContent || '').trim();
          const href = node.getAttribute('href') || '';
          return /people\\//.test(href) && (!text || text.length < 80);
        });
        const href = link?.getAttribute('href') || '';
        const match = href.match(/\\/people\\/([A-Za-z0-9_-]+)/);
        return match ? match[1] : null;
      };
      const publishButton = findPublishButton();
      if (!publishButton) return { createdTarget: null, createdUrl: location.href, authorIdentity: null, titleMatches: false, bodyMatches: false };
      publishButton.click();
      await new Promise((resolve) => setTimeout(resolve, 500));
      const dialog = Array.from(document.querySelectorAll('[role="dialog"], .Modal, .Popover, .css-modal')).find(isVisible) || document;
      const confirmButton = findPublishButton(dialog);
      if (confirmButton && confirmButton !== publishButton) {
        confirmButton.click();
      }
      await new Promise((resolve) => setTimeout(resolve, 1800));
      const currentUrl = location.href;
      const directMatch = currentUrl.match(/zhuanlan\\.zhihu\\.com\\/p\\/(\\d+)/);
      const linkedArticle = Array.from(document.querySelectorAll('a[href*="zhuanlan.zhihu.com/p/"]')).map((node) => node.getAttribute('href') || '').find(Boolean) || null;
      const linkedMatch = linkedArticle ? linkedArticle.match(/zhuanlan\\.zhihu\\.com\\/p\\/(\\d+)/) : null;
      const articleId = directMatch?.[1] || linkedMatch?.[1] || null;
      const titleNode = document.querySelector('.Post-Title, h1.ContentItem-title, .ArticleTitle, h1');
      const bodyNode = document.querySelector('.Post-RichTextContainer, .RichText, .ArticleContent, [itemprop="articleBody"]');
      const authorSlug = readAuthorSlug();
      return {
        createdTarget: articleId ? 'article:' + articleId : null,
        createdUrl: articleId ? (directMatch ? currentUrl : linkedArticle) : currentUrl,
        authorIdentity: authorSlug,
        titleMatches: normalize(titleNode?.textContent || '') === normalize(expectedTitle),
        bodyMatches: normalize(bodyNode?.textContent || '') === normalize(expectedBody),
        authorMatches: authorSlug === expectedAuthor,
      };
    })()` ) as {
      createdTarget?: string | null;
      createdUrl?: string | null;
      authorIdentity?: string | null;
      titleMatches?: boolean;
      bodyMatches?: boolean;
      authorMatches?: boolean;
    };

    if (!proof.createdTarget || !proof.titleMatches || !proof.bodyMatches || !proof.authorMatches) {
      throw new CliError('OUTCOME_UNKNOWN', 'Published Zhihu article proof did not match the requested title/body or current author');
    }

    return buildResultRow(`Published Zhihu article \"${title}\"`, 'article', title, 'created', {
      created_target: proof.createdTarget,
      created_url: proof.createdUrl,
      author_identity: authorIdentity,
    });
  },
});