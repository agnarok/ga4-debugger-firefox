const eventList = document.getElementById('event-list');
const emptyState = document.getElementById('empty-state');
const eventCountEl = document.getElementById('event-count');
const statusEl = document.getElementById('status');
const btnClear = document.getElementById('btn-clear');
const toggleExpand = document.getElementById('toggle-expand');
const nameFilter = document.getElementById('name-filter');
const toggleDebugMode = document.getElementById('toggle-debug-mode');
const toggleTestMode = document.getElementById('toggle-test-mode');
const typeFilterEl = document.getElementById('type-filters');

const myTabId = browser.devtools.inspectedWindow.tabId;

let totalRequests = 0;
let ga4Matched = 0;
const diagUrls = [];
const entries = [];                 // { hit, type, card }
let expandAll = false;
const activeTypes = new Set(['custom', 'pageview', 'automatic', 'ecommerce', 'recommended']);

// ── Event-type classification ────────────────────────────────────────────────

const ECOMMERCE = new Set([
  'view_item', 'view_item_list', 'select_item', 'add_to_cart', 'remove_from_cart',
  'view_cart', 'begin_checkout', 'add_payment_info', 'add_shipping_info', 'purchase',
  'refund', 'select_promotion', 'view_promotion', 'add_to_wishlist', 'generate_lead',
]);
const RECOMMENDED = new Set([
  'login', 'sign_up', 'search', 'share', 'select_content', 'join_group', 'spend_virtual_currency',
  'earn_virtual_currency', 'level_up', 'post_score', 'tutorial_begin', 'tutorial_complete',
  'unlock_achievement', 'level_start', 'level_end', 'ad_impression',
]);
const AUTOMATIC = new Set([
  'first_visit', 'session_start', 'user_engagement', 'scroll', 'click',
  'view_search_results', 'file_download', 'form_start', 'form_submit',
  'video_start', 'video_progress', 'video_complete', 'page_view',
]);

function classify(en) {
  if (en === 'page_view') return 'pageview';
  if (ECOMMERCE.has(en)) return 'ecommerce';
  if (RECOMMENDED.has(en)) return 'recommended';
  if (AUTOMATIC.has(en)) return 'automatic';
  return 'custom';
}

// ── GA4 detection by request signature ───────────────────────────────────────

function isGa4(url, body) {
  const u = url.toLowerCase();
  const b = (body || '').toLowerCase();
  if (/\/g\/collect|\/mp\/collect/.test(u)) return true;
  const hasV2 = /[?&]v=2(&|$)/.test(u) || /(^|&)v=2(&|$)/.test(b);
  const hasGa4Tid = /[?&]tid=g-/.test(u) || /(^|&)tid=g-/.test(b);
  return hasV2 || hasGa4Tid;
}

// ── Payload parsing ─────────────────────────────────────────────────────────

function buildHit(params) {
  const eventParams = {};
  const userProps = {};
  for (const [k, v] of Object.entries(params)) {
    if (k.startsWith('ep.')) eventParams[k.slice(3)] = v;
    else if (k.startsWith('epn.')) eventParams[k.slice(4)] = Number(v);
    else if (k.startsWith('up.')) userProps[k.slice(3)] = v;
  }
  return {
    eventName: params['en'] || 'page_view',
    eventParams,
    userProps,
    params,
    timestamp: new Date().toISOString(),
  };
}

