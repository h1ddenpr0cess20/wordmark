/**
 * TTS content filters.
 */

import { logVerbose } from "../../utils/logger.ts";

/**
 * Reports whether a message should be skipped for TTS: missing, a system
 * message, or containing code/tool-output markers that would read poorly aloud.
 */
export function shouldSkipTts(messageId: string) {
  const messageElement = document.getElementById(`message-${messageId}`) || document.getElementById(messageId);
  if (!messageElement) {
    return true;
  }

  if (messageElement.classList.contains("system-message")) {
    logVerbose("Skipping TTS for system message");
    return true;
  }

  const messageText = messageElement.querySelector<HTMLElement>(".message-text")?.innerText || "";

  const triggerKeywords = [
    "tool_code\nprint(",
    "tool_code\nconsole.",
    "tool_code\nwindow.",
    "\n```python",
    "\n```javascript",
    "\n```json",
    "\n```bash",
    "\n```terminal",
    "\n```text",
    "\n```",
    "<tool_code>",
    "</tool_code>",
    "<tool_code_output>",
    "</tool_code_output>",
  ];

  for (const keyword of triggerKeywords) {
    if (messageText.includes(keyword)) {
      logVerbose(`Skipping TTS for message with code/tool-output marker: ${JSON.stringify(keyword)}`);
      return true;
    }
  }

  return false;
};

