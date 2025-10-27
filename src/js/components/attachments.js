/**
 * File upload and attachment handling (images and documents)
 */

import { filterSupportedFiles } from "../services/vectorStore.js";

window.pendingUploads = [];
window.pendingDocuments = [];
window.activeVectorStore = null;

window.initImageUploads = function() {
  const uploadInput = document.getElementById("image-upload");
  const directoryInput = document.getElementById("directory-upload");
  const uploadButton = document.getElementById("upload-button");
  const inputWrapper = document.querySelector(".input-wrapper");
  const userInput = document.getElementById("user-input");

  if (!uploadInput || !uploadButton || !inputWrapper || !userInput) {
    return;
  }

  // Show menu on upload button click
  uploadButton.addEventListener("click", (e) => {
    e.stopPropagation();
    showUploadMenu(e.currentTarget, uploadInput, directoryInput);
  });

  uploadInput.addEventListener("change", async(e) => {
    const files = Array.from(e.target.files || []);
    await handleFiles(files);
    uploadInput.value = "";
  });

  directoryInput.addEventListener("change", async(e) => {
    const files = Array.from(e.target.files || []);
    // Group and append one or more directories; preserve relative paths
    await handleFiles(files, { isDirectory: true });
    directoryInput.value = "";
  });

  // Drag and drop functionality
  setupDragAndDrop(inputWrapper);

  // Paste functionality
  setupPasteHandler(userInput);
};

/**
 * Show upload menu to choose between files or directory
 */
