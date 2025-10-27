/**
 * Chat export functionality
 */

// -----------------------------------------------------
// Export functions
// -----------------------------------------------------

const EXPORT_FORMAT_ALIASES = {
  txt: "txt",
  text: "txt",
  plaintext: "txt",
  md: "md",
  markdown: "md",
  html: "html",
  htm: "html",
  json: "json",
  csv: "csv",
};

const EXPORT_FORMATS = {
  txt: {
    extension: "txt",
    mime: "text/plain",
    build(messages, includeThinking, meta) {
      const sections = messages.map((msg) => {
        const lines = [`${msg.senderLabel}:`];
        if (msg.content) {
          lines.push(msg.content);
        }
        if (includeThinking && msg.reasoning.length > 0) {
          lines.push("Reasoning:");
          lines.push(msg.reasoning.join("\n\n"));
        }
        return lines.join("\n").trim();
      });
      const header = `Chat Export (${meta.iso})`;
      return [header, ...sections].filter(Boolean).join("\n\n").trim();
    },
  },
  md: {
    extension: "md",
    mime: "text/markdown",
    build(messages, includeThinking, meta) {
      const sections = messages.map((msg) => {
        const parts = [`### ${msg.senderLabel}`];
        if (msg.timestamp) {
          parts.push(`*${msg.timestamp}*`);
        }
        if (msg.content) {
          parts.push(msg.content);
        }
        if (includeThinking && msg.reasoning.length > 0) {
          parts.push("#### Reasoning");
          parts.push(msg.reasoning.join("\n\n"));
        }
        return parts.filter(Boolean).join("\n\n").trim();
      });
      const header = `# Chat Export (${meta.iso})`;
      return [header, ...sections].filter(Boolean).join("\n\n").trim();
    },
  },
  html: {
    extension: "html",
    mime: "text/html",
    build(messages, includeThinking, meta) {
      const messageSections = messages.map((msg) => {
        const timestampHtml = msg.timestamp
          ? `<div class="chat-timestamp">${escapeHtml(msg.timestamp)}</div>`
          : "";
        const contentHtml = msg.content
          ? escapeHtml(msg.content).replace(/\n/g, "<br>")
          : "<em>No content</em>";
        let reasoningHtml = "";
        if (includeThinking && msg.reasoning.length > 0) {
          const reasoningBlocks = msg.reasoning
            .map((segment) => `<p>${escapeHtml(segment).replace(/\n/g, "<br>")}</p>`)
            .join("\n");
          reasoningHtml = `<div class="chat-reasoning"><h4>Reasoning</h4>${reasoningBlocks}</div>`;
        }
        return `
        <article class="chat-message">
          <h3>${escapeHtml(msg.senderLabel)}</h3>
          ${timestampHtml}
          <div class="chat-content">${contentHtml}</div>
          ${reasoningHtml}
        </article>
        `;
      }).join("\n");
      return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>Chat Export</title>
    <style>
      body { font-family: "Segoe UI", Arial, sans-serif; padding: 24px; background-color: #fafafa; color: #222; }
      h1 { margin-bottom: 24px; }
      .chat-message { background: #fff; border-radius: 12px; padding: 16px; margin-bottom: 16px; box-shadow: 0 2px 4px rgba(0,0,0,0.08); }
      .chat-content { margin-top: 8px; white-space: pre-wrap; }
      .chat-timestamp { font-size: 0.85rem; color: #666; margin-top: 4px; }
      .chat-reasoning { margin-top: 12px; padding: 12px; background: #f4f6fc; border-radius: 8px; border: 1px solid #d9e1ff; }
      .chat-reasoning h4 { margin: 0 0 8px 0; }
    </style>
  </head>
  <body>
    <h1>Chat Export (${meta.iso})</h1>
    ${messageSections}
  </body>
</html>`;
    },
  },
  json: {
    extension: "json",
    mime: "application/json",
    build(messages, includeThinking, _meta) {
      const payload = messages.map((msg) => {
        const entry = {
          role: msg.role,
          sender: msg.senderLabel,
          content: includeThinking ? msg.rawContent : msg.content,
          timestamp: msg.timestamp || undefined,
        };
        if (includeThinking && msg.reasoning.length > 0) {
          entry.reasoning = msg.reasoning;
        }
        return entry;
      });
      return JSON.stringify(payload, null, 2);
    },
  },
  csv: {
    extension: "csv",
    mime: "text/csv",
    build(messages, includeThinking, _meta) {
      const header = ["role", "sender", "content", "reasoning", "timestamp"];
      const rows = messages.map((msg) => {
        const content = includeThinking ? msg.rawContent : msg.content;
        const reasoning = includeThinking && msg.reasoning.length > 0
          ? msg.reasoning.join(" | ")
          : "";
        return [
          msg.role,
          msg.senderLabel,
          content,
          reasoning,
          msg.timestamp || "",
        ];
      });
      const csvLines = [header, ...rows].map((row) => row.map(formatCsvValue).join(","));
      return csvLines.join("\n");
    },
  },
};

function normaliseExportFormat(input) {
  if (!input) {
    return null;
  }
  const key = input.trim().toLowerCase();
  return EXPORT_FORMAT_ALIASES[key] || null;
}

function formatCsvValue(value) {
  const stringValue = value === null || value === undefined ? "" : String(value);
  const escaped = stringValue.replace(/"/g, "\"\"");
  return `"${escaped}"`;
}

function escapeHtml(value) {
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

function separateThinkingSegments(text) {
  // Thinking filters disabled - responses API provides reasoning separately
  // No longer need to parse/filter <think> tags from content
  const thinkingSegments = [];
  if (typeof text !== "string") {
    return { stripped: "", thinking: thinkingSegments };
  }
  // Return text as-is without filtering
  return { stripped: text.trim(), thinking: thinkingSegments };
}

function normaliseMessagesForExport(history) {
  if (!Array.isArray(history)) {
    return [];
  }
  return history
    .filter((msg) => msg && msg.role && msg.role !== "system")
    .map((msg) => {
      const baseContent = typeof msg.content === "string"
        ? msg.content
        : JSON.stringify(msg.content, null, 2);
      const { stripped, thinking } = separateThinkingSegments(baseContent || "");
      const reasoningParts = [];

      if (Array.isArray(msg.reasoning)) {
        msg.reasoning.forEach((part) => {
          if (typeof part === "string" && part.trim()) {
            reasoningParts.push(part.trim());
          }
        });
      } else if (typeof msg.reasoning === "string" && msg.reasoning.trim()) {
        reasoningParts.push(msg.reasoning.trim());
      }

      if (thinking.length > 0) {
        reasoningParts.push(...thinking);
      }

      const seenReasoning = new Set();
      const dedupedReasoning = [];
      reasoningParts.forEach((part) => {
        const key = part;
        if (!seenReasoning.has(key)) {
          seenReasoning.add(key);
          dedupedReasoning.push(part);
        }
      });

      return {
        role: msg.role,
        senderLabel: msg.role === "user" ? "You" : "Assistant",
        content: stripped,
        rawContent: (baseContent || "").trim(),
        reasoning: dedupedReasoning,
        timestamp: msg.timestamp || "",
      };
    });
}

function getStoredExportFormat() {
  const stored = typeof localStorage !== "undefined" ? localStorage.getItem("chatExportFormat") : null;
  return normaliseExportFormat(stored) || "md";
}

function persistExportFormatPreference(formatKey) {
  if (typeof localStorage === "undefined") {
    return;
  }
  try {
    localStorage.setItem("chatExportFormat", formatKey);
  } catch (error) {
    console.warn("Unable to persist export format preference:", error);
  }
}

function resolveSelectedExportFormat() {
  const selectValue = window.exportFormatSelector ? window.exportFormatSelector.value : null;
  const normalised = normaliseExportFormat(selectValue);
  if (normalised && EXPORT_FORMATS[normalised]) {
    return normalised;
  }
  const fallback = getStoredExportFormat();
  if (EXPORT_FORMATS[fallback]) {
    return fallback;
  }
  return "md";
}

window.handleExportFormatChange = function(event) {
  const value = event && event.target ? event.target.value : null;
  const formatKey = normaliseExportFormat(value);
  if (!formatKey || !EXPORT_FORMATS[formatKey]) {
    return;
  }
  persistExportFormatPreference(formatKey);
  if (event && event.target && event.target.value !== formatKey) {
    event.target.value = formatKey;
  }
};

window.initializeExportControls = function() {
  if (!window.exportFormatSelector) {
    return;
  }
  const stored = getStoredExportFormat();
  const effective = EXPORT_FORMATS[stored] ? stored : "md";
  window.exportFormatSelector.value = effective;
};

/**
 * Exports the current chat conversation to a user-selected format
 */
window.exportChat = function() {
  const formatKey = resolveSelectedExportFormat();
  const formatConfig = EXPORT_FORMATS[formatKey];
  if (!formatConfig) {
    console.error("Unsupported export format selected:", formatKey);
    return;
  }

  persistExportFormatPreference(formatKey);

  const includeThinkingCheckbox = document.getElementById("include-thinking");
  const includeThinking = includeThinkingCheckbox ? includeThinkingCheckbox.checked : false;

  const normalisedMessages = normaliseMessagesForExport(window.conversationHistory);
  if (normalisedMessages.length === 0) {
    console.warn("Export skipped: no conversation history available yet.");
    return;
  }

  const exportMeta = { iso: new Date().toISOString() };
  const exportContent = formatConfig.build(normalisedMessages, includeThinking, exportMeta);

  const blob = new Blob([exportContent], { type: formatConfig.mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `chat-export-${new Date().toISOString().slice(0, 10)}.${formatConfig.extension}`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
};
