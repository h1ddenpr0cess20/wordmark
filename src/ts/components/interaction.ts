/**
 * User interaction handling: message sending and the send/stop lifecycle.
 */

import { elements, state } from "../init/state.ts";
import { showError, showInfo } from "../utils/notifications.ts";

import { sanitizeInput, stripBase64FromHistory } from "../utils/utils.ts";
import { saveImageToDb } from "../utils/storage/imageStorage.ts";
import { scrollInputIntoView } from "../utils/mobileHandling.ts";
import { finalizeStreamedResponse, removeLoadingIndicator } from "../services/streaming/messageLifecycle.ts";
import { updateBrowserHistory } from "../services/history/state.ts";
import { saveCurrentConversation } from "../services/history/persistence.ts";
import { responsesClient } from "../services/api.ts";
import { uploadFile, uploadAndAttachFiles, saveVectorStoreMetadata } from "../services/vectorStore.ts";
import { generateMessageId, addMessageCopyButton } from "./messages.ts";
import { appendMessage } from "./ui/chatMessages.ts";
import { getVerbosity, getReasoningEffort, getHistoryTokenBudget } from "../init/modelSettings.ts";
import { buildOutgoingAttachments } from "./outgoingAttachments.ts";
import type { PendingDocument } from "../../types/attachments.ts";

/** Outcome of {@link uploadPendingDocuments}: whether to proceed, plus the (possibly new) vector-store id. */
interface DocumentUploadResult {
  /** `false` when an upload failed and the send should be aborted. */
  ok: boolean;
  vectorStoreId: string | null;
}

/**
 * Uploads the pending document attachments for the active provider before a
 * turn runs.
 *
 * @remarks
 * For xAI, each file is uploaded and its id appended to the last user message
 * as `input_file` content parts. For other providers, files are pushed into a
 * (newly created) vector store for File Search — but only when the File Search
 * tool is enabled; if it is disabled the upload is skipped and the turn still
 * proceeds. Flattens directory entries into their constituent files.
 *
 * @returns `{ ok: false }` if an upload failed (the caller should abort the
 * send); otherwise `{ ok: true, vectorStoreId }` with the id to use for the turn.
 */
async function uploadPendingDocuments(
  documentsToUpload: PendingDocument[],
  activeServiceKey: string,
  vectorStoreId: string | null,
): Promise<DocumentUploadResult> {
  console.log("Has documents:", documentsToUpload.length);

  const files: File[] = [];
  documentsToUpload.forEach(doc => {
    if (doc.isDirectory) {
      (doc.files || []).forEach(f => files.push(f.file));
    } else if (doc.file) {
      files.push(doc.file);
    }
  });

  if (activeServiceKey === "xai") {
    try {
      if (showInfo) {
        showInfo("Uploading files...");
      }

      const fileIds = [];
      for (const file of files) {
        const uploaded = await uploadFile(file);
        fileIds.push(uploaded.id);
      }

      const lastUserMsg = state.conversationHistory[state.conversationHistory.length - 1];
      if (lastUserMsg && lastUserMsg.role === "user") {
        const fileParts = fileIds.map(id => ({ type: "input_file", file_id: id }));
        if (typeof lastUserMsg.content === "string") {
          const textPart = { type: "input_text", text: lastUserMsg.content };
          lastUserMsg.content = [textPart, ...fileParts];
        } else if (Array.isArray(lastUserMsg.content)) {
          lastUserMsg.content.push(...fileParts);
        }
      }

      console.info("Files uploaded for xAI:", fileIds);
      if (showInfo) {
        showInfo(`${fileIds.length} file(s) uploaded`);
      }
    } catch (error) {
      console.error("Failed to upload files:", error);
      if (showError) {
        showError(`Failed to upload files: ${error instanceof Error ? error.message : ""}`);
      }
      return { ok: false, vectorStoreId };
    }
  } else {
    console.log("File search enabled:", responsesClient?.isToolEnabled("builtin:file_search"));

    if (!responsesClient?.isToolEnabled("builtin:file_search")) {
      console.warn("File Search tool is not enabled. Documents will not be uploaded.");
      if (showInfo) {
        showInfo("Enable File Search tool in settings to upload documents");
      }
    } else {
      try {
        console.info("Uploading documents to vector store...");

        if (showInfo) {
          showInfo("Creating vector store and uploading documents...");
        }

        console.log("Files to upload:", files.map(f => f.name));
        const result = await uploadAndAttachFiles(files, `Chat-${Date.now()}`);
        vectorStoreId = result.vectorStoreId;
        state.activeVectorStore = vectorStoreId;

        if (vectorStoreId) {
          saveVectorStoreMetadata(vectorStoreId, {
            name: `Chat-${Date.now()}`,
            createdAt: Date.now(),
            fileCount: files.length,
          });
        }

        console.info("Documents uploaded to vector store:", vectorStoreId);

        if (showInfo) {
          const uploadedCount = files.length - (result.skipped || 0);
          const message = result.skipped > 0
            ? `Vector store created with ${uploadedCount} file(s). ${result.skipped} file(s) skipped.`
            : `Vector store created with ${uploadedCount} file(s)`;
          showInfo(message);
        }
      } catch (error) {
        console.error("Failed to upload documents:", error);
        if (showError) {
          showError(`Failed to upload documents: ${error instanceof Error ? error.message : ""}`);
        }
        return { ok: false, vectorStoreId };
      }
    }
  }

  return { ok: true, vectorStoreId };
}

