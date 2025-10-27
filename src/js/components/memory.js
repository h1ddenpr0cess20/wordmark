/**
 * Memory settings panel functionality
 */

window.initMemorySettings = function() {
  // Grab elements
  const toggle = document.getElementById("memory-toggle");
  const limitInput = document.getElementById("memory-limit");
  const clearBtn = document.getElementById("clear-memories");
  const listContainer = document.getElementById("memory-list");
  const addInput = document.getElementById("memory-add-input");
  const addButton = document.getElementById("memory-add-button");

  if (!toggle || !limitInput) {
    return; // Memory section not present
  }

  // Initialize from storage
  const cfg = window.getMemoryConfig ? window.getMemoryConfig() : { enabled: false, limit: 25 };
  toggle.checked = Boolean(cfg.enabled);
  limitInput.value = cfg.limit;
  renderList();

  // Set max length on input (about three long sentences)
  if (addInput) {
    addInput.setAttribute("maxlength", "600");
  }

  // Update tool definitions to include/exclude memory tool on load
  if (typeof window.updateToolDefinitions === "function") {
    window.updateToolDefinitions();
  }

  // Events
  toggle.addEventListener("change", () => {
    if (window.setMemoryEnabled) window.setMemoryEnabled(toggle.checked);
    // Reflect in tool availability
    if (typeof window.updateToolDefinitions === "function") {
      window.updateToolDefinitions();
    }
    renderList();
    if (typeof window.updateFeatureStatus === "function") {
      window.updateFeatureStatus();
    }
  });

  limitInput.addEventListener("change", () => {
    const val = parseInt(limitInput.value, 10);
    if (window.setMemoryLimit) window.setMemoryLimit(val);
    renderList();
  });

  if (clearBtn) {
    clearBtn.addEventListener("click", (e) => {
      if (e && typeof e.stopPropagation === "function") e.stopPropagation();
      if (e && typeof e.preventDefault === "function") e.preventDefault();
      if (confirm("Clear all saved memories? This cannot be undone.")) {
        if (window.clearAllMemories) window.clearAllMemories();
        renderList();
      }
    });
  }

  if (addButton && addInput) {
    const doAdd = (evt) => {
      if (evt && typeof evt.stopPropagation === "function") evt.stopPropagation();
      if (evt && typeof evt.preventDefault === "function") evt.preventDefault();
      const text = (addInput.value || "").trim();
      if (!text) return;
      if (window.addMemory) {
        window.addMemory(text);
      }
      addInput.value = "";
      renderList();
    };
    addButton.addEventListener("click", doAdd);
    // Ctrl/Cmd+Enter support
    addInput.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        doAdd(e);
      }
    });
  }

  // React to external memory changes (e.g., via tools)
  if (typeof window.addEventListener === "function") {
    window.addEventListener("memories:changed", () => {
      renderList();
    });
    window.addEventListener("memories:config", () => {
      // update limit/toggle display from source of truth if needed
      const cfg = window.getMemoryConfig ? window.getMemoryConfig() : { enabled: false, limit: 25 };
      if (toggle) toggle.checked = Boolean(cfg.enabled);
      if (limitInput) limitInput.value = cfg.limit;
      renderList();
    });
  }

  function renderList() {
    if (!listContainer) return;
    const cfg = window.getMemoryConfig ? window.getMemoryConfig() : { enabled: false };
    const mems = window.getMemories ? window.getMemories() : [];
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
      const row = document.createElement("div");
      row.className = "memory-row";
      const text = document.createElement("span");
      text.className = "memory-text";
      text.textContent = m;
      const del = document.createElement("button");
      del.type = "button";
      del.className = "tool-action-button";
      del.setAttribute("aria-label", `Delete memory ${idx + 1}`);
      del.textContent = "Delete";
      del.addEventListener("click", (e) => {
        if (e && typeof e.stopPropagation === "function") e.stopPropagation();
        if (e && typeof e.preventDefault === "function") e.preventDefault();
        if (window.removeMemoryAt) {
          window.removeMemoryAt(idx);
          renderList();
        }
      });
      row.appendChild(text);
      row.appendChild(del);
      listContainer.appendChild(row);
    });
  }
};
