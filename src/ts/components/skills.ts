/**
 * Settings UI for agent skills.
 *
 * @remarks
 * Skills are authored as `SKILL.md` files and **uploaded**, not typed into a
 * form. This module renders the list of available skills with enable toggles
 * (plus export for any skill and delete for uploaded ones) and wires the upload
 * control, which parses each file via {@link parseSkillMarkdown} and stores it.
 * Persistence/serialization live in
 * {@link ../services/skills/skillsStore.ts}; this is the DOM/wiring layer,
 * mirroring the MCP-server settings UI in {@link ../services/mcpServers.ts}.
 */

import { icon } from "../utils/icons.ts";
import { showNotification } from "../utils/notifications.ts";
import {
  getAllSkills,
  getSkillById,
  addUserSkill,
  removeUserSkill,
  isSkillEnabled,
  setSkillEnabled,
  parseSkillMarkdown,
  serializeSkillMarkdown,
  seedExampleSkills,
} from "../services/skills/skillsStore.ts";

/** Renders the configured skills into the settings list. */
function renderSkillsList() {
  const container = document.getElementById("skills-list");
  if (!container) {
    return;
  }

  const skills = getAllSkills();
  container.innerHTML = "";

  if (skills.length === 0) {
    container.innerHTML = "<p class=\"info-text\" style=\"margin: 0;\">No skills yet. Upload a SKILL.md file to get started.</p>";
    return;
  }

  skills.forEach((skill) => {
    const item = document.createElement("div");
    item.className = "tool-toggle-item";

    const content = document.createElement("div");
    content.className = "tool-toggle-content";

    const info = document.createElement("div");
    info.className = "tool-info";

    const titleRow = document.createElement("div");
    titleRow.className = "tool-title-row";

    const name = document.createElement("span");
    name.className = "tool-name";
    name.textContent = skill.name;
    titleRow.appendChild(name);

    const badge = document.createElement("span");
    badge.className = `tool-badge tool-badge-${skill.source === "builtin" ? "builtin" : "function"}`;
    badge.textContent = skill.source === "builtin" ? "Built-in" : "Uploaded";
    titleRow.appendChild(badge);

    if (skill.resources.length) {
      const resourceBadge = document.createElement("span");
      resourceBadge.className = "tool-badge tool-badge-mcp";
      resourceBadge.textContent = skill.resources.length === 1 ? "1 resource" : `${skill.resources.length} resources`;
      titleRow.appendChild(resourceBadge);
    }

    info.appendChild(titleRow);

    if (skill.description) {
      const description = document.createElement("p");
      description.className = "tool-description";
      description.textContent = skill.description;
      info.appendChild(description);
    }

    if (skill.triggers.length) {
      const triggers = document.createElement("p");
      triggers.className = "tool-note";
      triggers.textContent = `Auto-activates on: ${skill.triggers.join(", ")}`;
      info.appendChild(triggers);
    }

    const control = document.createElement("div");
    control.className = "tool-toggle-control";

    const exportButton = document.createElement("button");
    exportButton.type = "button";
    exportButton.className = "tool-action-delete";
    exportButton.title = `Export ${skill.name} as SKILL.md`;
    exportButton.setAttribute("aria-label", `Export ${skill.name}`);
    exportButton.innerHTML = icon("download", { width: 16, height: 16 });
    exportButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      handleExportSkill(skill.id);
    });
    control.appendChild(exportButton);

    if (skill.source === "user") {
      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "tool-action-delete";
      deleteButton.title = `Remove ${skill.name}`;
      deleteButton.setAttribute("aria-label", `Remove ${skill.name}`);
      deleteButton.innerHTML = icon("trash", { width: 16, height: 16 });
      deleteButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        handleRemoveSkill(skill.id, skill.name);
      });
      control.appendChild(deleteButton);
    }

    const toggleContainer = document.createElement("div");
    toggleContainer.className = "toggle-container";

    const inputId = `skill-toggle-${skill.id.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase()}`;
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.id = inputId;
    checkbox.dataset.skillId = skill.id;
    checkbox.dataset.skillName = skill.name;
    checkbox.checked = isSkillEnabled(skill.id);
    checkbox.addEventListener("change", handleSkillToggle);

    const label = document.createElement("label");
    label.className = "toggle-switch";
    label.setAttribute("for", inputId);

    toggleContainer.appendChild(checkbox);
    toggleContainer.appendChild(label);
    control.appendChild(toggleContainer);

    content.appendChild(info);
    content.appendChild(control);
    item.appendChild(content);
    container.appendChild(item);
  });
}

/** Toggle handler: persists a skill's enabled state. */
function handleSkillToggle(event: Event) {
  const checkbox = event.currentTarget as HTMLInputElement;
  const skillId = checkbox.dataset.skillId;
  if (!skillId) {
    return;
  }
  setSkillEnabled(skillId, checkbox.checked);
  showNotification?.(`${checkbox.checked ? "Enabled" : "Disabled"} ${checkbox.dataset.skillName || "skill"}.`, "success");
}

/** Confirms and removes an uploaded skill, then re-renders. */
function handleRemoveSkill(id: string, name: string) {
  if (!confirm(`Are you sure you want to remove the skill "${name}"?`)) {
    return;
  }
  try {
    removeUserSkill(id);
    renderSkillsList();
    showNotification?.("Skill removed successfully", "success");
  } catch (error) {
    showNotification?.(`Error removing skill: ${error instanceof Error ? error.message : ""}`, "error");
  }
}

/** Serializes a skill to SKILL.md and triggers a browser download. */
function handleExportSkill(id: string) {
  const skill = getSkillById(id);
  if (!skill) {
    return;
  }
  try {
    const markdown = serializeSkillMarkdown(skill);
    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${skill.id.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase()}.SKILL.md`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  } catch (error) {
    showNotification?.(`Error exporting skill: ${error instanceof Error ? error.message : ""}`, "error");
  }
}

/** Reads each chosen SKILL.md file, parses it, and stores it as an enabled skill. */
async function handleImportFiles(files: FileList) {
  let added = 0;
  for (const file of Array.from(files)) {
    try {
      const text = await file.text();
      const input = parseSkillMarkdown(text);
      const skill = addUserSkill(input);
      setSkillEnabled(skill.id, true);
      added += 1;
    } catch (error) {
      showNotification?.(`Could not import "${file.name}": ${error instanceof Error ? error.message : "invalid SKILL.md"}`, "error");
    }
  }
  if (added > 0) {
    renderSkillsList();
    showNotification?.(added === 1 ? "Skill uploaded and enabled." : `${added} skills uploaded and enabled.`, "success");
  }
}

/** Renders the initial skills list and wires the upload control. */
export function initSkillsSettings() {
  seedExampleSkills();
  renderSkillsList();

  const importButton = document.getElementById("import-skill");
  const importInput = document.getElementById("import-skill-input") as HTMLInputElement | null;
  if (importButton && importInput) {
    importButton.addEventListener("click", () => importInput.click());
    importInput.addEventListener("change", () => {
      if (importInput.files && importInput.files.length) {
        void handleImportFiles(importInput.files);
      }
      importInput.value = "";
    });
  }
}
