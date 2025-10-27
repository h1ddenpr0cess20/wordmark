window.shouldSkipTts = function(messageId) {
  const messageElement = document.getElementById(`message-${messageId}`) || document.getElementById(messageId);
  if (!messageElement) {
    return true;
  }

  if (messageElement.classList.contains('system-message')) {
    if (window.VERBOSE_LOGGING) {
      console.info('Skipping TTS for system message or message with trigger keywords');
    }
    return true;
  }

  const messageText = messageElement.querySelector('.message-text')?.innerText || '';

  const triggerKeywords = [
    'tool_code\nprint(',
    'tool_code\nconsole.',
    'tool_code\nwindow.',
    '\n```python',
    '\n```javascript',
    '\n```json',
    '\n```bash',
    '\n```terminal',
    '\n```text',
    '\n```',
    '<tool_code>',
    '</tool_code>',
    '<tool_code_output>',
    '</tool_code_output>',
  ];

  for (const keyword of triggerKeywords) {
    if (messageText.includes(keyword)) {
      if (window.VERBOSE_LOGGING) {
        console.info('Skipping TTS for system message or message with trigger keywords');
      }
      return true;
    }
  }

  return false;
};

