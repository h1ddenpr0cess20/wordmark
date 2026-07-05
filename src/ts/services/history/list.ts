/**
 * Conversation history list.
 *
 * @remarks
 * Renders the saved-conversation sidebar from the IndexedDB store and wires its
 * load, rename, and delete controls.
 */

import { elements, state } from "../../init/state.ts";
import {
  getAllConversationsFromDb,
  deleteConversationFromDb,
} from "../../utils/storage/conversationStorage.ts";
import { startNewConversation, loadConversation, renameConversation } from "./persistence.ts";
import { buildHistoryRowHtml } from "./historyRow.ts";
import { closePanel } from "../../utils/dom/panels.ts";

let activeHistoryKeydown: ((e: KeyboardEvent) => void) | null = null;

/**
 * Renders the saved-conversation list into the history panel, wiring each
 * entry's load, rename, and delete actions.
 */
export function renderChatHistoryList() {
  const historyList = elements.historyList;
  if (!historyList) {
    return;
  }

  getAllConversationsFromDb?.()
    .then((convos) => {
      historyList.innerHTML = "";

      if (!convos || convos.length === 0) {
        historyList.innerHTML = "<div class=\"history-empty\">No saved conversations yet.</div>";
        return;
      }

      convos.sort((a, b) => new Date(b.updated || 0).getTime() - new Date(a.updated || 0).getTime());

      const toolbarDiv = document.createElement("div");
      toolbarDiv.className = "history-toolbar";
      toolbarDiv.innerHTML = `
        <div class="history-toolbar-left">
          <button class="history-new-button">
            <span>+ Start New Conversation</span>
          </button>
          <label class="selection-mode-toggle">
            <input type="checkbox" id="multi-select-mode"> Multi-select
          </label>
        </div>
        <div class="history-toolbar-right">
          <span class="selection-status" style="display: none; font-size: 0.85rem; color: var(--text-secondary); margin-right: 8px;">
            <span class="selected-count">0</span> selected
          </span>
          <button class="history-select-all-btn" title="Select all conversations" style="display: none;">Select All</button>
          <button class="history-clear-selection-btn" title="Clear selection" style="display: none;">Clear</button>
          <button class="history-load-btn" title="Load selected conversation" disabled>Load</button>
          <button class="history-rename-btn" title="Rename selected conversation" disabled>Rename</button>
          <button class="history-delete-btn" title="Delete selected conversations" disabled>Delete (<span class="delete-count">0</span>)</button>
        </div>
      `;

      const newButton = toolbarDiv.querySelector(".history-new-button") as HTMLElement;
      const multiSelectCheckbox = toolbarDiv.querySelector("#multi-select-mode") as HTMLInputElement;
      const selectionStatus = toolbarDiv.querySelector(".selection-status") as HTMLElement;
      const selectedCountSpan = toolbarDiv.querySelector(".selected-count") as HTMLElement;
      const selectAllButton = toolbarDiv.querySelector(".history-select-all-btn") as HTMLElement;
      const clearSelectionButton = toolbarDiv.querySelector(".history-clear-selection-btn") as HTMLElement;
      const loadButton = toolbarDiv.querySelector(".history-load-btn") as HTMLButtonElement;
      const renameButton = toolbarDiv.querySelector(".history-rename-btn") as HTMLButtonElement;
      const deleteButton = toolbarDiv.querySelector(".history-delete-btn") as HTMLButtonElement;
      const deleteCountSpan = toolbarDiv.querySelector(".delete-count") as HTMLElement;

      const deselectAllRows = () => {
        document.querySelectorAll(".history-row").forEach((row) => row.classList.remove("selected"));
      };

      const selectAllRows = () => {
        document.querySelectorAll(".history-row").forEach((row) => row.classList.add("selected"));
      };

      const closeHistoryPanel = () => {
        closePanel({ panel: elements.historyPanel, button: elements.historyButton });
      };

      const updateButtonStates = () => {
        const selectedRows = document.querySelectorAll<HTMLElement>(".history-row.selected");
        const isMultiSelect = multiSelectCheckbox.checked;
        const selectedCount = selectedRows.length;

        selectAllButton.style.display = isMultiSelect ? "inline-block" : "none";
        clearSelectionButton.style.display = isMultiSelect ? "inline-block" : "none";
        selectionStatus.style.display = isMultiSelect && selectedCount > 0 ? "inline-block" : "none";

        selectedCountSpan.textContent = String(selectedCount);
        deleteCountSpan.textContent = String(selectedCount);

        loadButton.disabled = selectedCount !== 1;
        renameButton.disabled = selectedCount !== 1;
        deleteButton.disabled = selectedCount === 0;

        deleteButton.title = selectedCount > 1
          ? `Delete ${selectedCount} selected conversations`
          : "Delete selected conversation";
      };

      newButton.onclick = () => {
        startNewConversation();
        closeHistoryPanel();
      };

      multiSelectCheckbox.onchange = () => {
        const isMultiSelect = multiSelectCheckbox.checked;

        deselectAllRows();

        const table = document.querySelector(".history-table");
        if (table) {
          table.classList.toggle("multi-select-mode", isMultiSelect);
        }

        updateButtonStates();
      };

      selectAllButton.onclick = () => {
        selectAllRows();
        updateButtonStates();
      };

      clearSelectionButton.onclick = () => {
        deselectAllRows();
        updateButtonStates();
      };

      loadButton.onclick = () => {
        const selectedRow = document.querySelector<HTMLElement>(".history-row.selected");
        if (selectedRow) {
          const conversationId = selectedRow.dataset.conversationId;
          if (conversationId) {
            loadConversation(conversationId)?.then(() => {
              closeHistoryPanel();
            });
          }
        }
      };

      renameButton.onclick = () => {
        const selectedRow = document.querySelector<HTMLElement>(".history-row.selected");
        if (!selectedRow) {
          return;
        }
        const conversationId = selectedRow.dataset.conversationId;
        const currentTitle = selectedRow.querySelector(".history-title")?.textContent || "";
        const newName = prompt("Rename conversation:", currentTitle);
        if (conversationId && newName && newName.trim()) {
          renameConversation(conversationId, newName.trim());
        }
      };

      deleteButton.onclick = () => {
        const selectedRows = document.querySelectorAll<HTMLElement>(".history-row.selected");
        if (!selectedRows.length) {
          return;
        }

        const conversationIds = Array.from(selectedRows)
          .map((row) => row.dataset.conversationId)
          .filter((id): id is string => Boolean(id));
        const confirmMessage = conversationIds.length === 1
          ? "Delete this conversation?"
          : `Delete ${conversationIds.length} conversations?`;

        if (!confirm(confirmMessage)) {
          return;
        }

        Promise.all(conversationIds.map(id => deleteConversationFromDb?.(id)))
          .then(() => {
            conversationIds.forEach((id) => {
              if (state.currentConversationId === id) {
                state.currentConversationId = null;
                state.currentConversationName = null;
              }
            });
            renderChatHistoryList();
          })
          .catch((err) => {
            console.error("Failed to delete conversations:", err);
            alert("Error deleting conversations. Please try again.");
          });
      };

      historyList.appendChild(toolbarDiv);

      const handleKeydown = (e: KeyboardEvent) => {
        if (elements.historyPanel?.getAttribute("aria-hidden") === "true") {
          return;
        }

        // Never hijack keys the user is typing into a field (e.g. the chat
        // input or the multi-select checkbox) — Backspace/Enter here must not
        // delete or load conversations.
        const target = e.target as HTMLElement | null;
        if (target && (
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable
        )) {
          return;
        }

        if ((e.key === "Delete" || e.key === "Backspace")) {
          if (document.querySelectorAll(".history-row.selected").length > 0) {
            deleteButton.click();
          }
        } else if (e.key === "Enter") {
          if (document.querySelectorAll(".history-row.selected").length === 1) {
            loadButton.click();
          }
        } else if (e.key === "a" && (e.ctrlKey || e.metaKey)) {
          if (multiSelectCheckbox.checked) {
            e.preventDefault();
            selectAllButton.click();
          }
        } else if (e.key === "Escape") {
          clearSelectionButton.click();
        }
      };

      if (activeHistoryKeydown) {
        document.removeEventListener("keydown", activeHistoryKeydown);
      }
      activeHistoryKeydown = handleKeydown;
      document.addEventListener("keydown", handleKeydown);

      const tableContainer = document.createElement("div");
      tableContainer.className = "history-table-container";

      const table = document.createElement("table");
      table.className = "history-table";

      const thead = document.createElement("thead");
      thead.innerHTML = `
        <tr>
          <th class="col-title">Conversation</th>
          <th class="col-prompt">Prompt</th>
          <th class="col-model">Model</th>
          <th class="col-stats">Stats</th>
          <th class="col-date">Updated</th>
        </tr>
      `;
      table.appendChild(thead);

      const tbody = document.createElement("tbody");

      let anchorRow: Element | null = null;

      convos.forEach((convo) => {
        const row = document.createElement("tr");
        row.className = "history-row";
        row.dataset.conversationId = convo.id || "";

        if (state.currentConversationId === convo.id) {
          row.classList.add("current-conversation");
        }

        row.innerHTML = buildHistoryRowHtml(convo);

        row.onclick = (e) => {
          const isMultiSelect = multiSelectCheckbox.checked;

          if (isMultiSelect) {
            if (e.ctrlKey || e.metaKey) {
              row.classList.toggle("selected");
              anchorRow = row;
            } else if (e.shiftKey) {
              const allRows = Array.from(document.querySelectorAll(".history-row"));

              if (anchorRow && allRows.includes(anchorRow)) {
                const startIndex = allRows.indexOf(anchorRow);
                const endIndex = allRows.indexOf(row);
                const [minIndex, maxIndex] = [Math.min(startIndex, endIndex), Math.max(startIndex, endIndex)];
                for (let i = minIndex; i <= maxIndex; i += 1) {
                  allRows[i].classList.add("selected");
                }
              } else {
                row.classList.add("selected");
                anchorRow = row;
              }
            } else {
              row.classList.toggle("selected");
              anchorRow = row;
            }
          } else {
            deselectAllRows();
            row.classList.add("selected");
            anchorRow = row;
          }

          updateButtonStates();
        };

        tbody.appendChild(row);
      });

      table.appendChild(tbody);
      tableContainer.appendChild(table);
      historyList.appendChild(tableContainer);
    })
    .catch((err) => {
      console.error("Error loading conversations for history list:", err);
      historyList.innerHTML = "<div class=\"history-error\">Error loading conversation history.</div>";
    });
};