function parsePayload(url, body) {
  const urlObj = new URL(url);
  const common = {};
  for (const [k, v] of urlObj.searchParams) common[k] = v;

  const lines = (body || '').split('\n').filter(Boolean);
  if (lines.length === 0) return [buildHit(common)];

  for (const [k, v] of new URLSearchParams(lines[0])) common[k] = v;
  if (lines.length === 1) return [buildHit(common)];

  return lines.slice(1).map(line => {
    const overrides = {};
    for (const [k, v] of new URLSearchParams(line)) overrides[k] = v;
    return buildHit({ ...common, ...overrides });
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(iso) {
  const d = new Date(iso);
  const hms = d.toLocaleTimeString('en-US', {
    hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  return `${hms}.${String(d.getMilliseconds()).padStart(3, '0')}`;
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

const BOOLISH = new Set(['dma', 'npa', 'seg', '_dbg']);
function fmtVal(key, val) {
  const s = String(val ?? '');
  if (s === '') return '—';
  if (BOOLISH.has(key)) {
    if (s === '0') return 'false';
    if (s === '1') return 'true';
  }
  if (key === 'dl' || key === 'dr' || key === 'dt') {
    try { return decodeURIComponent(s); } catch { return s; }
  }
  return s;
}

// ── Column field definitions (key, label) ─────────────────────────────────────

const USER_FIELDS = [
  ['cid', 'Client ID'], ['uid', 'User Id'], ['gcd', 'Google Consent Default'],
  ['gcs', 'Consent State'], ['dma', 'DMA'], ['pscdl', 'pscdl'], ['npa', 'Non-Personalized Ads'],
];
const SESSION_FIELDS = [
  ['_s', 'Hit Counter'], ['sct', 'Session Count'], ['seg', 'Session Engagement'], ['sid', 'Session ID'],
];
const SETTINGS_FIELDS = [
  ['_eu', 'Event Usage'], ['gtm', 'GTM Hash'], ['tid', 'Measurement ID'],
  ['v', 'Protocol Version'], ['_p', 'Random Page Hash'], ['ul', 'User Language'], ['_dbg', 'Debug Mode'],
];
const PLATFORM_FIELDS = [
  ['uaa', 'Architecture'], ['uab', 'Bitness'], ['uamb', 'Mobile'], ['uam', 'Model'],
  ['uap', 'Platform'], ['uapv', 'Platform Version'], ['uaw', 'Wow64'],
  ['sr', 'Screen Resolution'], ['vp', 'Viewport Size'],
];

function makeColumn(title, fields, params) {
  const present = fields.filter(([k]) => params[k] !== undefined && params[k] !== '');
  const col = el('div', 'col');
  col.appendChild(el('div', 'col-title', title));
  if (!present.length) {
    col.appendChild(el('div', 'field-val muted', 'no data'));
    return col;
  }
  present.forEach(([k, label]) => {
    const f = el('div', 'field');
    f.appendChild(el('span', 'field-key', label));
    f.appendChild(el('span', 'field-val', fmtVal(k, params[k])));
    col.appendChild(f);
  });
  return col;
}

// ── Card rendering ────────────────────────────────────────────────────────────

function renderCard(hit, type, index) {
  const card = el('div', `event-card t-${type}`);

  // Header
  const header = el('div', 'card-header');
  header.appendChild(el('span', 'expand-arrow', '▶'));
  header.appendChild(el('span', 'type-badge', type));
  header.appendChild(el('span', 'card-event-name', hit.eventName));
  if (hit.params.tid) header.appendChild(el('span', 'card-mid', hit.params.tid));
  if (hit.params._dbg === '1') header.appendChild(el('span', 'card-debug-badge', 'DEBUG'));

  const spacer = el('span', 'card-spacer');
  header.appendChild(spacer);

  const copyBtn = el('button', 'card-copy', 'Copy JSON');
  copyBtn.addEventListener('click', e => {
    e.stopPropagation();
    navigator.clipboard.writeText(JSON.stringify(hit.params, null, 2));
    copyBtn.textContent = 'Copied!';
    setTimeout(() => { copyBtn.textContent = 'Copy JSON'; }, 1200);
  });
  header.appendChild(copyBtn);
  header.appendChild(el('span', 'card-time', formatTime(hit.timestamp)));

  header.addEventListener('click', () => card.classList.toggle('expanded'));

  // Body — multi-column grid
  const body = el('div', 'card-body');

  // Event column
  const eventCol = el('div', 'col');
  eventCol.appendChild(el('div', 'col-title', 'Event'));
  const nameField = el('div', 'field');
  nameField.appendChild(el('span', 'field-key', 'Name'));
  nameField.appendChild(el('span', 'field-val', hit.eventName));
  eventCol.appendChild(nameField);

  // Parameters table
  const paramLabel = el('div', 'field-key', 'Parameters');
  paramLabel.style.marginTop = '6px';
  paramLabel.style.display = 'block';
  eventCol.appendChild(paramLabel);

  const epEntries = Object.entries(hit.eventParams);
  const upEntries = Object.entries(hit.userProps);

  if (epEntries.length) {
    const table = el('div', 'param-table');
    epEntries.forEach(([k, v]) => {
      const row = el('div', 'prow');
      row.appendChild(el('div', 'pk', k));
      row.appendChild(el('div', 'pv', String(v) || '—'));
      table.appendChild(row);
    });
    eventCol.appendChild(table);
  } else {
    eventCol.appendChild(el('div', 'params-empty', 'no event parameters'));
  }

  if (hit.params.dl) {
    const f = el('div', 'field');
    f.style.marginTop = '6px';
    f.appendChild(el('span', 'field-key', 'Document Location'));
    f.appendChild(el('span', 'field-val', fmtVal('dl', hit.params.dl)));
    eventCol.appendChild(f);
  }
  if (hit.params.dr) {
    const f = el('div', 'field');
    f.appendChild(el('span', 'field-key', 'Document Referrer'));
    f.appendChild(el('span', 'field-val', fmtVal('dr', hit.params.dr)));
    eventCol.appendChild(f);
  }

  body.appendChild(eventCol);

  // User column (+ user properties)
  const userCol = makeColumn('User', USER_FIELDS, hit.params);
  if (upEntries.length) {
    const up = el('div', 'field-key', 'User Properties');
    up.style.marginTop = '6px';
    up.style.display = 'block';
    userCol.appendChild(up);
    const t = el('div', 'param-table');
    upEntries.forEach(([k, v]) => {
      const row = el('div', 'prow');
      row.appendChild(el('div', 'pk', k));
      row.appendChild(el('div', 'pv', String(v) || '—'));
      t.appendChild(row);
    });
    userCol.appendChild(t);
  }
  body.appendChild(userCol);

  body.appendChild(makeColumn('Session', SESSION_FIELDS, hit.params));
  body.appendChild(makeColumn('Settings', SETTINGS_FIELDS, hit.params));
  body.appendChild(makeColumn('Platform', PLATFORM_FIELDS, hit.params));

  card.appendChild(header);
  card.appendChild(body);
  if (expandAll) card.classList.add('expanded');
  return card;
}

// ── List management + filtering ───────────────────────────────────────────────

function cardVisible(entry) {
  if (!activeTypes.has(entry.type)) return false;
  const q = nameFilter.value.trim().toLowerCase();
  if (q && !entry.hit.eventName.toLowerCase().includes(q)) return false;
  return true;
}

function applyFilters() {
  let visible = 0;
  entries.forEach(entry => {
    const show = cardVisible(entry);
    entry.card.style.display = show ? '' : 'none';
    if (show) visible++;
  });
  eventCountEl.textContent = `${visible} / ${entries.length} event${entries.length !== 1 ? 's' : ''}`;
  emptyState.classList.toggle('hidden', entries.length > 0);
}

function addHit(hit) {
  const type = classify(hit.eventName);
  const card = renderCard(hit, type, entries.length);
  const entry = { hit, type, card };
  entries.push(entry);
  eventList.appendChild(card);
  if (cardVisible(entry)) card.scrollIntoView({ block: 'end' });
  else card.style.display = 'none';
  applyFilters();
}

function clearAll() {
  entries.length = 0;
  eventList.innerHTML = '';
  applyFilters();
}

function updateStatus() {
  statusEl.textContent = `listening · ${totalRequests} collect · ${ga4Matched} GA4`;
}

// ── Receive captured requests from the background script ──────────────────────

const bgPort = browser.runtime.connect({ name: 'ga4-panel' });
bgPort.postMessage({ type: 'ready', tabId: myTabId });

bgPort.onMessage.addListener(msg => {
  if (msg.type !== 'request') return;
  totalRequests++;
  if (isGa4(msg.url, msg.body)) {
    ga4Matched++;
    parsePayload(msg.url, msg.body).forEach(addHit);
  } else {
    diagUrls.push(msg.url);
  }
  updateStatus();
});

// ── Diagnostic dump ────────────────────────────────────────────────────────────

statusEl.addEventListener('click', () => {
  const unique = [...new Set(diagUrls)];
  console.log('[GA4 Debugger] non-GA4 collect URLs seen:', unique);
  emptyState.classList.add('hidden');
  const box = el('div', 'diag-box');
  box.appendChild(el('div', 'diag-title', `Diagnostic — ${unique.length} non-GA4 collect URL(s)`));
  if (!unique.length) {
    box.appendChild(el('div', 'diag-url', 'None. If GA4 count is also 0, reload the page with this panel open.'));
  } else {
    unique.forEach(u => box.appendChild(el('div', 'diag-url', u)));
  }
  eventList.appendChild(box);
  box.scrollIntoView({ block: 'end' });
});

// ── Controls ──────────────────────────────────────────────────────────────────

btnClear.addEventListener('click', clearAll);

toggleExpand.addEventListener('change', () => {
  expandAll = toggleExpand.checked;
  entries.forEach(e => e.card.classList.toggle('expanded', expandAll));
});

nameFilter.addEventListener('input', applyFilters);

typeFilterEl.addEventListener('change', e => {
  const label = e.target.closest('.type-chk');
  if (!label) return;
  const type = label.dataset.type;
  if (e.target.checked) activeTypes.add(type);
  else activeTypes.delete(type);
  applyFilters();
});

toggleDebugMode.addEventListener('change', () => {
  const enabled = toggleDebugMode.checked;
  toggleDebugMode.parentElement.classList.toggle('active', enabled);
  const code = `(function(){
    window.dataLayer = window.dataLayer || [];
    function gtag(){ dataLayer.push(arguments); }
    gtag('set', { 'debug_mode': ${enabled} });
  })();`;
  browser.devtools.inspectedWindow.eval(code);
});

toggleTestMode.addEventListener('change', () => {
  const enabled = toggleTestMode.checked;
  toggleTestMode.parentElement.classList.toggle('active', enabled);
  bgPort.postMessage({ type: 'setTestMode', enabled, tabId: myTabId });
});

updateStatus();
