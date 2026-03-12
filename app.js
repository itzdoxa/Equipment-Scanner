const API_BASE = 'https://astrid-augitic-phoebe.ngrok-free.dev';
const CONFIDENCE_THRESHOLD = 0.78;

let selectedFile = null;
let detections = [];
let reviewIndex = 0;
let confirmedItems = [];

// Navigation

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => {
    if (s.classList.contains('active')) {
      s.classList.remove('active');
      s.classList.add('exit');
      setTimeout(() => s.classList.remove('exit'), 350);
    }
  });
  setTimeout(() => {
    document.getElementById('screen-' + id).classList.add('active');
  }, 50);
}

function goHome() {
  resetUpload();
  showScreen('home');
}

function goToUpload() {
  resetUpload();
  showScreen('upload');
}

// Upload

function resetUpload() {
  selectedFile = null;
  document.getElementById('file-input').value = '';
  document.getElementById('upload-zone').style.display = '';
  document.getElementById('upload-preview').style.display = 'none';
  document.getElementById('btn-detect').disabled = true;
}

function handleFileSelect(e) {
  const file = e.target.files[0];
  if (!file) return;
  selectedFile = file;

  const reader = new FileReader();
  reader.onload = function(ev) {
    document.getElementById('preview-img').src = ev.target.result;
    document.getElementById('preview-name').textContent = file.name;
    document.getElementById('upload-zone').style.display = 'none';
    document.getElementById('upload-preview').style.display = 'block';
    document.getElementById('btn-detect').disabled = false;
  };
  reader.readAsDataURL(file);
}

// Drag and drop
const zone = document.getElementById('upload-zone');
zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
zone.addEventListener('drop', e => {
  e.preventDefault();
  zone.classList.remove('dragover');
  if (e.dataTransfer.files.length) {
    document.getElementById('file-input').files = e.dataTransfer.files;
    handleFileSelect({ target: { files: e.dataTransfer.files } });
  }
});

async function sendForDetection() {
  if (!selectedFile) return;
  showScreen('processing');

  try {
    const formData = new FormData();
    formData.append('file', selectedFile, selectedFile.name);

    const resp = await fetch(API_BASE + '/detect', {
      method: 'POST',
      headers: { 'ngrok-skip-browser-warning': 'true' },
      body: formData
    });

    if (!resp.ok) throw new Error('Detection failed');

    const data = await resp.json();
    handleDetectionResult(data);
  } catch (err) {
    console.error(err);
    showToast('Detection failed. Check connection.');
    setTimeout(goHome, 1500);
  }
}

function handleDetectionResult(data) {
  if (Array.isArray(data)) {
    detections = data;
  } else if (data.detected_equipment) {
    detections = data.detected_equipment;
  } else if (data.detections) {
    detections = data.detections;
  } else if (data.results) {
    detections = data.results;
  } else {
    detections = [];
  }

  if (detections.length === 0) {
    showToast('No equipment detected. Try again.');
    setTimeout(goHome, 1500);
    return;
  }

  detections = detections.map(d => ({
    name: d.name || d.equipment || d.label || d.class_name || d.class || 'Unknown',
    confidence: d.confidence || d.score || 0
  }));

  reviewIndex = 0;
  confirmedItems = [];
  showScreen('review');
  renderReviewCard();
}

// Review

