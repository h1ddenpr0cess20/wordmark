/**
 * Helpers for rendering reasoning/thinking content.
 */

import { initializeMarked } from "../../init/marked.js";
import { sanitizeWithMedia } from "../../utils/sanitize.js";

export function processMainContentMarkdown(mainText) {
  let html = mainText;

  if (html.split('```').length % 2 === 0) {
    html += '\n```';
  }

  const backtickCount = (html.match(/`/g) || []).length;
  if (backtickCount % 2 !== 0 && html.endsWith('`')) {
    html += '`';
  }

  if (typeof marked === 'undefined') {
    initializeMarked();
  }
  let parsedContent = typeof marked !== 'undefined'
    ? sanitizeWithMedia(marked.parse(html))
    : DOMPurify.sanitize(html);

  parsedContent = parsedContent.replace(/\[\[IMAGE: ([^\]]+)\]\]/g, (match, filename) => {
    return `<span class="hidden-image-placeholder">${match}</span>`;
  });

  return parsedContent;
}

export function separateThinkingSegments(text) {
  if (typeof text !== 'string' || !text) {
    return { content: text || '', reasoning: '' };
  }

  const lower = text.toLowerCase();
  const openTag = '<think>';
  const closeTag = '</think>';
  const contentParts = [];
  const reasoningParts = [];
  let cursor = 0;
  let inThinking = false;

  while (cursor < text.length) {
    if (!inThinking) {
      const openIndex = lower.indexOf(openTag, cursor);
      if (openIndex === -1) {
        contentParts.push(text.slice(cursor));
        break;
      }
      if (openIndex > cursor) {
        contentParts.push(text.slice(cursor, openIndex));
      }
      cursor = openIndex + openTag.length;
      inThinking = true;
    } else {
      const closeIndex = lower.indexOf(closeTag, cursor);
      if (closeIndex === -1) {
        reasoningParts.push(text.slice(cursor));
        cursor = text.length;
        break;
      }
      if (closeIndex > cursor) {
        reasoningParts.push(text.slice(cursor, closeIndex));
      }
      cursor = closeIndex + closeTag.length;
      inThinking = false;
    }
  }

  return {
    content: contentParts.join(''),
    reasoning: reasoningParts.join(''),
  };
}
