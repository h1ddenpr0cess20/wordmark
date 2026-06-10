/**
 * File upload and attachment handling for images and documents.
 */

import { state } from "../init/state.ts";
import { showInfo } from "../utils/notifications.ts";
import { filterSupportedFiles } from "../services/vectorStore.ts";
import type { DirectoryFile } from "../../types/attachments.ts";

state.pendingUploads = [];
state.pendingDocuments = [];
state.activeVectorStore = null;

/**
 * Wires the image/document upload inputs, upload button, and drag-and-drop on
 * the input area, routing selected files into the pending-attachment state.
 */
export function initImageUploads() {
  const uploadInput = document.getElementById("image-upload") as HTMLInputElement | null;
  const directoryInput = document.getElementById("directory-upload") as HTMLInputElement | null;
  const uploadButton = document.getElementById("upload-button") as HTMLButtonElement | null;
  const inputWrapper = document.querySelector<HTMLElement>(".input-wrapper");
  const userInput = document.getElementById("user-input") as HTMLTextAreaElement | null;

  if (!uploadInput || !uploadButton || !inputWrapper || !userInput || !directoryInput) {
    return;
  }

  uploadButton.addEventListener("click", (e: MouseEvent) => {
    e.stopPropagation();
    showUploadMenu(e.currentTarget as HTMLElement, uploadInput, directoryInput);
  });

  uploadInput.addEventListener("change", async(e: Event) => {
    const files = Array.from((e.target as HTMLInputElement).files || []);
    await handleFiles(files);
    uploadInput.value = "";
  });

  directoryInput.addEventListener("change", async(e: Event) => {
    const files = Array.from((e.target as HTMLInputElement).files || []);
    await handleFiles(files, { isDirectory: true });
    directoryInput.value = "";
  });

  setupDragAndDrop(inputWrapper);

  setupPasteHandler(userInput);
}

/**
 * Show upload menu to choose between files or directory
 */
function showUploadMenu(button: HTMLElement, fileInput: HTMLInputElement, directoryInput: HTMLInputElement) {
  const existingMenu = document.querySelector<HTMLElement>(".upload-menu");
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

  const rect = button.getBoundingClientRect();
  menu.style.position = "absolute";
  menu.style.bottom = (window.innerHeight - rect.top + 5) + "px";
  menu.style.right = (window.innerWidth - rect.right) + "px";

  document.body.appendChild(menu);

  setTimeout(() => {
    const closeMenu = (e: MouseEvent) => {
      if (!menu.contains(e.target as Node) && e.target !== button) {
        menu.remove();
        document.removeEventListener("click", closeMenu);
      }
    };
    document.addEventListener("click", closeMenu);
  }, 0);
}

