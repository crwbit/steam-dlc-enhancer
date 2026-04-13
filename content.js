// ============================================================
//  Steam DLC Enhancer — content.js
// ============================================================

'use strict';

// ── Helpers ─────────────────────────────────────────────────
function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

function parsePriceText(text) {
  if (!text) return { price: 0, originalPrice: 0, discountPct: 0 };
  const lower = text.toLowerCase();
  if (lower.includes('free') || lower.includes('gratis')) {
    return { price: 0, originalPrice: 0, discountPct: 0 };
  }
  // Grab all numeric blocks
  const nums = [...text.matchAll(/[\d.,]+/g)].map(m => {
    let s = m[0];
    const lastComma = s.lastIndexOf(',');
    const lastDot   = s.lastIndexOf('.');
    if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
    return parseFloat(s) || 0;
  });
  const discountMatch = text.match(/-(\d+)%/);
  const discountPct   = discountMatch ? parseInt(discountMatch[1]) : 0;
  const price         = nums.length ? nums[nums.length - 1] : 0;
  // If discounted, try to back-calculate original
  const originalPrice = discountPct > 0 ? Math.round(price / (1 - discountPct / 100) * 100) / 100 : price;
  return { price, originalPrice, discountPct };
}

function detectCurrency(rowElements) {
  for (const row of rowElements) {
    const el = row.querySelector('.game_area_dlc_price');
    if (!el) continue;
    const m = el.textContent.match(/[^\d\s,.]+/);
    if (m) return m[0];
  }
  return '$';
}

