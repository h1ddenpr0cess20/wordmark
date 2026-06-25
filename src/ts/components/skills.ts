/**
 * Settings UI for agent skills.
 *
 * @remarks
 * Renders the list of available skills with enable toggles (and a delete action
 * for user-authored skills) and wires the add-skill form. Persistence lives in
 * {@link ../services/skills/skillsStore.ts}; this module is the DOM/wiring layer,
 * mirroring the MCP-server settings UI in
 * {@link ../services/mcpServers.ts}.
 */

import { icon } from "../utils/icons.ts";
import { showNotification } from "../utils/notifications.ts";
import {
  getAllSkills,
  addUserSkill,
  removeUserSkill,
  isSkillEnabled,
  setSkillEnabled,
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
    container.innerHTML = "<p class=\"info-text\" style=\"margin: 0;\">No skills configured. Add one below to get started.</p>";
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
    badge.textContent = skill.source === "builtin" ? "Built-in" : "Custom";
    titleRow.appendChild(badge);

    info.appendChild(titleRow);

    if (skill.description) {
      const description = document.createElement("p");
      description.className = "tool-description";
      description.textContent = skill.description;
      info.appendChild(description);
    }

    const control = document.createElement("div");
    control.className = "tool-toggle-control";

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
  if (showNotification) {
    showNotification(`${checkbox.checked ? "Enabled" : "Disabled"} ${checkbox.dataset.skillName || "skill"}.`, "success");
  }
}

/** Confirms and removes a user-authored skill, then re-renders. */
function handleRemoveSkill(id: string, name: string) {
  if (!confirm(`Are you sure you want to remove the skill "${name}"?`)) {
    return;
  }
  try {
    removeUserSkill(id);
    renderSkillsList();
    if (showNotification) {
      showNotification("Skill removed successfully", "success");
    }
  } catch (error) {
    if (showNotification) {
      showNotification(`Error removing skill: ${error instanceof Error ? error.message : ""}`, "error");
    }
  }
}

/** Reads the add-skill form, validates it, and stores the new skill. */
function handleAddSkill() {
  const nameInput = document.getElementById("skill-name") as HTMLInputElement | null;
  const descriptionInput = document.getElementById("skill-description") as HTMLInputElement | null;
  const instructionsInput = document.getElementById("skill-instructions") as HTMLTextAreaElement | null;

  if (!nameInput || !instructionsInput) {
    console.error("Required skill form elements not found");
    return;
  }

  const name = nameInput.value.trim();
  const description = descriptionInput?.value.trim() || "";
  const instructions = instructionsInput.value.trim();

  if (!name) {
    showNotification?.("Please enter a skill name", "error");
    return;
  }
  if (!instructions) {
    showNotification?.("Please enter skill instructions", "error");
    return;
  }

  try {
    const skill = addUserSkill({ name, description, instructions });
    setSkillEnabled(skill.id, true);
    renderSkillsList();

    nameInput.value = "";
    if (descriptionInput) descriptionInput.value = "";
    instructionsInput.value = "";

    showNotification?.("Skill added and enabled.", "success");
  } catch (error) {
    showNotification?.(`Error adding skill: ${error instanceof Error ? error.message : ""}`, "error");
  }
}

/** Renders the initial skills list and wires the add-skill button. */
export function initSkillsSettings() {
  renderSkillsList();

  const addButton = document.getElementById("add-skill");
  if (addButton) {
    addButton.addEventListener("click", handleAddSkill);
  }
}
