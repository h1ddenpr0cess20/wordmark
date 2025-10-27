/**
 * Vector Store Management UI Component
 */

import {
  listVectorStores,
  deleteVectorStore,
  getVectorStore,
  listVectorStoreFiles,
  setActiveVectorStoreId,
  clearActiveVectorStore,
  getActiveVectorStoreId,
  getActiveVectorStoreIds,
  saveVectorStoreMetadata,
  getVectorStoreMetadata,
  removeVectorStoreMetadata,
  MAX_ACTIVE_VECTOR_STORES,
} from "../services/vectorStore.js";

const VECTOR_STORE_API_COOLDOWN_MS = 3000;
let lastVectorStoreApiCall = 0;

async function enforceVectorStoreApiCooldown() {
  const now = Date.now();
  const elapsed = now - lastVectorStoreApiCall;
  if (elapsed < VECTOR_STORE_API_COOLDOWN_MS) {
    await new Promise(resolve => setTimeout(resolve, VECTOR_STORE_API_COOLDOWN_MS - elapsed));
  }
}

function markVectorStoreApiCall() {
  lastVectorStoreApiCall = Date.now();
}

/**
 * Initialize vector store manager
 */
export async function initVectorStoreManager() {
  const managerContainer = document.getElementById("vector-store-manager");
  if (!managerContainer) return;

  const refreshButton = document.getElementById("refresh-vector-stores");
  const clearActiveButton = document.getElementById("clear-active-vector-store");

  if (refreshButton) {
    refreshButton.addEventListener("click", () => refreshVectorStoreList(true));
  }

  if (clearActiveButton) {
    clearActiveButton.addEventListener("click", () => {
      // Clear the single "active" id
      clearActiveVectorStore();
      // Clear all enabled/active metadata selections
      try {
        const meta = getVectorStoreMetadata();
        if (meta && typeof meta === "object") {
          Object.keys(meta).forEach(id => removeVectorStoreMetadata(id));
        }
      } catch { /* noop */ }
      if (window.showInfo) {
        window.showInfo("Cleared all active vector stores");
      }
      refreshVectorStoreList();
    });
  }

  const listContainer = document.getElementById("vector-store-list");
  if (listContainer) {
    listContainer.innerHTML = "<div class=\"loading-text\">Loading vector stores...</div>";
  }

  await refreshVectorStoreList(false);
}

/**
 * Refresh the vector store list
 */
