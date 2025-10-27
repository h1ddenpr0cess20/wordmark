export function initializeConversationInput() {
  if (!window.userInput || !window.sendButton) {
    return;
  }

  window.userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!window.activeAbortController && !window.isResponsePending) {
        window.sendMessage();
      } else {
        console.info('Message sending prevented - generation in progress');
      }
    }
  });

  window.sendButton.addEventListener('click', window.sendMessage);

  const svgSelectors = '#settings-button svg, #history-button svg, #gallery-button svg, .close-settings svg, .close-history svg, .close-gallery svg';
  document.querySelectorAll(svgSelectors).forEach((svg) => {
    svg.addEventListener('click', (event) => {
      event.stopPropagation();
      const parentButton = event.currentTarget.closest('button');
      if (parentButton) {
        parentButton.click();
      }
    });
  });

  window.userInput.addEventListener('input', () => {
    window.userInput.style.height = '56px';
    window.userInput.style.height = `${Math.max(56, window.userInput.scrollHeight)}px`;
  });

  if (window.galleryButton) {
    const firstGalleryClick = async(event) => {
      event.preventDefault();
      if (typeof window.loadGalleryModule === 'function') {
        await window.loadGalleryModule();
      }
      if (typeof window.initGallery === 'function') {
        window.initGallery();
      }
      window.galleryButton.removeEventListener('click', firstGalleryClick);
      window.galleryButton.click();
    };
    window.galleryButton.addEventListener('click', firstGalleryClick, { once: true });
  }
}

