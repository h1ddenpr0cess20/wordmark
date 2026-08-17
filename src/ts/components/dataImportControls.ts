/**
 * The Data tab's import control.
 *
 * @remarks
 * Wires the file picker, the "apply settings" opt-in and the Import button to
 * {@link ../services/dataImport.ts}, then refreshes the surfaces that show
 * imported data (the rail's recent list and the history panel).
 */

import {
  parseImportBundle,
  importBundle,
  describeImport,
  ImportFormatError,
} from "../services/dataImport.ts";
import { renderChatHistoryList } from "../services/history/list.ts";
import { showInfo, showError } from "../utils/notifications.ts";

/** Wires the Data tab's import controls. Safe to call before the panel loads. */
export function initDataImportControls() {
  const fileInput = document.getElementById("import-data-file") as HTMLInputElement | null;
  const applySettingsToggle = document.getElementById("import-apply-settings") as HTMLInputElement | null;
  const importButton = document.getElementById("import-data-button") as HTMLButtonElement | null;
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