export async function refreshVectorStoreList(applyCooldown = true) {
  const listContainer = document.getElementById("vector-store-list");
  if (!listContainer) return;

  const activeIds = (typeof getActiveVectorStoreIds === "function" ? getActiveVectorStoreIds() : []);

  // Show loading state
  listContainer.innerHTML = "<div class=\"loading-text\">Loading vector stores...</div>";

  try {
    if (applyCooldown) {
      await enforceVectorStoreApiCooldown();
    }
    const response = await listVectorStores(10);
    markVectorStoreApiCall();
    const stores = response.data || [];
    const metadata = getVectorStoreMetadata() || {};

    if (stores.length === 0) {
      listContainer.innerHTML = "<div class=\"empty-state\">No vector stores found. Upload documents to create one.</div>";
      return;
    }

    // Build the list
    const listHtml = stores.map((store, index) => {
      const isActive = Array.isArray(activeIds) ? activeIds.includes(store.id) : (store.id === getActiveVectorStoreId());
      const meta = metadata[store.id] || {};
      const createdDate = new Date(store.created_at * 1000).toLocaleDateString();
      const fileCount = store.file_counts?.total || 0;
      const friendlyName = escapeHtml(buildFriendlyVectorStoreName(store, meta, index));

      return `
        <div class="vector-store-item ${isActive ? "active" : ""}" data-store-id="${store.id}">
          <div class="vector-store-header">
            <div class="vector-store-name">
              ${isActive ? "<span class=\"active-badge\">Active</span>" : ""}
              <strong>${friendlyName}</strong>
            </div>
            <div class="vector-store-actions">
            <div class="tool-toggle-control" title="Enable/disable this store for File Search">
              <div class="toggle-container">
                <input type="checkbox" id="enable-${store.id}" class="store-enable-toggle" data-store-id="${store.id}" ${isActive ? "checked" : ""}>
                <label for="enable-${store.id}" class="toggle-switch"></label>
              </div>
            </div>
            <button class="tool-action-button btn-view" data-store-id="${store.id}" title="View details">View</button>
            <button class="btn-small btn-delete" data-store-id="${store.id}" title="Delete this vector store">Delete</button>
          </div>
          </div>
          <div class="vector-store-meta">
            <span class="meta-item"><strong>ID:</strong> ${store.id}</span>
            <span class="meta-item"><strong>Files:</strong> ${fileCount}</span>
            <span class="meta-item"><strong>Created:</strong> ${createdDate}</span>
            ${meta.lastUsed ? `<span class="meta-item"><strong>Last Used:</strong> ${new Date(meta.lastUsed).toLocaleString()}</span>` : ""}
          </div>
        </div>
      `;
    }).join("");

    listContainer.innerHTML = listHtml;

    // Attach event listeners
    listContainer.querySelectorAll(".store-enable-toggle").forEach(input => {
      input.addEventListener("change", async (e) => {
        const storeId = e.target.getAttribute("data-store-id");
        const checked = e.target.checked;
        try {
          if (checked) {
            const container = document.getElementById("vector-store-list");
            const currentlyChecked = container ? container.querySelectorAll(".store-enable-toggle:checked").length : 0;
            if (currentlyChecked > MAX_ACTIVE_VECTOR_STORES) {
              e.target.checked = false;
              if (window.showError) {
                window.showError(`You can enable up to ${MAX_ACTIVE_VECTOR_STORES} vector stores at a time.`);
              } else {
                alert(`You can enable up to ${MAX_ACTIVE_VECTOR_STORES} vector stores at a time.`);
              }
              return;
            }
            // Save metadata to mark as enabled/active
            const store = await getVectorStore(storeId);
            const friendlyDisplayName = deriveFriendlyVectorStoreName(store);
            saveVectorStoreMetadata(storeId, {
              name: store.name,
              friendlyName: friendlyDisplayName,
              createdAt: store.created_at,
              fileCount: store.file_counts?.total || 0,
            });
            if (window.showInfo) {
              window.showInfo(`Enabled vector store "${friendlyDisplayName || store.name || storeId}"`);
            }
          } else {
            // Remove metadata; also clear primary active id if it matches
            const metadata = getVectorStoreMetadata();
            const friendlyDisplayName = metadata?.[storeId]?.friendlyName || metadata?.[storeId]?.name || storeId;
            removeVectorStoreMetadata(storeId);
            try {
              if (typeof getActiveVectorStoreId === "function" && getActiveVectorStoreId() === storeId) {
                clearActiveVectorStore();
              }
            } catch { /* noop */ }
            if (window.showInfo) {
              window.showInfo(`Disabled vector store "${friendlyDisplayName}"`);
            }
          }
        } catch (error) {
          console.error("Failed to toggle vector store:", error);
          if (window.showError) {
            window.showError(`Failed to toggle vector store: ${error.message}`);
          }
        } finally {
          refreshVectorStoreList(false);
        }
      });
    });

    listContainer.querySelectorAll(".btn-view").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const storeId = e.target.getAttribute("data-store-id");
        viewVectorStoreDetails(storeId);
      });
    });

    listContainer.querySelectorAll(".btn-delete").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const storeId = e.target.getAttribute("data-store-id");
        confirmDeleteVectorStore(storeId);
      });
    });

  } catch (error) {
    console.error("Failed to load vector stores:", error);

    // Check if it's a CORS error
    const isCorsError = error.message.includes("CORS") ||
                        error.message.includes("fetch") ||
                        error.name === "TypeError";

    if (isCorsError) {
      listContainer.innerHTML = `
        <div class="info-message">
          <p><strong>Vector Store Listing Not Available</strong></p>
        </div>
      `;
    } else {
      listContainer.innerHTML = `<div class="error-message">Failed to load vector stores: ${escapeHtml(error.message)}</div>`;
    }
  }
}

/**
 * Activate a vector store
 */
async function activateVectorStore(storeId) {
  try {
    // Get store details to save metadata
    const store = await getVectorStore(storeId);

    setActiveVectorStoreId(storeId);
    saveVectorStoreMetadata(storeId, {
      name: store.name,
      createdAt: store.created_at,
      fileCount: store.file_counts?.total || 0,
    });

    if (window.showInfo) {
      window.showInfo(`Vector store "${store.name || storeId}" activated`);
    }

    await refreshVectorStoreList();
  } catch (error) {
    console.error("Failed to activate vector store:", error);
    if (window.showError) {
      window.showError(`Failed to activate vector store: ${error.message}`);
    }
  }
}

/**
 * View vector store details
 */
