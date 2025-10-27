/**
 * Helpers for rendering reasoning/thinking content.
 */

export function processMainContentMarkdown(mainText) {
  let html = mainText;

  if (html.split('```').length % 2 === 0) {
    html += '\n```';
  }

  const backtickCount = (html.match(/`/g) || []).length;
  if (backtickCount % 2 !== 0 && html.endsWith('`')) {
    html += '`';
  }

  if (typeof marked === 'undefined' && typeof window.loadMarkedLibrary === 'function') {
    window.loadMarkedLibrary();
  }
  let parsedContent = typeof marked !== 'undefined'
    ? (window.sanitizeWithYouTube ? window.sanitizeWithYouTube(marked.parse(html)) : DOMPurify.sanitize(marked.parse(html)))
    : DOMPurify.sanitize(html);

  parsedContent = parsedContent.replace(/\[\[IMAGE: ([^\]]+)\]\]/g, (match, filename) => {
    return `<span class="hidden-image-placeholder">${match}</span>`;
  });

  return parsedContent;
}
