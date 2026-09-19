(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const scrapeBtn = $('scrapeBtn');
  const resultsTableBody = document.querySelector('#resultsTable tbody');
  const statusBar = $('statusBar');
  const statusText = $('statusText');
  const resultCount = $('resultCount');
  const getMoreBtn = $('getMoreBtn');
  const downloadBtn = $('downloadBtn');
  const trackingPanel = $('trackingPanel');
  const trackingPhase = $('trackingPhase');
  const trackingBar = $('trackingBar');
  const trackingLog = $('trackingLog');
  const resultsContainer = $('resultsContainer');

  const categories = [
    'Gym', 'Fitness Center', 'Hotel', 'Restaurant', 'Cafe', 'Dentist',
    'Real Estate', 'Realtor', 'Lawyer', 'Plumber', 'Electrician', 'Salon',
    'Barber', 'Pharmacy', 'Hospital', 'School', 'Auto repair', 'HVAC', 'Roofing',
  ];

  let countries = [], states = [], cities = [], areas = [];
  let selectedCategory = '', selectedCountry = '', selectedCountryCode = '';
  let selectedCountryPhoneCode = '';
  let selectedState = '', selectedStateCode = '', selectedCity = '', selectedArea = '';
  let activeStream = null, processedIds = new Set(), lastPayload = null, currentLeads = [];

  const fields = {
    category: { toggle: $('categoryToggle'), panel: $('categoryPanel'), search: $('categorySearch'), list: $('categoryList'), field: document.querySelector('[data-field="category"]') },
    country: { toggle: $('countryToggle'), panel: $('countryPanel'), search: $('countrySearch'), list: $('countryList'), field: document.querySelector('[data-field="country"]') },
    state: { toggle: $('stateToggle'), panel: $('statePanel'), search: $('stateSearch'), list: $('stateList'), field: document.querySelector('[data-field="state"]') },
    city: { toggle: $('cityToggle'), panel: $('cityPanel'), search: $('citySearch'), list: $('cityList'), field: document.querySelector('[data-field="city"]') },
    area: { toggle: $('areaToggle'), panel: $('areaPanel'), search: $('areaSearch'), list: $('areaList'), field: document.querySelector('[data-field="area"]') },
  };

  function setToggleLabel(toggle, text) {
    const span = toggle.querySelector('.label-text');
    if (span) span.textContent = text;
    else toggle.childNodes[0].textContent = text;
  }

  function closeAllPanels(except) {
    Object.entries(fields).forEach(([key, f]) => {
      if (!f || !f.panel) return;
      if (except && key === except) return;
      f.panel.classList.add('hidden');
      if (f.field) f.field.classList.remove('is-open');
    });
  }

  function openPanel(key) {
    const f = fields[key];
    if (!f || f.toggle.disabled) return;
    const wasOpen = !f.panel.classList.contains('hidden');
    closeAllPanels();
    if (wasOpen) return;
    f.panel.classList.remove('hidden');
    if (f.field) f.field.classList.add('is-open');
    f.search.value = '';
    setTimeout(() => f.search.focus(), 10);
  }

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.dropdown') && !e.target.closest('.field')) closeAllPanels();
  });

  function buildList(listEl, options, onSelect, allowCustom, searchValue) {
    listEl.innerHTML = '';
    const q = (searchValue || '').trim().toLowerCase();
    const filtered = options.filter((o) => o.label.toLowerCase().includes(q));
    if (allowCustom && q && !options.some((o) => o.label.toLowerCase() === q)) {
      const el = document.createElement('div');
      el.className = 'dropdown-item';
      el.textContent = 'Use "' + searchValue.trim() + '"';
      el.onclick = () => onSelect({ label: searchValue.trim(), value: searchValue.trim(), custom: true });
      listEl.appendChild(el);
    }
    if (!filtered.length && !(allowCustom && q)) {
      const empty = document.createElement('div');
      empty.className = 'dropdown-item is-empty';
      empty.textContent = 'No matches';
      listEl.appendChild(empty);
      return;
    }
    filtered.forEach((opt) => {
      const item = document.createElement('div');
      item.className = 'dropdown-item';
      item.textContent = opt.label;
      item.onclick = () => onSelect(opt);
      listEl.appendChild(item);
    });
  }

  function wireDropdown(key, getOptions, onSelect, allowCustom) {
    const f = fields[key];
    if (!f) return;
    f.toggle.onclick = (e) => {
      e.stopPropagation();
      if (f.toggle.disabled) return;
      openPanel(key);
      if (!f.panel.classList.contains('hidden')) buildList(f.list, getOptions(), onSelect, allowCustom, '');
    };
    f.search.oninput = () => buildList(f.list, getOptions(), onSelect, allowCustom, f.search.value);
    f.search.onkeydown = (e) => {
      if (e.key === 'Enter' && allowCustom && f.search.value.trim()) {
        e.preventDefault();
        onSelect({ label: f.search.value.trim(), value: f.search.value.trim(), custom: true });
      }
    };
  }

  function setDisabled(toggle, disabled) {
    toggle.disabled = disabled;
    toggle.classList.toggle('is-disabled', disabled);
  }

  function getSelectedSources() {
    return Array.from(document.querySelectorAll('input[name="source"]:checked')).map((el) => el.value);
  }

  function appendLog(m) {
    const row = document.createElement('div');
    row.className = 'tracking-row';
    row.textContent = m;
    trackingLog.appendChild(row);
    trackingLog.scrollTop = trackingLog.scrollHeight;
  }

  function updateProgress(pct, msg) {
    trackingBar.style.width = Math.min(100, pct || 0) + '%';
    if (msg) trackingPhase.textContent = msg;
  }

  function resetTracking() {
    trackingPanel.classList.remove('hidden');
    trackingPhase.textContent = 'Starting…';
    trackingBar.style.width = '0%';
    trackingLog.innerHTML = '';
  }

  wireDropdown('category', () => categories.map((c) => ({ label: c, value: c })), (opt) => {
    selectedCategory = opt.value;
    setToggleLabel(fields.category.toggle, opt.label);
    closeAllPanels();
  }, true);

  async function loadCountries() {
    const res = await fetch('/api/countries');
    const list = await res.json();
    countries = list.map((c) => ({ label: c.name, value: c.name, code: c.isoCode, phonecode: c.phonecode || '' }));
    wireDropdown('country', () => countries, (opt) => {
      selectedCountry = opt.value;
      selectedCountryCode = opt.code || '';
      selectedCountryPhoneCode = opt.phonecode ? String(opt.phonecode) : '';
      setToggleLabel(fields.country.toggle, opt.label);
      closeAllPanels();
      resetAfterCountry();
      if (selectedCountryCode) loadStates(selectedCountryCode);
    }, false);
  }

  async function loadStates(code) {
    const res = await fetch('/api/countries/' + code + '/states');
    const list = await res.json();
    states = list.map((s) => ({ label: s.name, value: s.name, code: s.isoCode }));
    wireDropdown('state', () => states, (opt) => {
      selectedState = opt.value;
      selectedStateCode = opt.code || '';
      setToggleLabel(fields.state.toggle, opt.label);
      closeAllPanels();
      resetAfterState();
      if (selectedCountryCode && selectedStateCode) loadCities(selectedCountryCode, selectedStateCode);
    }, false);
    setDisabled(fields.state.toggle, false);
    setToggleLabel(fields.state.toggle, 'Select state…');
  }

  async function loadCities(cc, sc) {
    const res = await fetch('/api/countries/' + cc + '/states/' + sc + '/cities');
    const list = await res.json();
    cities = list.map((c) => ({ label: c.name, value: c.name }));
    wireDropdown('city', () => cities, (opt) => {
      selectedCity = opt.value;
      setToggleLabel(fields.city.toggle, opt.label);
      closeAllPanels();
      resetAfterCity();
      setDisabled(fields.area.toggle, false);
      setToggleLabel(fields.area.toggle, 'Neighborhood…');
      wireDropdown('area', () => areas, (a) => {
        selectedArea = a.value;
        setToggleLabel(fields.area.toggle, a.label);
        closeAllPanels();
      }, true);
    }, true);
    setDisabled(fields.city.toggle, false);
    setToggleLabel(fields.city.toggle, 'Select city…');
  }

  function resetAfterCountry() {
    selectedState = selectedStateCode = selectedCity = selectedArea = '';
    setDisabled(fields.state.toggle, true);
    setDisabled(fields.city.toggle, true);
    setDisabled(fields.area.toggle, true);
    setToggleLabel(fields.state.toggle, 'Select state…');
    setToggleLabel(fields.city.toggle, 'Select city…');
    setToggleLabel(fields.area.toggle, 'Neighborhood…');
  }
  function resetAfterState() {
    selectedCity = selectedArea = '';
    setDisabled(fields.city.toggle, true);
    setDisabled(fields.area.toggle, true);
    setToggleLabel(fields.city.toggle, 'Select city…');
    setToggleLabel(fields.area.toggle, 'Neighborhood…');
  }
  function resetAfterCity() {
    selectedArea = '';
    setDisabled(fields.area.toggle, true);
    setToggleLabel(fields.area.toggle, 'Neighborhood…');
  }

  function stopStream() {
    if (activeStream) { activeStream.close(); activeStream = null; }
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function displayResults(data, append) {
    resultsContainer.classList.remove('hidden');
    if (!append) { resultsTableBody.innerHTML = ''; currentLeads = []; }
    data.forEach((lead) => {
      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td><span class="badge-src">' + escapeHtml(lead.source || 'maps') + '</span></td>' +
        '<td>' + escapeHtml(lead.name || '') + '</td>' +
        '<td>' + escapeHtml(lead.email || '—') + '</td>' +
        '<td>' + escapeHtml(lead.phone || '—') + '</td>' +
        '<td>' + escapeHtml(lead.address || '—') + '</td>' +
        '<td>' + (lead.website ? '<a href="' + escapeHtml(lead.website) + '" target="_blank" rel="noopener">Open</a>' : '—') + '</td>';
      resultsTableBody.appendChild(tr);
      currentLeads.push(lead);
    });
    resultCount.textContent = String(resultsTableBody.children.length);
  }

  scrapeBtn.addEventListener('click', () => {
    const sources = getSelectedSources();
    if (!selectedCategory || !selectedCountry) { alert('Choose a category and country.'); return; }
    if (!sources.length) { alert('Select at least one source.'); return; }
    statusBar.classList.remove('hidden');
    resultsContainer.classList.add('hidden');
    scrapeBtn.disabled = true;
    statusText.textContent = 'Searching… large runs can take several minutes';
    resetTracking();
    processedIds = new Set();
    lastPayload = { category: selectedCategory, country: selectedCountry, state: selectedState, city: selectedCity, area: selectedArea, sources };
    stopStream();
    const params = new URLSearchParams({
      category: selectedCategory, country: selectedCountry, state: selectedState,
      city: selectedCity, area: selectedArea, sources: sources.join(','),
    });
    activeStream = new EventSource('/api/search/stream?' + params);
    activeStream.addEventListener('progress', (e) => {
      const d = JSON.parse(e.data);
      if (d.message) appendLog(d.message);
      updateProgress(d.percent, d.message || d.stage);
    });
    activeStream.addEventListener('done', (e) => {
      const d = JSON.parse(e.data);
      if (d.success) {
        (d.data || []).forEach((x) => { if (x.id) processedIds.add(x.id); });
        displayResults(d.data || [], false);
        const withEmail = d.withEmail != null ? d.withEmail : (d.data || []).filter((x) => x.email).length;
        statusText.textContent = 'Done — ' + d.count + ' leads (' + withEmail + ' with email)';
        appendLog('Completed. ' + d.count + ' unique leads.');
        updateProgress(100, 'Completed');
      } else statusText.textContent = 'Error: ' + (d.error || 'Unknown');
      scrapeBtn.disabled = false;
      stopStream();
    });
    activeStream.addEventListener('error', () => {
      statusText.textContent = 'Connection error';
      appendLog('Connection error.');
      scrapeBtn.disabled = false;
      stopStream();
    });
  });

  getMoreBtn.addEventListener('click', async () => {
    if (!lastPayload) return;
    getMoreBtn.disabled = true;
    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.assign({}, lastPayload, { processedIds: Array.from(processedIds) })),
      });
      const result = await res.json();
      if (result.success) {
        (result.data || []).forEach((x) => { if (x.id) processedIds.add(x.id); });
        displayResults(result.data || [], true);
        appendLog('Fetched ' + result.count + ' more.');
      }
    } finally { getMoreBtn.disabled = false; }
  });

  downloadBtn.addEventListener('click', () => {
    if (!currentLeads.length) { alert('No data yet.'); return; }
    const dial = (selectedCountryPhoneCode || '1').replace(/\D/g, '');
    const rows = [['Source', 'Name', 'Phone', 'Email', 'City', 'Country', 'Address', 'Website', 'Category']];
    currentLeads.forEach((lead) => {
      let digits = (lead.phone || '').replace(/\D/g, '');
      let phone = '';
      if (digits) phone = digits.startsWith(dial) ? '+' + digits : '+' + dial + digits;
      rows.push([lead.source || '', lead.name || '', phone, lead.email || '', selectedCity || '', selectedCountry || 'United States', lead.address || '', lead.website || '', selectedCategory || '']);
    });
    const csv = rows.map((r) => r.map((v) => {
      const s = String(v == null ? '' : v);
      return /[,"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'us_leads_export.csv';
    a.click();
  });

  document.addEventListener('DOMContentLoaded', async () => {
    await loadCountries();
    const us = countries.find((c) => c.code === 'US' || /united states/i.test(c.label));
    if (us) {
      selectedCountry = us.value;
      selectedCountryCode = us.code || 'US';
      selectedCountryPhoneCode = us.phonecode || '1';
      setToggleLabel(fields.country.toggle, us.label);
      loadStates(selectedCountryCode);
    }
  });
})();
