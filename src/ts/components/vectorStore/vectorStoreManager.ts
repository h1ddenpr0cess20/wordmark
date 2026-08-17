/**
 * Vector-store management UI.
 *
 * @remarks
 * Browser UI for listing, activating, inspecting, and deleting vector stores,
 * tracking the active-store selection metadata.
 */

import { showError, showInfo } from "../../utils/notifications.ts";
import { escapeHtml } from "../../utils/sanitize.ts";
import { isRecord } from "../../utils/utils.ts";
import { alertMessage, confirmAction } from "../../utils/dialogs.ts";
import {
  listVectorStores,
  deleteVectorStore,
  getVectorStore,
  listVectorStoreFiles,
  clearActiveVectorStore,
  getActiveVectorStoreId,
  getActiveVectorStoreIds,
  saveVectorStoreMetadata,
  getVectorStoreMetadata,
  removeVectorStoreMetadata,
  MAX_ACTIVE_VECTOR_STORES,
} from "../../services/vectorStore.ts";
import {
  deriveFriendlyVectorStoreName,
  buildFriendlyVectorStoreName,
  formatBytes,
} from "./vectorStoreFormatting.ts";

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
      clearActiveVectorStore();
      try {
        const meta = getVectorStoreMetadata();
        if (meta && typeof meta === "object") {
          Object.keys(meta).forEach(id => removeVectorStoreMetadata(id));
        }
      } catch (error) {
        console.warn("Failed to clear vector store metadata:", error);
      }
      if (showInfo) {
        showInfo("Cleared all active vector stores");
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

  const activeIds = getActiveVectorStoreIds();

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

    const listHtml = stores.map((store: unknown, index: number) => {
      const rec = isRecord(store) ? store : {};
      const storeId = typeof rec.id === "string" ? rec.id : "";
      const safeStoreId = escapeHtml(storeId);
      const isActive = Array.isArray(activeIds) ? activeIds.includes(storeId) : (storeId === getActiveVectorStoreId());
      const meta = metadata[storeId] || {};
      const createdDate = new Date(Number(rec.created_at) * 1000).toLocaleDateString();
      const fileCount = (isRecord(rec.file_counts) && typeof rec.file_counts.total === "number") ? rec.file_counts.total : 0;
      const friendlyName = escapeHtml(buildFriendlyVectorStoreName(store, meta, index));

      return `
        <div class="vector-store-item ${isActive ? "active" : ""}" data-store-id="${safeStoreId}">
          <div class="vector-store-header">
            <div class="vector-store-name">
              ${isActive ? "<span class=\"active-badge\">Active</span>" : ""}
              <strong>${friendlyName}</strong>
            </div>
            <div class="vector-store-actions">
            <div class="tool-toggle-control" title="Enable/disable this store for File Search">
              <div class="toggle-container">
                <input type="checkbox" id="enable-${safeStoreId}" class="store-enable-toggle" data-store-id="${safeStoreId}" ${isActive ? "checked" : ""}>
                <label for="enable-${safeStoreId}" class="toggle-switch"></label>
              </div>
            </div>
            <button class="tool-action-button btn-view" data-store-id="${safeStoreId}" title="View details">View</button>
            <button class="btn-small btn-delete" data-store-id="${safeStoreId}" title="Delete this vector store">Delete</button>
          </div>
          </div>
          <div class="vector-store-meta">
            <span class="meta-item"><strong>ID:</strong> ${safeStoreId}</span>
            <span class="meta-item"><strong>Files:</strong> ${fileCount}</span>
            <span class="meta-item"><strong>Created:</strong> ${createdDate}</span>
            ${meta.lastUsed ? `<span class="meta-item"><strong>Last Used:</strong> ${new Date(meta.lastUsed).toLocaleString()}</span>` : ""}
          </div>
        </div>
      `;
    }).join("");

    listContainer.innerHTML = listHtml;

    listContainer.querySelectorAll(".store-enable-toggle").forEach(input => {
      input.addEventListener("change", async (e) => {
        const target = e.target as HTMLInputElement;
        const storeId = target.getAttribute("data-store-id");
        const checked = target.checked;
        if (!storeId) return;
        try {
          if (checked) {
            const container = document.getElementById("vector-store-list");
            const currentlyChecked = container ? container.querySelectorAll(".store-enable-toggle:checked").length : 0;
            if (currentlyChecked > MAX_ACTIVE_VECTOR_STORES) {
              target.checked = false;
              if (showError) {
                showError(`You can enable up to ${MAX_ACTIVE_VECTOR_STORES} vector stores at a time.`);
              } else {
                await alertMessage(`You can enable up to ${MAX_ACTIVE_VECTOR_STORES} vector stores at a time.`, undefined, "error");
              }
              return;
            }
            const store = await getVectorStore(storeId);
            const friendlyDisplayName = deriveFriendlyVectorStoreName(store);
            saveVectorStoreMetadata(storeId, {
              name: store.name,
              friendlyName: friendlyDisplayName,
              createdAt: store.created_at,
              fileCount: store.file_counts?.total || 0,
            });
            if (showInfo) {
              showInfo(`Enabled vector store "${friendlyDisplayName || store.name || storeId}"`);
            }
          } else {
            const metadata = getVectorStoreMetadata();
            const friendlyDisplayName = metadata?.[storeId]?.friendlyName || metadata?.[storeId]?.name || storeId;
            removeVectorStoreMetadata(storeId);
            try {
              if (getActiveVectorStoreId() === storeId) {
                clearActiveVectorStore();
              }
            } catch { /* noop */ }
            if (showInfo) {
              showInfo(`Disabled vector store "${friendlyDisplayName}"`);
            }
          }
        } catch (error) {
          console.error("Failed to toggle vector store:", error);
          if (showError) {
            showError(`Failed to toggle vector store: ${error instanceof Error ? error.message : ""}`);
          }
        } finally {
          refreshVectorStoreList(false);
        }
      });
    });

    listContainer.querySelectorAll(".btn-view").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const storeId = (e.target as HTMLElement).getAttribute("data-store-id");
        void viewVectorStoreDetails(storeId);
      });
    });

    listContainer.querySelectorAll(".btn-delete").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const storeId = (e.target as HTMLElement).getAttribute("data-store-id");
        void confirmDeleteVectorStore(storeId);
      });
    });

  } catch (error) {
    console.error("Failed to load vector stores:", error);

    const errorMessage = error instanceof Error ? error.message : "";
    const errorName = error instanceof Error ? error.name : "";
    const isCorsError = errorMessage.includes("CORS") ||
                        errorMessage.includes("fetch") ||
                        errorName === "TypeError";

    if (isCorsError) {
      listContainer.innerHTML = `
        <div class="info-message">
          <p><strong>Vector Store Listing Not Available</strong></p>
        </div>
      `;
    } else {
      listContainer.innerHTML = `<div class="error-message">Failed to load vector stores: ${escapeHtml(errorMessage)}</div>`;
    }
  }
}