/** A File that may carry a custom relative-path tag set during directory traversal. */
type FileWithRelativePath = File & { _relativePath?: string };

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
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
function isSupportedDocument(file: File) {
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
async function handleFiles(files: File[], options: { isDirectory?: boolean } = {}) {
  if (!files || files.length === 0) {
    return;
  }

  const { isDirectory = false } = options;

  state.pendingUploads = state.pendingUploads || [];
  state.pendingDocuments = state.pendingDocuments || [];

  if (isDirectory) {
    const { supported, unsupported } = filterSupportedFiles(files);

    if (unsupported.length > 0) {
      const unsupportedNames = unsupported.map(f => f.name);
      const message = unsupported.length === 1
        ? `File "${unsupportedNames[0]}" is not supported and was skipped.`
        : `${unsupported.length} files were skipped (unsupported format): ${unsupportedNames.slice(0, 3).join(", ")}${unsupported.length > 3 ? "..." : ""}`;
      if (showInfo) {
        showInfo(message);
      } else {
        console.warn("Unsupported files skipped:", unsupportedNames);
      }
    }

    const groups = new Map<string, DirectoryFile[]>();
    for (const file of supported) {
      const rel = file.webkitRelativePath || (file as FileWithRelativePath)._relativePath || file.name;
      const parts = rel.split("/");
      const top = parts[0] || "Directory";
      const innerRel = parts.slice(1).join("/") || file.name;

      if (!groups.has(top)) groups.set(top, []);
      groups.get(top)!.push({
        file,
        name: file.name,
        size: file.size,
        type: file.type,
        isImage: file.type?.startsWith("image/") || false,
        relativePath: innerRel,
      });
    }

    const hasStructure = Array.from(groups.keys()).some(k => k && k !== "Directory") ||
                         supported.some(f => (f.webkitRelativePath || (f as FileWithRelativePath)._relativePath || "").includes("/"));

    if (!hasStructure) {
      state.pendingDocuments.push(...supported.map(file => ({
        file,
        name: file.name,
        size: file.size,
        type: file.type,
      })));
    } else {
      for (const [directoryName, fileList] of groups) {
        state.pendingDocuments.push({
          isDirectory: true,
          directoryName,
          files: fileList,
        });
      }
    }
  } else {
    const imageFiles: File[] = [];
    const documentFiles: File[] = [];
    const unsupportedFiles: string[] = [];

    for (const file of files) {
      if (file.type?.startsWith("image/")) {
        imageFiles.push(file);
      } else if (isSupportedDocument(file)) {
        documentFiles.push(file);
      } else {
        unsupportedFiles.push(file.name);
      }
    }

    if (unsupportedFiles.length > 0) {
      const message = unsupportedFiles.length === 1
        ? `File "${unsupportedFiles[0]}" is not supported and was skipped.`
        : `${unsupportedFiles.length} files were skipped (unsupported format): ${unsupportedFiles.slice(0, 3).join(", ")}${unsupportedFiles.length > 3 ? "..." : ""}`;
      if (showInfo) {
        showInfo(message);
      } else {
        console.warn("Unsupported files skipped:", unsupportedFiles);
      }
    }

    if (imageFiles.length > 0) {
      for (const file of imageFiles) {
        const dataUrl = await readFileAsDataURL(file);
        state.pendingUploads.push({ file, dataUrl });
      }
    }

    if (documentFiles.length > 0) {
      state.pendingDocuments.push(...documentFiles.map(file => ({
        file,
        name: file.name,
        size: file.size,
        type: file.type,
      })));
    }
  }

  showPendingUploadPreviews();
}

/**
 * Setup drag and drop functionality for the input wrapper
 * Enhanced to support folder drops by recursively reading directory entries
 */
function setupDragAndDrop(inputWrapper: HTMLElement) {
  let dragTimeout: ReturnType<typeof setTimeout> | null = null;

  ["dragenter", "dragover", "dragleave", "drop"].forEach(eventName => {
    inputWrapper.addEventListener(eventName, preventDefaults, false);
    document.body.addEventListener(eventName, preventDefaults, false);
  });

  inputWrapper.addEventListener("dragenter", handleDragEnter, false);
  inputWrapper.addEventListener("dragover", handleDragOver, false);

  inputWrapper.addEventListener("dragleave", handleDragLeave, false);
  inputWrapper.addEventListener("drop", handleDrop, false);

  document.addEventListener("dragend", cleanupDragState, false);

  function preventDefaults(e: Event) {
    e.preventDefault();
    e.stopPropagation();
  }

  function handleDragEnter(e: DragEvent) {
    if (dragTimeout) {
      clearTimeout(dragTimeout);
      dragTimeout = null;
    }

    if (e.dataTransfer && e.dataTransfer.types.includes("Files")) {
      inputWrapper.classList.add("drag-over");
    }
  }

  function handleDragOver(e: DragEvent) {
    if (dragTimeout) {
      clearTimeout(dragTimeout);
      dragTimeout = null;
    }

    if (e.dataTransfer && e.dataTransfer.types.includes("Files")) {
      inputWrapper.classList.add("drag-over");
    }
  }

  function handleDragLeave(e: DragEvent) {
    if (dragTimeout) {
      clearTimeout(dragTimeout);
    }

    dragTimeout = setTimeout(() => {
      const rect = inputWrapper.getBoundingClientRect();
      const isStillInside = e.clientX >= rect.left && e.clientX <= rect.right &&
                           e.clientY >= rect.top && e.clientY <= rect.bottom;

      if (!isStillInside) {
        inputWrapper.classList.remove("drag-over");
      }
    }, 50);
  }

  function cleanupDragState() {
    if (dragTimeout) {
      clearTimeout(dragTimeout);
      dragTimeout = null;
    }
    inputWrapper.classList.remove("drag-over");
  }

  function readAllFilesFromEntry(entry: FileSystemEntry, path = ""): Promise<File[]> {
    return new Promise((resolve) => {
      try {
        if (entry.isFile) {
          (entry as FileSystemFileEntry).file((file: FileWithRelativePath) => {
            file._relativePath = path + file.name;
            resolve([file]);
          }, () => resolve([]));
        } else if (entry.isDirectory) {
          const reader = (entry as FileSystemDirectoryEntry).createReader();
          const entries: FileSystemEntry[] = [];
          const readBatch = () => {
            reader.readEntries((batch: FileSystemEntry[]) => {
              if (!batch || batch.length === 0) {
                const promises = entries.map((child) =>
                  readAllFilesFromEntry(child, path + entry.name + "/"),
                );
                Promise.all(promises).then((results) => {
                  resolve(([] as File[]).concat(...results));
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
      } catch {
        resolve([]);
      }
    });
  }

  function fileFromEntry(entry: FileSystemEntry): Promise<File | null> {
    return new Promise((resolve) => {
      try {
        (entry as FileSystemFileEntry).file((file: FileWithRelativePath) => {
          file._relativePath = file.name;
          resolve(file);
        }, () => resolve(null));
      } catch {
        resolve(null);
      }
    });
  }

  async function handleDrop(e: DragEvent) {
    if (dragTimeout) {
      clearTimeout(dragTimeout);
      dragTimeout = null;
    }
    inputWrapper.classList.remove("drag-over");

    const dt = e.dataTransfer;
    let files: File[] = [];
    let sawDirectory = false;

    if (dt && dt.items && dt.items.length) {
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
      files = Array.from(dt?.files || []);
      sawDirectory = files.some(f => f.webkitRelativePath && f.webkitRelativePath.includes("/"));
    }

    if (files.length > 0) {
      const containsDirInfo = sawDirectory || files.some(f => {
        const rel = (f as FileWithRelativePath)._relativePath;
        return Boolean(f.webkitRelativePath) || Boolean(rel && rel.includes("/"));
      });
      await handleFiles(files, containsDirInfo ? { isDirectory: true } : {});
    }
  }
}

/**
 * Setup paste functionality for the textarea
 */
function setupPasteHandler(userInput: HTMLTextAreaElement) {
  userInput.addEventListener("paste", async(e: ClipboardEvent) => {
    const items = Array.from(e.clipboardData?.items || []);
    const imageItems = items.filter((item) => item.type.startsWith("image/"));

    if (imageItems.length > 0) {
      e.preventDefault();

      const files: File[] = [];
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

function showPendingUploadPreviews() {
  const wrapper = document.querySelector<HTMLElement>(".input-wrapper");
  if (!wrapper) {
    return;
  }
  let previewEl = wrapper.querySelector<HTMLElement>(".upload-previews");
  if (!previewEl) {
    previewEl = document.createElement("div");
    previewEl.className = "upload-previews";
    wrapper.insertBefore(previewEl, wrapper.firstChild);
  }
  const preview = previewEl;
  preview.innerHTML = "";

  state.pendingUploads.forEach((up, index) => {
    const container = document.createElement("div");
    container.className = "upload-preview-container";

    const img = document.createElement("img");
    img.src = up.dataUrl || "";
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

  state.pendingDocuments.forEach((doc, index) => {
    if (doc.isDirectory) {
      const container = document.createElement("div");
      container.className = "upload-preview-container directory-preview";

      const directoryFiles = doc.files || [];
      const totalSize = directoryFiles.reduce((sum, f) => sum + f.size, 0);

      const docInfo = document.createElement("div");
      docInfo.className = "document-info";
      docInfo.innerHTML = `
        <span class="doc-icon">📁</span>
        <span class="doc-name">${doc.directoryName}</span>
        <span class="doc-size">${directoryFiles.length} file${directoryFiles.length !== 1 ? "s" : ""} (${formatFileSize(totalSize)})</span>
      `;

      const removeBtn = document.createElement("button");
      removeBtn.className = "upload-preview-remove";
      removeBtn.innerHTML = "×";
      removeBtn.title = "Remove directory";
      removeBtn.addEventListener("click", (e) => {
        e.preventDefault();
        removeDocumentPreview(index);
      });

      const fileList = document.createElement("div");
      fileList.className = "directory-file-list";
      fileList.style.display = "none";

      directoryFiles.forEach(file => {
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

      docInfo.style.cursor = "pointer";
      docInfo.addEventListener("click", (e) => {
        if (e.target === removeBtn || removeBtn.contains(e.target as Node)) return;
        const isExpanded = fileList.style.display !== "none";
        fileList.style.display = isExpanded ? "none" : "block";
        container.classList.toggle("expanded", !isExpanded);
      });

      container.appendChild(docInfo);
      container.appendChild(removeBtn);
      container.appendChild(fileList);
      preview.appendChild(container);
    } else {
      const container = document.createElement("div");
      container.className = "upload-preview-container document-preview";

      const docInfo = document.createElement("div");
      docInfo.className = "document-info";
      docInfo.innerHTML = `
        <span class="doc-icon">📄</span>
        <span class="doc-name">${doc.name}</span>
        <span class="doc-size">${formatFileSize(doc.size || 0)}</span>
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
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

/**
 * Remove an image from pending uploads by index
 */
function removeUploadPreview(index: number) {
  if (index >= 0 && index < state.pendingUploads.length) {
    state.pendingUploads.splice(index, 1);
    showPendingUploadPreviews();
  }
}

/**
 * Remove a document from pending uploads by index
 */
function removeDocumentPreview(index: number) {
  if (index >= 0 && index < state.pendingDocuments.length) {
    state.pendingDocuments.splice(index, 1);
    showPendingUploadPreviews();
  }
}