function renderReviewCard() {
  const item = detections[reviewIndex];
  const isConfident = item.confidence >= CONFIDENCE_THRESHOLD;
  const confPercent = Math.round(item.confidence * 100);

  document.getElementById('review-counter').textContent = (reviewIndex + 1) + ' / ' + detections.length;

  const body = document.getElementById('review-body');
  const actions = document.getElementById('review-actions');

  if (isConfident) {
    body.innerHTML =
      '<div class="equipment-card confident fade-in-up">' +
        '<div class="confidence-badge high">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>' +
          'High confidence' +
        '</div>' +
        '<div class="equipment-name">' + item.name + '</div>' +
        '<div class="equipment-conf">' + confPercent + '% confidence</div>' +
        '<div class="conf-bar-track">' +
          '<div class="conf-bar-fill high" style="width: ' + confPercent + '%"></div>' +
        '</div>' +
        '<div class="validation-section" id="edit-section" style="display:none">' +
          '<div class="validation-label">Correct the name</div>' +
          '<input class="validation-input" id="edit-input" value="' + item.name + '" />' +
        '</div>' +
        '<span class="edit-link" id="edit-link" onclick="toggleEdit()">Not right? Edit</span>' +
      '</div>';
  } else {
    body.innerHTML =
      '<div class="equipment-card not-confident fade-in-up">' +
        '<div class="confidence-badge low">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>' +
          'Needs review' +
        '</div>' +
        '<div class="equipment-name">' + item.name + '</div>' +
        '<div class="equipment-conf">' + confPercent + '% confidence</div>' +
        '<div class="conf-bar-track">' +
          '<div class="conf-bar-fill low" style="width: ' + confPercent + '%"></div>' +
        '</div>' +
        '<div class="validation-section">' +
          '<div class="validation-label">Is this correct? Edit the name if needed.</div>' +
          '<input class="validation-input" id="edit-input" value="' + item.name + '" />' +
        '</div>' +
      '</div>';
  }

  actions.innerHTML =
    '<button class="btn btn-confirm-item" onclick="confirmItem()">Confirm</button>' +
    '<button class="btn btn-remove" onclick="removeItem()">Remove</button>';
}

function toggleEdit() {
  const section = document.getElementById('edit-section');
  const link = document.getElementById('edit-link');
  if (section.style.display === 'none') {
    section.style.display = 'block';
    link.textContent = 'Cancel edit';
    document.getElementById('edit-input').focus();
  } else {
    section.style.display = 'none';
    link.textContent = 'Not right? Edit';
  }
}

function confirmItem() {
  const input = document.getElementById('edit-input');
  const item = detections[reviewIndex];
  const finalName = input ? input.value.trim() || item.name : item.name;

  confirmedItems.push({ name: finalName, confidence: item.confidence });
  nextReviewItem();
}

function removeItem() {
  nextReviewItem();
}

function nextReviewItem() {
  reviewIndex++;
  if (reviewIndex >= detections.length) {
    showSummary();
  } else {
    renderReviewCard();
  }
}

// Summary

function showSummary() {
  showScreen('summary');
  document.getElementById('summary-num').textContent = confirmedItems.length;

  const listEl = document.getElementById('summary-list');

  if (confirmedItems.length === 0) {
    document.getElementById('summary-subtitle').textContent = 'No items confirmed';
    listEl.innerHTML = '<p class="error-msg">No equipment was confirmed. Try scanning again.</p>';
    return;
  }

  document.getElementById('summary-subtitle').textContent = 'Review your confirmed list';

  let html = '<h3>Equipment List</h3>';
  confirmedItems.forEach(function(item, i) {
    const pct = Math.round(item.confidence * 100);
    html +=
      '<div class="summary-item fade-in-up" style="animation-delay: ' + (i * 0.06) + 's">' +
        '<div class="summary-item-num">' + (i + 1) + '</div>' +
        '<div class="summary-item-info">' +
          '<div class="summary-item-name">' + item.name + '</div>' +
          '<div class="summary-item-conf">' + pct + '% confidence</div>' +
        '</div>' +
        '<div class="summary-item-check">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>' +
        '</div>' +
      '</div>';
  });
  listEl.innerHTML = html;
}

function finish() {
  showToast('Equipment list saved!');
  setTimeout(goHome, 1200);
}

function startOver() {
  detections = [];
  confirmedItems = [];
  reviewIndex = 0;
  goToUpload();
}

// Toast

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(function() { t.classList.remove('show'); }, 2200);
}
