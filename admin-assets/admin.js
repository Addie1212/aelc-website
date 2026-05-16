(function () {
  const source = document.getElementById('html-source');
  const hiddenHtml = document.getElementById('html-editor');
  const visualForm = document.getElementById('visual-editor-form');
  const frame = document.getElementById('visual-page-frame');
  const mediaData = document.getElementById('media-data');

  if (!source || !hiddenHtml || !visualForm || !frame) return;

  let mediaItems = [];
  let selectedElement = null;
  let selectedMedia = null;
  let currentElementFilter = 'all';

  const selectedLabel = document.getElementById('selected-label');
  const selectionHelp = document.getElementById('selection-help');
  const selectedText = document.getElementById('selected-text');
  const selectedLink = document.getElementById('selected-link');
  const selectedAlt = document.getElementById('selected-alt');
  const selectedSource = document.getElementById('selected-source');
  const deleteButton = document.getElementById('delete-element');
  const duplicateButton = document.getElementById('duplicate-element');
  const addTextButton = document.getElementById('add-text-block');
  const replaceMediaButton = document.getElementById('replace-with-media');
  const insertMediaButton = document.getElementById('insert-media-after');
  const mediaList = document.getElementById('visual-media-list');
  const mediaFilter = document.getElementById('media-category-filter');
  const uploadBox = document.getElementById('quick-upload-form');
  const uploadButton = document.getElementById('quick-upload-button');
  const uploadStatus = document.getElementById('upload-status');
  const pageElementList = document.getElementById('page-element-list');
  const elementSearch = document.getElementById('element-search');

  const textTags = new Set(['a', 'button', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'strong', 'em', 'li', 'label', 'small']);
  const structuralTags = new Set(['div', 'section', 'article', 'header', 'footer', 'nav', 'main', 'aside', 'ul', 'ol']);
  const mediaTags = new Set(['img', 'video']);

  try {
    mediaItems = JSON.parse(mediaData ? mediaData.textContent : '[]');
  } catch {
    mediaItems = [];
  }

  function parseForEditing(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    if (!doc.querySelector('base[data-aelc-editor-base]')) {
      const base = doc.createElement('base');
      base.href = '/';
      base.setAttribute('data-aelc-editor-base', 'true');
      doc.head.prepend(base);
    }
    return `<!DOCTYPE html>\n${doc.documentElement.outerHTML}`;
  }

  function frameDoc() {
    return frame.contentDocument;
  }

  function tagName(el) {
    return el ? el.tagName.toLowerCase() : '';
  }

  function mediaCategory(item) {
    return (item.path || '').split('/')[1] || 'uploads';
  }

  function isTextElement(el) {
    return textTags.has(tagName(el));
  }

  function isSelectableElement(el) {
    const tag = tagName(el);
    return textTags.has(tag) || mediaTags.has(tag) || structuralTags.has(tag);
  }

  function textPreview(el) {
    if (!el) return '';
    if (tagName(el) === 'img' || tagName(el) === 'video') {
      return el.getAttribute('alt') || el.getAttribute('src') || 'Media';
    }
    return (el.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function elementKind(el) {
    const tag = tagName(el);
    if (mediaTags.has(tag)) return 'media';
    if (isTextElement(el)) return /\d|₹|rs\.?|fee|price/i.test(textPreview(el)) ? 'price' : 'text';
    return 'section';
  }

  function elementLabel(el) {
    const tag = tagName(el);
    const kind = elementKind(el);
    const preview = textPreview(el) || (kind === 'section' ? 'Layout block' : 'Empty element');
    return { tag, kind, preview: preview.slice(0, 95) };
  }

  function assignEditableIds() {
    const doc = frameDoc();
    if (!doc || !doc.body) return;
    let index = 1;
    doc.querySelectorAll('body *').forEach((el) => {
      if (!isSelectableElement(el)) return;
      if (!textPreview(el) && !mediaTags.has(tagName(el)) && !structuralTags.has(tagName(el))) return;
      el.dataset.aelcId = String(index++);
      el.dataset.aelcEditable = 'true';
    });
  }

  function cleanTarget(target) {
    if (!target || !target.closest) return null;
    const doc = frameDoc();
    if (!doc || target.id === 'aelc-editor-shield') return null;
    const direct = target.closest('[data-aelc-editable="true"]');
    if (direct) return direct;
    return null;
  }

  function elementAtPoint(x, y) {
    const doc = frameDoc();
    const shield = doc.getElementById('aelc-editor-shield');
    if (!shield) return null;
    shield.style.pointerEvents = 'none';
    const target = cleanTarget(doc.elementFromPoint(x, y));
    shield.style.pointerEvents = 'auto';
    return target;
  }

  function injectEditorTools() {
    const doc = frameDoc();
    if (!doc || !doc.body) return;

    doc.documentElement.classList.add('aelc-edit-mode');
    doc.getElementById('aelc-editor-style')?.remove();
    doc.getElementById('aelc-editor-shield')?.remove();

    assignEditableIds();

    const style = doc.createElement('style');
    style.id = 'aelc-editor-style';
    style.textContent = `
      html.aelc-edit-mode [data-aelc-editable="true"] { cursor: crosshair !important; }
      [data-aelc-hovered] { outline: 2px dashed #0f766e !important; outline-offset: 3px !important; }
      [data-aelc-selected] { outline: 4px solid #0f766e !important; outline-offset: 4px !important; box-shadow: 0 0 0 7px rgba(15,118,110,.20) !important; }
      #aelc-editor-shield { position: fixed; inset: 0; z-index: 2147483647; background: rgba(15,118,110,.015); cursor: crosshair; }
      #aelc-editor-shield::after { content: "Edit mode: click any text, image, price, or section"; position: fixed; left: 14px; bottom: 14px; background: #0f766e; color: #fff; border-radius: 8px; padding: 9px 12px; font: 700 13px Arial, sans-serif; box-shadow: 0 10px 28px rgba(0,0,0,.22); pointer-events: none; }
    `;
    doc.head.append(style);

    const shield = doc.createElement('div');
    shield.id = 'aelc-editor-shield';
    shield.addEventListener('mousemove', (event) => {
      const target = elementAtPoint(event.clientX, event.clientY);
      doc.querySelectorAll('[data-aelc-hovered]').forEach((el) => el.removeAttribute('data-aelc-hovered'));
      if (target && target !== selectedElement) target.setAttribute('data-aelc-hovered', 'true');
    });
    shield.addEventListener('mouseleave', () => {
      doc.querySelectorAll('[data-aelc-hovered]').forEach((el) => el.removeAttribute('data-aelc-hovered'));
    });
    shield.addEventListener('wheel', (event) => {
      event.preventDefault();
      doc.defaultView.scrollBy({ top: event.deltaY, left: event.deltaX, behavior: 'auto' });
    }, { passive: false });
    shield.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const target = elementAtPoint(event.clientX, event.clientY);
      if (target) selectElement(target, { scroll: false });
    }, true);
    doc.body.append(shield);

    renderPageElements();
    selectionHelp.textContent = 'Edit mode is active. Click the page or pick from the element list.';
  }

  function selectedMediaElement() {
    if (!selectedElement) return null;
    if (selectedElement.matches('img, video')) return selectedElement;
    return selectedElement.querySelector('img, video');
  }

  function selectElement(el, options = {}) {
    const doc = frameDoc();
    if (!doc || !el) return;

    if (selectedElement) selectedElement.removeAttribute('data-aelc-selected');

    selectedElement = el;
    selectedElement.setAttribute('data-aelc-selected', 'true');
    selectedElement.removeAttribute('data-aelc-hovered');

    if (options.scroll !== false) {
      selectedElement.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    }

    syncInspectorFromSelection();
    markActiveElementButton();
  }

  function syncInspectorFromSelection() {
    const hasSelection = Boolean(selectedElement);
    const tag = hasSelection ? tagName(selectedElement) : '';
    const link = hasSelection ? selectedElement.closest('a') : null;
    const media = selectedMediaElement();
    const label = hasSelection ? elementLabel(selectedElement) : null;

    selectedLabel.textContent = hasSelection ? `<${tag}> ${label.kind}` : 'Nothing selected';
    selectionHelp.textContent = hasSelection
      ? label.preview
      : 'Click any visible part of the page, or choose an item from the element list below.';

    deleteButton.disabled = !hasSelection || tag === 'body';
    duplicateButton.disabled = !hasSelection || tag === 'body';
    replaceMediaButton.disabled = !hasSelection || !selectedMedia;
    insertMediaButton.disabled = !hasSelection || !selectedMedia;

    selectedText.disabled = !hasSelection || !isTextElement(selectedElement);
    selectedText.value = selectedText.disabled ? '' : selectedElement.textContent.trim();

    selectedLink.disabled = !link;
    selectedLink.value = link ? link.getAttribute('href') || '' : '';

    selectedAlt.disabled = !media || tagName(media) !== 'img';
    selectedAlt.value = media && tagName(media) === 'img' ? media.getAttribute('alt') || '' : '';

    selectedSource.disabled = !media;
    selectedSource.value = media ? media.getAttribute('src') || '' : '';
  }

  function markActiveElementButton() {
    if (!pageElementList) return;
    pageElementList.querySelectorAll('.selected-element-button').forEach((button) => button.classList.remove('selected-element-button'));
    if (selectedElement && selectedElement.dataset.aelcId) {
      pageElementList.querySelector(`[data-select-element="${selectedElement.dataset.aelcId}"]`)?.classList.add('selected-element-button');
    }
  }

  function renderPageElements() {
    const doc = frameDoc();
    if (!doc || !pageElementList) return;
    const query = (elementSearch?.value || '').toLowerCase().trim();
    const elements = Array.from(doc.querySelectorAll('[data-aelc-editable="true"]')).filter((el) => {
      const kind = elementKind(el);
      if (currentElementFilter === 'text' && kind !== 'text' && kind !== 'price') return false;
      if (currentElementFilter === 'media' && kind !== 'media') return false;
      if (query && !`${tagName(el)} ${kind} ${textPreview(el)}`.toLowerCase().includes(query)) return false;
      return true;
    });

    pageElementList.innerHTML = elements.length ? elements.slice(0, 180).map((el) => {
      const label = elementLabel(el);
      return `
        <button type="button" class="element-row" data-select-element="${escapeAttr(el.dataset.aelcId)}">
          <span class="element-tag">${escapeHtml(label.tag)}</span>
          <span class="element-kind">${escapeHtml(label.kind)}</span>
          <strong>${escapeHtml(label.preview || 'Empty element')}</strong>
        </button>
      `;
    }).join('') : '<p class="muted">No matching elements found.</p>';

    pageElementList.querySelectorAll('[data-select-element]').forEach((button) => {
      button.addEventListener('click', () => {
        const el = doc.querySelector(`[data-aelc-id="${CSS.escape(button.dataset.selectElement)}"]`);
        if (el) selectElement(el);
      });
    });

    markActiveElementButton();
  }

  function createMediaElement(item) {
    const doc = frameDoc();
    const el = doc.createElement(item.type === 'image' ? 'img' : 'video');
    el.src = item.path;
    if (item.type === 'image') {
      el.alt = item.name || '';
    } else {
      el.controls = true;
    }
    el.dataset.aelcEditable = 'true';
    el.dataset.aelcId = String(Date.now());
    return el;
  }

  function replaceSelectedMedia() {
    if (!selectedMedia) return;
    const media = selectedMediaElement();
    if (!media) return;
    const currentTag = tagName(media);
    const nextTag = selectedMedia.type === 'image' ? 'img' : 'video';
    if (currentTag === nextTag) {
      media.src = selectedMedia.path;
      if (currentTag === 'img') media.alt = selectedMedia.name || '';
      syncInspectorFromSelection();
      renderPageElements();
      return;
    }
    const next = createMediaElement(selectedMedia);
    media.replaceWith(next);
    selectElement(next);
    renderPageElements();
  }

  function insertMediaAfterSelection() {
    if (!selectedMedia || !selectedElement) return;
    const next = createMediaElement(selectedMedia);
    selectedElement.after(next);
    assignEditableIds();
    selectElement(next);
    renderPageElements();
  }

  function renderMedia() {
    if (!mediaList) return;
    const category = mediaFilter ? mediaFilter.value : 'all';
    const filtered = category === 'all' ? mediaItems : mediaItems.filter((item) => mediaCategory(item) === category);

    mediaList.innerHTML = filtered.length ? filtered.map((item) => `
      <button type="button" class="media-chip" data-media-path="${escapeAttr(item.path)}">
        ${item.type === 'image'
          ? `<img src="/${escapeAttr(item.path)}" alt="">`
          : '<span class="video-chip">Video</span>'}
        <span>${escapeHtml(item.name)}</span>
        <small>${escapeHtml(mediaCategory(item))}</small>
      </button>
    `).join('') : '<p class="muted">No files in this folder yet.</p>';

    mediaList.querySelectorAll('[data-media-path]').forEach((button) => {
      button.addEventListener('click', () => {
        selectedMedia = mediaItems.find((item) => item.path === button.dataset.mediaPath) || null;
        mediaList.querySelectorAll('.selected-media').forEach((el) => el.classList.remove('selected-media'));
        button.classList.add('selected-media');
        replaceMediaButton.disabled = !selectedElement;
        insertMediaButton.disabled = !selectedElement;
      });
    });
  }

  function rebuildCategoryFilter(categories) {
    if (!mediaFilter) return;
    const current = mediaFilter.value;
    mediaFilter.innerHTML = '<option value="all">All folders</option>' + categories
      .map((category) => `<option value="${escapeAttr(category)}">${escapeHtml(category)}</option>`)
      .join('');
    mediaFilter.value = categories.includes(current) ? current : 'all';
  }

  function escapeHtml(value) {
    return String(value || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function escapeAttr(value) {
    return escapeHtml(value).replaceAll('`', '&#096;');
  }

  function serializeCleanHtml() {
    const doc = frameDoc();
    const clone = doc.documentElement.cloneNode(true);
    clone.classList.remove('aelc-edit-mode');
    clone.querySelectorAll('[data-aelc-selected], [data-aelc-hovered], [data-aelc-editable], [data-aelc-id]').forEach((el) => {
      el.removeAttribute('data-aelc-selected');
      el.removeAttribute('data-aelc-hovered');
      el.removeAttribute('data-aelc-editable');
      el.removeAttribute('data-aelc-id');
    });
    clone.querySelectorAll('#aelc-editor-style, #aelc-editor-shield, base[data-aelc-editor-base]').forEach((el) => el.remove());
    return `<!DOCTYPE html>\n${clone.outerHTML}`;
  }

  selectedText.addEventListener('input', () => {
    if (!selectedElement || selectedText.disabled) return;
    selectedElement.textContent = selectedText.value;
    renderPageElements();
    syncInspectorFromSelection();
  });

  selectedLink.addEventListener('input', () => {
    const link = selectedElement ? selectedElement.closest('a') : null;
    if (link) link.href = selectedLink.value;
  });

  selectedAlt.addEventListener('input', () => {
    const media = selectedMediaElement();
    if (media && tagName(media) === 'img') media.alt = selectedAlt.value;
  });

  selectedSource.addEventListener('input', () => {
    const media = selectedMediaElement();
    if (media) media.src = selectedSource.value;
  });

  deleteButton.addEventListener('click', () => {
    if (!selectedElement || tagName(selectedElement) === 'body') return;
    const parent = selectedElement.parentElement;
    selectedElement.remove();
    selectedElement = null;
    assignEditableIds();
    renderPageElements();
    if (parent && parent.dataset.aelcEditable) selectElement(parent);
    syncInspectorFromSelection();
  });

  duplicateButton.addEventListener('click', () => {
    if (!selectedElement || tagName(selectedElement) === 'body') return;
    const clone = selectedElement.cloneNode(true);
    clone.removeAttribute('data-aelc-selected');
    selectedElement.after(clone);
    assignEditableIds();
    selectElement(clone);
    renderPageElements();
  });

  addTextButton.addEventListener('click', () => {
    const doc = frameDoc();
    const p = doc.createElement('p');
    p.textContent = 'New editable text';
    p.dataset.aelcEditable = 'true';
    const target = selectedElement && tagName(selectedElement) !== 'body' ? selectedElement : doc.body;
    target.after ? target.after(p) : doc.body.append(p);
    assignEditableIds();
    selectElement(p);
    renderPageElements();
  });

  replaceMediaButton.addEventListener('click', replaceSelectedMedia);
  insertMediaButton.addEventListener('click', insertMediaAfterSelection);
  if (mediaFilter) mediaFilter.addEventListener('change', renderMedia);
  if (elementSearch) elementSearch.addEventListener('input', renderPageElements);
  document.querySelectorAll('[data-element-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      currentElementFilter = button.dataset.elementFilter;
      document.querySelectorAll('[data-element-filter]').forEach((item) => item.classList.remove('active-filter'));
      button.classList.add('active-filter');
      renderPageElements();
    });
  });

  uploadButton.addEventListener('click', async () => {
    const input = uploadBox.querySelector('input[type="file"]');
    const category = uploadBox.querySelector('input[name="category"]');
    if (!input.files.length) {
      uploadStatus.textContent = 'Choose at least one image or video first.';
      return;
    }

    const formData = new FormData();
    formData.append('category', category.value || 'uploads');
    Array.from(input.files).forEach((file) => formData.append('media', file));
    uploadStatus.textContent = 'Uploading...';

    try {
      const response = await fetch('/admin/media/upload', {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body: formData
      });
      if (!response.ok) throw new Error('Upload failed.');
      const result = await response.json();
      mediaItems = result.media || mediaItems;
      rebuildCategoryFilter(result.categories || []);
      renderMedia();
      input.value = '';
      uploadStatus.textContent = `${result.uploaded.length} file${result.uploaded.length === 1 ? '' : 's'} uploaded.`;
    } catch (error) {
      uploadStatus.textContent = error.message || 'Upload failed.';
    }
  });

  visualForm.addEventListener('submit', () => {
    hiddenHtml.value = serializeCleanHtml();
  });

  frame.addEventListener('load', injectEditorTools);
  frame.srcdoc = parseForEditing(source.value);
  renderMedia();
})();
