let allData = [];
let filteredData = [];
let visibleColumns = {};
let currentEditingCell = null;
let currentUser = localStorage.getItem('pfmea_user') || 'User';

// Undo/Redo System
let history = [];
let historyIndex = -1;

// Audit Trail
let auditTrail = [];

// Comments System
let cellComments = {};

// **UPDATED: Complete column structure with Classification**
const defaultColumns = [
  'station',
  'process_step',
  'requirement',
  'process_type',
  'failure_mode',
  'failure_effect',
  'severity',
  'classification',
  'potential_cause',
  'occurrence',
  'prevention_control',
  'detection_control',
  'detection',
  'action_priority',
  'action_to_be_taken',
  'timestamp',
  'source'
];

let customColumns = [];
let allColumns = [...defaultColumns];

const columnLabels = {
  'station': '🏭 Station',
  'process_step': 'Process Step / Op Description',
  'requirement': 'Requirement (Col D)',
  'process_type': 'Process Type',
  'failure_mode': 'Failure Mode',
  'failure_effect': 'Failure Effect',
  'severity': 'Severity (S)',
  'classification': '🏷️ Classification',
  'potential_cause': 'Potential Cause',
  'occurrence': 'Occurrence (O)',
  'prevention_control': 'Prevention Control',
  'detection_control': 'Detection Control',
  'detection': 'Detection (D)',
  'action_priority': 'Action Priority (AP)',
  'action_to_be_taken': '⚠️ Action to be Taken',
  'timestamp': '📅 Date/Time Added',
  'source': '📥 Source'
};

// Initialize visible columns
defaultColumns.forEach(col => {
  visibleColumns[col] = true;
});

// AP Calculation Function (AIAG-VDA Method)
function calculateAP(s, o, d) {
  s = parseInt(s) || 1; 
  o = parseInt(o) || 1; 
  d = parseInt(d) || 1;
  
  if (s === 1) return "L"; 
  if (s >= 9) {
    if (o >= 8) return "H";
    if (o >= 4) return (d >= 2) ? "H" : "M";
    return (d >= 5) ? "H" : (d >= 2 ? "M" : "L");
  }
  if (s >= 7) {
    if (o >= 8) return "H";
    if (o >= 4) return (d >= 5) ? "H" : "M";
    return (d >= 5) ? "M" : "L";
  }
  if (s >= 4) {
    if (o >= 6) return (d >= 5) ? "H" : "M";
    return (d >= 5) ? "M" : "L";
  }
  if (o >= 6) return (d >= 5) ? "M" : "L";
  return "L";
}

