/**
 * The left rail: brand, new-chat, recent conversations, panel buttons and the
 * service status line.
 *
 * @remarks
 * The recent list is a compact view of the same IndexedDB store the history
 * panel renders — it shows the most recently updated conversations so switching
 * between them never requires opening a panel. Below the rail breakpoint the
 * rail becomes an overlay drawer driven by `body.rail-open`, and any navigation
 * closes it again.
 *
 * Re-rendering is driven through {@link uiHooks.refreshRailConversations} so the
 * history/persistence layers can refresh the list without importing this module
 * (which would close an import cycle through `history/list.ts`).
 */

import { elements, state } from "../init/state.ts";
import { uiHooks } from "../init/uiHooks.ts";
import { icon } from "../utils/icons.ts";
import { config } from "../../config/config.ts";
import { getAllConversationsFromDb, deleteConversationFromDb } from "../utils/storage/conversationStorage.ts";
import { deleteDocChunks } from "../utils/storage/docChunkStorage.ts";
import { startNewConversation, loadConversation } from "../services/history/persistence.ts";
import { renderChatHistoryList } from "../services/history/list.ts";
import { extractConversationTitle } from "../services/history/historyRow.ts";
import { updateBrowserHistory } from "../services/history/state.ts";
import { updateHeaderInfo, serviceStatusLabel } from "./settings.ts";

/** Viewport width at or below which the rail collapses into a drawer. */
const RAIL_BREAKPOINT = 860;

/** How many conversations the rail lists before deferring to the history panel. */
const RAIL_LIMIT = 20;

/** Whether the rail is currently in its drawer (overlay) form. */
function isDrawer(): boolean {
  return window.innerWidth <= RAIL_BREAKPOINT;
}

/** Opens or closes the rail drawer, keeping the toggle's ARIA state in sync. */
export function setRailOpen(open: boolean) {
  document.body.classList.toggle("rail-open", open);
  elements.railToggle?.setAttribute("aria-expanded", open ? "true" : "false");
}

/** Closes the rail drawer after a navigation, leaving the static rail alone. */
function closeRailAfterNavigation() {
  if (isDrawer()) {
    setRailOpen(false);
  }
}

/**
 * The service line shown at the foot of the rail: the active provider and where
 * it is reached.
 */
export function updateRailServiceLine() {
  const line = elements.railServiceLine;
  if (!line) {
    return;
  }

  const serviceKey = config?.defaultService || "";
  const label = serviceKey ? serviceStatusLabel(serviceKey) : "No service";
  const baseUrl = serviceKey ? config?.services?.[serviceKey]?.baseUrl : "";

  let where = "key stored locally";
  if (baseUrl) {
    try {
      where = new URL(baseUrl).host;
    } catch {
      where = baseUrl;
    }
  }

  const text = `${label} · ${where}`;
  line.textContent = text;
  line.title = text;
}

/** Removes a conversation from storage and refreshes both conversation lists. */
function deleteConversation(id: string, title: string) {
  if (!confirm(`Delete "${title}"?`)) {
    return;
  }

  Promise.all([
    deleteConversationFromDb?.(id),
    deleteDocChunks(id).catch(() => undefined),
  ])
    .then(() => {
      if (state.currentConversationId === id) {
        state.currentConversationId = null;
        state.currentConversationName = null;
      }
      renderRailConversations();
      renderChatHistoryList();
    })
    .catch((err) => {
      console.error("Failed to delete conversation:", err);
      alert("Error deleting conversation. Please try again.");
    });
}

/** Builds one row of the rail's recent list. */
function railRow(id: string, title: string): HTMLElement {
  const row = document.createElement("div");
  row.className = "rail-conversation";
  row.dataset.conversationId = id;
  row.title = title;
  if (state.currentConversationId === id) {
    row.classList.add("current-conversation");
  }

  const label = document.createElement("span");
  label.className = "rail-conversation-title";
  label.textContent = title;

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "rail-conversation-delete";
  remove.setAttribute("aria-label", `Delete ${title}`);
  remove.title = "Delete conversation";
  remove.innerHTML = icon("trash", { width: 13, height: 13 });
  remove.addEventListener("click", (event) => {
    event.stopPropagation();
    deleteConversation(id, title);
  });

  row.addEventListener("click", () => {
    loadConversation(id)?.then(() => {
      renderRailConversations();
      closeRailAfterNavigation();
    });
  });

  row.appendChild(label);
  row.appendChild(remove);
  return row;
}

/** Renders the rail's recent-conversation list from the conversation store. */
export function renderRailConversations() {
  const container = elements.railConversations;
  if (!container) {
    return;
  }

  getAllConversationsFromDb?.()
    .then((convos) => {
      container.innerHTML = "";

      if (!convos || convos.length === 0) {
        const empty = document.createElement("div");
        empty.className = "rail-empty";
        empty.textContent = "No conversations yet.";
        container.appendChild(empty);
        return;
      }

      convos
        .sort((a, b) => new Date(b.updated || 0).getTime() - new Date(a.updated || 0).getTime())
        .slice(0, RAIL_LIMIT)
        .forEach((convo) => {
          if (!convo.id) {
            return;
          }
          container.appendChild(railRow(convo.id, extractConversationTitle(convo)));
        });
    })
    .catch((err) => {
      console.error("Error loading conversations for the rail:", err);
      container.innerHTML = "";
      const failed = document.createElement("div");
      failed.className = "rail-empty";
      failed.textContent = "Could not load conversations.";
      container.appendChild(failed);
    });
}

/** Wires the rail's controls and renders its initial contents. */
export function initializeRail() {
  elements.newChatButton?.addEventListener("click", () => {
    startNewConversation();
    updateHeaderInfo();
    updateBrowserHistory();
    renderRailConversations();
    closeRailAfterNavigation();
  });

  elements.railToggle?.addEventListener("click", () => {
    setRailOpen(!document.body.classList.contains("rail-open"));
  });

  elements.railClose?.addEventListener("click", () => setRailOpen(false));
  elements.railScrim?.addEventListener("click", () => setRailOpen(false));

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && document.body.classList.contains("rail-open")) {
      setRailOpen(false);
    }
  });

  window.addEventListener("resize", () => {
    if (!isDrawer()) {
      setRailOpen(false);
    }
  });

  updateRailServiceLine();
  renderRailConversations();
}

uiHooks.refreshRailConversations = renderRailConversations;
uiHooks.updateRailServiceLine = updateRailServiceLine;
