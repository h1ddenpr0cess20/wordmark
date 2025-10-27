window.initTtsReferences = function(refs) {
  this.ttsToggle = refs.ttsToggle;
  this.ttsAutoplayToggle = refs.ttsAutoplayToggle;
  this.ttsVoiceSelector = refs.ttsVoiceSelector;
  this.ttsInstructionsInput = refs.ttsInstructionsInput;
  this.personalityInput = refs.personalityInput;
  this.personalityPromptRadio = refs.personalityPromptRadio;

  if (this.ttsVoiceSelector) {
    this.ttsVoiceSelector.addEventListener('change', (event) => {
      window.ttsConfig.voice = event.target.value;
    });
  } else {
    console.warn('ttsVoiceSelector not found during initialization');
  }
};

