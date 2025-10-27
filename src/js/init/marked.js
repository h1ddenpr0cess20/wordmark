/**
 * Markdown (marked) initialization for the chatbot application
 */

/**
 * Initialize the marked library with custom configuration
 */
function initializeMarked() {
  // Create a custom renderer
  const renderer = new marked.Renderer();

  // Override the link renderer to add target="_blank" and rel="noopener noreferrer"
  renderer.link = function(href, title, text) {
    const link = marked.Renderer.prototype.link.call(this, href, title, text);
    return link.replace("<a", "<a target=\"_blank\" rel=\"noopener noreferrer\"");
  };

  // Configure marked with our custom renderer and other options
  marked.use({
    renderer: renderer,
    gfm: true,
    breaks: true, // Keep this change as it helps with line breaks
    pedantic: false,
  });

  // Provide a markdown-it-compatible shim so existing code can call window.markdownit().render(...)
  // This uses Marked under the hood.
  window.markdownit = function() {
    return {
      render: (src) => marked.parse(src),
    };
  };
}

// Make function available globally
window.initializeMarked = initializeMarked;