/**
 * View vector store details
 */
async function viewVectorStoreDetails(storeId: string | null) {
  if (!storeId) return;
  try {
    const store = await getVectorStore(storeId);
    const filesResponse = await listVectorStoreFiles(storeId, 100);
    const files = filesResponse.data || [];

    const fileList = files.length > 0
      ? files.map((f: unknown) => {
        const r = isRecord(f) ? f : {};
        return `${String(r.id ?? "")} (${String(r.status ?? "")})`;
      })
      : ["No files in this vector store"];

    // A native message box renders plain text, so the detail is assembled as
    // lines rather than the HTML fragment this used to strip tags out of.
    const detailLines = [
      `ID: ${store.id}`,
      `Created: ${new Date(store.created_at * 1000).toLocaleString()}`,
      `Total Files: ${store.file_counts?.total || 0}`,
      `Completed Files: ${store.file_counts?.completed || 0}`,
      `In Progress: ${store.file_counts?.in_progress || 0}`,
      `Failed: ${store.file_counts?.failed || 0}`,
      ...(store.usage_bytes ? [`Storage Used: ${formatBytes(store.usage_bytes)}`] : []),
      "",
      "Files:",
      ...fileList,
    ];

    await alertMessage(store.name || "Unnamed Store", detailLines.join("\n"));
  } catch (error) {
    console.error("Failed to view vector store details:", error);
    if (showError) {
      showError(`Failed to view vector store: ${error instanceof Error ? error.message : ""}`);
    }
  }
}

/**
 * Confirm and delete a vector store
 */
async function confirmDeleteVectorStore(storeId: string | null) {
  const confirmed = await confirmAction({
    message: "Delete this vector store?",
    detail: "The store and its indexed files are removed from your OpenAI account. This cannot be undone.",
    confirmLabel: "Delete",
    destructive: true,
  });
  if (confirmed) {
    await deleteVectorStoreById(storeId);
  }
}

/**
 * Delete a vector store
 */
async function deleteVectorStoreById(storeId: string | null) {
  if (!storeId) return;
  try {
    await enforceVectorStoreApiCooldown();
    await deleteVectorStore(storeId);
    markVectorStoreApiCall();

    if (getActiveVectorStoreId() === storeId) {
      clearActiveVectorStore();
    }

    removeVectorStoreMetadata(storeId);

    if (showInfo) {
      showInfo("Vector store deleted successfully");
    }

    await refreshVectorStoreList();
  } catch (error) {
    console.error("Failed to delete vector store:", error);
    if (showError) {
      showError(`Failed to delete vector store: ${error instanceof Error ? error.message : ""}`);
    }
  }
}