function getCurrentTimestamp() {
  return new Date().toLocaleString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function formatTimestamp(isoString) {
  if (!isoString) return '-';
  const date = new Date(isoString);
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function setCurrentUser() {
  const user = prompt('Enter your name for audit trail:', currentUser);
  if (user) {
    currentUser = user;
    localStorage.setItem('pfmea_user', user);
    alert(`✅ User set to: ${user}`);
  }
}

function addAuditEntry(type, rowIndex, colName, oldValue, newValue) {
  const entry = {
    type: type,
    timestamp: getCurrentTimestamp(),
    user: currentUser,
    rowIndex: rowIndex,
    column: colName,
    oldValue: oldValue,
    newValue: newValue
  };
  auditTrail.push(entry);
  localStorage.setItem('pfmea_audit_trail', JSON.stringify(auditTrail));
}

function loadAuditTrail() {
  const saved = localStorage.getItem('pfmea_audit_trail');
  if (saved) {
    auditTrail = JSON.parse(saved);
  }
}

function loadComments() {
  const saved = localStorage.getItem('pfmea_comments');
  if (saved) {
    cellComments = JSON.parse(saved);
  }
}

function saveComments() {
  localStorage.setItem('pfmea_comments', JSON.stringify(cellComments));
}

function getCellKey(rowIndex, colName) {
  return `${rowIndex}_${colName}`;
}

function addComment() {
  const commentText = document.getElementById('commentInput').value.trim();
  if (!commentText) {
    alert('Please enter a comment');
    return;
  }

  if (!currentEditingCell) return;

  const cellKey = getCellKey(currentEditingCell.rowIndex, currentEditingCell.colName);
  if (!cellComments[cellKey]) {
    cellComments[cellKey] = [];
  }

  cellComments[cellKey].push({
    author: currentUser,
    timestamp: getCurrentTimestamp(),
    text: commentText
  });

  saveComments();
  document.getElementById('commentInput').value = '';
  displayComments();
}

function displayComments() {
  if (!currentEditingCell) return;

  const cellKey = getCellKey(currentEditingCell.rowIndex, currentEditingCell.colName);
  const comments = cellComments[cellKey] || [];
  const container = document.getElementById('commentsContainer');

  if (comments.length === 0) {
    container.innerHTML = '<p style="color: #64748b; font-size: 12px; text-align: center;">No comments yet</p>';
    return;
  }

  container.innerHTML = comments.map(comment => `
    <div class="comment">
      <div class="comment-header">
        <span class="comment-author">${comment.author}</span>
        <span class="comment-time">${comment.timestamp}</span>
      </div>
      <div class="comment-text">${comment.text}</div>
    </div>
  `).join('');
}

function displayAuditTrail() {
  if (!currentEditingCell) return;

  const rowIndex = currentEditingCell.rowIndex;
  const colName = currentEditingCell.colName;
  const container = document.getElementById('auditTrailContainer');

  const relevantEntries = auditTrail.filter(entry => 
    entry.rowIndex === rowIndex && entry.column === colName
  );

  if (relevantEntries.length === 0) {
    container.innerHTML = '<p style="color: #64748b; font-size: 12px; text-align: center;">No changes yet</p>';
    return;
  }

  container.innerHTML = relevantEntries.reverse().map(entry => `
    <div class="audit-entry ${entry.type}">
      <div class="audit-timestamp">
        ${entry.type === 'edit' ? '✏️ Edited' : entry.type === 'add' ? '➕ Added' : '🗑️ Deleted'}
      </div>
      <div class="audit-user">by ${entry.user} • ${entry.timestamp}</div>
      <div class="audit-change">
        <span class="old-value">${entry.oldValue || '(empty)'}</span> 
        → 
        <span class="new-value">${entry.newValue || '(empty)'}</span>
      </div>
    </div>
  `).join('');
}

function saveState() {
  const state = JSON.parse(JSON.stringify(allData));
  history = history.slice(0, historyIndex + 1);
  history.push(state);
  historyIndex++;
  updateUndoRedoButtons();
}

function undo() {
  if (historyIndex > 0) {
    historyIndex--;
    allData = JSON.parse(JSON.stringify(history[historyIndex]));
    renderTable(filteredData.length > 0 ? filteredData : allData);
    updateStats(filteredData.length > 0 ? filteredData : allData);
    updateUndoRedoButtons();
    showToast('↶ Changes undone', 'success');
  }
}

function redo() {
  if (historyIndex < history.length - 1) {
    historyIndex++;
    allData = JSON.parse(JSON.stringify(history[historyIndex]));
    renderTable(filteredData.length > 0 ? filteredData : allData);
    updateStats(filteredData.length > 0 ? filteredData : allData);
    updateUndoRedoButtons();
    showToast('↷ Changes redone', 'success');
  }
}

function updateUndoRedoButtons() {
  document.getElementById('undoBtn').disabled = historyIndex <= 0;
  document.getElementById('redoBtn').disabled = historyIndex >= history.length - 1;
}

document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key === 'z') {
    e.preventDefault();
    undo();
  }
  if (e.ctrlKey && e.key === 'y') {
    e.preventDefault();
    redo();
  }
});

function loadCustomColumns() {
  const saved = localStorage.getItem('pfmea_custom_columns');
  if (saved) {
    customColumns = JSON.parse(saved);
    customColumns.forEach(col => {
      allColumns.push(col.key);
      columnLabels[col.key] = col.label;
      visibleColumns[col.key] = true;
    });
  }
}

function saveCustomColumns() {
  localStorage.setItem('pfmea_custom_columns', JSON.stringify(customColumns));
}

function toggleMobileMenu() {
  const menu = document.getElementById('navbarMenu');
  menu.classList.toggle('active');
}

function toggleColumnMenu() {
  const menu = document.getElementById('columnMenu');
  menu.classList.toggle('active');
  if (menu.classList.contains('active')) {
    populateColumnMenu();
  }
}

