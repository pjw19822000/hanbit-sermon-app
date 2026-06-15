const Admin = (() => {
  let loggedIn = false;
  let taglineBackup = null;
  let currentTab = 'home';
  let selectedIds = new Set();
  let sortEditMode = false;
  let listSortable = null;
  let menuSortables = [];

  function loadSelection() {
    selectedIds = new Set();
    try { sessionStorage.removeItem('hanbit-bulk-selected'); } catch { /* ignore */ }
  }

  function saveSelection() {
    /* 메모리만 사용 — 새로고침 시 선택 해제 */
  }

  function isSelected(id) { return selectedIds.has(id); }

  function getSelectionCount() { return selectedIds.size; }

  function toggleSelect(id, on) {
    if (on) selectedIds.add(id);
    else selectedIds.delete(id);
    saveSelection();
    App.updateSelectionUi?.();
  }

  function clearSelection() {
    selectedIds.clear();
    saveSelection();
    App.refreshList();
  }

  function toggleSelectAll(on) {
    const ids = App.getListVideoIds?.() || [];
    if (on) ids.forEach(id => selectedIds.add(id));
    else ids.forEach(id => selectedIds.delete(id));
    saveSelection();
    App.refreshList();
  }

  function getMoveVideoIds(sourceState) {
    if (selectedIds.size) return [...selectedIds];
    if (sourceState) return Store.videosForListState(sourceState, { adminMode: true }).map(v => v.id);
    return [];
  }

  loadSelection();
  initAutoLogout();

  async function login(email, pw) {
    const em = (email || '').trim();
    const password = pw || '';
    if (!em || !password) return false;

    if (Firebase.isEnabled()) {
      try {
        await Firebase.signIn(em, password);
        loggedIn = true;
        sessionStorage.setItem('hanbit-admin', '1');
        return true;
      } catch (e) {
        console.error(e);
        return false;
      }
    }

    const cfg = Store.getConfig();
    if (em === (Firebase.adminEmail?.() || '') && password === (cfg.adminPassword || '0000')) {
      loggedIn = true;
      sessionStorage.setItem('hanbit-admin', '1');
      return true;
    }
    return false;
  }

  function resetSortMode() {
    sortEditMode = false;
    destroyListSort();
  }

  async function logout(opts = {}) {
    const { silent = false } = opts;
    resetSortMode();
    selectedIds.clear();
    loggedIn = false;
    sessionStorage.removeItem('hanbit-admin');
    if (Firebase.isEnabled()) await Firebase.signOut();
    if (!silent) UI.toast('로그아웃됨');
    App.onAdminLogout?.();
  }

  function initAutoLogout() {
    /* 탭 전환·유튜브 새 창 등으로 포커스가 빠져도 관리자 세션 유지. 로그아웃은 버튼으로만. */
  }

  function isIn() {
    if (Firebase.isEnabled()) return Firebase.isAdmin();
    return loggedIn || sessionStorage.getItem('hanbit-admin') === '1';
  }

  function showTab(tab) {
    currentTab = tab;
    const el = document.getElementById('admin-content');
    if (el) renderDashboard(el, tab);
  }

  function tabBtn(id, label, tab) {
    return `<button class="sub-nav-btn ${tab === id ? 'act' : ''}" onclick="Admin.showTab('${id}')">${label}</button>`;
  }

  const MENU_ADMIN_LABELS = {
    baek: '백용현 담임목사',
    prayer: '기도사역말씀',
    associate: '부사역자',
    events: '주제·행사',
    testimony: '간증',
    praise: '찬양',
    worshipRegular: '정기 예배',
    search: '검색',
    settings: '설정'
  };

  function renderDashboard(el, tab) {
    currentTab = tab || 'home';
    const cfg = Store.getConfig();
    const tabs = `<div class="sub-nav admin-tabs">${tabBtn('home', '홈 문구', currentTab)}${tabBtn('menus', '메뉴', currentTab)}${tabBtn('im', '이임 목사', currentTab)}${tabBtn('videos', '영상', currentTab)}${tabBtn('bulk', '일괄 이동', currentTab)}${tabBtn('add', '추가', currentTab)}</div>`;

    if (currentTab === 'menus') {
      el.innerHTML = tabs + renderMenusPanel();
      initMenuSort();
    }
    else if (currentTab === 'im') el.innerHTML = tabs + renderImPastorPanel();
    else if (currentTab === 'videos') el.innerHTML = tabs + renderVideosPanel();
    else if (currentTab === 'bulk') {
      el.innerHTML = tabs + renderBulkPanel();
      initBulkRouteForms();
    }
    else if (currentTab === 'add') el.innerHTML = tabs + renderAddPanel();
    else el.innerHTML = tabs + renderHomePanel(cfg);
  }

  function renderHomePanel(cfg) {
    return `
      ${Firebase.isEnabled() ? `<p class="adm-note">설정은 Firebase · 목록은 Cloudflare videos.json + Firebase 수정본</p>` : ''}
      <div class="login-box adm-box">
        <div class="form-group"><label class="form-label">제목</label>
          <input class="form-input" id="adm-title-text" value="${UI.esc(cfg.homeTitle?.text || '')}"></div>
        <div class="form-group"><label class="form-label">부제</label>
          <input class="form-input" id="adm-tag-text" value="${UI.esc(cfg.homeTagline?.text || '')}"></div>
        <div class="adm-grid3">
          <div class="form-group"><label class="form-label">글자크기</label><input class="form-input" id="adm-tag-size" value="${UI.esc(cfg.homeTagline?.fontSize || '1rem')}"></div>
          <div class="form-group"><label class="form-label">굵기</label><input class="form-input" id="adm-tag-weight" value="${UI.esc(cfg.homeTagline?.fontWeight || '500')}"></div>
          <div class="form-group"><label class="form-label">색상</label><input class="form-input" id="adm-tag-color" value="${UI.esc(cfg.homeTagline?.color || '#2c5282')}"></div>
        </div>
        <div class="adm-row">
          <button class="btn btn-primary" onclick="Admin.saveTagline()">저장</button>
          <button class="btn btn-outline" onclick="Admin.cancelTagline()">취소</button>
        </div>
      </div>
      <div class="login-box adm-box">
        <div class="section-label" style="margin-bottom:0.5rem">메뉴 표시</div>
        <label class="adm-check-row"><input type="checkbox" id="adm-associate-menu" ${Store.getMenus().associate?.visible !== false ? 'checked' : ''} onchange="Admin.toggleAssociateMenu(this.checked)"> 부사역자 메뉴 표시</label>
        <p class="adm-hint">체크 해제 시 홈에서 부사역자 메뉴가 숨겨집니다.</p>
      </div>
      <div class="login-box adm-box">
        <label class="adm-check-row"><input type="checkbox" id="adm-promo" ${cfg.showPromo ? 'checked' : ''} onchange="Admin.togglePromo(this.checked)"> 홍보·스트리밍 영상 표시</label>
        <div class="form-group"><label class="form-label">마지막 갱신 (YYYY-MM)</label>
          <input class="form-input" id="adm-updated" value="${UI.esc(cfg.lastUpdated || '')}"></div>
        <button class="btn btn-outline btn-sm" onclick="Admin.saveUpdated()">갱신일 저장</button>
        <button class="btn btn-outline btn-sm" style="margin-top:0.75rem" onclick="App.nav({s:'list',view:'associate',sub:'이임목사',adminIm:true})">이임 목사 관리</button>
        <button class="btn btn-outline btn-sm" onclick="Admin.logout()">로그아웃</button>
      </div>`;
  }

  function renderMenusPanel() {
    const menus = Store.getMenus();
    const homeKeys = Store.getHomeMenuOrder();
    const homeRows = homeKeys.map(key => {
      const m = menus[key];
      if (!m) return '';
      const label = MENU_ADMIN_LABELS[key] || m.title || m.label || key;
      return `<div class="adm-sort-row" data-menu-key="${UI.esc(key)}">
        <button type="button" class="adm-drag-handle" title="드래그하여 순서 변경" aria-label="순서">⠿</button>
        <label class="adm-menu-row adm-menu-row-grow"><input type="checkbox" data-menu="${UI.esc(key)}" ${m.visible !== false ? 'checked' : ''}> ${UI.esc(label)}</label>
      </div>`;
    }).join('');

    const hiddenSub = Store.getHiddenSubMenus();
    const subSections = Object.entries(Store.SUB_MENU_GROUP_LABELS).map(([group, groupLabel]) => {
      const items = Store.getAllSubMenuItemsForAdmin(group);
      const rows = items.map(item => {
        const key = `${group}:${item.id}`;
        const checked = !hiddenSub.has(key) && !item.isDeleted;
        const labelVal = UI.esc(item.label);
        return `<div class="adm-menu-item${item.isDeleted ? ' is-deleted' : ''}" data-sub-id="${UI.esc(item.id)}" data-sub-group="${UI.esc(group)}">
          <button type="button" class="adm-drag-handle" title="드래그하여 순서 변경" aria-label="순서">⠿</button>
          <label class="adm-menu-row adm-menu-sub adm-menu-row-grow">
            <input type="checkbox" data-sub-menu="${UI.esc(key)}" ${checked ? 'checked' : ''} ${item.isDeleted ? 'disabled' : ''}>
            <input type="text" class="form-input adm-menu-label" data-sub-label="${UI.esc(key)}" value="${labelVal}" ${item.isDeleted ? 'disabled' : ''}>
          </label>
          <div class="adm-menu-actions">
            ${item.isDeleted
              ? `<button type="button" class="btn btn-outline btn-sm" onclick="Admin.restoreSubMenu('${UI.esc(group)}','${UI.esc(item.id)}')">복원</button>`
              : `<button type="button" class="btn btn-outline btn-sm" onclick="Admin.deleteSubMenu('${UI.esc(group)}','${UI.esc(item.id)}')">삭제</button>`}
          </div>
        </div>`;
      }).join('');
      const addRow = group === 'associate'
        ? `<div class="adm-add-row">
            <input class="form-input" id="add-assoc-id" placeholder="ID (예: 홍길동)">
            <input class="form-input" id="add-assoc-label" placeholder="표시 이름">
            <button type="button" class="btn btn-outline btn-sm" onclick="Admin.addAssociate()">교역자 추가</button>
          </div>`
        : `<div class="adm-add-row">
            <input class="form-input" id="add-sub-id-${UI.esc(group)}" placeholder="ID (영문)">
            <input class="form-input" id="add-sub-label-${UI.esc(group)}" placeholder="표시 이름">
            <button type="button" class="btn btn-outline btn-sm" onclick="Admin.addSubMenu('${UI.esc(group)}')">하위 메뉴 추가</button>
          </div>`;
      return `<div class="adm-sub-group"><div class="section-label adm-sub-title">${UI.esc(groupLabel)}</div>
        <div class="adm-sort-list" id="adm-sub-order-${UI.esc(group)}">${rows}</div>${addRow}</div>`;
    }).join('');

    return `<div class="login-box adm-box">
      <p class="adm-hint">⠿ 드래그로 순서 변경 · 체크=표시 · 이름 수정 · 추가/삭제 · 「메뉴 저장」 시 Firebase 반영</p>
      <div class="section-label">홈 상위 메뉴</div>
      <div class="adm-sort-list" id="adm-home-menu-order">${homeRows}</div>
      <div class="section-label" style="margin-top:1rem">하위 메뉴</div>
      ${subSections}
      <button class="btn btn-primary" style="margin-top:0.75rem" onclick="Admin.saveMenus()">메뉴 저장</button>
    </div>`;
  }

  function collectMenuOrdersFromDom() {
    const homeMenuOrder = [...document.querySelectorAll('#adm-home-menu-order [data-menu-key]')]
      .map(el => el.dataset.menuKey).filter(Boolean);
    const subMenuOrders = { ...(Store.getConfig().subMenuOrders || {}) };
    Object.keys(Store.SUB_MENU_GROUP_LABELS).forEach(group => {
      const ids = [...document.querySelectorAll(`#adm-sub-order-${group} .adm-menu-item:not(.is-deleted)`)].map(el => el.dataset.subId).filter(Boolean);
      if (ids.length) subMenuOrders[group] = ids;
    });
    return { homeMenuOrder, subMenuOrders };
  }

  function destroyMenuSort() {
    menuSortables.forEach(s => { try { s.destroy(); } catch { /* ignore */ } });
    menuSortables = [];
  }

  function initMenuSort() {
    destroyMenuSort();
    if (typeof Sortable === 'undefined') return;
    const homeEl = document.getElementById('adm-home-menu-order');
    if (homeEl) {
      menuSortables.push(Sortable.create(homeEl, {
        handle: '.adm-drag-handle',
        animation: 150,
        draggable: '.adm-sort-row'
      }));
    }
    Object.keys(Store.SUB_MENU_GROUP_LABELS).forEach(group => {
      const el = document.getElementById(`adm-sub-order-${group}`);
      if (!el) return;
      menuSortables.push(Sortable.create(el, {
        handle: '.adm-drag-handle',
        animation: 150,
        draggable: '.adm-menu-item:not(.is-deleted)'
      }));
    });
  }

  function renderImPastorPanel() {
    const all = Store.associates('이임목사', true);
    const hiddenSet = Store.getHiddenImSpeakers();
    const groups = new Map();
    all.forEach(v => {
      const key = Store.canonicalSpeakerKey(v.speaker, v.title);
      const label = Store.canonicalSpeakerLabel(v.speaker, v.title);
      if (!groups.has(key)) groups.set(key, { label, count: 0, hidden: hiddenSet.has(key) });
      groups.get(key).count += 1;
    });
    const visibleCount = [...groups.values()].filter(g => !g.hidden).length;
    const rows = [...groups.entries()]
      .sort((a, b) => a[1].label.localeCompare(b[1].label, 'ko'))
      .map(([key, g]) => {
        const keyJson = UI.esc(JSON.stringify(key));
        return `<div class="adm-im-row${g.hidden ? ' is-hidden-speaker' : ''}">
          <span class="adm-im-name">${UI.esc(g.label)}${g.hidden ? ' <span class="badge-hidden">숨김</span>' : ''}</span>
          <span class="adm-im-count">${g.count}편</span>
          <button type="button" class="btn btn-outline btn-sm adm-im-toggle" data-key='${keyJson}'
            onclick="Admin.toggleImSpeakerHidden(JSON.parse(this.dataset.key), this)">${g.hidden ? '표시' : '숨김'}</button>
        </div>`;
      })
      .join('');
    return `<div class="login-box adm-box">
      <p class="adm-hint">설교자별 「숨김」을 누르면 일반 사용자에게 해당 폴더가 보이지 않습니다. (Firebase 저장)</p>
      <p class="adm-hint"><strong>전체 ${all.length}편 · ${groups.size}명 · 표시 ${visibleCount}명 · 숨김 ${groups.size - visibleCount}명</strong></p>
      <div class="adm-im-list">${rows || '<div class="no-data">이임 목사 설교 없음</div>'}</div>
      <button class="btn btn-outline btn-sm" style="margin-top:0.75rem" onclick="App.nav({s:'list',view:'associate',sub:'이임목사',adminIm:true})">이임 목사 영상 관리 →</button>
    </div>`;
  }

  async function toggleImSpeakerHidden(key, btn) {
    try {
      const hidden = await Store.toggleHiddenImSpeaker(key);
      UI.toast(hidden ? `"${Store.speakerLabelFromKey(key)}" 숨김` : `"${Store.speakerLabelFromKey(key)}" 표시`);
      showTab('im');
      App.refreshList();
    } catch (e) {
      UI.toast('저장 실패');
    }
  }

  async function toggleAssociateMenu(visible) {
    const menus = Store.getMenus();
    if (!menus.associate) return;
    menus.associate.visible = visible;
    try {
      await Store.saveMenus(menus);
      UI.renderHomeMenus();
      UI.toast(visible ? '부사역자 메뉴 표시' : '부사역자 메뉴 숨김');
    } catch (e) {
      UI.toast('저장 실패');
    }
  }

  function renderRouteSubFields(prefix, cat) {
    if (!cat) return '';
    if (cat === 'baek-bible') {
      const books = (Store.db()?.bibleBooks || Store.OT_BOOKS).map(b =>
        `<option value="${UI.esc(b)}">${UI.esc(b)}</option>`).join('');
      return `<div class="form-group"><label class="form-label">2단 · 성경</label>
        <select class="form-input" id="${prefix}-route-book"><option value="">— 전체(성경 미지정) —</option>${books}</select></div>`;
    }
    if (cat === 'baek-theme') {
      const themes = (Store.db()?.themes || []).map(t =>
        `<option value="${UI.esc(t)}">${UI.esc(t)}</option>`).join('');
      return `<div class="form-group"><label class="form-label">2단 · 주제</label>
        <select class="form-input" id="${prefix}-route-theme"><option value="">— 선택 —</option>${themes}</select></div>`;
    }
    if (cat === 'baek-worship') {
      const ws = Store.BAEK_WORSHIPS.map(w =>
        `<option value="${UI.esc(w)}">${UI.esc(w)}</option>`).join('');
      return `<div class="form-group"><label class="form-label">2단 · 예배</label>
        <select class="form-input" id="${prefix}-route-worship">${ws}</select></div>`;
    }
    if (cat === 'prayer') {
      const ps = Object.entries(Store.PRAYER_LABELS).map(([id, label]) =>
        `<option value="${UI.esc(id)}">${UI.esc(label)}</option>`).join('');
      return `<div class="form-group"><label class="form-label">2단 · 시리즈</label>
        <select class="form-input" id="${prefix}-route-prayer">
          <option value="">— 시리즈 선택 —</option>${ps}</select></div>
        <div id="${prefix}-route-year-wrap"></div>`;
    }
    if (cat === 'associate') {
      const assocs = Store.getAssociatesList().map(a =>
        `<option value="${UI.esc(a.id)}">${UI.esc(a.label)}</option>`).join('');
      const imSpeakers = Store.getImSpeakerKeys().map(k =>
        `<option value="${UI.esc(k)}">${UI.esc(Store.speakerLabelFromKey(k))}</option>`).join('');
      return `<div class="form-group"><label class="form-label">2단 · 교역자</label>
        <select class="form-input" id="${prefix}-route-associate">${assocs}</select></div>
        <div class="form-group" id="${prefix}-im-wrap" style="display:none"><label class="form-label">3단 · 이임 설교자</label>
        <select class="form-input" id="${prefix}-route-im"><option value="">— 전체 —</option>${imSpeakers}</select></div>
        <div class="form-group"><label class="form-label">구약/신약 (선택)</label>
        <select class="form-input" id="${prefix}-route-testament"><option value="">— 전체 —</option>
        <option value="구약">구약</option><option value="신약">신약</option></select></div>`;
    }
    if (cat === 'events') {
      const ev = Store.getSubMenuItems('events').map(e =>
        `<option value="${UI.esc(e.id)}">${UI.esc(e.label)}</option>`).join('');
      return `<div class="form-group"><label class="form-label">2단 · 행사</label>
        <select class="form-input" id="${prefix}-route-event">${ev}</select></div>`;
    }
    if (cat === 'praise') {
      const pr = Store.getSubMenuItems('praise').map(p =>
        `<option value="${UI.esc(p.id)}">${UI.esc(p.label)}</option>`).join('');
      return `<div class="form-group"><label class="form-label">2단 · 찬양</label>
        <select class="form-input" id="${prefix}-route-praise">${pr}</select></div>`;
    }
    return '';
  }

  const routeCatCache = {};

  function loadRouteDraft(prefix) {
    try {
      const raw = sessionStorage.getItem(`hanbit-route-draft-${prefix}`);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  function saveRouteDraft(prefix) {
    const route = collectRouteByPrefix(prefix);
    if (!route?.category) {
      sessionStorage.removeItem(`hanbit-route-draft-${prefix}`);
      return;
    }
    sessionStorage.setItem(`hanbit-route-draft-${prefix}`, JSON.stringify(route));
  }

  function bindRouteSubEvents(prefix) {
    const subEl = document.getElementById(`${prefix}-route-sub`);
    if (!subEl || subEl.dataset.routeBound === '1') return;
    subEl.dataset.routeBound = '1';
    subEl.addEventListener('change', (e) => {
      const id = e.target?.id || '';
      if (id === `${prefix}-route-prayer`) onPrayerSeriesChange(prefix);
      else if (id === `${prefix}-route-associate`) toggleRouteImSpeaker(prefix);
      else {
        saveRouteDraft(prefix);
        if (prefix === 'bulk') previewBulkRoute();
      }
    });
    subEl.addEventListener('input', (e) => {
      if (e.target?.id === `${prefix}-route-year`) {
        saveRouteDraft(prefix);
        if (prefix === 'bulk') previewBulkRoute();
      }
    });
  }

  function onPrayerSeriesChange(prefix) {
    updatePrayerYearSelect(prefix);
    saveRouteDraft(prefix);
    if (prefix === 'bulk') previewBulkRoute();
  }

  function initBulkRouteForms() {
    routeCatCache.source = '';
    routeCatCache.bulk = '';
    ['source', 'bulk'].forEach(prefix => {
      const draft = loadRouteDraft(prefix);
      const catEl = document.getElementById(`${prefix}-route-cat`);
      if (!catEl) return;
      if (draft?.category) {
        catEl.value = draft.category;
        updateRouteSelects(prefix, true);
        restoreRouteSubFields(prefix, draft.category, draft);
        if (draft.category === 'prayer') updatePrayerYearSelect(prefix);
        if (draft.category === 'associate') toggleRouteImSpeaker(prefix);
      } else {
        bindRouteSubEvents(prefix);
      }
    });
    previewBulkRoute();
  }

  function restoreRouteSubFields(prefix, cat, route) {
    if (!route) return;
    const setVal = (id, val) => {
      if (val === undefined || val === null || val === '') return;
      const el = document.getElementById(`${prefix}-route-${id}`);
      if (el) el.value = val;
    };
    if (cat === 'baek-bible') setVal('book', route.book);
    if (cat === 'baek-theme') setVal('theme', route.theme);
    if (cat === 'baek-worship') setVal('worship', route.worship);
    if (cat === 'prayer') {
      setVal('prayer', route.prayerSeries);
      setVal('year', route.year);
    }
    if (cat === 'associate') {
      setVal('associate', route.associateId);
      setVal('im', route.imSpeaker);
      setVal('testament', route.testament);
    }
    if (cat === 'events') setVal('event', route.eventSub);
    if (cat === 'praise') setVal('praise', route.praiseSub);
  }

  function updateRouteSelects(prefix, force) {
    const cat = document.getElementById(`${prefix}-route-cat`)?.value || '';
    const subEl = document.getElementById(`${prefix}-route-sub`);
    if (!subEl) return;
    if (!cat) {
      subEl.innerHTML = '';
      routeCatCache[prefix] = '';
      saveRouteDraft(prefix);
      return;
    }
    const hasSub = subEl.querySelector(`#${prefix}-route-prayer, #${prefix}-route-book, #${prefix}-route-associate, #${prefix}-route-event, #${prefix}-route-praise, #${prefix}-route-theme, #${prefix}-route-worship`);
    if (!force && routeCatCache[prefix] === cat && hasSub) {
      bindRouteSubEvents(prefix);
      return;
    }
    const saved = collectRouteByPrefix(prefix) || loadRouteDraft(prefix);
    routeCatCache[prefix] = cat;
    subEl.innerHTML = renderRouteSubFields(prefix, cat);
    subEl.dataset.routeBound = '';
    restoreRouteSubFields(prefix, cat, saved);
    bindRouteSubEvents(prefix);
    if (cat === 'prayer') updatePrayerYearSelect(prefix);
    if (cat === 'associate') toggleRouteImSpeaker(prefix);
    saveRouteDraft(prefix);
    if (prefix === 'bulk') previewBulkRoute();
  }

  function updatePrayerYearSelect(prefix) {
    const wrap = document.getElementById(`${prefix}-route-year-wrap`);
    const series = document.getElementById(`${prefix}-route-prayer`)?.value || '';
    const prevYear = document.getElementById(`${prefix}-route-year`)?.value
      || loadRouteDraft(prefix)?.year || '';
    if (!wrap) return;
    if (!Store.routeNeedsYear(series)) { wrap.innerHTML = ''; return; }
    const existing = Store.getPrayerYears(series);
    const extras = [];
    const now = new Date().getFullYear();
    for (let i = 0; i < 6; i++) extras.push(String(now - i));
    const allYears = [...new Set([...existing, ...extras])].sort((a, b) => b.localeCompare(a));
    const opts = allYears.map(y => `<option value="${UI.esc(y)}">`).join('');
    wrap.innerHTML = `<div class="form-group"><label class="form-label">3단 · 연도 (필수)</label>
      <input class="form-input" id="${prefix}-route-year" list="${prefix}-year-list" placeholder="예: 2024" inputmode="numeric" autocomplete="off" value="${UI.esc(prevYear)}">
      <datalist id="${prefix}-year-list">${opts}</datalist>
      <p class="adm-hint">이동할 연도를 선택하거나 직접 입력하세요.</p></div>`;
  }

  function toggleRouteImSpeaker(prefix) {
    const assoc = document.getElementById(`${prefix}-route-associate`)?.value;
    const wrap = document.getElementById(`${prefix}-im-wrap`);
    if (wrap) wrap.style.display = assoc === '이임목사' ? '' : 'none';
  }

  function collectRouteByPrefix(prefix) {
    const cat = document.getElementById(`${prefix}-route-cat`)?.value;
    if (!cat) return null;
    const route = { category: cat };
    if (cat === 'baek-bible') route.book = document.getElementById(`${prefix}-route-book`)?.value || '';
    if (cat === 'baek-theme') route.theme = document.getElementById(`${prefix}-route-theme`)?.value || '';
    if (cat === 'baek-worship') route.worship = document.getElementById(`${prefix}-route-worship`)?.value || '';
    if (cat === 'prayer') {
      route.prayerSeries = document.getElementById(`${prefix}-route-prayer`)?.value || '';
      route.year = document.getElementById(`${prefix}-route-year`)?.value || '';
    }
    if (cat === 'associate') {
      route.associateId = document.getElementById(`${prefix}-route-associate`)?.value || '';
      if (route.associateId === '이임목사') route.imSpeaker = document.getElementById(`${prefix}-route-im`)?.value || '';
      route.testament = document.getElementById(`${prefix}-route-testament`)?.value || '';
    }
    if (cat === 'events') route.eventSub = document.getElementById(`${prefix}-route-event`)?.value || '';
    if (cat === 'praise') route.praiseSub = document.getElementById(`${prefix}-route-praise`)?.value || '';
    return route;
  }

  function getStoredSourceState() {
    const raw = sessionStorage.getItem('hanbit-bulk-source');
    try { return raw ? JSON.parse(raw) : null; } catch { return null; }
  }

  function renderBulkPanel() {
    const sourceState = getStoredSourceState();
    const sourceVideos = sourceState ? Store.videosForListState(sourceState, { adminMode: true }) : [];
    const sourceDesc = sourceState ? Store.describeListState(sourceState) : '미지정';
    const selCount = getSelectionCount();
    const moveCount = selCount || sourceVideos.length;
    const catOpts = Store.MOVE_CATEGORIES.map(c =>
      `<option value="${UI.esc(c.id)}">${UI.esc(c.label)}</option>`).join('');

    return `<div class="login-box adm-box">
      <p class="adm-hint">출발: 관리자에서 경로 선택 · 또는 목록에서 체크 선택 · 이동: 아래 「이동 대상」</p>

      <div class="section-label">출발 위치</div>
      <div class="form-group">
        <label class="form-label">1단 · 분류</label>
        <select class="form-input" id="source-route-cat" onchange="Admin.updateRouteSelects('source', true)">
          <option value="">— 선택 —</option>${catOpts}
        </select>
      </div>
      <div id="source-route-sub"></div>
      <div class="adm-row">
        <button type="button" class="btn btn-outline btn-sm" onclick="Admin.applySourceRoute()">출발 위치 적용</button>
      </div>
      <div class="adm-bulk-source" style="margin-top:0.5rem">
        <strong>현재 출발</strong>
        <div class="adm-hint" id="bulk-source-desc">${UI.esc(sourceDesc)}</div>
        <div class="adm-bulk-count">폴더 <span id="bulk-source-count">${sourceVideos.length}</span>편 · 선택 <span id="bulk-sel-count">${selCount}</span>편</div>
        <p class="adm-hint">이동 시 <strong>선택한 영상</strong>이 있으면 선택분만, 없으면 폴더 전체가 이동됩니다.</p>
      </div>

      <div class="section-label" style="margin-top:1rem">이동 대상</div>
      <div class="form-group">
        <label class="form-label">1단 · 분류</label>
        <select class="form-input" id="bulk-route-cat" onchange="Admin.updateBulkRoute()">
          <option value="">— 선택 —</option>${catOpts}
        </select>
      </div>
      <div id="bulk-route-sub"></div>
      <div id="bulk-route-preview" class="adm-hint" style="margin-top:0.5rem"></div>
      <div class="adm-row">
        <button class="btn btn-primary" ${moveCount ? '' : 'disabled'} id="bulk-move-btn"
          onclick="Admin.executeBulkMove()">이동 실행 (<span id="bulk-move-count">${moveCount}</span>편)</button>
        <button class="btn btn-outline" onclick="Admin.previewBulkRoute()">미리보기</button>
      </div>
    </div>`;
  }

  function applySourceRoute() {
    const route = collectRouteByPrefix('source');
    if (!route?.category) { UI.toast('출발 분류를 선택하세요'); return; }
    const st = Store.routeToListState(route);
    if (!st) { UI.toast('출발 경로가 올바르지 않습니다'); return; }
    sessionStorage.setItem('hanbit-bulk-source', JSON.stringify(st));
    const videos = Store.videosForListState(st, { adminMode: true });
    const desc = Store.describeListState(st);
    const descEl = document.getElementById('bulk-source-desc');
    const countEl = document.getElementById('bulk-source-count');
    const moveBtn = document.getElementById('bulk-move-btn');
    const moveCountEl = document.getElementById('bulk-move-count');
    if (descEl) descEl.textContent = desc;
    if (countEl) countEl.textContent = String(videos.length);
    refreshBulkMoveCount();
    UI.toast(`출발: ${desc} (${videos.length}편)`);
  }

  function refreshBulkMoveCount() {
    const sourceState = getStoredSourceState();
    const sourceVideos = sourceState ? Store.videosForListState(sourceState, { adminMode: true }) : [];
    const selCount = getSelectionCount();
    const moveCount = selCount || sourceVideos.length;
    const selEl = document.getElementById('bulk-sel-count');
    const moveEl = document.getElementById('bulk-move-count');
    const btn = document.getElementById('bulk-move-btn');
    if (selEl) selEl.textContent = String(selCount);
    if (moveEl) moveEl.textContent = String(moveCount);
    if (btn) btn.disabled = !moveCount;
  }

  function updateBulkRoute() {
    updateRouteSelects('bulk', true);
    const preview = document.getElementById('bulk-route-preview');
    if (preview && !document.getElementById('bulk-route-cat')?.value) preview.textContent = '';
  }

  function previewBulkRoute() {
    const route = collectRouteByPrefix('bulk');
    const el = document.getElementById('bulk-route-preview');
    if (!el) return;
    if (!route?.category) { el.textContent = '이동 대상 분류를 선택하세요.'; return; }
    const patch = Store.buildRoutePatch(route);
    let extra = '';
    if (Store.isBaekRouteCategory(route.category)) {
      extra = ' · 백용현: 성경별·주제별·정기예배 동시 분류 (book/themes/worship 자동)';
    }
    el.textContent = `→ ${Store.describeRoute(route)} · 적용 필드: ${Object.keys(patch).join(', ')}${extra}`;
  }

  async function executeBulkMove() {
    const sourceState = getStoredSourceState();
    const route = collectRouteByPrefix('bulk');
    if (!route?.category) { UI.toast('이동 대상을 선택하세요'); return; }
    if (route.category === 'prayer' && !route.prayerSeries) {
      UI.toast('기도 시리즈를 선택하세요');
      return;
    }
    if (route.category === 'prayer' && Store.routeNeedsYear(route.prayerSeries) && !route.year) {
      UI.toast('연도별 시리즈는 이동 연도를 입력하세요');
      return;
    }
    const patch = Store.buildRoutePatch(route);
    if (!Object.keys(patch).length) { UI.toast('이동 대상이 올바르지 않습니다'); return; }
    const ids = getMoveVideoIds(sourceState);
    if (!ids.length) {
      UI.toast('출발 위치를 적용하거나, 목록에서 영상을 선택하세요');
      return;
    }
    const dest = Store.describeRoute(route);
    const mode = selectedIds.size ? `선택 ${ids.length}편` : `폴더 ${ids.length}편`;
    if (!confirm(`${mode}을(를) 「${dest}」(으)로 이동할까요?`)) return;
    try {
      if (Firebase.isEnabled()) await Firebase.requireAuth();
      const n = await Store.bulkApplyOverride(ids, patch, route);
      clearSelection();
      UI.toast(`${n}편 이동됨 (Firebase)`);
      App.refreshList();
      UI.renderHomeMenus?.();
      showTab('bulk');
    } catch (e) {
      UI.toast('저장 실패: ' + (e.message || ''));
    }
  }

  function openBulkFromList() {
    if (typeof App !== 'undefined' && App.getListState) {
      sessionStorage.setItem('hanbit-bulk-source', JSON.stringify(App.getListState()));
    }
    openAdmin('bulk');
  }

  function openBulkSelected() {
    if (!selectedIds.size) { UI.toast('이동할 영상을 선택하세요'); return; }
    if (typeof App !== 'undefined' && App.getListState) {
      sessionStorage.setItem('hanbit-bulk-source', JSON.stringify(App.getListState()));
    }
    openAdmin('bulk');
    UI.toast(`${selectedIds.size}편 선택 · 이동 대상을 고르세요`);
  }

  async function deleteSubMenu(group, id) {
    if (!confirm(`「${id}」 하위 메뉴를 삭제할까요? (복원 가능)`)) return;
    const cfg = Store.getConfig();
    const deleted = new Set(cfg.deletedSubMenus || []);
    deleted.add(`${group}:${id}`);
    const patch = { deletedSubMenus: [...deleted].sort() };
    if (group === 'associate') {
      const da = new Set(cfg.deletedAssociates || []);
      da.add(id);
      patch.deletedAssociates = [...da].sort();
    }
    try {
      await Store.saveMenuCustomization(patch);
      UI.toast('삭제됨');
      showTab('menus');
    } catch (e) { UI.toast('저장 실패'); }
  }

  async function restoreSubMenu(group, id) {
    const cfg = Store.getConfig();
    const patch = {
      deletedSubMenus: (cfg.deletedSubMenus || []).filter(k => k !== `${group}:${id}`)
    };
    if (group === 'associate') {
      patch.deletedAssociates = (cfg.deletedAssociates || []).filter(x => x !== id);
    }
    try {
      await Store.saveMenuCustomization(patch);
      UI.toast('복원됨');
      showTab('menus');
    } catch (e) { UI.toast('저장 실패'); }
  }

  async function addSubMenu(group) {
    const id = document.getElementById(`add-sub-id-${group}`)?.value?.trim();
    const label = document.getElementById(`add-sub-label-${group}`)?.value?.trim();
    if (!id || !label) { UI.toast('ID와 이름을 입력하세요'); return; }
    const cfg = Store.getConfig();
    const custom = { ...(cfg.customSubMenus || {}) };
    const list = [...(custom[group] || [])];
    if (list.some(x => x.id === id) || (Store.SUB_MENU_REGISTRY[group] || []).some(x => x.id === id)) {
      UI.toast('이미 있는 ID입니다'); return;
    }
    list.push({ id, label });
    custom[group] = list;
    const deleted = (cfg.deletedSubMenus || []).filter(k => k !== `${group}:${id}`);
    try {
      await Store.saveMenuCustomization({ customSubMenus: custom, deletedSubMenus: deleted });
      UI.toast('추가됨');
      showTab('menus');
    } catch (e) { UI.toast('저장 실패'); }
  }

  async function addAssociate() {
    const id = document.getElementById('add-assoc-id')?.value?.trim();
    const label = document.getElementById('add-assoc-label')?.value?.trim();
    if (!id || !label) { UI.toast('ID와 이름을 입력하세요'); return; }
    const cfg = Store.getConfig();
    const custom = [...(cfg.customAssociates || [])];
    if (Store.ASSOCIATES.includes(id) || custom.some(x => x.id === id)) {
      UI.toast('이미 있는 ID입니다'); return;
    }
    custom.push({ id, label });
    const labels = { ...(cfg.associateLabels || {}), [id]: label };
    const deleted = (cfg.deletedAssociates || []).filter(x => x !== id);
    try {
      await Store.saveMenuCustomization({ customAssociates: custom, associateLabels: labels, deletedAssociates: deleted });
      UI.toast('교역자 추가됨');
      showTab('menus');
    } catch (e) { UI.toast('저장 실패'); }
  }

  function renderVideosPanel() {
    return `<div class="adm-box">
      <p class="adm-hint">Cloudflare 기본 목록 + Firebase 수정(숨김·편집·추가)이 합쳐져 표시됩니다.</p>
      <div class="search-box"><span>🔍</span>
        <input type="search" class="search-input" id="adm-video-q" placeholder="제목·성경·목사 검색…"
               oninput="Admin.searchVideos(this.value)">
      </div>
      <div id="adm-video-results"><div class="no-data">검색어를 입력하세요.</div></div>
    </div>`;
  }

  function renderAddPanel() {
    const buckets = Store.BUCKETS.map(b =>
      `<option value="${b.id}">${UI.esc(b.label)}</option>`).join('');
    return `<div class="login-box adm-box">
      <div class="form-group"><label class="form-label">YouTube URL *</label>
        <input class="form-input" id="add-url" placeholder="https://www.youtube.com/watch?v=..."></div>
      <div class="form-group"><label class="form-label">표시 제목 *</label>
        <input class="form-input" id="add-title"></div>
      <div class="form-group"><label class="form-label">성경 본문</label>
        <input class="form-input" id="add-scripture" placeholder="요한복음 3장 16절"></div>
      <div class="form-group"><label class="form-label">설교자</label>
        <input class="form-input" id="add-speaker"></div>
      <div class="form-group"><label class="form-label">분류</label>
        <select class="form-input" id="add-bucket">${buckets}</select></div>
      <button class="btn btn-primary" onclick="Admin.submitAdd()">Firebase에 추가</button>
    </div>`;
  }

  async function searchVideos(q) {
    const el = document.getElementById('adm-video-results');
    if (!el) return;
    if (!q.trim()) {
      App.clearPagedList?.();
      el.innerHTML = '<div class="no-data">검색어를 입력하세요.</div>';
      return;
    }
    el.innerHTML = '<div class="loading"><div class="spinner"></div>검색 중…</div>';
    const r = await Store.search(q, true);
    App.renderAdminVideoSearch?.(q, r);
  }

  function toggleEditPrayerYear() {
    const bucket = document.getElementById('edit-bucket')?.value || '';
    const ps = document.getElementById('edit-prayer')?.value || '';
    const wrap = document.getElementById('edit-year-wrap');
    if (!wrap) return;
    const show = bucket === 'prayer-ministry' && ps && Store.routeNeedsYear(ps);
    wrap.style.display = show ? '' : 'none';
  }

  async function saveMenus() {
    const menus = Store.getMenus();
    document.querySelectorAll('[data-menu]').forEach(cb => {
      const k = cb.dataset.menu;
      if (menus[k]) menus[k].visible = cb.checked;
    });
    const hiddenSub = [];
    document.querySelectorAll('[data-sub-menu]').forEach(cb => {
      if (!cb.checked && !cb.disabled) hiddenSub.push(cb.dataset.subMenu);
    });
    const subMenuLabels = { ...(Store.getConfig().subMenuLabels || {}) };
    document.querySelectorAll('[data-sub-label]').forEach(inp => {
      const key = inp.dataset.subLabel;
      const val = inp.value.trim();
      if (!key || !val) return;
      const [group, id] = key.split(':');
      const base = (Store.SUB_MENU_REGISTRY[group] || []).find(x => x.id === id);
      const custom = (Store.getConfig().customSubMenus?.[group] || []).find(x => x.id === id);
      const defaultLabel = base?.label || custom?.label || id;
      if (val !== defaultLabel) subMenuLabels[key] = val;
      else delete subMenuLabels[key];
    });
    const { homeMenuOrder, subMenuOrders } = collectMenuOrdersFromDom();
    try {
      await Store.saveMenus(menus);
      await Store.saveHiddenSubMenus(hiddenSub);
      await Store.saveMenuCustomization({ subMenuLabels, homeMenuOrder, subMenuOrders });
      UI.renderHomeMenus();
      UI.toast('메뉴 저장됨');
    } catch (e) {
      UI.toast('저장 실패');
    }
  }

  async function toggleHidden(id, btn) {
    const hidden = await Store.toggleAdminHidden(id);
    UI.toast(hidden ? '숨김 처리' : '표시됨');
    App.refreshList();
    if (btn) btn.textContent = hidden ? '👁' : '🚫';
    const card = btn?.closest('.video-item');
    if (card) card.classList.toggle('is-hidden', hidden);
  }

  function openEdit(id) {
    const v = Store.getVideo(id);
    if (!v) return;
    const o = Store.getOverrides()[id] || {};
    const buckets = Store.BUCKETS.map(b =>
      `<option value="${b.id}" ${(o.bucket || v.bucket) === b.id ? 'selected' : ''}>${UI.esc(b.label)}</option>`).join('');
    const worships = Store.BAEK_WORSHIPS.map(w =>
      `<option value="${UI.esc(w)}" ${(o.worship || v.worship) === w ? 'selected' : ''}>${UI.esc(w)}</option>`).join('');
    const prayers = Object.entries(Store.PRAYER_LABELS).map(([pid, plabel]) =>
      `<option value="${UI.esc(pid)}" ${(o.prayerSeries || v.prayerSeries) === pid ? 'selected' : ''}>${UI.esc(plabel)}</option>`).join('');
    const assocs = Store.getAssociatesList().map(a =>
      `<option value="${UI.esc(a.id)}" ${(o.associateId || v.associateId) === a.id ? 'selected' : ''}>${UI.esc(a.label)}</option>`).join('');
    const events = Store.getSubMenuItems('events').map(e =>
      `<option value="${UI.esc(e.id)}" ${(o.eventBucket || v.eventBucket) === e.id ? 'selected' : ''}>${UI.esc(e.label)}</option>`).join('');
    const praises = Store.getSubMenuItems('praise').map(p =>
      `<option value="${UI.esc(p.id)}" ${(o.praiseSub || v.praiseSub) === p.id ? 'selected' : ''}>${UI.esc(p.label)}</option>`).join('');
    const body = document.getElementById('admin-modal-body');
    body.innerHTML = `
      <h3 style="margin-bottom:0.75rem;font-size:1em">영상 편집</h3>
      <div class="form-group"><label class="form-label">표시 제목</label>
        <input class="form-input" id="edit-title" value="${UI.esc(v.displayTitle)}"></div>
      <div class="form-group"><label class="form-label">성경 본문</label>
        <input class="form-input" id="edit-scripture" value="${UI.esc(v.scripture || '')}"></div>
      <div class="form-group"><label class="form-label">설교자</label>
        <input class="form-input" id="edit-speaker" value="${UI.esc(v.speaker || '')}"></div>
      <div class="form-group"><label class="form-label">분류 (bucket)</label>
        <select class="form-input" id="edit-bucket" onchange="Admin.toggleEditPrayerYear()">${buckets}</select></div>
      <div class="form-group"><label class="form-label">예배 종류</label>
        <select class="form-input" id="edit-worship"><option value="">—</option>${worships}</select></div>
      <div class="form-group"><label class="form-label">기도 시리즈</label>
        <select class="form-input" id="edit-prayer" onchange="Admin.toggleEditPrayerYear()"><option value="">—</option>${prayers}</select></div>
      <div class="form-group" id="edit-year-wrap" style="display:none"><label class="form-label">기도 연도</label>
        <input class="form-input" id="edit-prayer-year" inputmode="numeric" placeholder="예: 2024" value="${UI.esc(o.seriesMeta?.year || v.seriesMeta?.year || Store.prayerYear(v) || '')}"></div>
      <div class="form-group"><label class="form-label">부사역자</label>
        <select class="form-input" id="edit-associate"><option value="">—</option>${assocs}</select></div>
      <div class="form-group"><label class="form-label">행사 하위</label>
        <select class="form-input" id="edit-event"><option value="">—</option>${events}</select></div>
      <div class="form-group"><label class="form-label">찬양 하위</label>
        <select class="form-input" id="edit-praise"><option value="">—</option>${praises}</select></div>
      <label class="adm-check-row"><input type="checkbox" id="edit-im" ${o.isImPastor === true || v.associateId === '이임목사' ? 'checked' : ''}> 이임 목사</label>
      <div class="adm-row">
        <button class="btn btn-primary" onclick="Admin.saveEdit('${UI.esc(id)}')">저장</button>
        <button class="btn btn-outline" onclick="Admin.closeModal()">닫기</button>
      </div>`;
    document.getElementById('admin-modal').classList.add('open');
    toggleEditPrayerYear();
  }

  async function saveEdit(id) {
    try {
      const bucket = document.getElementById('edit-bucket').value;
      const isIm = document.getElementById('edit-im').checked;
      const prayerSeries = document.getElementById('edit-prayer').value;
      const prayerYearVal = document.getElementById('edit-prayer-year')?.value.trim() || '';
      const patch = {
        displayTitle: document.getElementById('edit-title').value,
        scripture: document.getElementById('edit-scripture').value,
        speaker: document.getElementById('edit-speaker').value,
        bucket,
        isBaek: bucket === 'baek-regular',
        isImPastor: isIm,
        worship: document.getElementById('edit-worship').value,
        prayerSeries,
        associateId: document.getElementById('edit-associate').value,
        eventBucket: document.getElementById('edit-event').value,
        praiseSub: document.getElementById('edit-praise').value
      };
      if (prayerYearVal && (bucket === 'prayer-ministry' || prayerSeries)) {
        patch.seriesMeta = { year: prayerYearVal, ...(prayerSeries ? { sub: prayerSeries } : {}) };
      }
      Object.keys(patch).forEach(k => {
        if (k === 'isImPastor' || k === 'isBaek') return;
        if (patch[k] === '' || patch[k] === undefined) delete patch[k];
      });
      await Store.applyOverride(id, patch, (bucket === 'prayer-ministry' || prayerSeries)
        ? { category: 'prayer', prayerSeries, year: prayerYearVal }
        : null);
      closeModal();
      App.refreshList();
      UI.renderHomeMenus?.();
      searchVideos(document.getElementById('adm-video-q')?.value || '');
      UI.toast('저장됨 (Firebase)');
    } catch (e) {
      UI.toast('저장 실패');
    }
  }

  async function submitAdd() {
    try {
      await Store.addCustomVideo({
        url: document.getElementById('add-url').value,
        displayTitle: document.getElementById('add-title').value,
        scripture: document.getElementById('add-scripture').value,
        speaker: document.getElementById('add-speaker').value,
        bucket: document.getElementById('add-bucket').value
      });
      UI.toast('추가됨 (Firebase)');
      document.getElementById('add-url').value = '';
      document.getElementById('add-title').value = '';
      showTab('videos');
    } catch (e) {
      UI.toast(e.message || '추가 실패');
    }
  }

  async function deleteCustom(id) {
    if (!confirm('수동 추가 영상을 삭제할까요?')) return;
    await Store.removeCustomVideo(id);
    searchVideos(document.getElementById('adm-video-q')?.value || '');
    App.refreshList();
    UI.toast('삭제됨');
  }

  function closeModal() {
    document.getElementById('admin-modal')?.classList.remove('open');
  }

  async function setImPastor(id, checked) {
    await Store.applyOverride(id, { isImPastor: checked });
    App.refreshList();
    UI.toast(checked ? '이임 목사로 지정' : '부사역자 목록으로');
  }

  async function saveTagline() {
    const cfg = Store.getConfig();
    try {
      await Store.saveConfig({
        homeTitle: { ...cfg.homeTitle, text: document.getElementById('adm-title-text').value },
        homeTagline: {
          ...cfg.homeTagline,
          text: document.getElementById('adm-tag-text').value,
          fontSize: document.getElementById('adm-tag-size').value,
          fontWeight: document.getElementById('adm-tag-weight').value,
          color: document.getElementById('adm-tag-color').value
        }
      });
      UI.applyHomeText();
      UI.toast('저장됨');
    } catch (e) {
      UI.toast('저장 실패: ' + (e.message || ''));
    }
  }

  async function cancelTagline() {
    if (taglineBackup) await Store.saveConfig(JSON.parse(JSON.stringify(taglineBackup)));
    UI.applyHomeText();
    showTab('home');
    UI.toast('취소됨');
  }

  function openAdmin(tab) {
    taglineBackup = JSON.parse(JSON.stringify(Store.getConfig()));
    App.navPush({ s: 'admin', adminTab: tab || 'home' });
  }

  async function togglePromo(on) {
    try {
      await Store.saveConfig({ showPromo: on });
      await Store.load();
      App.refreshList();
      UI.toast(on ? '홍보 표시' : '홍보 숨김');
    } catch (e) {
      UI.toast('저장 실패');
    }
  }

  async function saveUpdated() {
    try {
      await Store.saveConfig({ lastUpdated: document.getElementById('adm-updated').value });
      UI.applyHomeText();
      UI.toast('갱신일 저장');
    } catch (e) {
      UI.toast('저장 실패');
    }
  }

  function isSortMode() { return sortEditMode && isIn(); }

  function toggleSortMode() {
    if (!isIn()) { UI.toast('관리자 로그인이 필요합니다'); return; }
    if (sortEditMode) destroyListSort();
    sortEditMode = !sortEditMode;
    App.refreshList();
  }

  async function resetListOrder() {
    if (!isIn()) { UI.toast('관리자 로그인이 필요합니다'); return; }
    const st = App.getListState?.();
    const key = Store.getListOrderKey(st);
    if (!key) { UI.toast('순서를 저장할 목록이 아닙니다'); return; }
    if (!confirm('이 목록의 사용자 지정 순서를 기본값으로 되돌릴까요?')) return;
    try {
      await Store.clearListOrder(key);
      UI.toast('기본 순서로 복원');
      App.refreshList();
    } catch (e) {
      UI.toast('저장 실패: ' + (e.message || ''));
    }
  }

  function destroyListSort() {
    if (listSortable) {
      listSortable.destroy();
      listSortable = null;
    }
  }

  function initListSort(orderKey) {
    destroyListSort();
    if (!isIn() || !sortEditMode || !orderKey) return;
    const root = document.getElementById('list-content');
    if (!root || typeof Sortable === 'undefined') return;

    const saveOrder = async () => {
      const ids = [...root.querySelectorAll('.video-item[data-id]')].map(el => el.dataset.id);
      if (!ids.length) return;
      try {
        if (Firebase.isEnabled()) await Firebase.requireAuth();
        await Store.saveListOrder(orderKey, ids);
        UI.toast('순서 저장됨');
        App.refreshList();
      } catch (e) {
        UI.toast('순서 저장 실패: ' + (e.message || ''));
      }
    };

    listSortable = Sortable.create(root, {
      handle: '.adm-drag-handle',
      animation: 150,
      draggable: '.video-item',
      onEnd: saveOrder
    });
  }

  return {
    login, logout, isIn, setImPastor, renderDashboard, showTab,
    saveTagline, cancelTagline, openAdmin, togglePromo, saveUpdated,
    saveMenus, searchVideos, toggleHidden, openEdit, saveEdit,
    submitAdd, deleteCustom, closeModal, toggleAssociateMenu, toggleImSpeakerHidden,
    openBulkFromList, openBulkSelected, updateBulkRoute, updateRouteSelects, updatePrayerYearSelect, onPrayerSeriesChange, applySourceRoute,
    previewBulkRoute, executeBulkMove, refreshBulkMoveCount,
    toggleSelect, toggleSelectAll, clearSelection, isSelected, getSelectionCount,
    deleteSubMenu, restoreSubMenu, addSubMenu, addAssociate,
    isSortMode, toggleSortMode, resetListOrder, initListSort, toggleEditPrayerYear
  };
})();
