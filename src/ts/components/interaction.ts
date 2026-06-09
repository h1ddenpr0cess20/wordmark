import { elements, state } from "../init/state.ts";
import { showError,showInfo } from "../utils/notifications.ts";
/**
 * User interaction handling for the chatbot application
 */

import { sanitizeInput, stripBase64FromHistory } from "../utils/utils.ts";
import { saveImageToDb } from "../utils/imageStorage.ts";
import { scrollInputIntoView } from "../utils/mobileHandling.ts";
import { finalizeStreamedResponse, removeLoadingIndicator } from "../services/streaming/messageLifecycle.ts";
import { updateBrowserHistory } from "../services/history/state.ts";
import { saveCurrentConversation } from "../services/history/persistence.ts";
import { responsesClient } from "../services/api.ts";
import { uploadFile, uploadAndAttachFiles, saveVectorStoreMetadata } from "../services/vectorStore.ts";
import { generateMessageId, addMessageCopyButton } from "./messages.ts";
import { appendMessage } from "./ui/chatMessages.ts";
import { getVerbosity, getReasoningEffort, getHistoryTokenBudget } from "../init/modelSettings.ts";
import type { Attachment } from "../../types/api.ts";

// -----------------------------------------------------
// Message sending and related functionality
// -----------------------------------------------------

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

  // Transform send button into stop button
  sendButton.classList.add("stop-mode");
  sendButton.title = "Stop generation";

  // Change button action to stop generation
  sendButton.removeEventListener("click", sendMessage);
  sendButton.addEventListener("click", stopGeneration);

  // Handle standalone image uploads (not part of a directory)
  const uploads = state.pendingUploads || [];
  let uploadHtml = "";
  const placeholders: string[] = [];
  const attachmentsForHistory: Attachment[] = [];

  // Only process standalone images (pendingUploads is cleared for directory uploads)
  uploads.forEach(up => {
    const ext = up.file && up.file.name.includes(".") ? up.file.name.split(".").pop() : "png";
    const filename = `upload-${Date.now()}-${Math.random().toString(36).substring(2,8)}.${ext}`;
    up.filename = filename;
    up.timestamp = new Date().toISOString();
    uploadHtml += `<img src="${up.dataUrl}" alt="Uploaded Image" class="generated-image-thumbnail" data-filename="${filename}" data-timestamp="${up.timestamp}" />`;
    placeholders.push(`[[IMAGE: ${filename}]]`);
    const mimeType = (up.file && up.file.type) || (typeof up.dataUrl === "string" && up.dataUrl.startsWith("data:")
      ? up.dataUrl.split(";")[0].replace("data:", "")
      : "image/png");
    attachmentsForHistory.push({
      type: "image",
      filename,
      mimeType,
      mediaType: "image",
      dataUrl: up.dataUrl,
      source: "upload",
      uploaded: true,
      timestamp: up.timestamp,
    });
    if (state.imageDataCache && typeof state.imageDataCache.set === "function" && filename && up.dataUrl) {
      state.imageDataCache.set(filename, up.dataUrl);
    }
  });

  // Add document attachments display and save for later upload
  let documentsHtml = "";
  const documents = state.pendingDocuments || [];
  const documentsToUpload = [...documents]; // Save copy before clearing
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  documents.forEach(doc => {
    const icon = doc.isDirectory ? "📁" : "📄";

    if (doc.isDirectory) {
      // Display directory with file count
      const directoryFiles = doc.files || [];
      const totalSize = directoryFiles.reduce((sum, f) => sum + f.size, 0);
      const directoryMarkup = [
        "<div class=\"attached-document\">",
        `<span class="doc-icon">${icon}</span>`,
        `<span class="doc-name">${doc.directoryName}</span>`,
        `<span class="doc-size">${directoryFiles.length} file${directoryFiles.length !== 1 ? "s" : ""} (${formatFileSize(totalSize)})</span>`,
        "</div>",
      ].join("\n");
      documentsHtml += directoryMarkup;
      // Add all files from directory to history
      directoryFiles.forEach(file => {
        attachmentsForHistory.push({
          type: "document",
          filename: file.name,
          mimeType: file.type,
          size: file.size,
          source: "upload",
          uploaded: true,
          timestamp: new Date().toISOString(),
          directory: doc.directoryName,
        });
      });
    } else {
      // Individual file
      const fileMarkup = [
        "<div class=\"attached-document\">",
        `<span class="doc-icon">${icon}</span>`,
        `<span class="doc-name">${doc.name}</span>`,
        `<span class="doc-size">${formatFileSize(doc.size || 0)}</span>`,
        "</div>",
      ].join("\n");
      documentsHtml += fileMarkup;
      attachmentsForHistory.push({
        type: "document",
        filename: doc.name,
        mimeType: doc.type,
        size: doc.size,
        source: "upload",
        uploaded: true,
        timestamp: new Date().toISOString(),
      });
    }
  });

  let userHtml = sanitizeInput(message);
  if (documentsHtml) {
    userHtml = `<div class="attached-documents">${documentsHtml}</div>${userHtml}`;
  }
  if (uploadHtml) {
    userHtml = `<div class="generated-images">${uploadHtml}</div>${userHtml}`;
  }

  // Add user message to the conversation and store in history manually
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

  // Clear documents and previews after processing
  state.pendingDocuments = [];
  const preview = document.querySelector(".upload-previews") as any;
  if (preview) {
    preview.innerHTML = "";
  }
  console.info("User message added to conversation history.");
  // Auto-save after user message
  saveCurrentConversation();

  // Clear input and adjust height
  userInput.value = "";
  userInput.style.height = "auto";

  // Create loading message with pure animation
  const loadingId = `loading-${Date.now()}`;
  const loadingHTML = "<div class=\"loading-animation\"><div class=\"loading-dot\"></div><div class=\"loading-dot\"></div><div class=\"loading-dot\"></div></div>";
  appendMessage("Assistant", loadingHTML, "assistant", true);
  const loadingElement = elements.chatBox ? elements.chatBox.lastElementChild : null;
  if (loadingElement) {
    loadingElement.id = loadingId;
  }

  // Update browser URL
  updateBrowserHistory();
  console.info("Browser history updated.");

  state.activeLoadingMessageId = loadingId;
  state.isResponsePending = true;

  // Handle document uploads if present
  let vectorStoreId = state.activeVectorStore || null;
  const activeServiceKey = elements.serviceSelector ? elements.serviceSelector.value : "openai";
  if (hasDocuments) {
    console.log("Has documents:", documentsToUpload.length);

    // Flatten files from directories and individual uploads
    const files: File[] = [];
    documentsToUpload.forEach(doc => {
      if (doc.isDirectory) {
        (doc.files || []).forEach(f => files.push(f.file));
      } else if (doc.file) {
        files.push(doc.file);
      }
    });

    if (activeServiceKey === "xai") {
      // xAI: upload files and attach as input_file references directly in the message
      try {
        if (showInfo) {
          showInfo("Uploading files...");
        }

        const fileIds = [];
        for (const file of files) {
          const uploaded = await uploadFile(file);
          fileIds.push(uploaded.id);
        }

        // Inject input_file parts into the last user message in conversation history
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
        removeLoadingIndicator(loadingId);
        resetSendButton();
        return;
      }
    } else {
      // OpenAI: use vector stores + file_search
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

          // Save vector store metadata
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
          removeLoadingIndicator(loadingId);
          resetSendButton();
          return;
        }
      }
    }
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

  // Reset both button and enter key handlers
  if (elements.sendButton) {
    elements.sendButton.removeEventListener("click", stopGeneration);
    elements.sendButton.addEventListener("click", sendMessage);
  }

  // Make sure userInput is properly enabled but don't focus on mobile
  if (elements.userInput) {
    elements.userInput.disabled = false;

    // Only focus on desktop devices, skip on mobile to prevent keyboard popup
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
                    window.innerWidth <= 768;

    if (!isMobile) {
      elements.userInput.focus();
    } else {
      // For mobile, ensure the input is visible without forcing focus
      scrollInputIntoView();

    }
  }
}
