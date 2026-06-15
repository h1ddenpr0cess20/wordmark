/**
 * Chat export format registry.
 *
 * @remarks
 * Defines the supported export formats (txt, md, html, json, csv) and their
 * serializers, plus the alias resolution used to map user-facing names and file
 * extensions to canonical keys. The export controller in {@link ./export.ts}
 * normalizes conversation history and drives these builders.
 */

import { escapeHtml } from "../utils/sanitize.ts";

/** Per-export metadata shared with every format builder. */
export interface ExportMeta {
  iso: string;
}

/** A conversation message normalised into the shape the format builders consume. */
export interface ExportMessage {
  role: string;
  senderLabel: string;
  content: string;
  rawContent: string;
  reasoning: string[];
  timestamp: string;
}

/** A registered export format and its serializer. */
export interface ExportFormat {
  extension: string;
  mime: string;
  build(messages: ExportMessage[], includeThinking: boolean, meta: ExportMeta): string;
}

/** Maps user-facing format names and extensions to canonical format keys. */
const EXPORT_FORMAT_ALIASES: Record<string, string> = {
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

/** Quotes and escapes a value for inclusion in a CSV cell. */
function formatCsvValue(value: unknown) {
  const stringValue = value === null || value === undefined ? "" : String(value);
  const escaped = stringValue.replace(/"/g, "\"\"");
  return `"${escaped}"`;
}

/** Registered export formats keyed by canonical format key. */
export const EXPORT_FORMATS: Record<string, ExportFormat> = {
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
    build(messages, includeThinking) {
      const payload = messages.map((msg) => {
        const entry: Record<string, unknown> = {
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
    build(messages, includeThinking) {
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

/** Resolves an alias or extension to a canonical format key, or `null`. */
export function normaliseExportFormat(input: string | null): string | null {
  if (!input) {
    return null;
  }
  const key = input.trim().toLowerCase();
  return EXPORT_FORMAT_ALIASES[key] || null;
}