function populateColumnMenu() {
  const menu = document.getElementById('columnMenu');
  menu.innerHTML = '';
  
  allColumns.forEach(col => {
    const item = document.createElement('div');
    item.className = 'column-item';
    
    const isCustom = customColumns.some(c => c.key === col);
    
    let actionsHTML = '';
    if (isCustom) {
      actionsHTML = `
        <div class="column-item-actions">
          <button onclick="deleteCustomColumn('${col}')" title="Delete">🗑️</button>
        </div>
      `;
    }
    
    item.innerHTML = `
      <input type="checkbox" id="col_${col}" ${visibleColumns[col] ? 'checked' : ''} 
             onchange="toggleColumn('${col}')">
      <label for="col_${col}" style="margin: 0; cursor: pointer; flex: 1;">${columnLabels[col]}</label>
      ${actionsHTML}
    `;
    menu.appendChild(item);
  });

  const divider = document.createElement('div');
  divider.className = 'column-menu-divider';
  divider.textContent = '➕ Add Custom Column';
  menu.appendChild(divider);

  const form = document.createElement('div');
  form.className = 'add-column-form';
  form.innerHTML = `
    <input type="text" id="newColName" placeholder="Column Name (e.g., Notes)" maxlength="50">
    <button type="button" onclick="addCustomColumn()">Add Column</button>
  `;
  menu.appendChild(form);
}

function addCustomColumn() {
  const colName = document.getElementById('newColName').value.trim();
  
  if (!colName) {
    alert('Please enter a column name');
    return;
  }

  const colKey = colName.toLowerCase().replace(/\s+/g, '_');
  
  if (columnLabels[colKey]) {
    alert('This column already exists');
    return;
  }

  customColumns.push({ key: colKey, label: colName });
  allColumns.push(colKey);
  columnLabels[colKey] = colName;
  visibleColumns[colKey] = true;

  allData.forEach(row => {
    row[colKey] = '';
  });

  saveCustomColumns();
  document.getElementById('newColName').value = '';
  populateColumnMenu();
  renderTable(filteredData.length > 0 ? filteredData : allData);
  alert(`✅ Column "${colName}" added successfully!`);
}

function deleteCustomColumn(colKey) {
  if (confirm(`Delete column "${columnLabels[colKey]}"? This cannot be undone.`)) {
    customColumns = customColumns.filter(c => c.key !== colKey);
    allColumns = allColumns.filter(c => c !== colKey);
    delete columnLabels[colKey];
    delete visibleColumns[colKey];

    allData.forEach(row => {
      delete row[colKey];
    });

    saveCustomColumns();
    populateColumnMenu();
    renderTable(filteredData.length > 0 ? filteredData : allData);
    alert('✅ Column deleted successfully!');
  }
}

function toggleColumn(col) {
  visibleColumns[col] = !visibleColumns[col];
  renderTable(filteredData.length > 0 ? filteredData : allData);
}

function openEditCellModal(rowIndex, colName) {
  currentEditingCell = { rowIndex, colName };
  const row = (filteredData.length > 0 ? filteredData : allData)[rowIndex];
  
  document.getElementById('editCellTitle').textContent = `Edit: ${columnLabels[colName]}`;
  document.getElementById('editCellLabel').textContent = columnLabels[colName];
  document.getElementById('editCellInput').value = row[colName] || '';
  document.getElementById('currentValueDisplay').textContent = row[colName] || '(empty)';
  document.getElementById('editCellModal').classList.add('active');

  displayComments();
  displayAuditTrail();
}

function closeEditCellModal() {
  document.getElementById('editCellModal').classList.remove('active');
  currentEditingCell = null;
}

document.getElementById('editCellForm').addEventListener('submit', function(e) {
  e.preventDefault();
  
  if (currentEditingCell) {
    const { rowIndex, colName } = currentEditingCell;
    const data = filteredData.length > 0 ? filteredData : allData;
    const oldValue = data[rowIndex][colName];
    const newValue = document.getElementById('editCellInput').value;

    data[rowIndex][colName] = newValue;
    
    if (['severity', 'occurrence', 'detection'].includes(colName)) {
      data[rowIndex].action_priority = calculateAP(data[rowIndex].severity, data[rowIndex].occurrence, data[rowIndex].detection);
    }

    saveState();
    addAuditEntry('edit', rowIndex, colName, oldValue, newValue);
    
    closeEditCellModal();
    renderTable(data);
    updateStats(filteredData.length > 0 ? filteredData : allData);
    saveChanges();
  }
});

async function initDatabaseRender() {
  const tableBody = document.getElementById('tableBody');
  
  try {
    loadCustomColumns();
    loadAuditTrail();
    loadComments();
    
    let dbData = localStorage.getItem('pfmea_data');
    
    if (!dbData) {
      dbData = '[]';
      localStorage.setItem('pfmea_data', dbData);
    }
    
    const db = JSON.parse(dbData);
    allData = db;
    
    populateFilters();
    saveState();
    renderTable(allData);
    updateStats(allData);
    updateUndoRedoButtons();
    
  } catch (err) {
    console.error("Failed to load data: ", err);
    tableBody.innerHTML = `<tr><td colspan="20" style="text-align:center; color:red; padding:20px;">❌ Failed to load data.</td></tr>`;
    allData = [];
    saveState();
  }
}