/**
 * Sends a message to the API and handles the response
 */
export async function sendMessage() {
  const userInput = elements.userInput;
  const sendButton = elements.sendButton;
  if (!userInput || !sendButton) {
    return;
  }
  const message = userInput.value.trim();
  const hasImages = state.pendingUploads && state.pendingUploads.length > 0;
  const hasDocuments = state.pendingDocuments && state.pendingDocuments.length > 0;

  if (!message && !hasImages && !hasDocuments) {
    if (state.verboseLogging) {
      console.info("No message entered. sendMessage aborted.");
    }
    return;
  }

  state.shouldStopGeneration = false;

  if (state.verboseLogging) {
    console.info("New message send initiated:", message);
  }

  sendButton.classList.add("stop-mode");
  sendButton.title = "Stop generation";

  sendButton.removeEventListener("click", sendMessage);
  sendButton.addEventListener("click", stopGeneration);

  const uploads = state.pendingUploads || [];
  const documents = state.pendingDocuments || [];
  const documentsToUpload = [...documents];

  const { uploadHtml, documentsHtml, placeholders, attachmentsForHistory } =
    buildOutgoingAttachments(uploads, documents);

  let userHtml = sanitizeInput(message);
  if (documentsHtml) {
    userHtml = `<div class="attached-documents">${documentsHtml}</div>${userHtml}`;
  }
  if (uploadHtml) {
    userHtml = `<div class="generated-images">${uploadHtml}</div>${userHtml}`;
  }

  const userElement = appendMessage("You", userHtml, "user", true);
  const userId = userElement ? userElement.id : generateMessageId();
  const historyContent = placeholders.length > 0 ? `${placeholders.join("\n")}\n\n${message}` : message;
  state.conversationHistory.push({
    role: "user",
    content: historyContent,
    id: userId,
    timestamp: new Date().toISOString(),
    attachments: attachmentsForHistory.length > 0 ? attachmentsForHistory : undefined,
  });
  addMessageCopyButton(userElement, userId);
  if (uploads.length > 0) {
    state.generatedImages = state.generatedImages || [];
    for (const up of uploads) {
      state.generatedImages.push({
        url: up.dataUrl ?? undefined,
        tool: "upload",
        prompt: "",
        timestamp: up.timestamp,
        filename: up.filename,
        associatedMessageId: userId,
        uploaded: true,
        mediaType: "image",
        mimeType: (up.file && up.file.type) || "image/png",
        isStoredInDb: true,
      });
      if (saveImageToDb && up.dataUrl && up.filename) {
        saveImageToDb(up.dataUrl, up.filename, {
          tool: "upload",
          prompt: "",
          timestamp: up.timestamp,
          associatedMessageId: userId,
          uploaded: true,
          mediaType: "image",
          mimeType: (up.file && up.file.type) || "image/png",
        }).catch(err => console.error("Failed to save upload image:", err));
      }
    }
    state.pendingUploads = [];
  }

  state.pendingDocuments = [];
  const preview = document.querySelector(".upload-previews");
  if (preview) {
    preview.innerHTML = "";
  }
  console.info("User message added to conversation history.");
  saveCurrentConversation();

  userInput.value = "";
  userInput.style.height = "auto";

  const loadingId = `loading-${Date.now()}`;
  const loadingHTML = "<div class=\"loading-animation\"><div class=\"loading-dot\"></div><div class=\"loading-dot\"></div><div class=\"loading-dot\"></div></div>";
  appendMessage("Assistant", loadingHTML, "assistant", true);
  const loadingElement = elements.chatBox ? elements.chatBox.lastElementChild : null;
  if (loadingElement) {
    loadingElement.id = loadingId;
  }

  updateBrowserHistory();
  console.info("Browser history updated.");

  state.activeLoadingMessageId = loadingId;
  state.isResponsePending = true;

  let vectorStoreId = state.activeVectorStore || null;
  const activeServiceKey = elements.serviceSelector ? elements.serviceSelector.value : "openai";
  if (hasDocuments) {
    const uploadResult = await uploadPendingDocuments(documentsToUpload, activeServiceKey, vectorStoreId);
    if (!uploadResult.ok) {
      removeLoadingIndicator(loadingId);
      resetSendButton();
      return;
    }
    vectorStoreId = uploadResult.vectorStoreId;
  }

  try {
    if (!responsesClient || typeof responsesClient.runTurn !== "function") {
      throw new Error("Responses client is not available. Check that services/api.js is loaded.");
    }

    const abortController = new AbortController();
    state.activeAbortController = abortController;

    const requestMessages = Array.isArray(state.conversationHistory)
      ? [...state.conversationHistory]
      : [];

    const result = await responsesClient.runTurn({
      inputMessages: requestMessages,
      model: elements.modelSelector ? elements.modelSelector.value : undefined,
      verbosity: getVerbosity(),
      reasoningEffort: getReasoningEffort() ?? undefined,
      stream: true,
      loadingId,
      abortController,
      vectorStoreId,
      historyTokenBudget: getHistoryTokenBudget(),
    });

    if (state.shouldStopGeneration) {
      return;
    }

    const loadingMessage = document.getElementById(loadingId);
    if (!loadingMessage) {
      return;
    }

    finalizeStreamedResponse(loadingMessage, {
      content: result.outputText,
      reasoning: result.reasoningText,
      response: result.response,
    });
  } catch (error) {
    console.error("Error during message send:", error);
    if (error instanceof Error && error.name === "AbortError") {
      removeLoadingIndicator(loadingId);
      if (showInfo) {
        showInfo("Generation stopped");
      }
    } else {
      removeLoadingIndicator(loadingId);
      if (showError) {
        showError(`Error: ${error instanceof Error ? error.message : ""}`);
      }
    }
    return;
  } finally {
    if (uploads.length > 0) {
      stripBase64FromHistory(userId, placeholders);
    }
    state.activeAbortController = null;
    resetSendButton();
  }
}

