/**
 * Memory settings panel.
 *
 * @remarks
 * Wires the memory toggle, limit, add/clear controls, and saved-memory list to
 * the underlying memory store, keeping the memory tool's availability in sync.
 */

import { getMemoryConfig, setMemoryEnabled, setMemoryLimit, getMemories, addMemory, clearAllMemories, removeMemoryAt } from "../utils/memoryStorage.ts";
import { updateFeatureStatus } from "./settings.ts";
import { updateToolDefinitions } from "./tools.ts";
import { createMemoryRow } from "./memoryRow.ts";

/** Initializes the memory settings panel and binds its controls. */
export function initMemorySettings() {
  const toggle = document.getElementById("memory-toggle") as HTMLInputElement | null;
  const limitInput = document.getElementById("memory-limit") as HTMLInputElement | null;
  const clearBtn = document.getElementById("clear-memories");
  const listContainer = document.getElementById("memory-list");
  const addInput = document.getElementById("memory-add-input") as HTMLInputElement | null;
  const addButton = document.getElementById("memory-add-button");

  if (!toggle || !limitInput) {
    return;
  }

  const cfg = getMemoryConfig ? getMemoryConfig() : { enabled: false, limit: 25 };
  toggle.checked = Boolean(cfg.enabled);
  limitInput.value = String(cfg.limit);
  renderList();

  if (addInput) {
    addInput.setAttribute("maxlength", "600");
  }

  updateToolDefinitions();

  toggle.addEventListener("change", () => {
    if (setMemoryEnabled) setMemoryEnabled(toggle.checked);
    updateToolDefinitions();

    renderList();
    updateFeatureStatus();

  });

  limitInput.addEventListener("change", () => {
    const val = parseInt(limitInput.value, 10);
    if (setMemoryLimit) setMemoryLimit(val);
    renderList();
  });

  if (clearBtn) {
    clearBtn.addEventListener("click", (e: Event) => {
      if (e && typeof e.stopPropagation === "function") e.stopPropagation();
      if (e && typeof e.preventDefault === "function") e.preventDefault();
      if (confirm("Clear all saved memories? This cannot be undone.")) {
        if (clearAllMemories) clearAllMemories();
        renderList();
      }
    });
  }

  if (addButton && addInput) {
    const doAdd = (evt: Event) => {
      if (evt && typeof evt.stopPropagation === "function") evt.stopPropagation();
      if (evt && typeof evt.preventDefault === "function") evt.preventDefault();
      const text = (addInput.value || "").trim();
      if (!text) return;
      if (addMemory) {
        addMemory(text);
      }
      addInput.value = "";
      renderList();
    };
    addButton.addEventListener("click", doAdd);
    addInput.addEventListener("keydown", (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        doAdd(e);
      }
    });
  }

  if (typeof window.addEventListener === "function") {
    window.addEventListener("memories:changed", () => {
      renderList();
    });
    window.addEventListener("memories:config", () => {
      const cfg = getMemoryConfig ? getMemoryConfig() : { enabled: false, limit: 25 };
      if (toggle) toggle.checked = Boolean(cfg.enabled);
      if (limitInput) limitInput.value = String(cfg.limit);
      renderList();
    });
  }

  function renderList() {
    if (!listContainer) return;
    const cfg = getMemoryConfig ? getMemoryConfig() : { enabled: false };
    const mems = getMemories ? getMemories() : [];
    if (!cfg.enabled) {
      listContainer.innerHTML = "<div class=\"info-text\">Memory is disabled.</div>";
      return;
    }
    if (!mems.length) {
      listContainer.innerHTML = "<div class=\"info-text\">No memories saved yet.</div>";
      return;
    }
    listContainer.innerHTML = "";
    mems.forEach((m, idx) => {
      const row = createMemoryRow(m, idx, {
        onDelete: (index) => {
          if (removeMemoryAt) {
            removeMemoryAt(index);
            renderList();
          }
        },
      });
      listContainer.appendChild(row);
    });
  }
}
