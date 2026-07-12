/**
 * Conversation history list.
 *
 * @remarks
 * Renders the saved-conversation panel from the IndexedDB store: a search
 * field, date-grouped conversation rows that load on click, per-row rename and
 * delete actions, and a bulk-select mode for multi-delete.
 */

import { elements, state } from "../../init/state.ts";
import {
  getAllConversationsFromDb,
  deleteConversationFromDb,
} from "../../utils/storage/conversationStorage.ts";
import { deleteDocChunks } from "../../utils/storage/docChunkStorage.ts";
import { startNewConversation, loadConversation, renameConversation } from "./persistence.ts";
import {
  buildHistoryRowHtml,
  conversationDateGroup,
  extractConversationTitle,
  resolveConversationPrompt,
} from "./historyRow.ts";
import { closePanel } from "../../utils/dom/panels.ts";
import type { ConversationRecord } from "../../../types/common.ts";

let activeHistoryKeydown: ((e: KeyboardEvent) => void) | null = null;

/**
 * Renders the saved-conversation list into the history panel, wiring search,
 * load-on-click, per-row rename/delete, and bulk selection.
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

      const controls = document.createElement("div");
      controls.className = "history-controls";
      controls.innerHTML = `
        <button type="button" class="history-new-button">
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="#plus-circle"></use></svg>
          <span>New conversation</span>
        </button>
        <input type="search" class="history-search" placeholder="Search conversations" aria-label="Search conversations">
        <label class="selection-mode-toggle" title="Select multiple conversations">
          <input type="checkbox" id="multi-select-mode"> Select
        </label>
      `;

      const bulkbar = document.createElement("div");
      bulkbar.className = "history-bulkbar";
      bulkbar.hidden = true;
      bulkbar.innerHTML = `
        <span class="selection-status"><span class="selected-count">0</span> selected</span>
        <div class="history-bulk-actions">
          <button type="button" class="history-select-all-btn">Select all</button>
          <button type="button" class="history-clear-selection-btn">Clear</button>
          <button type="button" class="history-delete-btn" disabled>Delete</button>
        </div>
      `;

      const newButton = controls.querySelector(".history-new-button") as HTMLElement;
      const searchInput = controls.querySelector(".history-search") as HTMLInputElement;
      const multiSelectCheckbox = controls.querySelector("#multi-select-mode") as HTMLInputElement;
      const selectedCountSpan = bulkbar.querySelector(".selected-count") as HTMLElement;
      const selectAllButton = bulkbar.querySelector(".history-select-all-btn") as HTMLElement;
      const clearSelectionButton = bulkbar.querySelector(".history-clear-selection-btn") as HTMLElement;
      const deleteButton = bulkbar.querySelector(".history-delete-btn") as HTMLButtonElement;

      const cardList = document.createElement("div");
      cardList.className = "history-cards";

      const visibleRows = () =>
        Array.from(cardList.querySelectorAll<HTMLElement>(".history-row")).filter((row) => !row.hidden);

      const selectedRows = () =>
        Array.from(cardList.querySelectorAll<HTMLElement>(".history-row.selected"));

      const deselectAllRows = () => {
        selectedRows().forEach((row) => row.classList.remove("selected"));
      };

      const closeHistoryPanel = () => {
        closePanel({ panel: elements.historyPanel, button: elements.historyButton });
      };

      const updateSelectionState = () => {
        const count = selectedRows().length;
        selectedCountSpan.textContent = String(count);
        deleteButton.disabled = count === 0;
        deleteButton.textContent = count > 1 ? `Delete (${count})` : "Delete";
      };

      const deleteConversations = (conversationIds: string[]) => {
        if (!conversationIds.length) {
          return;
        }
        const confirmMessage = conversationIds.length === 1
          ? "Delete this conversation?"
          : `Delete ${conversationIds.length} conversations?`;
        if (!confirm(confirmMessage)) {
          return;
        }

        Promise.all(conversationIds.map(id => Promise.all([
          deleteConversationFromDb?.(id),
          deleteDocChunks(id).catch(() => undefined),
        ])))
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

      newButton.onclick = () => {
        startNewConversation();
        closeHistoryPanel();
      };

      searchInput.oninput = () => {
        const query = searchInput.value.trim().toLowerCase();
        cardList.querySelectorAll<HTMLElement>(".history-row").forEach((row) => {
          row.hidden = Boolean(query) && !(row.dataset.search || "").includes(query);
        });
        cardList.querySelectorAll<HTMLElement>(".history-group").forEach((group) => {
          group.hidden = !group.querySelector(".history-row:not([hidden])");
        });
      };

      multiSelectCheckbox.onchange = () => {
        const isMultiSelect = multiSelectCheckbox.checked;
        bulkbar.hidden = !isMultiSelect;
        cardList.classList.toggle("multi-select-mode", isMultiSelect);
        deselectAllRows();
        updateSelectionState();
      };

      selectAllButton.onclick = () => {
        visibleRows().forEach((row) => row.classList.add("selected"));
        updateSelectionState();
      };

      clearSelectionButton.onclick = () => {
        deselectAllRows();
        updateSelectionState();
      };

      deleteButton.onclick = () => {
        const conversationIds = selectedRows()
          .map((row) => row.dataset.conversationId)
          .filter((id): id is string => Boolean(id));
        deleteConversations(conversationIds);
      };

      const handleKeydown = (e: KeyboardEvent) => {
        if (elements.historyPanel?.getAttribute("aria-hidden") === "true") {
          return;
        }

        // Never hijack keys the user is typing into a field (e.g. the chat
        // input or the search box) — Backspace/Enter here must not delete or
        // load conversations.
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
          if (selectedRows().length > 0) {
            deleteButton.click();
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

      let anchorRow: Element | null = null;
      let currentGroup: HTMLElement | null = null;
      let currentGroupLabel: string | null = null;

      const searchTextFor = (convo: ConversationRecord) => [
        extractConversationTitle(convo),
        resolveConversationPrompt(convo).info,
        convo.model || "",
        convo.service || "",
      ].join(" ").toLowerCase();

      convos.forEach((convo) => {
        const groupLabel = conversationDateGroup(convo.updated);
        if (groupLabel !== currentGroupLabel) {
          currentGroupLabel = groupLabel;
          currentGroup = document.createElement("div");
          currentGroup.className = "history-group";
          const heading = document.createElement("div");
          heading.className = "history-group-label";
          heading.textContent = groupLabel;
          currentGroup.appendChild(heading);
          cardList.appendChild(currentGroup);
        }

        const row = document.createElement("div");
        row.className = "history-row";
        row.dataset.conversationId = convo.id || "";
        row.dataset.search = searchTextFor(convo);

        if (state.currentConversationId === convo.id) {
          row.classList.add("current-conversation");
        }

        row.innerHTML = buildHistoryRowHtml(convo);

        const renameAction = row.querySelector(".row-rename") as HTMLElement;
        const deleteAction = row.querySelector(".row-delete") as HTMLElement;

        renameAction.onclick = (e) => {
          e.stopPropagation();
          const currentTitle = row.querySelector(".history-title")?.textContent || "";
          const newName = prompt("Rename conversation:", currentTitle);
          if (convo.id && newName && newName.trim()) {
            renameConversation(convo.id, newName.trim());
          }
        };

        deleteAction.onclick = (e) => {
          e.stopPropagation();
          if (convo.id) {
            deleteConversations([convo.id]);
          }
        };

        row.onclick = (e) => {
          if (!multiSelectCheckbox.checked) {
            if (convo.id) {
              loadConversation(convo.id)?.then(() => {
                closeHistoryPanel();
              });
            }
            return;
          }

          if (e.shiftKey && anchorRow) {
            const allRows = visibleRows();
            const startIndex = allRows.indexOf(anchorRow as HTMLElement);
            const endIndex = allRows.indexOf(row);
            if (startIndex !== -1 && endIndex !== -1) {
              const [minIndex, maxIndex] = [Math.min(startIndex, endIndex), Math.max(startIndex, endIndex)];
              for (let i = minIndex; i <= maxIndex; i += 1) {
                allRows[i].classList.add("selected");
              }
            }
          } else {
            row.classList.toggle("selected");
          }
          anchorRow = row;
          updateSelectionState();
        };

        (currentGroup || cardList).appendChild(row);
      });

      historyList.appendChild(controls);
      historyList.appendChild(bulkbar);
      historyList.appendChild(cardList);
      searchInput.focus({ preventScroll: true });
    })
    .catch((err) => {
      console.error("Error loading conversations for history list:", err);
      historyList.innerHTML = "<div class=\"history-error\">Error loading conversation history.</div>";
    });
};
