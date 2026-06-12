/**
 * HTML sanitization helpers built on DOMPurify.
 *
 * Allows YouTube iframes and external image embeds while stripping unsafe
 * markup, then post-processes the result to secure media elements.
 */

import DOMPurify from "dompurify";

/** Base DOMPurify allowlist permitting common markup plus YouTube iframes and media tags. */
const DOMPURIFY_CONFIG = {
  ALLOWED_TAGS: [
    "a", "abbr", "acronym", "address", "area", "article", "aside", "audio", "b", "bdi", "bdo", "big", "blockquote", "body", "br", "button", "canvas", "caption", "center", "cite", "code", "col", "colgroup", "data", "datalist", "dd", "del", "details", "dfn", "dialog", "dir", "div", "dl", "dt", "em", "fieldset", "figcaption", "figure", "font", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6", "head", "header", "hgroup", "hr", "html", "i", "img", "input", "ins", "kbd", "label", "legend", "li", "main", "map", "mark", "menu", "menuitem", "meter", "nav", "ol", "optgroup", "option", "output", "p", "pre", "progress", "q", "rp", "rt", "ruby", "s", "samp", "section", "select", "small", "source", "span", "strike", "strong", "sub", "summary", "sup", "table", "tbody", "td", "textarea", "tfoot", "th", "thead", "time", "title", "tr", "track", "tt", "u", "ul", "var", "video", "wbr",
    "iframe",
  ],
  ALLOWED_ATTR: [
    "accept", "align", "alt", "autocomplete", "background", "bgcolor", "border", "cellpadding", "cellspacing", "charset", "cite", "class", "clear", "color", "cols", "colspan", "content", "contenteditable", "controls", "coords", "data", "datetime", "default", "dir", "disabled", "download", "draggable", "enctype", "for", "form", "frameborder", "headers", "height", "hidden", "high", "href", "hreflang", "id", "inputmode", "is", "ismap", "itemid", "itemprop", "itemref", "itemscope", "itemtype", "kind", "label", "lang", "list", "loop", "low", "max", "maxlength", "media", "method", "min", "minlength", "multiple", "name", "noshade", "novalidate", "nowrap", "open", "optimum", "pattern", "placeholder", "poster", "preload", "pubdate", "radiogroup", "readonly", "rel", "required", "rev", "role", "rows", "rowspan", "spellcheck", "scope", "selected", "shape", "size", "span", "srclang", "start", "step", "style", "summary", "tabindex", "target", "title", "type", "usemap", "valign", "value", "width", "wrap",
    "src", "allowfullscreen", "frameborder", "allow",
  ],
  ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|cid|xmpp|https:\/\/www\.youtube\.com\/embed\/|https:\/\/www\.youtube-nocookie\.com\/embed\/):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
  ADD_TAGS: [],
  ADD_ATTR: [],
  FORBID_TAGS: ["script", "object", "embed", "link"],
  FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover"],
  ALLOW_DATA_ATTR: false,
};

/**
 * Sanitizes HTML with DOMPurify using a media-friendly allowlist that permits
 * YouTube iframes and external images while blocking scripts and event handlers.
 */
export function sanitizeWithMedia(html: string) {
  const config = {
    ...DOMPURIFY_CONFIG,
    ALLOW_UNKNOWN_PROTOCOLS: false,
    ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|cid|xmpp|data):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
  };

  const sanitized = DOMPurify.sanitize(html, config);

  const tempDiv = document.createElement("div");
  tempDiv.innerHTML = sanitized;

  const iframes = tempDiv.querySelectorAll("iframe");
  iframes.forEach((iframe) => {
    const src = iframe.getAttribute("src");
    if (src && !(/^https:\/\/(www\.)?(youtube\.com\/embed\/|youtube-nocookie\.com\/embed\/)/.test(src))) {
      iframe.remove();
    } else if (src) {
      iframe.setAttribute("allowfullscreen", "");
      iframe.setAttribute("frameborder", "0");
      iframe.setAttribute("allow", "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture");
    }
  });
  const images = tempDiv.querySelectorAll("img");
  images.forEach((img) => {
    const src = img.getAttribute("src");
    if (src) {
      if (/^https:\/\//.test(src) || /^data:image\//.test(src) || /^\//.test(src) || /^\./.test(src)) {
        img.setAttribute("referrerpolicy", "no-referrer");
        img.setAttribute("crossorigin", "anonymous");
        img.setAttribute("loading", "lazy");
        img.classList.add("expandable-image");
        img.style.cursor = "pointer";
      } else if (/^http:\/\//.test(src)) {
        img.setAttribute("src", src.replace(/^http:\/\//, "https://"));
        img.setAttribute("referrerpolicy", "no-referrer");
        img.setAttribute("crossorigin", "anonymous");
        img.setAttribute("loading", "lazy");
        img.classList.add("expandable-image");
        img.style.cursor = "pointer";
      } else {
        img.remove();
      }
    }
  });

  return tempDiv.innerHTML;
}

/** Escapes HTML-special characters in a value for safe interpolation into markup. */
export function escapeHtml(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