// ── Main ─────────────────────────────────────────────────────
function enhanceDLCList() {
  const container = document.querySelector('.game_area_dlc_list');
  const rowElements = Array.from(document.querySelectorAll('.game_area_dlc_row'));
  if (!container || !rowElements.length) return;

  // Prevent double-init
  if (container.dataset.dlcEnhanced) return;
  container.dataset.dlcEnhanced = '1';

  // ── Parse all DLC data once (O(n)) ──────────────────────
  const currency = detectCurrency(rowElements);

  const dlcData = rowElements.map((row, index) => {
    const isOwned     = row.classList.contains('ds_owned');
    const nameEl      = row.querySelector('.game_area_dlc_name');
    const name        = nameEl ? nameEl.textContent.trim() : '';
    const nameLower   = name.toLowerCase();
    const priceEl     = row.querySelector('.game_area_dlc_price');
    const rawText     = priceEl ? priceEl.textContent.trim() : '';
    const { price, originalPrice, discountPct } = parsePriceText(rawText);
    const isDiscounted = discountPct > 0;
    const isFree      = price === 0 && !rawText.toLowerCase().includes('owned');

    return { element: row, index, name, nameLower, isOwned, price, originalPrice, discountPct, isDiscounted, isFree };
  });

  // ── Stats (computed once) ────────────────────────────────
  const totalCount   = dlcData.length;
  const ownedCount   = dlcData.filter(d => d.isOwned).length;
  const percentage   = Math.round((ownedCount / totalCount) * 100) || 0;
  const unownedCost  = dlcData.filter(d => !d.isOwned && !d.isFree).reduce((s, d) => s + d.price, 0);
  const totalSavings = dlcData.filter(d => d.isDiscounted).reduce((s, d) => s + (d.originalPrice - d.price), 0);

  // ── State ────────────────────────────────────────────────
  const state = { search: '', filter: 'all', sort: 'default' };

  // ── Build Dashboard DOM ──────────────────────────────────
  const dashboard = document.createElement('div');
  dashboard.id = 'dlc_dashboard';

  // Stats bar
  const statsRow = document.createElement('div');
  statsRow.className = 'dlc_stats_row';

  const collectionStat = document.createElement('span');
  collectionStat.className = 'dlc_stat text-blue';

  const costStat = document.createElement('span');
  costStat.className = 'dlc_stat text-orange';

  const savingsStat = document.createElement('span');
  savingsStat.className = 'dlc_stat text-green';

  statsRow.appendChild(collectionStat);
  statsRow.appendChild(costStat);
  if (totalSavings > 0) statsRow.appendChild(savingsStat);

  // Progress bar
  const progressContainer = document.createElement('div');
  progressContainer.id = 'dlc_enhancer_progress';
  progressContainer.setAttribute('role', 'progressbar');
  progressContainer.setAttribute('aria-valuenow', percentage);
  progressContainer.setAttribute('aria-valuemin', '0');
  progressContainer.setAttribute('aria-valuemax', '100');
  const progressBar = document.createElement('div');
  progressBar.id = 'dlc_enhancer_bar';
  progressContainer.appendChild(progressBar);

  // Controls — single row
  const controlsRow = document.createElement('div');
  controlsRow.className = 'dlc_controls_row';

  // Search
  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.className = 'dlc_input dlc_search';
  searchInput.setAttribute('aria-label', 'Search DLCs');
  searchInput.spellcheck = false;

  // Filter
  const filterSelect = document.createElement('select');
  filterSelect.className = 'dlc_select';
  filterSelect.setAttribute('aria-label', 'Filter DLCs');

  // Sort
  const sortSelect = document.createElement('select');
  sortSelect.className = 'dlc_select';
  sortSelect.setAttribute('aria-label', 'Sort DLCs');

  controlsRow.appendChild(searchInput);
  controlsRow.appendChild(filterSelect);
  controlsRow.appendChild(sortSelect);

  // No-results placeholder
  const noResults = document.createElement('div');
  noResults.className = 'dlc_no_results';
  noResults.style.display = 'none';

  dashboard.appendChild(statsRow);
  dashboard.appendChild(progressContainer);
  dashboard.appendChild(controlsRow);
  container.prepend(dashboard);
  container.appendChild(noResults);

  // ── i18n update ──────────────────────────────────────────
  function applyI18n() {
    searchInput.placeholder = chrome.i18n.getMessage('searchPlaceholder');
    noResults.textContent   = chrome.i18n.getMessage('noResults');

    collectionStat.textContent = `${chrome.i18n.getMessage('collection')}: ${ownedCount} / ${totalCount} (${percentage}%)`;
    costStat.textContent       = `${chrome.i18n.getMessage('costToComplete')}: ${currency}${unownedCost.toFixed(2)}`;
    if (totalSavings > 0) savingsStat.textContent = `${chrome.i18n.getMessage('totalSavings')}: ${currency}${totalSavings.toFixed(2)}`;

    // Rebuild select options preserving current value
    const filterVal = filterSelect.value;
    const sortVal   = sortSelect.value;

    filterSelect.innerHTML = '';
    const filters = [
      ['all',                 chrome.i18n.getMessage('filterAll')],
      ['owned',               chrome.i18n.getMessage('filterOwned')],
      ['unowned',             chrome.i18n.getMessage('filterUnowned')],
      ['discounted',          chrome.i18n.getMessage('filterDiscounted')],
      ['free',                chrome.i18n.getMessage('filterFree')],
      ['notfree',             chrome.i18n.getMessage('filterNotFree')],
      ['unowned_discounted',  chrome.i18n.getMessage('filterUnownedDiscounted')],
    ];
    filters.forEach(([val, label]) => {
      const o = document.createElement('option');
      o.value = val; o.textContent = label;
      filterSelect.appendChild(o);
    });
    filterSelect.value = filterVal || 'all';

    sortSelect.innerHTML = '';
    const sorts = [
      ['default',     chrome.i18n.getMessage('sortDefault')],
      ['price_asc',   chrome.i18n.getMessage('sortPriceAsc')],
      ['price_desc',  chrome.i18n.getMessage('sortPriceDesc')],
      ['name_asc',    chrome.i18n.getMessage('sortNameAsc')],
      ['name_desc',   chrome.i18n.getMessage('sortNameDesc')],
      ['discount_desc', chrome.i18n.getMessage('sortDiscountDesc')],
    ];
    sorts.forEach(([val, label]) => {
      const o = document.createElement('option');
      o.value = val; o.textContent = label;
      sortSelect.appendChild(o);
    });
    sortSelect.value = sortVal || 'default';
  }

  // ── Render ───────────────────────────────────────────────
  // Use a DocumentFragment for batch DOM insertion (perf)
  function render() {
    // Detach rows — single reflow
    const frag = document.createDocumentFragment();
    dlcData.forEach(item => frag.appendChild(item.element)); // pull out of DOM cheaply

    let filtered = dlcData;

    // Search filter
    if (state.search) {
      const q = state.search;
      filtered = filtered.filter(d => d.nameLower.includes(q));
    }

    // Category filter
    switch (state.filter) {
      case 'owned':               filtered = filtered.filter(d => d.isOwned);                      break;
      case 'unowned':             filtered = filtered.filter(d => !d.isOwned);                     break;
      case 'discounted':          filtered = filtered.filter(d => d.isDiscounted);                 break;
      case 'free':                filtered = filtered.filter(d => d.isFree);                       break;
      case 'notfree':             filtered = filtered.filter(d => !d.isFree);                      break;
      case 'unowned_discounted':  filtered = filtered.filter(d => !d.isOwned && d.isDiscounted);  break;
    }

    // Sort
    const sorted = [...filtered];
    switch (state.sort) {
      case 'price_asc':    sorted.sort((a, b) => a.price - b.price);                           break;
      case 'price_desc':   sorted.sort((a, b) => b.price - a.price);                           break;
      case 'name_asc':     sorted.sort((a, b) => a.name.localeCompare(b.name));                break;
      case 'name_desc':    sorted.sort((a, b) => b.name.localeCompare(a.name));                break;
      case 'discount_desc':sorted.sort((a, b) => b.discountPct - a.discountPct);              break;
      default:             sorted.sort((a, b) => a.index - b.index);
    }

    // Re-insert visible items
    const outFrag = document.createDocumentFragment();
    sorted.forEach(item => { item.element.style.display = ''; outFrag.appendChild(item.element); });

    // Hide items not in result
    const visibleSet = new Set(sorted);
    dlcData.forEach(item => { if (!visibleSet.has(item)) { item.element.style.display = 'none'; outFrag.appendChild(item.element); } });

    container.appendChild(outFrag);

    noResults.style.display = sorted.length === 0 ? 'block' : 'none';
  }

  // ── Events ───────────────────────────────────────────────
  const debouncedSearch = debounce((val) => {
    state.search = val.toLowerCase();
    render();
  }, 150);

  searchInput.addEventListener('input', e => debouncedSearch(e.target.value));

  filterSelect.addEventListener('change', e => { state.filter = e.target.value; render(); });
  sortSelect.addEventListener('change',   e => { state.sort   = e.target.value; render(); });

  // Keyboard shortcut: Ctrl+Shift+F focuses search
  document.addEventListener('keydown', e => {
    if (e.ctrlKey && e.shiftKey && e.key === 'F') {
      e.preventDefault();
      searchInput.focus();
    }
  });

  // ── Initial render ───────────────────────────────────────
  applyI18n();
  // Animate progress bar after brief paint delay
  requestAnimationFrame(() => {
    requestAnimationFrame(() => { progressBar.style.width = `${percentage}%`; });
  });
  render();
}

// Run after page load; also handle Steam's dynamic page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', enhanceDLCList);
} else {
  enhanceDLCList();
}
// Fallback for ajax-heavy Steam pages
window.addEventListener('load', enhanceDLCList);