function populateFilters() {
  const stations = [...new Set(allData.map(d => d.station))].sort();
  const operationFilter = document.getElementById('operationFilter');
  
  operationFilter.innerHTML = '<option value="">All Stations</option>';
  
  stations.forEach(station => {
    const option = document.createElement('option');
    option.value = station;
    option.textContent = station;
    operationFilter.appendChild(option);
  });
}

function renderTable(data) {
  const tableBody = document.getElementById('tableBody');
  const headerRow = document.getElementById('headerRow');
  const noResults = document.getElementById('noResults');
  
  headerRow.innerHTML = '';
  allColumns.forEach(col => {
    if (visibleColumns[col]) {
      const th = document.createElement('th');
      th.textContent = columnLabels[col];
      
      // Enhanced styling for headers
      th.style.backgroundColor = '#1e293b';
      th.style.color = '#ffffff';
      th.style.fontWeight = '600';
      th.style.fontSize = '13px';
      th.style.padding = '14px 12px';
      th.style.textAlign = 'center';
      th.style.letterSpacing = '0.3px';
      th.style.fontFamily = "'Inter', 'Segoe UI', system-ui, sans-serif";
      
      if (col === 'action_priority') {
        th.style.backgroundColor = '#0f172a';
        th.style.fontWeight = 'bold';
      }
      
      if (col === 'action_to_be_taken') {
        th.style.backgroundColor = '#dc2626';
        th.style.fontWeight = 'bold';
      }
      
      if (col === 'classification') {
        th.style.backgroundColor = '#1e40af';
        th.style.fontWeight = 'bold';
      }
      
      headerRow.appendChild(th);
    }
  });

  const editTh = document.createElement('th');
  editTh.className = 'edit-column';
  editTh.style.width = '100px';
  editTh.textContent = 'Actions';
  editTh.style.backgroundColor = '#1e293b';
  editTh.style.color = '#ffffff';
  editTh.style.fontWeight = '600';
  editTh.style.fontSize = '13px';
  editTh.style.fontFamily = "'Inter', 'Segoe UI', system-ui, sans-serif";
  headerRow.appendChild(editTh);

  if (data.length === 0) {
    tableBody.innerHTML = '';
    noResults.style.display = 'block';
    return;
  }
  
  noResults.style.display = 'none';
  tableBody.innerHTML = '';
  
  data.forEach((row, rowIndex) => {
    const tr = document.createElement('tr');
    
    allColumns.forEach(col => {
      if (!visibleColumns[col]) return;

      const td = document.createElement('td');
      td.className = 'editable';
      td.onclick = () => openEditCellModal(rowIndex, col);

      const cellKey = getCellKey(rowIndex, col);
      const hasComments = cellComments[cellKey] && cellComments[cellKey].length > 0;

      if (col === 'action_priority') {
        const apClass = row[col] === 'H' ? 'high' : (row[col] === 'M' ? 'med' : 'low');
        td.innerHTML = `<span class="badge-rpn ${apClass}">${row[col]}</span>`;
        td.style.textAlign = 'center';
        td.style.backgroundColor = '#f8fafc';
        td.style.fontWeight = 'bold';
      } else if (col === 'classification') {
        let badgeClass = '';
        let badgeText = row[col] || 'None';
        
        if (badgeText === 'SC') {
          badgeClass = 'bg-red-100 text-red-800 border border-red-300';
        } else if (badgeText === 'CC') {
          badgeClass = 'bg-orange-100 text-orange-800 border border-orange-300';
        } else {
          badgeClass = 'bg-gray-100 text-gray-600 border border-gray-300';
        }
        
        td.innerHTML = `<span style="display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;" class="${badgeClass}">${badgeText}</span>`;
        td.style.textAlign = 'center';
        td.style.backgroundColor = '#f8fafc';
      } else if (col === 'action_to_be_taken') {
        const actionText = row[col] || '';
        const isEmpty = !actionText.trim();
        const isHighOrMedium = row.action_priority === 'H' || row.action_priority === 'M';
        
        if (isEmpty && isHighOrMedium) {
          td.innerHTML = `<span style="color: #dc2626; font-weight: 600; font-style: italic;">⚠️ Required</span>`;
          td.style.backgroundColor = '#fee2e2';
        } else {
          td.textContent = actionText;
          if (isHighOrMedium && !isEmpty) {
            td.style.backgroundColor = '#dcfce7';
            td.style.fontWeight = '600';
          }
        }
      } else if (col === 'timestamp') {
        td.textContent = formatTimestamp(row[col]);
        td.style.fontSize = '11px';
        td.style.color = '#64748b';
      } else if (col === 'source') {
        const sourceIcon = row[col] === 'manual' ? '✍️ Manual' : '📤 Import';
        td.textContent = sourceIcon;
        td.style.fontSize = '11px';
        td.style.textAlign = 'center';
      } else {
        td.textContent = row[col] || '';
      }

      if (hasComments) {
        td.innerHTML += '<div class="comment-indicator"></div>';
      }

      tr.appendChild(td);
    });

    const editTd = document.createElement('td');
    editTd.className = 'edit-column';
    editTd.style.textAlign = 'center';
    editTd.style.whiteSpace = 'nowrap';
    editTd.innerHTML = `
      <div class="action-buttons">
        <button class="btn btn-secondary btn-small" onclick="openEditCellModal(${rowIndex}, 'station')" title="Edit">✏️</button>
        <button class="btn btn-warning btn-small" onclick="setCurrentUser()" title="Set User">👤</button>
        <button class="btn btn-danger btn-small" onclick="deleteRow(${rowIndex})" title="Delete">🗑️</button>
      </div>
    `;
    tr.appendChild(editTd);

    tableBody.appendChild(tr);
  });
}

