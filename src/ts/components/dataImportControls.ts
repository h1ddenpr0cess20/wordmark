/**
 * The Storage tab's import control.
 *
 * @remarks
 * The counterpart to the Export button in `storageManager.ts`. Wires the file
 * picker, the "apply settings" opt-in and the Import button to
 * {@link ../services/dataImport.ts}, then refreshes the surfaces that show
 * imported data (the history list and the storage category counts).
 */

import {
  parseImportBundle,
  importBundle,
  describeImport,
  ImportFormatError,
} from "../services/dataImport.ts";
import { renderCategoryList } from "./storageManager.ts";
import { renderChatHistoryList } from "../services/history/list.ts";
import { showInfo, showError } from "../utils/notifications.ts";

/** Wires the Storage tab's import controls. Safe to call before the panel loads. */
export function initDataImportControls() {
  const fileInput = document.getElementById("import-data-file") as HTMLInputElement | null;
  const applySettingsToggle = document.getElementById("import-apply-settings") as HTMLInputElement | null;
  const importButton = document.getElementById("import-all-data") as HTMLButtonElement | null;
  const status = document.getElementById("import-data-status");

  if (!fileInput || !importButton) {
    return;
  }

  const setStatus = (message: string) => {
    if (status) {
      status.textContent = message;
    }
  };

  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    importButton.disabled = !file;
    setStatus(file ? `Ready to import ${file.name}.` : "");
  });

  importButton.addEventListener("click", async() => {
    const file = fileInput.files?.[0];
    if (!file) {
      return;
    }

    importButton.disabled = true;
    setStatus("Importing…");

    try {
      const bundle = parseImportBundle(await file.text());
      const summary = await importBundle(bundle, {
        applySettings: Boolean(applySettingsToggle?.checked),
      });
      const message = describeImport(summary);

      setStatus(message);
      showInfo?.(message);

      renderChatHistoryList();
      renderCategoryList();

      fileInput.value = "";
    } catch (error) {
      const message = error instanceof ImportFormatError
        ? error.message
        : "Import failed. See the console for details.";
      if (!(error instanceof ImportFormatError)) {
        console.error("Failed to import data:", error);
      }
      setStatus(message);
      showError?.(message);
    } finally {
      importButton.disabled = !fileInput.files?.length;
    }
  });
}
