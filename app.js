const API_BASE = 'https://35.173.230.180';
const CONFIDENCE_THRESHOLD = 0.70;

var selectedFile = null;
var detections = [];
var reviewIndex = 0;
var confirmedItems = [];

// Navigation

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(function(s) {
    if (s.classList.contains('active')) {
      s.classList.remove('active');
      s.classList.add('exit');
      setTimeout(function() { s.classList.remove('exit'); }, 350);
    }
  });
  setTimeout(function() {
    document.getElementById('screen-' + id).classList.add('active');
  }, 50);
}

function goHome() {
  resetUpload();
  confirmedItems = [];
  showScreen('home');
}

function goToUpload() {
  resetUpload();
  updateUploadBadge();
  showScreen('upload');
}

function updateUploadBadge() {
  var badge = document.getElementById('upload-item-count');
  if (confirmedItems.length > 0) {
    badge.style.display = 'block';
    badge.textContent = confirmedItems.length + ' item' + (confirmedItems.length === 1 ? '' : 's') + ' added so far';
  } else {
    badge.style.display = 'none';
  }
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
  var file = e.target.files[0];
  if (!file) return;
  selectedFile = file;

  var reader = new FileReader();
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
var zone = document.getElementById('upload-zone');
zone.addEventListener('dragover', function(e) { e.preventDefault(); zone.classList.add('dragover'); });
zone.addEventListener('dragleave', function() { zone.classList.remove('dragover'); });
zone.addEventListener('drop', function(e) {
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
    var formData = new FormData();
    formData.append('file', selectedFile, selectedFile.name);

    var resp = await fetch(API_BASE + '/detect', {
      method: 'POST',
      headers: {},
      body: formData
    });

    if (!resp.ok) throw new Error('Detection failed');

    var data = await resp.json();
    handleDetectionResult(data);
  } catch (err) {
    console.error(err);
    showToast('Detection failed. Check connection.');
    setTimeout(goToUpload, 1500);
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
    setTimeout(goToUpload, 1500);
    return;
  }

  detections = detections.map(function(d) {
    return {
      name: d.equipment || d.name || d.label || d.class_name || d.class || 'Unknown',
      confidence: d.confidence || d.score || 0
    };
  });

  // Remove duplicates already in confirmed list
  var existingNames = confirmedItems.map(function(item) { return item.name.toLowerCase(); });
  var newDetections = detections.filter(function(d) {
    return existingNames.indexOf(d.name.toLowerCase()) === -1;
  });

  // Also deduplicate within this batch (keep highest confidence)
  var seen = {};
  detections = [];
  newDetections.forEach(function(d) {
    var key = d.name.toLowerCase();
    if (!seen[key] || d.confidence > seen[key].confidence) {
      seen[key] = d;
    }
  });
  for (var key in seen) {
    detections.push(seen[key]);
  }

  if (detections.length === 0) {
    showToast('All detected items already in your list.');
    setTimeout(goToUpload, 1500);
    return;
  }

  reviewIndex = 0;
  showScreen('review');
  renderReviewCard();
}

// Review

function renderReviewCard() {
  var item = detections[reviewIndex];
  var isConfident = item.confidence >= CONFIDENCE_THRESHOLD;
  var confPercent = Math.round(item.confidence * 100);

  document.getElementById('review-counter').textContent = (reviewIndex + 1) + ' / ' + detections.length;

  var body = document.getElementById('review-body');
  var actions = document.getElementById('review-actions');

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
  var section = document.getElementById('edit-section');
  var link = document.getElementById('edit-link');
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
  var input = document.getElementById('edit-input');
  var item = detections[reviewIndex];
  var finalName = input ? input.value.trim() || item.name : item.name;

  confirmedItems.push({ name: finalName, confidence: item.confidence });
  nextReviewItem();
}

function removeItem() {
  nextReviewItem();
}

function nextReviewItem() {
  reviewIndex++;
  if (reviewIndex >= detections.length) {
    showScanChoice();
  } else {
    renderReviewCard();
  }
}

// After reviewing all detections, show choice: scan more or finish

function showScanChoice() {
  showScreen('scan-choice');
  document.getElementById('choice-count').textContent = confirmedItems.length;

  var listEl = document.getElementById('choice-list');
  var html = '';
  confirmedItems.forEach(function(item, i) {
    html +=
      '<div class="choice-item fade-in-up" style="animation-delay: ' + (i * 0.04) + 's">' +
        '<div class="choice-item-num">' + (i + 1) + '</div>' +
        '<span class="choice-item-name">' + item.name + '</span>' +
        '<span class="choice-item-conf">' + Math.round(item.confidence * 100) + '%</span>' +
      '</div>';
  });
  listEl.innerHTML = html;
}

function scanMore() {
  goToUpload();
}

function finishScanning() {
  showSummary();
}

// Summary

function showSummary() {
  showScreen('summary');
  document.getElementById('summary-num').textContent = confirmedItems.length;

  var listEl = document.getElementById('summary-list');

  if (confirmedItems.length === 0) {
    document.getElementById('summary-subtitle').textContent = 'No items confirmed';
    listEl.innerHTML = '<p class="error-msg">No equipment was confirmed. Try scanning again.</p>';
    return;
  }

  document.getElementById('summary-subtitle').textContent = 'Your final equipment list';

  var html = '<h3>Equipment List</h3>';
  confirmedItems.forEach(function(item, i) {
    var pct = Math.round(item.confidence * 100);
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
  var t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(function() { t.classList.remove('show'); }, 2200);
}
