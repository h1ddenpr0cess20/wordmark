window.renderChatHistoryList = function() {
  if (!window.historyList) {
    return;
  }

  window.getAllConversationsFromDb?.()
    .then((convos) => {
      window.historyList.innerHTML = '';

      if (!convos || convos.length === 0) {
        window.historyList.innerHTML = '<div class="history-empty">No saved conversations yet.</div>';
        return;
      }

      convos.sort((a, b) => new Date(b.updated) - new Date(a.updated));

      const toolbarDiv = document.createElement('div');
      toolbarDiv.className = 'history-toolbar';
      toolbarDiv.innerHTML = `
        <div class="history-toolbar-left">
          <button class="history-new-button">
            <span>+ Start New Conversation</span>
          </button>
          <label class="selection-mode-toggle">
            <input type="checkbox" id="multi-select-mode"> Multi-select
          </label>
        </div>
        <div class="history-toolbar-right">
          <span class="selection-status" style="display: none; font-size: 0.85rem; color: var(--text-secondary); margin-right: 8px;">
            <span class="selected-count">0</span> selected
          </span>
          <button class="history-select-all-btn" title="Select all conversations" style="display: none;">Select All</button>
          <button class="history-clear-selection-btn" title="Clear selection" style="display: none;">Clear</button>
          <button class="history-load-btn" title="Load selected conversation" disabled>Load</button>
          <button class="history-rename-btn" title="Rename selected conversation" disabled>Rename</button>
          <button class="history-delete-btn" title="Delete selected conversations" disabled>Delete (<span class="delete-count">0</span>)</button>
        </div>
      `;

      const newButton = toolbarDiv.querySelector('.history-new-button');
      const multiSelectCheckbox = toolbarDiv.querySelector('#multi-select-mode');
      const selectionStatus = toolbarDiv.querySelector('.selection-status');
      const selectedCountSpan = toolbarDiv.querySelector('.selected-count');
      const selectAllButton = toolbarDiv.querySelector('.history-select-all-btn');
      const clearSelectionButton = toolbarDiv.querySelector('.history-clear-selection-btn');
      const loadButton = toolbarDiv.querySelector('.history-load-btn');
      const renameButton = toolbarDiv.querySelector('.history-rename-btn');
      const deleteButton = toolbarDiv.querySelector('.history-delete-btn');
      const deleteCountSpan = toolbarDiv.querySelector('.delete-count');

      const updateButtonStates = () => {
        const selectedRows = document.querySelectorAll('.history-row.selected');
        const isMultiSelect = multiSelectCheckbox.checked;
        const selectedCount = selectedRows.length;

        selectAllButton.style.display = isMultiSelect ? 'inline-block' : 'none';
        clearSelectionButton.style.display = isMultiSelect ? 'inline-block' : 'none';
        selectionStatus.style.display = isMultiSelect && selectedCount > 0 ? 'inline-block' : 'none';

        selectedCountSpan.textContent = selectedCount;
        deleteCountSpan.textContent = selectedCount;

        loadButton.disabled = selectedCount !== 1;
        renameButton.disabled = selectedCount !== 1;
        deleteButton.disabled = selectedCount === 0;

        deleteButton.title = selectedCount > 1
          ? `Delete ${selectedCount} selected conversations`
          : 'Delete selected conversation';
      };

      newButton.onclick = () => {
        window.startNewConversation?.();
        window.historyPanel?.setAttribute('aria-hidden', 'true');
        window.historyButton?.setAttribute('aria-expanded', 'false');
      };

      multiSelectCheckbox.onchange = () => {
        const isMultiSelect = multiSelectCheckbox.checked;

        document.querySelectorAll('.history-row').forEach((row) => {
          row.classList.remove('selected');
        });

        const table = document.querySelector('.history-table');
        if (table) {
          table.classList.toggle('multi-select-mode', isMultiSelect);
        }

        updateButtonStates();
      };

      selectAllButton.onclick = () => {
        document.querySelectorAll('.history-row').forEach((row) => {
          row.classList.add('selected');
        });
        updateButtonStates();
      };

      clearSelectionButton.onclick = () => {
        document.querySelectorAll('.history-row').forEach((row) => {
          row.classList.remove('selected');
        });
        updateButtonStates();
      };

      loadButton.onclick = () => {
        const selectedRow = document.querySelector('.history-row.selected');
        if (selectedRow) {
          const conversationId = selectedRow.dataset.conversationId;
          window.loadConversation?.(conversationId)?.then(() => {
            window.historyPanel?.setAttribute('aria-hidden', 'true');
            window.historyButton?.setAttribute('aria-expanded', 'false');
          });
        }
      };

      renameButton.onclick = () => {
        const selectedRow = document.querySelector('.history-row.selected');
        if (!selectedRow) {
          return;
        }
        const conversationId = selectedRow.dataset.conversationId;
        const currentTitle = selectedRow.querySelector('.history-title')?.textContent || '';
        const newName = prompt('Rename conversation:', currentTitle);
        if (newName && newName.trim()) {
          window.renameConversation?.(conversationId, newName.trim());
        }
      };

      deleteButton.onclick = () => {
        const selectedRows = document.querySelectorAll('.history-row.selected');
        if (!selectedRows.length) {
          return;
        }

        const conversationIds = Array.from(selectedRows).map(row => row.dataset.conversationId);
        const confirmMessage = conversationIds.length === 1
          ? 'Delete this conversation?'
          : `Delete ${conversationIds.length} conversations?`;

        if (!confirm(confirmMessage)) {
          return;
        }

        Promise.all(conversationIds.map(id => window.deleteConversationFromDb?.(id)))
          .then(() => {
            conversationIds.forEach((id) => {
              if (window.currentConversationId === id) {
                window.currentConversationId = null;
                window.currentConversationName = null;
              }
            });
            window.renderChatHistoryList?.();
          })
          .catch((err) => {
            console.error('Failed to delete conversations:', err);
            alert('Error deleting conversations. Please try again.');
          });
      };

      window.historyList.appendChild(toolbarDiv);

      const handleKeydown = (e) => {
        if (window.historyPanel?.getAttribute('aria-hidden') === 'true') {
          return;
        }

        if ((e.key === 'Delete' || e.key === 'Backspace')) {
          if (document.querySelectorAll('.history-row.selected').length > 0) {
            deleteButton.click();
          }
        } else if (e.key === 'Enter') {
          if (document.querySelectorAll('.history-row.selected').length === 1) {
            loadButton.click();
          }
        } else if (e.key === 'a' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          if (multiSelectCheckbox.checked) {
            selectAllButton.click();
          }
        } else if (e.key === 'Escape') {
          clearSelectionButton.click();
        }
      };

      document.addEventListener('keydown', handleKeydown);

      const tableContainer = document.createElement('div');
      tableContainer.className = 'history-table-container';

      const table = document.createElement('table');
      table.className = 'history-table';

      const thead = document.createElement('thead');
      thead.innerHTML = `
        <tr>
          <th class="col-title">Conversation</th>
          <th class="col-prompt">Prompt</th>
          <th class="col-model">Model</th>
          <th class="col-stats">Stats</th>
          <th class="col-date">Updated</th>
        </tr>
      `;
      table.appendChild(thead);

      const tbody = document.createElement('tbody');

      convos.forEach((convo) => {
        const row = document.createElement('tr');
        row.className = 'history-row';
        row.dataset.conversationId = convo.id;

        if (window.currentConversationId === convo.id) {
          row.classList.add('current-conversation');
        }

        let title = '';
        const userMsg = (convo.messages || []).find(m => m.role === 'user');
        if (userMsg) {
          title = userMsg.content.substring(0, 50) + (userMsg.content.length > 50 ? '...' : '');
        } else {
          title = '(No user message)';
        }

        const date = new Date(convo.updated);
        const now = new Date();
        const yesterday = new Date();
        yesterday.setDate(now.getDate() - 1);

        let formatted;
        if (date.toDateString() === now.toDateString()) {
          formatted = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } else if (date.toDateString() === yesterday.toDateString()) {
          formatted = 'Yesterday';
        } else {
          formatted = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
        }

        let promptInfo = '';
        let promptClass = 'none';
        if (convo.systemPrompt) {
          if (convo.systemPrompt.type === 'personality') {
            promptInfo = convo.systemPrompt.content || window.DEFAULT_PERSONALITY || 'Default';
            promptClass = 'personality';
          } else if (convo.systemPrompt.type === 'custom') {
            const content = convo.systemPrompt.content || '';
            promptInfo = content.substring(0, 30) + (content.length > 30 ? '...' : '');
            promptClass = 'custom';
          } else {
            promptInfo = 'None';
            promptClass = 'none';
          }
        }

        const modelInfo = convo.model || 'Unknown';
        const serviceInfo = convo.service || 'Unknown';
        const messageCount = (convo.messages || []).length;
        const imageCount = (convo.images || []).length;

        row.innerHTML = `
          <td class="col-title">
            <div class="history-title">${title}</div>
          </td>
          <td class="col-prompt">
            <span class="prompt-type ${promptClass}">${promptInfo}</span>
          </td>
          <td class="col-model">
            <div class="model-info">
              <div class="model-name">${modelInfo}</div>
              <div class="service-name">${serviceInfo}</div>
            </div>
          </td>
          <td class="col-stats">
            <div class="stats-info">
              <span class="message-count">${messageCount} msg</span>
              ${imageCount > 0 ? `<span class="image-count">${imageCount} img</span>` : ''}
            </div>
          </td>
          <td class="col-date">
            <span class="date-info">${formatted}</span>
          </td>
        `;

        row.onclick = (e) => {
          const isMultiSelect = multiSelectCheckbox.checked;

          if (isMultiSelect) {
            if (e.ctrlKey || e.metaKey) {
              row.classList.toggle('selected');
            } else if (e.shiftKey) {
              const allRows = Array.from(document.querySelectorAll('.history-row'));
              const lastSelected = document.querySelector('.history-row.selected:last-of-type');

              if (lastSelected) {
                const startIndex = allRows.indexOf(lastSelected);
                const endIndex = allRows.indexOf(row);
                const [minIndex, maxIndex] = [Math.min(startIndex, endIndex), Math.max(startIndex, endIndex)];
                for (let i = minIndex; i <= maxIndex; i += 1) {
                  allRows[i].classList.add('selected');
                }
              } else {
                row.classList.add('selected');
              }
            } else {
              row.classList.toggle('selected');
            }
          } else {
            document.querySelectorAll('.history-row').forEach((r) => r.classList.remove('selected'));
            row.classList.add('selected');
          }

          updateButtonStates();
        };

        tbody.appendChild(row);
      });

      table.appendChild(tbody);
      tableContainer.appendChild(table);
      window.historyList.appendChild(tableContainer);
    })
    .catch((err) => {
      console.error('Error loading conversations for history list:', err);
      window.historyList.innerHTML = '<div class="history-error">Error loading conversation history.</div>';
    });
};