async function viewVectorStoreDetails(storeId) {
  try {
    const store = await getVectorStore(storeId);
    const filesResponse = await listVectorStoreFiles(storeId, 100);
    const files = filesResponse.data || [];

    const fileList = files.length > 0
      ? files.map(f => `<li>${f.id} (${f.status})</li>`).join("")
      : "<li>No files in this vector store</li>";

    const detailsHtml = `
      <div class="vector-store-details">
        <h3>${escapeHtml(store.name || "Unnamed Store")}</h3>
        <p><strong>ID:</strong> ${store.id}</p>
        <p><strong>Created:</strong> ${new Date(store.created_at * 1000).toLocaleString()}</p>
        <p><strong>Total Files:</strong> ${store.file_counts?.total || 0}</p>
        <p><strong>Completed Files:</strong> ${store.file_counts?.completed || 0}</p>
        <p><strong>In Progress:</strong> ${store.file_counts?.in_progress || 0}</p>
        <p><strong>Failed:</strong> ${store.file_counts?.failed || 0}</p>
        ${store.usage_bytes ? `<p><strong>Storage Used:</strong> ${formatBytes(store.usage_bytes)}</p>` : ""}
        <h4>Files:</h4>
        <ul>${fileList}</ul>
      </div>
    `;

    if (window.showCustomModal) {
      window.showCustomModal("Vector Store Details", detailsHtml);
    } else {
      alert(detailsHtml.replace(/<[^>]*>/g, "\n"));
    }
  } catch (error) {
    console.error("Failed to view vector store details:", error);
    if (window.showError) {
      window.showError(`Failed to view vector store: ${error.message}`);
    }
  }
}

/**
 * Confirm and delete a vector store
 */
function confirmDeleteVectorStore(storeId) {
  const confirmed = confirm("Are you sure you want to delete this vector store? This action cannot be undone.");
  if (confirmed) {
    deleteVectorStoreById(storeId);
  }
}

/**
 * Delete a vector store
 */
async function deleteVectorStoreById(storeId) {
  try {
    await enforceVectorStoreApiCooldown();
    await deleteVectorStore(storeId);
    markVectorStoreApiCall();

    // Clear if it was the active store
    if (getActiveVectorStoreId() === storeId) {
      clearActiveVectorStore();
    }

    // Remove metadata
    removeVectorStoreMetadata(storeId);

    if (window.showInfo) {
      window.showInfo("Vector store deleted successfully");
    }

    await refreshVectorStoreList();
  } catch (error) {
    console.error("Failed to delete vector store:", error);
    if (window.showError) {
      window.showError(`Failed to delete vector store: ${error.message}`);
    }
  }
}

function normalizeVectorStoreLabel(str) {
  return String(str || "").replace(/[_\-]+/g, " ").replace(/\s+/g, " ").trim();
}

function toTitleCase(str) {
  return str.replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}

function deriveFriendlyVectorStoreName(store) {
  if (!store) {
    return "Document Set";
  }
  const originalName = String(store.name || "").trim();
  if (originalName) {
    const chatMatch = originalName.match(/^Chat-(\d{10,})$/i);
    if (chatMatch) {
      const timestamp = Number(chatMatch[1]);
      if (!Number.isNaN(timestamp)) {
        return `Chat ${new Date(timestamp).toLocaleString()}`;
      }
    }
    const normalized = normalizeVectorStoreLabel(originalName);
    if (normalized) {
      return toTitleCase(normalized);
    }
    return originalName;
  }
  if (store.created_at) {
    return `Document Set ${new Date(store.created_at * 1000).toLocaleDateString()}`;
  }
  if (store.id) {
    return `Document Set ${store.id.slice(-6).toUpperCase()}`;
  }
  return "Document Set";
}

function buildFriendlyVectorStoreName(store, meta, index) {
  if (meta && typeof meta.friendlyName === "string" && meta.friendlyName.trim()) {
    return meta.friendlyName.trim();
  }
  if (meta && typeof meta.name === "string" && meta.name.trim()) {
    return deriveFriendlyVectorStoreName({
      ...store,
      name: meta.name,
    });
  }
  const derived = deriveFriendlyVectorStoreName(store);
  if (derived && derived.trim() && derived !== "Document Set") {
    return derived;
  }
  if (store && store.id) {
    return `Document Set ${index + 1} (${store.id.slice(-6).toUpperCase()})`;
  }
  return `Document Set ${index + 1}`;
}

/**
 * Format bytes to human readable format
 */
function formatBytes(bytes) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + " " + sizes[i];
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// Export for use in other modules
window.vectorStoreManager = {
  refresh: refreshVectorStoreList,
  init: initVectorStoreManager,
};
