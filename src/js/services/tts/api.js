window.generateSpeech = async function(text) {
  if (!this.ttsConfig.enabled) {
    return null;
  }

  try {
    return await generateSpeechXai(text);
  } catch (error) {
    console.error('TTS generation error:', error);
    return null;
  }
};

async function generateSpeechXai(text) {
  const xaiApiKey = window.config.services.xai?.apiKey;

  if (!xaiApiKey) {
    console.error('xAI API key not found for TTS. Please ensure your xAI API key is configured.');
    return null;
  }

  const requestBody = {
    text,
    voice_id: window.ttsConfig.voice,
    language: 'auto',
    output_format: {
      codec: 'wav',
      sample_rate: 24000,
    },
  };

  const response = await fetch('https://api.x.ai/v1/tts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${xaiApiKey}`,
      'Content-Type': 'application/json',
    },
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
    throw new Error(`xAI TTS API request failed: ${errorDetails}`);
  }

  return await response.arrayBuffer();
}
