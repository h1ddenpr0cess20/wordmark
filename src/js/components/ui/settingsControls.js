window.updatePromptVisibility = function() {
  const personalityContainer = document.getElementById('personality-container');
  const customPromptContainer = document.getElementById('custom-prompt-container');
  const noPromptContainer = document.getElementById('no-prompt-container');

  if (window.personalityPromptRadio?.checked) {
    if (personalityContainer) {
      personalityContainer.style.display = 'block';
    }
    if (customPromptContainer) {
      customPromptContainer.style.display = 'none';
    }
    if (noPromptContainer) {
      noPromptContainer.style.display = 'none';
    }
  } else if (window.customPromptRadio?.checked) {
    if (personalityContainer) {
      personalityContainer.style.display = 'none';
    }
    if (customPromptContainer) {
      customPromptContainer.style.display = 'block';
    }
    if (noPromptContainer) {
      noPromptContainer.style.display = 'none';
    }
  } else if (window.noPromptRadio?.checked) {
    if (personalityContainer) {
      personalityContainer.style.display = 'none';
    }
    if (customPromptContainer) {
      customPromptContainer.style.display = 'none';
    }
    if (noPromptContainer) {
      noPromptContainer.style.display = 'block';
    }
  }
};

window.updateParameterControls = function() {
  const currentService = window.config?.defaultService;
  const isLmStudio = currentService === 'lmstudio';

  const refreshButton = document.getElementById('refresh-lmstudio-models');
  const refreshInfo = document.querySelector('.lmstudio-refresh-info');

  if (refreshButton) {
    refreshButton.style.display = isLmStudio ? 'flex' : 'none';
  }

  if (refreshInfo) {
    refreshInfo.style.display = isLmStudio ? 'block' : 'none';
  }
};