function deleteRow(rowIndex) {
  if (confirm('Are you sure you want to delete this row?')) {
    const data = filteredData.length > 0 ? filteredData : allData;
    const itemToDelete = data[rowIndex];
    
    allData = allData.filter(item => item !== itemToDelete);
    saveState();
    addAuditEntry('delete', rowIndex, 'row', JSON.stringify(itemToDelete), 'Row deleted');
    
    applyFilters();
    saveChanges();
    alert('✅ Row deleted successfully!');
  }
}

function applyFilters() {
  const searchTerm = document.getElementById('searchInput').value.toLowerCase();
  const station = document.getElementById('operationFilter').value;
  const apRange = document.getElementById('rpnFilter').value;
  const severity = document.getElementById('severityFilter').value;
  const classFilter = document.getElementById('classFilter').value;
  
  filteredData = allData.filter(row => {
    if (searchTerm) {
      const searchableText = `
        ${row.station} ${row.process_step} ${row.requirement}
        ${row.failure_mode} ${row.failure_effect} ${row.potential_cause}
        ${row.prevention_control} ${row.detection_control} ${row.action_to_be_taken}
      `.toLowerCase();
      
      if (!searchableText.includes(searchTerm)) return false;
    }
    
    if (station && row.station !== station) return false;
    
    if (apRange) {
      if (apRange === 'high' && row.action_priority !== 'H') return false;
      if (apRange === 'medium' && row.action_priority !== 'M') return false;
      if (apRange === 'low' && row.action_priority !== 'L') return false;
    }
    
    if (severity && row.severity !== parseInt(severity)) return false;
    
    if (classFilter) {
      if (classFilter === 'SC' && row.classification !== 'SC') return false;
      if (classFilter === 'CC' && row.classification !== 'CC') return false;
      if (classFilter === 'other' && (row.classification === 'SC' || row.classification === 'CC')) return false;
    }
    
    return true;
  });
  
  renderTable(filteredData);
  updateStats(filteredData);
}

function resetFilters() {
  document.getElementById('searchInput').value = '';
  document.getElementById('operationFilter').value = '';
  document.getElementById('rpnFilter').value = '';
  document.getElementById('severityFilter').value = '';
  document.getElementById('classFilter').value = '';
  
  filteredData = [];
  renderTable(allData);
  updateStats(allData);
}

function updateStats(data) {
  const total = data.length;
  const highRisk = data.filter(d => d.action_priority === 'H').length;
  const mediumRisk = data.filter(d => d.action_priority === 'M').length;
  const lowRisk = data.filter(d => d.action_priority === 'L').length;
  
  document.getElementById('totalRecords').textContent = total;
  document.getElementById('highRiskCount').textContent = highRisk;
  document.getElementById('mediumRiskCount').textContent = mediumRisk;
  document.getElementById('scCount').textContent = lowRisk;
}

