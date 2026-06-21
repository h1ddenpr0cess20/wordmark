/**
 * Chat export format registry.
 *
 * @remarks
 * Defines the supported export formats (txt, md, html, json, csv) and their
 * serializers, plus the alias resolution used to map user-facing names and file
 * extensions to canonical keys. The export controller in {@link ./export.ts}
 * normalizes conversation history and drives these builders.
 */

import { marked } from "marked";
import { escapeHtml, sanitizeWithMedia } from "../utils/sanitize.ts";
import chatExportStyles from "../../css/components/features/export/chat-export.css?raw";
import chatExportTemplate from "../../html/chat-export.html?raw";

/**
 * Theme CSS custom properties captured from the live app and replayed into the
 * HTML export so it mirrors the on-screen chat under the user's selected theme.
 */
export const THEME_EXPORT_VARS = [
  "--bg-primary", "--bg-secondary", "--bg-hover",
  "--text-primary", "--text-secondary",
  "--border-color", "--border-color-rgb",
  "--accent-color", "--accent-color-rgb", "--accent-hover",
  "--button-text-color",
  "--user-bg", "--assistant-bg",
  "--code-bg", "--code-border", "--code-text",
  "--code-inline-bg", "--code-inline-border",
] as const;

/** Light-theme fallbacks used when a theme variable wasn't captured (e.g. headless export). */
const THEME_FALLBACKS: Record<string, string> = {
  "--bg-primary": "#ffffff",
  "--bg-secondary": "#f4f5f8",
  "--bg-hover": "#eceef3",
  "--text-primary": "#1f2330",
  "--text-secondary": "#5b6170",
  "--border-color": "#e2e5ec",
  "--border-color-rgb": "226, 229, 236",
  "--accent-color": "#4f46e5",
  "--accent-color-rgb": "79, 70, 229",
  "--accent-hover": "#6366f1",
  "--button-text-color": "#ffffff",
  "--user-bg": "#eef1ff",
  "--assistant-bg": "#ffffff",
  "--code-bg": "#0f172a",
  "--code-border": "#1e293b",
  "--code-text": "#e2e8f0",
  "--code-inline-bg": "#eef0f6",
  "--code-inline-border": "#dfe2ea",
};

/** Per-export metadata shared with every format builder. */
export interface ExportMeta {
  iso: string;
  /** Captured theme CSS variables (see {@link THEME_EXPORT_VARS}); absent values fall back. */
  theme?: Record<string, string>;
}

/** Renders markdown to sanitized HTML using the same pipeline as the live chat. */
function renderMarkdown(text: string): string {
  if (!text) {
    return "";
  }
  const html = marked.parse(text, { async: false }) as string;
  return sanitizeWithMedia(html);
}

/** Emits a `:root` block defining every export theme variable, captured value or fallback. */
function buildThemeRoot(theme?: Record<string, string>): string {
  const declarations = THEME_EXPORT_VARS
    .map((name) => `        ${name}: ${(theme && theme[name]) || THEME_FALLBACKS[name]};`)
    .join("\n");
  return `:root {\n${declarations}\n      }`;
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

/**
 * Quotes and escapes a value for inclusion in a CSV cell, neutralizing
 * spreadsheet formula injection by prefixing a leading `= + - @` (non-numeric)
 * with an apostrophe so tools like Excel treat it as text.
 */
function formatCsvValue(value: unknown) {
  const stringValue = value === null || value === undefined ? "" : String(value);
  const guarded = /^[=+\-@\t\r]/.test(stringValue) && !/^-?\d/.test(stringValue)
    ? `'${stringValue}`
    : stringValue;
  const escaped = guarded.replace(/"/g, "\"\"");
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
        const roleClass = msg.role === "user" ? "user" : msg.role === "assistant" ? "assistant" : "other";
        const initial = escapeHtml((msg.senderLabel || "?").trim().charAt(0).toUpperCase() || "?");
        const timestampHtml = msg.timestamp
          ? `<span class="timestamp">${escapeHtml(msg.timestamp)}</span>`
          : "";
        const contentHtml = msg.content
          ? renderMarkdown(msg.content)
          : "<p class=\"empty\"><em>No content</em></p>";
        let reasoningHtml = "";
        if (includeThinking && msg.reasoning.length > 0) {
          const reasoningBody = msg.reasoning.map((segment) => renderMarkdown(segment)).join("\n");
          reasoningHtml = `<details class="reasoning"><summary>Reasoning</summary><div class="reasoning-body">${reasoningBody}</div></details>`;
        }
        return `
        <article class="message ${roleClass}">
          <div class="avatar" aria-hidden="true">${initial}</div>
          <div class="bubble">
            <div class="meta"><span class="sender">${escapeHtml(msg.senderLabel)}</span>${timestampHtml}</div>
            <div class="content">${contentHtml}</div>
            ${reasoningHtml}
          </div>
        </article>`;
      }).join("\n");
      const substitutions: Record<string, string> = {
        "{{themeRoot}}": buildThemeRoot(meta.theme),
        "{{styles}}": chatExportStyles,
        "{{iso}}": escapeHtml(meta.iso),
        "{{messages}}": messageSections,
      };
      return chatExportTemplate.replace(/\{\{(?:themeRoot|styles|iso|messages)\}\}/g, (token) => substitutions[token]);
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
