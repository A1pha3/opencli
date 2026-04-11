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
      const readValue = (node) => 'value' in node ? (node.value || '') : (node.innerText || node.textContent || '');
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
      const newline = String.fromCharCode(10);
      const readRichTextValue = (root) => {
        if (!root) return '';
        const blockTags = new Set(['P', 'DIV', 'LI', 'BLOCKQUOTE', 'PRE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6']);
        const readInline = (node) => {
          if (!node) return '';
          if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';
          if (node.nodeType !== Node.ELEMENT_NODE) return '';
          if (node.tagName === 'BR') return newline;
          return Array.from(node.childNodes || []).map(readInline).join('');
        };
        const readBlock = (node) => {
          if (!node) return '';
          if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';
          if (node.nodeType !== Node.ELEMENT_NODE) return '';
          if (node.tagName === 'UL' || node.tagName === 'OL') {
            return Array.from(node.children || []).map(readBlock).join(newline);
          }
          return Array.from(node.childNodes || []).map(readInline).join('');
        };
        const childNodes = Array.from(root.childNodes || []);
        const hasBlockChildren = childNodes.some((node) => node.nodeType === Node.ELEMENT_NODE && blockTags.has(node.tagName));
        if (!hasBlockChildren) {
          return Array.from(childNodes).map(readInline).join('') || root.textContent || '';
        }
        return childNodes.map(readBlock).join(newline);
      };
      const readControlValue = (node) => {
        if (!node) return '';
        if ('value' in node) return node.value || '';
        return readRichTextValue(node) || node.textContent || '';
      };
      const crlf = String.fromCharCode(13) + String.fromCharCode(10);
      const nbsp = String.fromCharCode(160);
      const zeroWidthSpace = String.fromCharCode(8203);
      const normalize = (value) => String(value || '')
        .split(crlf).join(newline)
        .split(nbsp).join(' ')
        .split(zeroWidthSpace).join('')
        .trim();
      const normalizeForComparison = (value) => normalize(value).replace(/\\s+/g, ' ');
      const titleNode = Array.from(document.querySelectorAll(titleSelector)).find(isVisible);
      const bodyNode = Array.from(document.querySelectorAll(bodySelector)).find((node) => isVisible(node) && !node.closest('.WriteIndex-titleInput'));
      if (!titleNode || !bodyNode) return { titleMatches: false, bodyMatches: false, titleValue: '', bodyValue: '' };
      setControlValue(titleNode, titleText);
      setControlValue(bodyNode, bodyText);
      const titleValue = readControlValue(titleNode);
      const bodyValue = readControlValue(bodyNode);
      return {
        titleValue,
        bodyValue,
        titleMatches: normalize(titleValue) === normalize(titleText),
        bodyMatches: normalizeForComparison(bodyValue) === normalizeForComparison(bodyText),
      };
    })()` ) as { titleValue?: string; bodyValue?: string; titleMatches?: boolean; bodyMatches?: boolean };

    if (!fillState.titleMatches || !fillState.bodyMatches) {
      throw new CliError('OUTCOME_UNKNOWN', 'Zhihu article editor content did not exactly match the requested title/body before publish');
    }

    let publishLanding: {
      currentUrl?: string | null;
      articleUrl?: string | null;
      articleId?: string | null;
      isEditUrl?: boolean;
    } = {};
    let publishTriggered = false;

    for (let publishAttempt = 0; publishAttempt < 3; publishAttempt += 1) {
      const publishAction = await page.evaluate(`(() => {
        const isVisible = (node) => {
          if (!node) return false;
          const rect = node.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        };
        const findPublishButton = (scope = document) => Array.from(scope.querySelectorAll('button')).find((node) => {
          const text = (node.textContent || '').trim();
          return text === '发布' || text === '确认发布' || text === '立即发布' || text === '确认并发布';
        });
        const publishButton = findPublishButton();
        if (!publishButton) return { publishTriggered: false, currentUrl: location.href };
        publishButton.click();
        const dialog = Array.from(document.querySelectorAll('[role="dialog"], .Modal, .Popover, .css-modal')).find(isVisible) || document;
        const confirmButton = findPublishButton(dialog);
        if (confirmButton && confirmButton !== publishButton) {
          confirmButton.click();
        }
        return { publishTriggered: true, currentUrl: location.href };
      })()` ) as { publishTriggered?: boolean; currentUrl?: string };

      if (!publishAction.publishTriggered) {
        if (publishTriggered) {
          break;
        }
        throw new CliError('ACTION_NOT_AVAILABLE', `Zhihu article publish button was not available at ${publishAction.currentUrl || PUBLISH_URL}`);
      }

      publishTriggered = true;
      let editObservedCount = 0;

      for (let attempt = 0; attempt < 20; attempt += 1) {
        publishLanding = await page.evaluate(`(() => {
          const resolveUrl = (href) => {
            if (!href) return null;
            try { return new URL(href, location.href).href; } catch { return href; }
          };
          const currentUrl = location.href;
          const editMatch = currentUrl.match(/zhuanlan\\.zhihu\\.com\\/p\\/(\\d+)\\/edit(?:[/?#]|$)/);
          const directMatch = currentUrl.match(/zhuanlan\\.zhihu\\.com\\/p\\/(\\d+)(?:[/?#]|$)/);
          const articleId = editMatch?.[1] || directMatch?.[1] || null;
          const linkedArticle = Array.from(document.querySelectorAll('a[href*="zhuanlan.zhihu.com/p/"], a[href^="/p/"]'))
            .map((node) => resolveUrl(node.getAttribute('href') || ''))
            .find((href) => typeof href === 'string' && /zhuanlan\\.zhihu\\.com\\/p\\/\\d+/.test(href)) || null;
          return {
            currentUrl,
            articleUrl: articleId ? ('https://zhuanlan.zhihu.com/p/' + articleId) : linkedArticle,
            articleId,
            isEditUrl: Boolean(editMatch),
          };
        })()` ) as {
          currentUrl?: string | null;
          articleUrl?: string | null;
          articleId?: string | null;
          isEditUrl?: boolean;
        };

        if (publishLanding.articleId && !publishLanding.isEditUrl) {
          break;
        }

        if (publishLanding.isEditUrl) {
          editObservedCount += 1;
          if (editObservedCount >= 3) {
            break;
          }
        } else {
          editObservedCount = 0;
        }

        await page.wait(0.75);
      }

      if (publishLanding.articleId && !publishLanding.isEditUrl) {
        break;
      }
    }

    if (publishLanding.articleUrl && publishLanding.currentUrl !== publishLanding.articleUrl) {
      await page.goto(publishLanding.articleUrl);
      await page.wait(2);
    }

    const proof = await page.evaluate(`(() => {
      const expectedTitle = ${JSON.stringify(title)};
      const expectedBody = ${JSON.stringify(payload)};
      const expectedAuthor = ${JSON.stringify(authorIdentity)};
      const crlf = String.fromCharCode(13) + String.fromCharCode(10);
      const newline = String.fromCharCode(10);
      const nbsp = String.fromCharCode(160);
      const normalize = (value) => String(value || '')
        .split(crlf).join(newline)
        .split(nbsp).join(' ')
        .replace(/\\s+/g, ' ')
        .trim();
      const resolveUrl = (href) => {
        if (!href) return null;
        try { return new URL(href, location.href).href; } catch { return href; }
      };
      const readAuthorSlug = () => {
        const links = Array.from(document.querySelectorAll('a[href^="/people/"], a[href*="zhihu.com/people/"]'))
          .map((node) => resolveUrl(node.getAttribute('href') || ''))
          .filter((href) => typeof href === 'string' && /zhihu\\.com\\/people\\//.test(href));
        const slugs = Array.from(new Set(links
          .map((href) => href.match(/\\/people\\/([A-Za-z0-9_-]+)/)?.[1] || null)
          .filter(Boolean)));
        return slugs.length === 1 ? slugs[0] : null;
      };
      const currentUrl = location.href;
      const directMatch = currentUrl.match(/zhuanlan\\.zhihu\\.com\\/p\\/(\\d+)/);
      const linkedArticle = Array.from(document.querySelectorAll('a[href*="zhuanlan.zhihu.com/p/"], a[href^="/p/"]'))
        .map((node) => resolveUrl(node.getAttribute('href') || ''))
        .find((href) => typeof href === 'string' && /zhuanlan\\.zhihu\\.com\\/p\\/\\d+/.test(href)) || null;
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