function saveChanges() {
  localStorage.setItem('pfmea_data', JSON.stringify(allData));
  showToast('✅ Changes saved to local storage!', 'success');
}

function goToIndex() {
  window.location.href = 'index.html';
}

function goToAddEntry() {
  window.location.href = 'pfmea-entry.html';
}

function confirmDeleteDatabase() {
  const recordCount = allData.length;
  
  if (recordCount === 0) {
    alert('⚠️ Database is already empty!');
    return;
  }
  
  document.getElementById('deleteRecordCount').textContent = recordCount;
  document.getElementById('deleteDbModal').classList.add('active');
}

function closeDeleteDbModal() {
  document.getElementById('deleteDbModal').classList.remove('active');
}

function executeDeleteDatabase() {
  allData = [];
  filteredData = [];
  history = [];
  historyIndex = -1;
  
  localStorage.removeItem('pfmea_data');
  localStorage.setItem('pfmea_data', JSON.stringify([]));
  
  auditTrail = [];
  localStorage.removeItem('pfmea_audit_trail');
  
  cellComments = {};
  localStorage.removeItem('pfmea_comments');
  
  closeDeleteDbModal();
  
  renderTable([]);
  updateStats([]);
  updateUndoRedoButtons();
  
  showToast('✅ Database deleted successfully! All records have been removed.', 'success');
  
  addAuditEntry('delete', 0, 'database', 'All records', 'Database cleared');
}

function exportToCSV() {
  const data = filteredData.length > 0 ? filteredData : allData;
  
  if (data.length === 0) {
    alert('No data to export!');
    return;
  }
  
  const headers = allColumns.filter(col => visibleColumns[col]).map(col => columnLabels[col]);
  let csv = headers.join(',') + '\n';
  
  data.forEach(row => {
    const values = allColumns.filter(col => visibleColumns[col]).map(col => {
      const val = row[col] || '';
      return typeof val === 'string' && val.includes(',') ? `"${val}"` : val;
    });
    csv += values.join(',') + '\n';
  });
  
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `PFMEA_Database_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}

function exportAuditTrail() {
  document.getElementById('auditLogModal').classList.add('active');
  
  const container = document.getElementById('auditLogContent');
  
  if (auditTrail.length === 0) {
    container.innerHTML = '<p style="text-align: center; color: #64748b; padding: 30px;">No audit entries yet</p>';
    return;
  }

  container.innerHTML = auditTrail.reverse().map(entry => `
    <div class="audit-entry ${entry.type}">
      <div class="audit-timestamp">
        ${entry.type === 'edit' ? '✏️ Edited' : entry.type === 'add' ? '➕ Added' : '🗑️ Deleted'}
        ${entry.column ? ` • <strong>${columnLabels[entry.column] || entry.column}</strong>` : ' • Row'}
      </div>
      <div class="audit-user">by <strong>${entry.user}</strong> • ${entry.timestamp}</div>
      ${entry.oldValue ? `<div class="audit-change">
        <span class="old-value">${entry.oldValue}</span> 
        → 
        <span class="new-value">${entry.newValue}</span>
      </div>` : ''}
    </div>
  `).join('');
}

function closeAuditLogModal() {
  document.getElementById('auditLogModal').classList.remove('active');
}

function exportAuditTrailCSV() {
  if (auditTrail.length === 0) {
    alert('No audit entries to export!');
    return;
  }

  const headers = ['Type', 'Timestamp', 'User', 'Row', 'Column', 'Old Value', 'New Value'];
  let csv = headers.join(',') + '\n';

  auditTrail.forEach(entry => {
    const values = [
      entry.type,
      entry.timestamp,
      entry.user,
      entry.rowIndex,
      entry.column || 'row',
      `"${entry.oldValue || ''}"`,
      `"${entry.newValue || ''}"`
    ];
    csv += values.join(',') + '\n';
  });

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `PFMEA_AuditTrail_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    padding: 16px 20px;
    background: white;
    border-radius: 8px;
    box-shadow: 0 10px 30px rgba(0,0,0,0.15);
    z-index: 3000;
    animation: slideInRight 0.3s ease;
    border-left: 4px solid ${type === 'success' ? '#16a34a' : type === 'error' ? '#dc2626' : '#17b890'};
  `;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

document.querySelectorAll('.modal').forEach(modal => {
  modal.addEventListener('click', function(e) {
    if (e.target === this) {
      this.classList.remove('active');
    }
  });
});

window.addEventListener('DOMContentLoaded', initDatabaseRender);