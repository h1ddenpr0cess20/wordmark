window.generateSpeech = async function(text) {
  if (!this.ttsConfig.enabled) {
    return null;
  }

  try {
    const openaiApiKey = window.config.services.openai?.apiKey;

    if (!openaiApiKey) {
      console.error('OpenAI API key not found for TTS. Please ensure your OpenAI API key is configured.');
      return null;
    }

    let instructions = this.ttsConfig.instructions || '';

    if (!instructions && this.personalityPromptRadio?.checked &&
        this.personalityInput?.value.trim() !== '' &&
        this.personalityInput?.getAttribute('data-explicitly-set') === 'true') {
      instructions = `Assume the personality of ${this.personalityInput.value.trim()}. Roleplay and never break character.  Do not read code blocks that appear between backticks or other non-speech content such as emotes which appear between asterisks in *italics* like that.`;
    }

    if (!instructions) {
      instructions = 'Speak in a natural, conversational tone.';
    }

    const requestBody = {
      model: 'gpt-4o-mini-tts',
      input: text,
      voice: this.ttsConfig.voice,
      instructions,
      response_format: 'wav',
    };

    const headers = {
      Authorization: `Bearer ${openaiApiKey}`,
      'Content-Type': 'application/json',
    };

    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      let errorDetails = '';
      try {
        const errorData = await response.json();
        errorDetails = errorData.error?.message || JSON.stringify(errorData);
      } catch {
        errorDetails = `HTTP ${response.status} - ${response.statusText}`;
      }
      throw new Error(`TTS API request failed: ${errorDetails}`);
    }

    return await response.arrayBuffer();
  } catch (error) {
    console.error('TTS generation error:', error);
    return null;
  }
};

