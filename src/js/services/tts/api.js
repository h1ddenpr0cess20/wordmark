import { ttsConfig } from "./config.js";

export async function generateSpeech(text) {
  if (!ttsConfig.enabled) {
    return null;
  }

  try {
    const provider = ttsConfig.provider || "openai";

    if (provider === "xai") {
      return await generateSpeechXai(text);
    }
    return await generateSpeechOpenai(text);
  } catch (error) {
    console.error("TTS generation error:", error);
    return null;
  }
}

async function generateSpeechOpenai(text) {
  const openaiApiKey = window.config.services.openai?.apiKey;

  if (!openaiApiKey) {
    console.error("OpenAI API key not found for TTS. Please ensure your OpenAI API key is configured.");
    return null;
  }

  let instructions = ttsConfig.instructions || "";

  if (!instructions && window.personalityPromptRadio?.checked &&
      window.personalityInput?.value.trim() !== "" &&
      window.personalityInput?.getAttribute("data-explicitly-set") === "true") {
    instructions = `Assume the personality of ${window.personalityInput.value.trim()}. Roleplay and never break character.  Do not read code blocks that appear between backticks or other non-speech content such as emotes which appear between asterisks in *italics* like that.`;
  }

  if (!instructions) {
    instructions = "Speak in a natural, conversational tone.";
  }

  const requestBody = {
    model: "gpt-4o-mini-tts",
    input: text,
    voice: ttsConfig.voice,
    instructions,
    response_format: "wav",
  };

  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    let errorDetails = "";
    try {
      const errorData = await response.json();
      errorDetails = errorData.error?.message || JSON.stringify(errorData);
    } catch {
      errorDetails = `HTTP ${response.status} - ${response.statusText}`;
    }
    throw new Error(`TTS API request failed: ${errorDetails}`);
  }

  return await response.arrayBuffer();
}

async function generateSpeechXai(text) {
  const xaiApiKey = window.config.services.xai?.apiKey;

  if (!xaiApiKey) {
    console.error("xAI API key not found for TTS. Please ensure your xAI API key is configured.");
    return null;
  }

  const requestBody = {
    text,
    voice_id: ttsConfig.voice,
    language: "auto",
    output_format: {
      codec: "wav",
      sample_rate: 24000,
    },
  };

  const response = await fetch("https://api.x.ai/v1/tts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${xaiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    let errorDetails = "";
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
