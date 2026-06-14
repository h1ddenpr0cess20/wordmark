/**
 * Drag-and-drop and paste ingestion for attachments.
 *
 * @remarks
 * Wires drag-over highlighting plus folder-aware drop handling (recursively
 * reading `FileSystemEntry` trees) on the input wrapper, and image paste on the
 * textarea. Both routes hand collected files to the `handleFiles` callback
 * supplied by {@link ./attachments.ts}, keeping this module free of any
 * dependency back on the upload component.
 */

import type { FileWithRelativePath } from "../../types/attachments.ts";

/** Sink for files gathered from drag-drop or paste, matching `attachments.handleFiles`. */
type HandleFiles = (files: File[], options?: { isDirectory?: boolean }) => Promise<void>;

/**
 * Sets up folder-aware drag-and-drop on the input wrapper: highlights on
 * drag-over and, on drop, recursively reads directory entries before handing
 * the collected files to `handleFiles`.
 */
export function setupDragAndDrop(inputWrapper: HTMLElement, handleFiles: HandleFiles) {
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
 * Sets up image paste on the textarea: intercepts pasted image items and hands
 * them to `handleFiles`.
 */
export function setupPasteHandler(userInput: HTMLTextAreaElement, handleFiles: HandleFiles) {
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
