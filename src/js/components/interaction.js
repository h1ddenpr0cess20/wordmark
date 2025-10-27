/**
 * User interaction handling for the chatbot application
 */

// -----------------------------------------------------
// Message sending and related functionality
// -----------------------------------------------------

/**
 * Sends a message to the API and handles the response
 */
window.sendMessage = async function() {
  const message = window.userInput.value.trim();
  const hasImages = window.pendingUploads && window.pendingUploads.length > 0;
  const hasDocuments = window.pendingDocuments && window.pendingDocuments.length > 0;

  if (!message && !hasImages && !hasDocuments) {
    if (window.VERBOSE_LOGGING) {
      console.info("No message entered. sendMessage aborted.");
    }
    return;
  }

  window.shouldStopGeneration = false;

  if (window.VERBOSE_LOGGING) {
    console.info("New message send initiated:", message);
  }

  // Transform send button into stop button
  window.sendButton.classList.add("stop-mode");
  window.sendButton.title = "Stop generation";

  // Change button action to stop generation
  window.sendButton.removeEventListener("click", window.sendMessage);
  window.sendButton.addEventListener("click", window.stopGeneration);

  // Handle standalone image uploads (not part of a directory)
  const uploads = window.pendingUploads || [];
  let uploadHtml = "";
  const placeholders = [];
  const attachmentsForHistory = [];

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
      dataUrl: up.dataUrl,
      source: "upload",
      uploaded: true,
      timestamp: up.timestamp,
    });
    if (window.imageDataCache && typeof window.imageDataCache.set === "function" && filename && up.dataUrl) {
      window.imageDataCache.set(filename, up.dataUrl);
    }
  });

  // Add document attachments display and save for later upload
  let documentsHtml = "";
  const documents = window.pendingDocuments || [];
  const documentsToUpload = [...documents]; // Save copy before clearing
  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  documents.forEach(doc => {
    const icon = doc.isDirectory ? "📁" : "📄";

    if (doc.isDirectory) {
      // Display directory with file count
      const totalSize = doc.files.reduce((sum, f) => sum + f.size, 0);
      const directoryMarkup = [
        "<div class=\"attached-document\">",
        `<span class="doc-icon">${icon}</span>`,
        `<span class="doc-name">${doc.directoryName}</span>`,
        `<span class="doc-size">${doc.files.length} file${doc.files.length !== 1 ? "s" : ""} (${formatFileSize(totalSize)})</span>`,
        "</div>",
      ].join("\n");
      documentsHtml += directoryMarkup;
      // Add all files from directory to history
      doc.files.forEach(file => {
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
        `<span class="doc-size">${formatFileSize(doc.size)}</span>`,
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

  let userHtml = window.sanitizeInput(message);
  if (documentsHtml) {
    userHtml = `<div class="attached-documents">${documentsHtml}</div>${userHtml}`;
  }
  if (uploadHtml) {
    userHtml = `<div class="generated-images">${uploadHtml}</div>${userHtml}`;
  }

  // Add user message to the conversation and store in history manually
  const userElement = window.appendMessage("You", userHtml, "user", true);
  const userId = userElement ? userElement.id : (typeof window.generateMessageId === "function"
    ? window.generateMessageId()
    : `msg-${Date.now()}`);
  const historyContent = placeholders.length > 0 ? `${placeholders.join("\n")}\n\n${message}` : message;
  window.conversationHistory.push({
    role: "user",
    content: historyContent,
    id: userId,
    timestamp: new Date().toISOString(),
    attachments: attachmentsForHistory.length > 0 ? attachmentsForHistory : undefined,
  });
  if (typeof window.addMessageCopyButton === "function") {
    window.addMessageCopyButton(userElement, userId);
  }
  if (uploads.length > 0) {
    window.generatedImages = window.generatedImages || [];
    for (const up of uploads) {
      window.generatedImages.push({
        url: up.dataUrl,
        tool: "upload",
        prompt: "",
        timestamp: up.timestamp,
        filename: up.filename,
        associatedMessageId: userId,
        uploaded: true,
      });
      if (window.saveImageToDb) {
        window.saveImageToDb(up.dataUrl, up.filename, {
          tool: "upload",
          prompt: "",
          timestamp: up.timestamp,
          associatedMessageId: userId,
          uploaded: true,
        }).catch(err => console.error("Failed to save upload image:", err));
      }
    }
    window.pendingUploads = [];
  }

  // Clear documents and previews after processing
  window.pendingDocuments = [];
  const preview = document.querySelector(".upload-previews");
  if (preview) {
    preview.innerHTML = "";
  }
  console.info("User message added to conversation history.");
  // Auto-save after user message
  if (window.saveCurrentConversation) {
    window.saveCurrentConversation();
  }

  // Clear input and adjust height
  window.userInput.value = "";
  window.userInput.style.height = "auto";

  // Create loading message with pure animation
  const loadingId = `loading-${Date.now()}`;
  const loadingHTML = "<div class=\"loading-animation\"><div class=\"loading-dot\"></div><div class=\"loading-dot\"></div><div class=\"loading-dot\"></div></div>";
  window.appendMessage("Assistant", loadingHTML, "assistant", true);
  const loadingElement = window.chatBox.lastElementChild;
  loadingElement.id = loadingId;

  // Update browser URL
  if (typeof window.updateBrowserHistory === "function") {
    window.updateBrowserHistory();
    console.info("Browser history updated.");
  }

  window.activeLoadingMessageId = loadingId;
  window.isResponsePending = true;

  // Handle document uploads if present - use existing vector store if available
  let vectorStoreId = window.activeVectorStore || null;
  if (hasDocuments) {
    console.log("Has documents:", documentsToUpload.length);
    console.log("File search enabled:", window.responsesClient?.isToolEnabled("builtin:file_search"));

    if (!window.responsesClient?.isToolEnabled("builtin:file_search")) {
      console.warn("File Search tool is not enabled. Documents will not be uploaded.");
      if (window.showInfo) {
        window.showInfo("Enable File Search tool in settings to upload documents");
      }
    } else {
      try {
        console.info("Uploading documents to vector store...");

        // Show status message to user
        if (window.showInfo) {
          window.showInfo("Creating vector store and uploading documents...");
        }

        const { uploadAndAttachFiles } = await import("../services/vectorStore.js");

        // Flatten files from directories and individual uploads
        const files = [];
        documentsToUpload.forEach(doc => {
          if (doc.isDirectory) {
            doc.files.forEach(f => files.push(f.file));
          } else {
            files.push(doc.file);
          }
        });

        console.log("Files to upload:", files.map(f => f.name));
        const result = await uploadAndAttachFiles(files, `Chat-${Date.now()}`);
        vectorStoreId = result.vectorStoreId;
        window.activeVectorStore = vectorStoreId;

        // Save vector store metadata
        if (typeof window.saveVectorStoreMetadata === "function") {
          window.saveVectorStoreMetadata(vectorStoreId, {
            name: `Chat-${Date.now()}`,
            createdAt: Date.now(),
            fileCount: files.length,
          });
        }

        console.info("Documents uploaded to vector store:", vectorStoreId);

        // Show success message
        if (window.showInfo) {
          const uploadedCount = files.length - (result.skipped || 0);
          const message = result.skipped > 0
            ? `Vector store created with ${uploadedCount} file(s). ${result.skipped} file(s) skipped.`
            : `Vector store created with ${uploadedCount} file(s)`;
          window.showInfo(message);
        }
      } catch (error) {
        console.error("Failed to upload documents:", error);
        if (window.showError) {
          window.showError(`Failed to upload documents: ${error.message}`);
        }
        window.removeLoadingIndicator(loadingId);
        window.resetSendButton();
        return;
      }
    }
  }

  try {
    if (!window.responsesClient || typeof window.responsesClient.runTurn !== "function") {
      throw new Error("Responses client is not available. Check that services/api.js is loaded.");
    }

    const abortController = new AbortController();
    window.activeAbortController = abortController;

    const requestMessages = Array.isArray(window.conversationHistory)
      ? [...window.conversationHistory]
      : [];

    const result = await window.responsesClient.runTurn({
      inputMessages: requestMessages,
      model: window.modelSelector ? window.modelSelector.value : undefined,
      verbosity: typeof window.getVerbosity === "function"
        ? window.getVerbosity()
        : undefined,
      reasoningEffort: typeof window.getReasoningEffort === "function"
        ? window.getReasoningEffort()
        : undefined,
      stream: true,
      loadingId,
      abortController,
      vectorStoreId,
    });

    if (window.shouldStopGeneration) {
      return;
    }

    const loadingMessage = document.getElementById(loadingId);
    if (!loadingMessage) {
      return;
    }

    window.finalizeStreamedResponse(loadingMessage, {
      content: result.outputText,
      reasoning: result.reasoningText,
      response: result.response,
    });
  } catch (error) {
    console.error("Error during message send:", error);
    if (error.name === "AbortError") {
      window.removeLoadingIndicator(loadingId);
      if (window.showInfo) {
        window.showInfo("Generation stopped");
      }
    } else {
      window.removeLoadingIndicator(loadingId);
      if (window.showError) {
        window.showError(`Error: ${error.message}`);
      }
    }
    return;
  } finally {
    if (uploads.length > 0 && typeof window.stripBase64FromHistory === "function") {
      window.stripBase64FromHistory(userId, placeholders);
    }
    window.activeAbortController = null;
    window.resetSendButton();
  }
};

/**
 * Stops ongoing generation
 */
window.stopGeneration = function() {
  if (!window.isResponsePending) {
    return;
  }

  window.sendButton.disabled = true;
  window.sendButton.classList.add("stopping");
  window.sendButton.classList.remove("stop-mode");

  window.shouldStopGeneration = true;

  if (window.activeAbortController) {
    try {
      window.activeAbortController.abort();
    } catch (abortError) {
      console.warn("Abort controller error:", abortError);
    }
  }

  if (window.activeLoadingMessageId) {
    window.removeLoadingIndicator(window.activeLoadingMessageId);
  }

  window.resetSendButton();

  if (window.VERBOSE_LOGGING) {
    console.info("Response generation cancelled.");
  }
};

/**
 * Resets the send button to its original state
 */
window.resetSendButton = function() {
  window.sendButton.classList.remove("stop-mode", "stopping");
  window.sendButton.title = "Send message";
  window.sendButton.disabled = false;

  window.activeLoadingMessageId = null;
  window.isResponsePending = false;
  window.shouldStopGeneration = false;
  window.activeAbortController = null;

  // Reset both button and enter key handlers
  window.sendButton.removeEventListener("click", window.stopGeneration);
  window.sendButton.addEventListener("click", window.sendMessage);

  // Make sure userInput is properly enabled but don't focus on mobile
  if (window.userInput) {
    window.userInput.disabled = false;

    // Only focus on desktop devices, skip on mobile to prevent keyboard popup
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
                    window.innerWidth <= 768;

    if (!isMobile) {
      window.userInput.focus();
    } else if (typeof window.scrollInputIntoView === "function") {
      // For mobile, ensure the input is visible without forcing focus
      window.scrollInputIntoView();
    }
  }
};