/**
 * Stops ongoing generation
 */
export function stopGeneration() {
  if (!state.isResponsePending) {
    return;
  }

  if (elements.sendButton) {
    elements.sendButton.disabled = true;
    elements.sendButton.classList.add("stopping");
    elements.sendButton.classList.remove("stop-mode");
  }

  state.shouldStopGeneration = true;

  if (state.activeAbortController) {
    try {
      state.activeAbortController.abort();
    } catch (abortError) {
      console.warn("Abort controller error:", abortError);
    }
  }

  if (state.activeLoadingMessageId) {
    removeLoadingIndicator(state.activeLoadingMessageId);
  }

  resetSendButton();

  if (state.verboseLogging) {
    console.info("Response generation cancelled.");
  }
}

/**
 * Resets the send button to its original state
 */
export function resetSendButton() {
  if (elements.sendButton) {
    elements.sendButton.classList.remove("stop-mode", "stopping");
    elements.sendButton.title = "Send message";
    elements.sendButton.disabled = false;
  }

  state.activeLoadingMessageId = null;
  state.isResponsePending = false;
  state.shouldStopGeneration = false;
  state.activeAbortController = null;

  if (elements.sendButton) {
    elements.sendButton.removeEventListener("click", stopGeneration);
    elements.sendButton.addEventListener("click", sendMessage);
  }

  if (elements.userInput) {
    elements.userInput.disabled = false;

    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
                    window.innerWidth <= 768;

    if (!isMobile) {
      elements.userInput.focus();
    } else {
      scrollInputIntoView();

    }
  }
}