function showUploadMenu(button, fileInput, directoryInput) {
  // Remove any existing menu
  const existingMenu = document.querySelector(".upload-menu");
  if (existingMenu) {
    existingMenu.remove();
    return;
  }

  const menu = document.createElement("div");
  menu.className = "upload-menu";

  const filesOption = document.createElement("button");
  filesOption.className = "upload-menu-item";
  filesOption.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
      <polyline points="13 2 13 9 20 9"></polyline>
    </svg>
    <span>Attach Files</span>
  `;
  filesOption.addEventListener("click", () => {
    menu.remove();
    fileInput.click();
  });

  const directoryOption = document.createElement("button");
  directoryOption.className = "upload-menu-item";
  directoryOption.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
    </svg>
    <span>Attach Directory</span>
  `;
  directoryOption.addEventListener("click", () => {
    menu.remove();
    directoryInput.click();
  });

  menu.appendChild(filesOption);
  menu.appendChild(directoryOption);

  // Position the menu above the button
  const rect = button.getBoundingClientRect();
  menu.style.position = "absolute";
  menu.style.bottom = (window.innerHeight - rect.top + 5) + "px";
  menu.style.right = (window.innerWidth - rect.right) + "px";

  document.body.appendChild(menu);

  // Close menu when clicking outside
  setTimeout(() => {
    const closeMenu = (e) => {
      if (!menu.contains(e.target) && e.target !== button) {
        menu.remove();
        document.removeEventListener("click", closeMenu);
      }
    };
    document.addEventListener("click", closeMenu);
  }, 0);
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Supported document extensions for OpenAI file uploads
 */
const SUPPORTED_DOCUMENT_EXTENSIONS = [
  ".c", ".cpp", ".cs", ".css", ".doc", ".docx", ".go", ".html",
  ".java", ".js", ".json", ".md", ".pdf", ".php", ".pptx", ".py",
  ".rb", ".sh", ".tex", ".ts", ".txt",
];

/**
 * Check if a file is a supported document type
 */
function isSupportedDocument(file) {
  const fileName = file.name.toLowerCase();
  return SUPPORTED_DOCUMENT_EXTENSIONS.some(ext => fileName.endsWith(ext));
}

/**
 * Handle files from various sources (upload, drag/drop, paste)
 * Now supports:
 * - Appending multiple batches (does not overwrite existing pending items)
 * - Multiple directory selection (groups by top-level folder)
 * - Preserving relative paths for directory uploads and drag-and-drop
 */
async function handleFiles(files, options = {}) {
  if (!files || files.length === 0) {
    return;
  }

  const { isDirectory = false } = options;

  // Ensure arrays exist
  window.pendingUploads = window.pendingUploads || [];
  window.pendingDocuments = window.pendingDocuments || [];

  if (isDirectory) {
    // Filter using vector store supported extensions
    const { supported, unsupported } = filterSupportedFiles(files);

    // Notify user about unsupported files
    if (unsupported.length > 0) {
      const unsupportedNames = unsupported.map(f => f.name);
      const message = unsupported.length === 1
        ? `File "${unsupportedNames[0]}" is not supported and was skipped.`
        : `${unsupported.length} files were skipped (unsupported format): ${unsupportedNames.slice(0, 3).join(", ")}${unsupported.length > 3 ? "..." : ""}`;
      if (window.showInfo) {
        window.showInfo(message);
      } else {
        console.warn("Unsupported files skipped:", unsupportedNames);
      }
    }

    // Group supported files by their top-level directory name (from relative path)
    const groups = new Map();
    for (const file of supported) {
      // Prefer File.webkitRelativePath or custom _relativePath set via drag-and-drop traversal
      const rel = file.webkitRelativePath || file._relativePath || file.name;
      const parts = rel.split("/");
      const top = parts[0] || "Directory";
      // Path inside the selected folder
      const innerRel = parts.slice(1).join("/") || file.name;

      if (!groups.has(top)) groups.set(top, []);
      groups.get(top).push({
        file,
        name: file.name,
        size: file.size,
        type: file.type,
        isImage: file.type?.startsWith("image/") || false,
        relativePath: innerRel,
      });
    }

    // If we couldn't infer any directory structure, treat as individual documents
    const hasStructure = Array.from(groups.keys()).some(k => k && k !== "Directory") ||
                         supported.some(f => (f.webkitRelativePath || f._relativePath || "").includes("/"));

    if (!hasStructure) {
      // Append as individual document attachments
      window.pendingDocuments.push(...supported.map(file => ({
        file,
        name: file.name,
        size: file.size,
        type: file.type,
      })));
    } else {
      // Append grouped directories
      for (const [directoryName, fileList] of groups) {
        window.pendingDocuments.push({
          isDirectory: true,
          directoryName,
          files: fileList,
        });
      }
    }
  } else {
    // For individual file uploads, separate images and documents
    const imageFiles = [];
    const documentFiles = [];
    const unsupportedFiles = [];

    for (const file of files) {
      if (file.type?.startsWith("image/")) {
        imageFiles.push(file);
      } else if (isSupportedDocument(file)) {
        documentFiles.push(file);
      } else {
        unsupportedFiles.push(file.name);
      }
    }

    // Notify user about unsupported files
    if (unsupportedFiles.length > 0) {
      const message = unsupportedFiles.length === 1
        ? `File "${unsupportedFiles[0]}" is not supported and was skipped.`
        : `${unsupportedFiles.length} files were skipped (unsupported format): ${unsupportedFiles.slice(0, 3).join(", ")}${unsupportedFiles.length > 3 ? "..." : ""}`;
      if (window.showInfo) {
        window.showInfo(message);
      } else {
        console.warn("Unsupported files skipped:", unsupportedFiles);
      }
    }

    // Append images
    if (imageFiles.length > 0) {
      for (const file of imageFiles) {
        const dataUrl = await readFileAsDataURL(file);
        window.pendingUploads.push({ file, dataUrl });
      }
    }

    // Append documents
    if (documentFiles.length > 0) {
      window.pendingDocuments.push(...documentFiles.map(file => ({
        file,
        name: file.name,
        size: file.size,
        type: file.type,
      })));
    }
  }

  if (typeof window.showPendingUploadPreviews === "function") {
    window.showPendingUploadPreviews();
  }
}

/**
 * Setup drag and drop functionality for the input wrapper
 * Enhanced to support folder drops by recursively reading directory entries
 */
function setupDragAndDrop(inputWrapper) {
  let dragTimeout = null;

  // Prevent default drag behaviors on both wrapper and document
  ["dragenter", "dragover", "dragleave", "drop"].forEach(eventName => {
    inputWrapper.addEventListener(eventName, preventDefaults, false);
    document.body.addEventListener(eventName, preventDefaults, false);
  });

  // Show drag-over state when dragging over the wrapper
  inputWrapper.addEventListener("dragenter", handleDragEnter, false);
  inputWrapper.addEventListener("dragover", handleDragOver, false);

  // Hide drag-over state when leaving wrapper or dropping
  inputWrapper.addEventListener("dragleave", handleDragLeave, false);
  inputWrapper.addEventListener("drop", handleDrop, false);

  // Global cleanup when drag operation ends
  document.addEventListener("dragend", cleanupDragState, false);

  function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  function handleDragEnter(e) {
    // Clear any existing timeout
    if (dragTimeout) {
      clearTimeout(dragTimeout);
      dragTimeout = null;
    }

    // Only activate if dragging files
    if (e.dataTransfer && e.dataTransfer.types.includes("Files")) {
      inputWrapper.classList.add("drag-over");
    }
  }

  function handleDragOver(e) {
    // Clear any existing timeout
    if (dragTimeout) {
      clearTimeout(dragTimeout);
      dragTimeout = null;
    }

    // Keep the drag-over state active
    if (e.dataTransfer && e.dataTransfer.types.includes("Files")) {
      inputWrapper.classList.add("drag-over");
    }
  }

  function handleDragLeave(e) {
    // Use a small timeout to prevent flickering when moving between child elements
    if (dragTimeout) {
      clearTimeout(dragTimeout);
    }

    dragTimeout = setTimeout(() => {
      // Check if we're still within the wrapper area
      const rect = inputWrapper.getBoundingClientRect();
      const isStillInside = e.clientX >= rect.left && e.clientX <= rect.right &&
                           e.clientY >= rect.top && e.clientY <= rect.bottom;

      if (!isStillInside) {
        inputWrapper.classList.remove("drag-over");
      }
    }, 50); // Small delay to handle rapid enter/leave events
  }

  function cleanupDragState() {
    // Clean up when drag operation ends anywhere
    if (dragTimeout) {
      clearTimeout(dragTimeout);
      dragTimeout = null;
    }
    inputWrapper.classList.remove("drag-over");
  }

  // Helpers for reading directory drops (webkit entries)
  function readAllFilesFromEntry(entry, path = "") {
    return new Promise((resolve) => {
      try {
        if (entry.isFile) {
          entry.file((file) => {
            // Attach relative path info for later grouping
            file._relativePath = path + file.name;
            resolve([file]);
          }, () => resolve([]));
        } else if (entry.isDirectory) {
          const reader = entry.createReader();
          const entries = [];
          const readBatch = () => {
            reader.readEntries((batch) => {
              if (!batch || batch.length === 0) {
                // Done reading children; recurse
                const promises = entries.map((child) =>
                  readAllFilesFromEntry(child, path + entry.name + "/"),
                );
                Promise.all(promises).then((results) => {
                  resolve([].concat(...results));
                }).catch(() => resolve([]));
              } else {
                entries.push(...batch);
                readBatch();
              }
            }, () => resolve([]));
          };
          readBatch();
        } else {
          resolve([]);
        }
      } catch (_) {
        resolve([]);
      }
    });
  }

  function fileFromEntry(entry) {
    return new Promise((resolve) => {
      try {
        entry.file((file) => {
          file._relativePath = file.name; // no nesting info
          resolve(file);
        }, () => resolve(null));
      } catch {
        resolve(null);
      }
    });
  }

  async function handleDrop(e) {
    // Clean up drag state
    if (dragTimeout) {
      clearTimeout(dragTimeout);
      dragTimeout = null;
    }
    inputWrapper.classList.remove("drag-over");

    const dt = e.dataTransfer;
    let files = [];
    let sawDirectory = false;

    // Prefer DataTransferItem API to detect directories
    if (dt.items && dt.items.length) {
      for (const item of dt.items) {
        if (item.kind !== "file") continue;
        const entry = item.webkitGetAsEntry && item.webkitGetAsEntry();
        if (entry) {
          if (entry.isDirectory) {
            sawDirectory = true;
            const dirFiles = await readAllFilesFromEntry(entry);
            files.push(...dirFiles);
          } else if (entry.isFile) {
            const f = await fileFromEntry(entry);
            if (f) files.push(f);
          }
        } else {
          const f = item.getAsFile && item.getAsFile();
          if (f) files.push(f);
        }
      }
    } else {
      // Fallback: plain FileList (won't include directories in some browsers)
      files = Array.from(dt.files || []);
      // Try to infer if any relative paths present
      sawDirectory = files.some(f => f.webkitRelativePath && f.webkitRelativePath.includes("/"));
    }

    if (files.length > 0) {
      const containsDirInfo = sawDirectory || files.some(f => f.webkitRelativePath || (f._relativePath && f._relativePath.includes("/")));
      await handleFiles(files, containsDirInfo ? { isDirectory: true } : {});
    }
  }
}

/**
 * Setup paste functionality for the textarea
 */
function setupPasteHandler(userInput) {
  userInput.addEventListener("paste", async(e) => {
    const items = Array.from(e.clipboardData.items);
    const imageItems = items.filter(item => item.type.startsWith("image/"));

    if (imageItems.length > 0) {
      e.preventDefault(); // Prevent default paste behavior for images

      const files = [];
      for (const item of imageItems) {
        const file = item.getAsFile();
        if (file) {
          files.push(file);
        }
      }

      if (files.length > 0) {
        await handleFiles(files);
      }
    }
  });
}

window.showPendingUploadPreviews = function() {
  const wrapper = document.querySelector(".input-wrapper");
  if (!wrapper) {
    return;
  }
  let preview = wrapper.querySelector(".upload-previews");
  if (!preview) {
    preview = document.createElement("div");
    preview.className = "upload-previews";
    wrapper.insertBefore(preview, wrapper.firstChild);
  }
  preview.innerHTML = "";

  // Show image previews
  window.pendingUploads.forEach((up, index) => {
    const container = document.createElement("div");
    container.className = "upload-preview-container";

    const img = document.createElement("img");
    img.src = up.dataUrl;
    img.alt = "Upload preview";
    img.className = "upload-preview-img";

    const removeBtn = document.createElement("button");
    removeBtn.className = "upload-preview-remove";
    removeBtn.innerHTML = "×";
    removeBtn.title = "Remove image";
    removeBtn.addEventListener("click", (e) => {
      e.preventDefault();
      removeUploadPreview(index);
    });

    container.appendChild(img);
    container.appendChild(removeBtn);
    preview.appendChild(container);
  });

  // Show document previews
  window.pendingDocuments.forEach((doc, index) => {
    if (doc.isDirectory) {
      // Directory preview
      const container = document.createElement("div");
      container.className = "upload-preview-container directory-preview";

      const totalSize = doc.files.reduce((sum, f) => sum + f.size, 0);

      const docInfo = document.createElement("div");
      docInfo.className = "document-info";
      docInfo.innerHTML = `
        <span class="doc-icon">📁</span>
        <span class="doc-name">${doc.directoryName}</span>
        <span class="doc-size">${doc.files.length} file${doc.files.length !== 1 ? "s" : ""} (${formatFileSize(totalSize)})</span>
      `;

      const removeBtn = document.createElement("button");
      removeBtn.className = "upload-preview-remove";
      removeBtn.innerHTML = "×";
      removeBtn.title = "Remove directory";
      removeBtn.addEventListener("click", (e) => {
        e.preventDefault();
        removeDocumentPreview(index);
      });

      // Create expandable file list
      const fileList = document.createElement("div");
      fileList.className = "directory-file-list";
      fileList.style.display = "none";

      doc.files.forEach(file => {
        const fileItem = document.createElement("div");
        fileItem.className = "directory-file-item";
        const displayName = file.relativePath || file.name;
        fileItem.innerHTML = `
          <span class="file-item-icon">📄</span>
          <span class="file-item-name">${displayName}</span>
          <span class="file-item-size">${formatFileSize(file.size)}</span>
        `;
        fileList.appendChild(fileItem);
      });

      // Toggle on click
      docInfo.style.cursor = "pointer";
      docInfo.addEventListener("click", (e) => {
        if (e.target === removeBtn || removeBtn.contains(e.target)) return;
        const isExpanded = fileList.style.display !== "none";
        fileList.style.display = isExpanded ? "none" : "block";
        container.classList.toggle("expanded", !isExpanded);
      });

      container.appendChild(docInfo);
      container.appendChild(removeBtn);
      container.appendChild(fileList);
      preview.appendChild(container);
    } else {
      // Individual file preview
      const container = document.createElement("div");
      container.className = "upload-preview-container document-preview";

      const docInfo = document.createElement("div");
      docInfo.className = "document-info";
      docInfo.innerHTML = `
        <span class="doc-icon">📄</span>
        <span class="doc-name">${doc.name}</span>
        <span class="doc-size">${formatFileSize(doc.size)}</span>
      `;

      const removeBtn = document.createElement("button");
      removeBtn.className = "upload-preview-remove";
      removeBtn.innerHTML = "×";
      removeBtn.title = "Remove document";
      removeBtn.addEventListener("click", (e) => {
        e.preventDefault();
        removeDocumentPreview(index);
      });

      container.appendChild(docInfo);
      container.appendChild(removeBtn);
      preview.appendChild(container);
    }
  });
};

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

/**
 * Remove an image from pending uploads by index
 */
function removeUploadPreview(index) {
  if (index >= 0 && index < window.pendingUploads.length) {
    window.pendingUploads.splice(index, 1);
    window.showPendingUploadPreviews();
  }
}

/**
 * Remove a document from pending uploads by index
 */
function removeDocumentPreview(index) {
  if (index >= 0 && index < window.pendingDocuments.length) {
    window.pendingDocuments.splice(index, 1);
    window.showPendingUploadPreviews();
  }
}
