/**
 * Party settings tab: enable toggle, scenario editor, per-character editor
 * (name, persona, temperature, per-tool toggles), and the Start control that
 * launches the {@link partyEngine}. All characters share the provider/model
 * selected in the Model tab; only the tools available to that provider are
 * offered.
 */

import { elements, state } from "../../init/state.ts";
import { responsesClient } from "../../services/api.ts";
import { startNewConversation } from "../../services/history/persistence.ts";
import { updateHeaderInfo } from "../../components/settings.ts";
import { updatePromptVisibility } from "../ui/settingsControls.ts";
import { showError } from "../../utils/notifications.ts";
import { partyEngine } from "../../services/party/partyEngine.ts";
import { defaultPartyConfig } from "../../services/party/partyState.ts";
import type { PartyCharacter, PartyConfig } from "../../services/party/partyTypes.ts";

let config: PartyConfig = defaultPartyConfig();

function newCharacterId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `char-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isEmptyCharacter(character: PartyCharacter): boolean {
  return !character.name.trim() && !character.persona.trim() && character.allowedTools.length === 0;
}

function buildToolToggles(character: PartyCharacter): HTMLElement {
  const grid = document.createElement("div");
  grid.className = "party-tool-grid";

  const availableKeys = new Set(responsesClient.getAvailableToolKeys?.() || []);
  const tools = (responsesClient.getToolCatalog?.() || []).filter((tool) => availableKeys.has(tool.key));

  if (tools.length === 0) {
    const note = document.createElement("p");
    note.className = "info-text";
    note.textContent = "No tools available for the selected provider.";
    grid.appendChild(note);
    return grid;
  }

  tools.forEach((tool, index) => {
    const item = document.createElement("div");
    item.className = "party-tool-item";

    const name = document.createElement("span");
    name.className = "party-tool-name";
    name.textContent = tool.displayName;

    const toggleContainer = document.createElement("div");
    toggleContainer.className = "toggle-container";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.className = "toggle-input";
    input.id = `party-tool-${character.id}-${index}`;
    input.checked = character.allowedTools.includes(tool.key);
    input.addEventListener("change", () => {
      if (input.checked) {
        if (!character.allowedTools.includes(tool.key)) {
          character.allowedTools.push(tool.key);
        }
      } else {
        character.allowedTools = character.allowedTools.filter((k) => k !== tool.key);
      }
    });

    const toggle = document.createElement("label");
    toggle.className = "toggle-switch";
    toggle.htmlFor = input.id;

    toggleContainer.append(input, toggle);
    item.append(name, toggleContainer);
    grid.appendChild(item);
  });

  return grid;
}

function renderCharacterRow(character: PartyCharacter, index: number): HTMLElement {
  const row = document.createElement("div");
  row.className = "party-character-row";
  row.dataset.id = character.id;

  const head = document.createElement("div");
  head.className = "party-row-head";

  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.className = "party-char-name";
  nameInput.placeholder = `Character ${index + 1}`;
  nameInput.value = character.name;
  nameInput.addEventListener("input", () => {
    character.name = nameInput.value;
  });

  const tempInput = document.createElement("input");
  tempInput.type = "number";
  tempInput.className = "party-char-temp";
  tempInput.placeholder = "temp";
  tempInput.title = "Temperature (optional)";
  tempInput.step = "0.1";
  tempInput.min = "0";
  tempInput.max = "2";
  tempInput.value = typeof character.temperature === "number" ? String(character.temperature) : "";
  tempInput.addEventListener("input", () => {
    const parsed = parseFloat(tempInput.value);
    character.temperature = Number.isFinite(parsed) ? parsed : undefined;
  });

  const removeButton = document.createElement("button");
  removeButton.type = "button";
  removeButton.className = "party-remove-character";
  removeButton.textContent = "Remove";
  removeButton.addEventListener("click", (event) => {
    event.stopPropagation();
    config.characters = config.characters.filter((c) => c.id !== character.id);
    renderCharacters();
  });

  head.append(nameInput, tempInput, removeButton);

  const persona = document.createElement("textarea");
  persona.className = "party-char-persona";
  persona.placeholder = "Persona / personality description";
  persona.value = character.persona;
  persona.addEventListener("input", () => {
    character.persona = persona.value;
  });

  row.append(head, persona, buildToolToggles(character));
  return row;
}

function renderCharacters(): void {
  const container = document.getElementById("party-characters");
  if (!container) {
    return;
  }
  container.innerHTML = "";
  config.characters.forEach((character, index) => container.appendChild(renderCharacterRow(character, index)));
}

function addCharacter(): void {
  config.characters.push({
    id: newCharacterId(),
    name: "",
    persona: "",
    allowedTools: [],
  });
  renderCharacters();
}

function bindScenarioInput(id: string, key: keyof PartyConfig["scenario"]): void {
  const input = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
  if (!input) {
    return;
  }
  if (config.scenario[key]) {
    input.value = config.scenario[key];
  }
  const handler = () => {
    config.scenario[key] = input.value;
  };
  input.addEventListener("input", handler);
  input.addEventListener("change", handler);
}

/**
 * Reacts to a prompt-type radio change. This is a *draft* action: it only
 * reveals/hides the relevant prompt fields (the party panel for "party", the
 * personality/custom inputs otherwise). It must NOT mutate the open
 * conversation's live state (`partyMode`, `activePartyConfig`) or its header —
 * that only happens when the user actually applies a prompt (a "Set …" button,
 * "Start Party", loading a conversation, or starting a new chat). Tearing down
 * party state here would corrupt the open conversation before it is applied
 * (e.g. dropping its party info, or flipping the header to the drafted prompt).
 */
function syncPartyMode(): void {
  updatePromptVisibility();
}

function closeSettingsPanel(): void {
  const closeButton = document.querySelector<HTMLButtonElement>("#settings-panel .close-settings");
  closeButton?.click();
}

async function startParty(): Promise<void> {
  const characters = config.characters.filter((c) => !isEmptyCharacter(c));
  if (characters.length < 2) {
    showError("Add at least two characters before starting a party.");
    return;
  }
  if (partyEngine.isRunning()) {
    partyEngine.stop();
  }
  const partyConfig = { characters, scenario: config.scenario, userName: config.userName };
  startNewConversation();
  state.partyMode = true;
  state.activePartyConfig = partyConfig;
  updateHeaderInfo();
  closeSettingsPanel();
  await partyEngine.start(partyConfig);
}

/** Initializes the Party settings tab. Safe to call once after panels load. */
export function initPartyTab(): void {
  config = defaultPartyConfig();

  state.partyMode = false;
  document.querySelectorAll<HTMLInputElement>("input[name=\"prompt-type\"]").forEach((radio) => {
    radio.addEventListener("change", syncPartyMode);
  });

  const userNameInput = document.getElementById("party-user-name") as HTMLInputElement | null;
  userNameInput?.addEventListener("input", () => {
    config.userName = userNameInput.value;
  });

  bindScenarioInput("party-topic", "topic");
  bindScenarioInput("party-setting", "setting");
  bindScenarioInput("party-mood", "mood");
  bindScenarioInput("party-conversation-type", "conversationType");

  document.getElementById("party-add-character")?.addEventListener("click", addCharacter);
  document.getElementById("party-start")?.addEventListener("click", () => {
    void startParty();
  });

  elements.serviceSelector?.addEventListener("change", renderCharacters);
  elements.modelSelector?.addEventListener("change", renderCharacters);

  renderCharacters();
  updatePromptVisibility();
}
