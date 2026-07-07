/**
 * File upload and attachment handling for images and documents.
 */

import { state } from "../../init/state.ts";
import { showInfo } from "../../utils/notifications.ts";
import { filterSupportedFiles } from "../../services/vectorStore.ts";
import { isExtractableDocument } from "../../services/parsers/index.ts";
import { extractsDocumentsClientSide } from "../../services/providers.ts";
import { getActiveServiceKey } from "../../services/api/clientConfig.ts";
import type { DirectoryFile, FileWithRelativePath } from "../../../types/attachments.ts";
import { showPendingUploadPreviews } from "./attachmentPreviews.ts";
import { setupDragAndDrop, setupPasteHandler } from "./attachmentDragDrop.ts";

state.pendingUploads = [];
state.pendingDocuments = [];
state.activeVectorStore = null;

let activeUploadMenuCleanup: (() => void) | null = null;

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
    try {
      await handleFiles(files);
    } catch (error) {
      console.error("Failed to process selected files:", error);
    } finally {
      uploadInput.value = "";
    }
  });

  directoryInput.addEventListener("change", async(e: Event) => {
    const files = Array.from((e.target as HTMLInputElement).files || []);
    try {
      await handleFiles(files, { isDirectory: true });
    } catch (error) {
      console.error("Failed to process selected directory:", error);
    } finally {
      directoryInput.value = "";
    }
  });

  setupDragAndDrop(inputWrapper, handleFiles);

  setupPasteHandler(userInput, handleFiles);
}

/**
 * Show upload menu to choose between files or directory
 */
function showUploadMenu(button: HTMLElement, fileInput: HTMLInputElement, directoryInput: HTMLInputElement) {
  if (activeUploadMenuCleanup) {
    activeUploadMenuCleanup();
    return;
  }

  const menu = document.createElement("div");
  menu.className = "upload-menu";

  let closeMenu: ((e: MouseEvent) => void) | null = null;
  const removeMenu = () => {
    menu.remove();
    if (closeMenu) {
      document.removeEventListener("click", closeMenu);
    }
    activeUploadMenuCleanup = null;
  };
  activeUploadMenuCleanup = removeMenu;

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
    removeMenu();
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
    removeMenu();
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
    closeMenu = (e: MouseEvent) => {
      if (!menu.contains(e.target as Node) && e.target !== button) {
        removeMenu();
      }
    };
    document.addEventListener("click", closeMenu);
  }, 0);
}

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => {
      const reason = reader.error?.message || "unknown error";
      reject(new Error(`Failed to read "${file.name}": ${reason}`));
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Check if a file is a supported document type. Local providers extract text in
 * the browser and accept any document format or non-binary (text/code/data)
 * file; cloud providers keep their native upload allowlist.
 */
function isSupportedDocument(file: File) {
  if (extractsDocumentsClientSide(getActiveServiceKey())) {
    return isExtractableDocument(file.name);
  }
  return filterSupportedFiles([file]).supported.length > 0;
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
    const supported: File[] = [];
    const unsupported: File[] = [];
    for (const file of files) {
      (isSupportedDocument(file) ? supported : unsupported).push(file);
    }

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
      const unreadableFiles: string[] = [];
      for (const file of imageFiles) {
        try {
          const dataUrl = await readFileAsDataURL(file);
          state.pendingUploads.push({ file, dataUrl });
        } catch (error) {
          console.error(`Failed to read image "${file.name}":`, error);
          unreadableFiles.push(file.name);
        }
      }

      if (unreadableFiles.length > 0) {
        const message = unreadableFiles.length === 1
          ? `File "${unreadableFiles[0]}" could not be read and was skipped.`
          : `${unreadableFiles.length} files could not be read and were skipped: ${unreadableFiles.slice(0, 3).join(", ")}${unreadableFiles.length > 3 ? "..." : ""}`;
        if (showInfo) {
          showInfo(message);
        } else {
          console.warn("Unreadable files skipped:", unreadableFiles);
        }
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

