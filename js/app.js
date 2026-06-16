const App = (() => {
  let state = { s: 'font' };
  let listCtx = null;
  let listVideos = [];
  let listRenderPage = 1;
  let listFolderQuery = '';
  let listFilterKey = '';
  let lastSearchQuery = '';
  const LIST_PAGE_SIZE = 40;
  const FONT_STEPS = ['xs', 'small', 'medium', 'large', 'xl'];
  const FONT_CLASS_NAMES = FONT_STEPS.map(s => 'font-' + s);

  const ASSOC_LABEL = {
    '김대웅': '김대웅 전도사',
    '문희정': '문희정 전도사',
    '이임목사': '이임 목사'
  };
  const assocLabel = id => ASSOC_LABEL[id] || id;
  const BAEK_LABEL = '백용현 담임목사';
  const THEME_DISCLAIMER = '<p class="list-disclaimer">(A.I가 주제를 정했으며 정확하지 않을 수 있습니다.)</p>';

  const VIEW_TITLES = {
    'baek-hub': '백용현 담임목사',
    'baek-bible': '성경별',
    'baek-theme': '주제별',
    'baek-worship': '정기 예배',
    'prayer-hub': '기도사역말씀',
    'associate-hub': '부사역자',
    'events-hub': '주제·행사',
    'praise-hub': '찬양',
    'misc-unclassified': '미분류 영상',
    'testimony': '간증',
    'worship-regular': '정기 예배',
    'unclassified': '분류되지 않은 영상'
  };

  async function init() {
    initDark();
    const saved = localStorage.getItem('hanbit-font');
    document.getElementById('screen-loading')?.classList.add('active');
    try {
      await Store.load();
    } catch (e) {
      console.error(e);
      UI.toast('데이터 로드 실패: ' + (e.message || '확인 필요'));
      try { UI.applyHomeText(); } catch (_) {}
    }
    document.getElementById('screen-loading')?.classList.remove('active');
    if (saved) {
      applyFont(saved);
      navReplace({ s: 'home' });
    } else {
      navReplace({ s: 'font' });
    }
    window.addEventListener('popstate', (e) => {
      const st = e.state || { s: 'home' };
      state = st;
      navRender(st);
    });
  }

  function go(screen) { navPush({ s: screen }); }

  function nav(st) { navPush(st); }

  function navPush(st) {
    state = { s: st.s, ...st };
    history.pushState(state, '', '');
    navRender(state);
  }

  function navReplace(st) {
    state = st;
    history.replaceState(state, '', '');
    navRender(state);
  }

  function showScreen(name) {
    document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
    const el = document.getElementById('screen-' + name);
    if (el) el.classList.add('active');
  }

  function syncAppToolbar(st) {
    const el = document.getElementById('app-toolbar');
    const show = !!(st?.s && st.s !== 'home' && st.s !== 'font' && st.s !== 'loading');
    if (el) el.hidden = !show;
    document.body.classList.toggle('app-toolbar-visible', show);
  }

  function goHome() {
    navReplace({ s: 'home' });
  }

  function navRender(st) {
    state = st;
    showScreen(st.s);
    syncAppToolbar(st);
    UI.applyHomeText();
    syncAdminScreenClasses();

    if (st.s === 'home') renderHome();
    else if (st.s === 'list') renderList(st);
    else if (st.s === 'search') renderSearch(document.getElementById('search-input')?.value || '');
    else if (st.s === 'admin-login') prepareAdminLogin();
    else if (st.s === 'admin' && Admin.isIn()) {
      Admin.renderDashboard(document.getElementById('admin-content'), st.adminTab || 'home');
    } else if (st.s === 'settings') renderSettings();
  }

  function syncAdminScreenClasses() {
    const on = Admin.isIn();
    ['screen-list', 'screen-search', 'screen-admin'].forEach(id => {
      document.getElementById(id)?.classList.toggle('is-admin', on);
    });
  }

  function renderHome() {
    UI.applyHomeText();
    UI.renderHomeMenus();
    syncAdminScreenClasses();
    syncHomeFontBtns();
    const badge = document.getElementById('admin-home-badge');
    if (badge) badge.hidden = !Admin.isIn();
  }

  function renderSettings() {
    const el = document.getElementById('settings-content');
    if (!el) return;
    const adminBlock = Admin.isIn()
      ? `<p class="adm-hint" style="padding:0 1rem;margin-bottom:0.5rem">관리자 모드 · 목록에서 선택·이동·순서 편집 가능</p>
         <button class="btn btn-outline" style="margin:0.5rem 1rem" onclick="Admin.openAdmin()">관리자 설정</button>
         <button class="btn btn-outline" style="margin:0.5rem 1rem" onclick="Admin.logout()">로그아웃</button>`
      : `<button class="btn btn-outline" style="margin:0.5rem 1rem" onclick="App.openAdminLogin()">관리자 로그인</button>`;
    el.innerHTML = `
      <div class="section-label">관리자</div>
      ${adminBlock}
      ${typeof Pwa !== 'undefined' && !Pwa.isStandalone() ? `
      <div class="section-label">앱 설치</div>
      <p class="adm-hint" style="padding:0 1rem">홈 화면에 추가하면 앱처럼 사용할 수 있습니다.</p>
      <button class="btn btn-primary" style="margin:0.5rem 1rem" onclick="Pwa.install()">홈 화면에 추가</button>
      ` : ''}
    `;
  }

  const PRAYER_YEAR_SERIES = ['prayer-conference', '50day-school', '24h-prayer', '100year-prayer', 'youth-camp', 'pastor-seminar'];

  function backBtn(st, label = '← 뒤로') {
    const json = JSON.stringify(st).replace(/'/g, '&#39;');
    return `<button class="sub-nav-btn" data-nav='${json}' onclick="App.nav(JSON.parse(this.dataset.nav))">${label}</button>`;
  }

  function showCardHub(titleEl, subEl, content, title, cards, subExtra = '') {
    hideListFolderSearch();
    titleEl.textContent = title;
    subEl.innerHTML = subExtra;
    content.innerHTML = UI.renderNavCards(cards);
  }

  function hideListFolderSearch() {
    const wrap = document.getElementById('list-folder-search-wrap');
    if (wrap) wrap.hidden = true;
  }

  function syncListFolderSearch(st) {
    const wrap = document.getElementById('list-folder-search-wrap');
    const inp = document.getElementById('list-folder-search');
    if (!wrap || !inp) return;
    const key = Store.getListOrderKey(st);
    if (listFilterKey !== key) {
      listFolderQuery = '';
      listFilterKey = key;
    }
    wrap.hidden = false;
    if (inp.value !== listFolderQuery) inp.value = listFolderQuery;
  }

  function filterListFolder(q) {
    listFolderQuery = q;
    if (state.s === 'list') renderList(state);
  }

  function yearHubCards(view, sub, all, getYear) {
    const years = [...new Set(all.map(getYear).filter(Boolean))].sort((a, b) => b.localeCompare(a));
    return years.map(y => {
      const yearVideos = all.filter(v => getYear(v) === y);
      return {
        nav: { s: 'list', view, sub, year: y },
        icon: '📅',
        title: `${y}년`,
        sub: '날짜순',
        count: Store.countVideos(yearVideos)
      };
    });
  }

  function prayerYearCards(sub, all, getYear) {
    return yearHubCards('prayer', sub, all, getYear);
  }

  function worshipYearCards(view, worshipSub, all) {
    return yearHubCards(view, worshipSub, all, v => Store.worshipYear(v));
  }

  function renderWorshipByYear(st, titleEl, subEl, content, opts) {
    const w = st.sub || '새벽기도회';
    if (!Store.BAEK_WORSHIPS.includes(w)) return null;
    const all = Store.byBaekView('worship', w);
    const title = `${opts.titlePrefix} · ${w}`;
    if (!st.year) {
      showCardHub(titleEl, subEl, content, title,
        worshipYearCards(st.view, w, all),
        opts.backBar || '');
      return { done: true };
    }
    return {
      done: false,
      w,
      title: `${title} · ${st.year}년`,
      videos: sortByDateDesc(all.filter(v => Store.worshipYear(v) === st.year).slice()),
      subHtml: backBtn({ s: 'list', view: st.view, sub: w }, '← 연도') + (opts.backBar || '')
    };
  }

  function associateNavBase(st) {
    const base = { s: 'list', view: 'associate', sub: st.sub };
    if (st.imSpeaker) base.imSpeaker = st.imSpeaker;
    return base;
  }

  function testamentHubCards(base, pool) {
    return [
      { nav: { ...base, testament: '구약' }, icon: '📜', title: '구약', sub: '구약성경 설교',
        count: Store.countVideos(Store.filterByTestament(pool, '구약')) },
      { nav: { ...base, testament: '신약' }, icon: '📖', title: '신약', sub: '신약성경 설교',
        count: Store.countVideos(Store.filterByTestament(pool, '신약')) }
    ];
  }

  function sortScriptureVideos(list) {
    list.sort((a, b) => {
      if (a.bookOrder !== b.bookOrder) return a.bookOrder - b.bookOrder;
      if ((a.chapter || 0) !== (b.chapter || 0)) return (a.chapter || 0) - (b.chapter || 0);
      return (a.date || a.uploadedAt || '').localeCompare(b.date || b.uploadedAt || '');
    });
    return list;
  }

  function sortByDateDesc(list) {
    list.sort((a, b) =>
      (b.date || b.uploadedAt || '').localeCompare(a.date || a.uploadedAt || '')
    );
    return list;
  }

  const WORSHIP_HUB_ITEMS = [
    { sub: '새벽기도회', icon: '🌅' },
    { sub: '저녁기도회', icon: '🌙' },
    { sub: '주일예배', icon: '✝️' },
    { sub: '수요저녁예배', icon: '📖' }
  ];

  function worshipHubCards(listView, subLabel) {
    return WORSHIP_HUB_ITEMS.map(({ sub, icon }) => ({
      nav: { s: 'list', view: listView, sub },
      icon,
      title: sub,
      sub: '연도별 · 날짜순',
      count: Store.countVideos(Store.byBaekView('worship', sub))
    }));
  }

  function countBaekHubItem(itemId) {
    if (itemId === 'bible') {
      return Store.countVideos(Store.baekRegular().filter(v => v.book));
    }
    if (itemId === 'theme') {
      return Store.countVideos(Store.baekRegular().filter(v => v.themes?.length));
    }
    const preset = BAEK_HUB_PRESETS[itemId];
    const w = preset?.nav?.sub;
    if (w) return Store.countVideos(Store.byBaekView('worship', w));
    return 0;
  }

  function visibleSubCards(group, cards, getId) {
    return cards.filter(c => !Store.isSubMenuHidden(group, getId(c)));
  }

  const BAEK_HUB_PRESETS = {
    bible: { nav: { s: 'list', view: 'baek-bible', sub: '' }, icon: '📜', sub: '구약 · 신약 순' },
    theme: { nav: { s: 'list', view: 'baek-theme', sub: '' }, icon: '🎯', sub: '말씀 주제' },
    'worship-dawn': { nav: { s: 'list', view: 'baek-worship', sub: '새벽기도회' }, icon: '🌅', sub: '연도별 · 날짜순' },
    'worship-evening': { nav: { s: 'list', view: 'baek-worship', sub: '저녁기도회' }, icon: '🌙', sub: '연도별 · 날짜순' },
    'worship-sunday': { nav: { s: 'list', view: 'baek-worship', sub: '주일예배' }, icon: '✝️', sub: '연도별 · 날짜순' },
    'worship-wed': { nav: { s: 'list', view: 'baek-worship', sub: '수요저녁예배' }, icon: '📖', sub: '연도별 · 날짜순' }
  };

  const EVENTS_HUB_PRESETS = {
    'outreach-sendoff': { icon: '🚀' },
    'outreach-report': { icon: '📋' },
    seminar: { icon: '📚' },
    revival: { icon: '🔥' },
    'pastor-conference': { icon: '🎤' },
    promo: { icon: '📢' }
  };

  const PRAISE_HUB_PRESETS = {
    sharon: { icon: '🎵' },
    hallelujah: { icon: '🎵' },
    festival: { icon: '🎼' }
  };

  function hubCardsFromSubMenus(group, listView, presets = {}, defaultIcon = '📂', countFn) {
    return Store.getSubMenuItems(group).map(item => {
      const preset = presets[item.id] || {};
      const nav = preset.nav || { s: 'list', view: listView, sub: item.id };
      let count;
      if (typeof countFn === 'function') count = countFn(item.id, nav, preset);
      else if (group === 'events') count = Store.countVideos(Store.events(item.id));
      else if (group === 'praise') count = Store.countVideos(Store.praise(item.id));
      else if (group === 'prayer') count = Store.countVideos(Store.prayerMinistry(item.id));
      return {
        nav,
        icon: preset.icon || Store.suggestSubMenuIcon(item.label, item.id, defaultIcon),
        title: item.label,
        sub: preset.sub || '',
        subId: item.id,
        count
      };
    });
  }

  const BAEK_HUB_CARDS = () => visibleSubCards('baek', hubCardsFromSubMenus('baek', 'baek-hub', BAEK_HUB_PRESETS, '📂', id => countBaekHubItem(id)), c => c.subId);

  function renderList(st, options = {}) {
    renderListAsync(st, options).catch(e => {
      console.error(e);
      UI.toast('목록 로드 실패');
    });
  }

  async function renderListAsync(st, options = {}) {
    listCtx = st;
    syncAdminScreenClasses();
    const titleEl = document.getElementById('list-title');
    const subEl = document.getElementById('list-subnav');
    const content = document.getElementById('list-content');
    const adminIm = st.adminIm && Admin.isIn();
    const adminMode = Admin.isIn();

    if (st.view && !Store.isListHubState(st) && !Store.isViewReady(st.view)) {
      titleEl.textContent = VIEW_TITLES[st.view] || '목록';
      subEl.innerHTML = '';
      content.innerHTML = '<div class="loading"><div class="spinner"></div>영상 불러오는 중…</div>';
      hideListFolderSearch();
      await Store.ensureViewReady(st.view);
    }

    if (!options.keepPage) listRenderPage = 1;
    let videos = [];
    let title = VIEW_TITLES[st.view] || '';
    let subHtml = '';
    let folderCount = 0;

    if (st.view === 'baek-hub') {
      showCardHub(titleEl, subEl, content, title, BAEK_HUB_CARDS(), pdfBtn());
      return;
    }

    if (st.view === 'baek-bible') {
      title = '성경별';
      if (!st.sub) {
        showCardHub(titleEl, subEl, content, `${BAEK_LABEL} · 성경별`, [
          { nav: { s: 'list', view: 'baek-bible', sub: '구약' }, icon: '📜', title: '구약', sub: '구약성경 설교',
            count: Store.countVideos(Store.byBaekView('bible', '', '구약')) },
          { nav: { s: 'list', view: 'baek-bible', sub: '신약' }, icon: '📖', title: '신약', sub: '신약성경 설교',
            count: Store.countVideos(Store.byBaekView('bible', '', '신약')) }
        ], backBtn({ s: 'list', view: 'baek-hub' }) + pdfBtn());
        return;
      }
      if (st.sub === '구약' || st.sub === '신약') {
        const set = new Set(st.sub === '구약' ? Store.OT_BOOKS : Store.NT_BOOKS);
        const books = Store.db().bibleBooks.filter(b => set.has(b)).map(b => ({
          nav: { s: 'list', view: 'baek-bible', sub: b, testament: st.sub },
          icon: '📖',
          title: b,
          sub: '성경별 설교',
          count: Store.countVideos(Store.byBaekView('bible', b, st.sub))
        }));
        showCardHub(titleEl, subEl, content, `${BAEK_LABEL} · 성경별 · ${st.sub}`, books,
          backBtn({ s: 'list', view: 'baek-bible', sub: '' }, '← 성경') + backBtn({ s: 'list', view: 'baek-hub' }, '← 백용현') + pdfBtn());
        return;
      }
      title = `${BAEK_LABEL} · ${st.sub}`;
      videos = sortScriptureVideos(Store.byBaekView('bible', st.sub, st.testament).slice());
      const tBack = st.testament
        ? backBtn({ s: 'list', view: 'baek-bible', sub: st.testament }, `← ${st.testament}`)
        : backBtn({ s: 'list', view: 'baek-bible', sub: '' }, '← 성경');
      subHtml = tBack + backBtn({ s: 'list', view: 'baek-hub' }, '← 백용현');
    } else if (st.view === 'baek-theme') {
      if (!st.sub) {
        const themes = Store.db().themes.map(t => ({
          nav: { s: 'list', view: 'baek-theme', sub: t },
          icon: '🎯',
          title: t,
          sub: '주제별 설교',
          count: Store.countVideos(Store.byBaekView('theme', t))
        }));
        showCardHub(titleEl, subEl, content, `${BAEK_LABEL} · 주제별`, themes,
          backBtn({ s: 'list', view: 'baek-hub' }) + THEME_DISCLAIMER + pdfBtn());
        return;
      }
      title = `${BAEK_LABEL} · ${st.sub}`;
      videos = sortByDateDesc(Store.byBaekView('theme', st.sub).slice());
      subHtml = backBtn({ s: 'list', view: 'baek-theme', sub: '' }, '← 주제') + backBtn({ s: 'list', view: 'baek-hub' }, '← 백용현') + THEME_DISCLAIMER;
    } else if (st.view === 'baek-worship') {
      const flow = renderWorshipByYear(st, titleEl, subEl, content, {
        titlePrefix: BAEK_LABEL,
        backBar: backBtn({ s: 'list', view: 'baek-hub' }, '← 백용현')
      });
      if (flow?.done) return;
      if (flow) {
        title = flow.title;
        videos = flow.videos;
        subHtml = flow.subHtml;
      }
    } else if (st.view === 'worship-regular') {
      if (!st.sub) {
        showCardHub(titleEl, subEl, content, '정기 예배', worshipHubCards('worship-regular', '백용현 담임목사'));
        return;
      }
      const flow = renderWorshipByYear(st, titleEl, subEl, content, {
        titlePrefix: '정기 예배',
        backBar: backBtn({ s: 'list', view: 'worship-regular' }, '← 정기 예배')
      });
      if (flow?.done) return;
      if (flow) {
        title = flow.title;
        videos = flow.videos;
        subHtml = flow.subHtml;
      }
    } else if (st.view === 'prayer-hub') {
      if (!st.sub || !Store.PRAYER_LABELS[st.sub]) {
        const cards = Store.getSubMenuItems('prayer')
          .filter(item => !Store.isSubMenuHidden('prayer', item.id))
          .map(item => ({
          nav: { s: 'list', view: 'prayer', sub: item.id },
          icon: '🙏',
          title: item.label,
          sub: PRAYER_YEAR_SERIES.includes(item.id) ? '연도별 · 날짜순' : '목록',
          count: Store.countVideos(Store.prayerMinistry(item.id))
        }));
        showCardHub(titleEl, subEl, content, '기도사역말씀', cards);
        return;
      }
      st = { ...st, view: 'prayer' };
    }

    if (st.view === 'prayer') {
      if (Store.isSubMenuHidden('prayer', st.sub)) {
        showCardHub(titleEl, subEl, content, '기도사역말씀', [], backBtn({ s: 'list', view: 'prayer-hub' }, '← 기도사역'));
        return;
      }
      title = Store.getSubMenuLabel('prayer', st.sub, Store.PRAYER_LABELS[st.sub] || st.sub);
      const all = Store.prayerMinistry(st.sub);
      const getYear = v => Store.prayerYear(v);

      if (PRAYER_YEAR_SERIES.includes(st.sub) && !st.year) {
        showCardHub(
          titleEl, subEl, content, title,
          prayerYearCards(st.sub, all, getYear),
          backBtn({ s: 'list', view: 'prayer-hub' }, '← 기도사역')
        );
        return;
      }

      videos = PRAYER_YEAR_SERIES.includes(st.sub) && st.year
        ? all.filter(v => getYear(v) === st.year)
        : all;

      if (PRAYER_YEAR_SERIES.includes(st.sub) && st.year) {
        videos.sort((a, b) => {
          const da = a.date || a.uploadedAt || '';
          const db = b.date || b.uploadedAt || '';
          return da.localeCompare(db);
        });
        title = `${title} · ${st.year}년`;
        subHtml = backBtn({ s: 'list', view: 'prayer', sub: st.sub }, '← 연도') + backBtn({ s: 'list', view: 'prayer-hub' }, '← 기도사역');
      } else {
        videos.sort((a, b) => {
          const la = a.seriesMeta?.lecture || '', lb = b.seriesMeta?.lecture || '';
          if (la && lb) return parseInt(la, 10) - parseInt(lb, 10);
          return (a.date || a.uploadedAt || '').localeCompare(b.date || b.uploadedAt || '');
        });
        subHtml = backBtn({ s: 'list', view: 'prayer-hub' }, '← 기도사역');
      }
    } else if (st.view === 'associate-hub') {
      showCardHub(titleEl, subEl, content, '부사역자', Store.getAssociatesList()
        .filter(a => !Store.isSubMenuHidden('associate', a.id))
        .map(a => ({
          nav: { s: 'list', view: 'associate', sub: a.id },
          icon: '👤',
          title: a.label,
          sub: a.id === '이임목사' ? '이름별 · 구약/신약' : '구약 · 신약',
          count: Store.countVideos(Store.associates(a.id))
        })));
      return;
    } else if (st.view === 'associate') {
      if (Store.isSubMenuHidden('associate', st.sub)) {
        showCardHub(titleEl, subEl, content, '부사역자', [], backBtn({ s: 'list', view: 'associate-hub' }, '← 부사역자'));
        return;
      }
      if (st.sub === '이임목사' && !st.imSpeaker) {
        const showHidden = Admin.isIn();
        const all = Store.associates('이임목사', showHidden);
        const groups = new Map();
        all.forEach(v => {
          const key = Store.canonicalSpeakerKey(v.speaker, v.title);
          const label = Store.canonicalSpeakerLabel(v.speaker, v.title);
          if (!groups.has(key)) groups.set(key, { label, count: 0, hidden: Store.isImSpeakerHidden(key) });
          groups.get(key).count += 1;
        });
        const cards = [...groups.entries()]
          .sort((a, b) => a[1].label.localeCompare(b[1].label, 'ko'))
          .map(([key, g]) => ({
            nav: { s: 'list', view: 'associate', sub: '이임목사', imSpeaker: key },
            icon: g.hidden ? '🚫' : '👤',
            title: g.label + (showHidden && g.hidden ? ' (숨김)' : ''),
            sub: '구약 · 신약',
            count: Store.countVideos(all.filter(v => Store.canonicalSpeakerKey(v.speaker, v.title) === key))
          }));
        showCardHub(titleEl, subEl, content, '이임 목사', cards, backBtn({ s: 'list', view: 'associate-hub' }, '← 부사역자'));
        return;
      }

      const base = associateNavBase(st);
      let pool = Store.associates(st.sub, Admin.isIn());

      if (st.sub === '이임목사' && st.imSpeaker) {
        if (!Admin.isIn() && Store.isImSpeakerHidden(st.imSpeaker)) {
          showCardHub(titleEl, subEl, content, '이임 목사', [], backBtn({ s: 'list', view: 'associate', sub: '이임목사' }, '← 이름'));
          return;
        }
        pool = pool.filter(v => Store.canonicalSpeakerKey(v.speaker, v.title) === st.imSpeaker);
        title = `이임 목사 · ${Store.speakerLabelFromKey(st.imSpeaker)}`;
      } else {
        title = assocLabel(st.sub) || '부사역자';
      }

      if (!st.testament) {
        showCardHub(titleEl, subEl, content, title, testamentHubCards(base, pool),
          (st.sub === '이임목사' && st.imSpeaker
            ? backBtn({ s: 'list', view: 'associate', sub: '이임목사' }, '← 이름')
            : '') +
          backBtn({ s: 'list', view: 'associate-hub' }, '← 부사역자'));
        return;
      }

      videos = sortScriptureVideos(Store.filterByTestament(pool, st.testament));
      title = `${title} · ${st.testament}`;
      subHtml = backBtn({ ...base, testament: undefined }, '← 구약/신약') +
        (st.sub === '이임목사' && st.imSpeaker
          ? backBtn({ s: 'list', view: 'associate', sub: '이임목사', imSpeaker: st.imSpeaker }, '← 이름')
          : '') +
        backBtn({ s: 'list', view: 'associate-hub' }, '← 부사역자');
    } else if (st.view === 'events-hub') {
      showCardHub(titleEl, subEl, content, '주제·행사',
        visibleSubCards('events', hubCardsFromSubMenus('events', 'events', EVENTS_HUB_PRESETS), c => c.subId));
      return;
    } else if (st.view === 'events') {
      if (Store.isSubMenuHidden('events', st.sub)) {
        showCardHub(titleEl, subEl, content, '주제·행사', [], backBtn({ s: 'list', view: 'events-hub' }, '← 주제·행사'));
        return;
      }
      title = Store.getSubMenuLabel('events', st.sub, st.sub);
      videos = Store.events(st.sub);
      subHtml = backBtn({ s: 'list', view: 'events-hub' }, '← 주제·행사');
    } else if (st.view === 'praise-hub') {
      showCardHub(titleEl, subEl, content, '찬양',
        visibleSubCards('praise', hubCardsFromSubMenus('praise', 'praise', PRAISE_HUB_PRESETS, '🎵'), c => c.subId));
      return;
    } else if (st.view === 'praise') {
      if (Store.isSubMenuHidden('praise', st.sub)) {
        showCardHub(titleEl, subEl, content, '찬양', [], backBtn({ s: 'list', view: 'praise-hub' }, '← 찬양'));
        return;
      }
      title = Store.getSubMenuLabel('praise', st.sub, st.sub);
      videos = Store.praise(st.sub);
      subHtml = backBtn({ s: 'list', view: 'praise-hub' }, '← 찬양');
    } else if (st.view === 'testimony') {
      title = '간증';
      videos = Store.testimony();
      subHtml = backBtn({ s: 'home' }, '← 홈');
    } else if (st.view === 'misc-unclassified') {
      title = '미분류 영상';
      const all = Store.miscUnclassifiedVideos();
      if (!st.year) {
        showCardHub(titleEl, subEl, content, title,
          yearHubCards('misc-unclassified', '', all, v => Store.youtubeYear(v)),
          backBtn({ s: 'home' }, '← 홈'));
        return;
      }
      videos = sortByDateDesc(all.filter(v => Store.youtubeYear(v) === st.year).slice());
      title = `${title} · ${st.year}년`;
      subHtml = backBtn({ s: 'list', view: 'misc-unclassified' }, '← 연도') + backBtn({ s: 'home' }, '← 홈');
    } else if (st.view === 'unclassified') {
      if (!Admin.isIn()) {
        navReplace({ s: 'home' });
        return;
      }
      title = '분류되지 않은 영상';
      videos = Store.unclassifiedVideos();
      videos.sort((a, b) => (a.date || a.uploadedAt || '').localeCompare(b.date || b.uploadedAt || ''));
      subHtml = backBtn({ s: 'home' }, '← 홈');
    }

    folderCount = Store.countVideos(videos);
    titleEl.textContent = `${title} (${folderCount})`;
    syncListFolderSearch(st);
    const orderKey = Store.getListOrderKey(st);
    videos = Store.applyListOrder(videos, orderKey);
    const folderQuery = listFolderQuery.trim();
    if (folderQuery) videos = Store.filterVideosByQuery(videos, folderQuery);
    listVideos = videos;
    const adminSort = Admin.isIn() && Admin.isSortMode?.();
    const flatOpts = st.view === 'unclassified'
      ? { adminSort, showIssue: true, adminMeta: true, page: listRenderPage, pageSize: LIST_PAGE_SIZE }
      : { adminSort, page: listRenderPage, pageSize: LIST_PAGE_SIZE };
    subEl.innerHTML = (subHtml || '') + listAdminBar(st, videos) + (videos.length ? pdfBtn() : '');

    content.innerHTML = videos.length
      ? UI.renderFlat(videos, adminIm, adminMode, flatOpts)
      : `<div class="no-data">${folderQuery ? '검색 결과가 없습니다.' : '영상이 없습니다.'}</div>`;
    if (Admin.isIn() && adminSort && orderKey) Admin.initListSort(orderKey);
  }

  function loadMoreList() {
    if (!listCtx || !listVideos.length) return;
    const totalPages = Math.ceil(listVideos.length / LIST_PAGE_SIZE);
    if (listRenderPage >= totalPages) return;
    listRenderPage += 1;
    if (listCtx.s === 'search') {
      const q = listCtx.query || document.getElementById('search-input')?.value || '';
      renderSearch(q, { keepPage: true });
    } else if (listCtx.s === 'admin-search') {
      renderAdminVideoSearch(listCtx.query, null, { keepPage: true });
    } else {
      renderList(listCtx, { keepPage: true });
    }
  }

  function refreshHomeCounts() {
    if (state.s === 'home') renderHome();
  }

  function onShardsReady() {
    if (state.s === 'home') renderHome();
    else if (state.s === 'list') renderList(state);
  }

  function listAdminBar(st, videos) {
    if (!Admin.isIn() || Store.isListHubState(st) || !videos.length) return '';
    return selectionAdminBar(videos, true);
  }

  function selectionAdminBar(videos, showSort = true) {
    if (!Admin.isIn() || !videos.length) return '';
    const sel = Admin.getSelectionCount();
    const allChecked = videos.every(v => Admin.isSelected(v.id));
    const sortOn = showSort && Admin.isSortMode?.();
    return `<span class="adm-sel-bar">
      <label class="adm-sel-all"><input type="checkbox" ${allChecked ? 'checked' : ''} onchange="Admin.toggleSelectAll(this.checked)"> 전체</label>
      <span class="adm-sel-count">${sel}편 선택</span>
      <button type="button" class="sub-nav-btn" onclick="Admin.clearSelection()">해제</button>
      <button type="button" class="sub-nav-btn adm-move-selected" onclick="Admin.openBulkSelected()" ${sel ? '' : 'disabled'}>선택 이동</button>
      ${showSort ? `<button type="button" class="sub-nav-btn" onclick="Admin.openBulkFromList()">폴더 전체</button>
      <button type="button" class="sub-nav-btn${sortOn ? ' is-active' : ''}" onclick="Admin.toggleSortMode()">${sortOn ? '순서 편집 중' : '순서 편집'}</button>
      ${sortOn ? '<button type="button" class="sub-nav-btn" onclick="Admin.resetListOrder()">기본 순서</button>' : ''}` : ''}
    </span>`;
  }

  function getListState() {
    return listCtx ? { ...listCtx } : null;
  }

  function getListVideoIds() {
    return listVideos.map(v => v.id);
  }

  function setSelectionPool(videos) {
    listVideos = Array.isArray(videos) ? videos : [];
  }

  function clearPagedList() {
    listCtx = null;
    listVideos = [];
    listRenderPage = 1;
    lastSearchQuery = '';
  }

  function updateSelectionUi() {
    const sel = Admin.getSelectionCount();
    const countEl = document.querySelector('.adm-sel-count');
    if (countEl) countEl.textContent = `${sel}편 선택`;
    const moveBtn = document.querySelector('.adm-move-selected');
    if (moveBtn) moveBtn.disabled = !sel;
    Admin.refreshBulkMoveCount?.();
  }

  function pdfBtn() {
    if (!Admin.isIn()) return '';
    return `<button class="sub-nav-btn" onclick="App.exportPdf()">PDF</button>`;
  }

  function exportPdf() {
    if (!Admin.isIn()) { UI.toast('관리자만 PDF 출력 가능'); return; }
    window.print();
  }

  function doSearch(q) {
    navPush({ s: 'search' });
    setTimeout(() => {
      const inp = document.getElementById('search-input');
      if (inp) { inp.value = q || ''; renderSearch(q || ''); }
    }, 0);
  }

  function searchResultCountHtml(count) {
    if (!count) return '';
    return `<p class="search-result-count">검색 결과 <strong>${count}</strong>편</p>`;
  }

  function renderSearch(q, options = {}) {
    renderSearchAsync(q, options).catch(e => console.error(e));
  }

  async function renderSearchAsync(q, options = {}) {
    syncAdminScreenClasses();
    const el = document.getElementById('search-results');
    const barEl = document.getElementById('search-admin-bar');
    if (!el) return;
    const query = (q || '').trim();
    if (!query) {
      listCtx = null;
      listVideos = [];
      lastSearchQuery = '';
      listRenderPage = 1;
      if (barEl) { barEl.hidden = true; barEl.innerHTML = ''; }
      el.innerHTML = '<div class="no-data">검색어를 입력하세요.</div>';
      return;
    }
    if (!options.keepPage) listRenderPage = 1;

    let r;
    if (options.keepPage && query === lastSearchQuery && listVideos.length) {
      r = listVideos;
    } else {
      el.innerHTML = '<div class="loading"><div class="spinner"></div>검색 중…</div>';
      r = await Store.search(query);
      lastSearchQuery = query;
    }

    const adminMode = Admin.isIn();
    listCtx = { s: 'search', view: 'search', query };
    listVideos = r;
    const bar = adminMode ? selectionAdminBar(r, false) : '';
    if (barEl) {
      barEl.hidden = !bar;
      barEl.innerHTML = bar || '';
    }
    const flatOpts = adminMode
      ? { adminSelect: true, adminMeta: true, page: listRenderPage, pageSize: LIST_PAGE_SIZE }
      : { page: listRenderPage, pageSize: LIST_PAGE_SIZE };
    el.innerHTML = r.length
      ? searchResultCountHtml(r.length) + UI.renderFlat(r, false, adminMode, flatOpts)
      : '<div class="no-data">검색 결과가 없습니다.</div>';
  }

  function renderAdminVideoSearch(q, videos, options = {}) {
    const el = document.getElementById('adm-video-results');
    if (!el) return;
    if (!options.keepPage) listRenderPage = 1;
    if (videos) {
      listCtx = { s: 'admin-search', query: (q || '').trim() };
      listVideos = videos;
    }
    if (!listVideos.length) {
      listCtx = null;
      el.innerHTML = '<div class="no-data">검색 결과가 없습니다.</div>';
      return;
    }
    const bar = selectionAdminBar(listVideos, false);
    el.innerHTML = bar + searchResultCountHtml(listVideos.length) + UI.renderFlat(listVideos, false, true, {
      adminSelect: true,
      adminMeta: true,
      page: listRenderPage,
      pageSize: LIST_PAGE_SIZE
    });
  }

  function normalizeFontStep(sz) {
    if (FONT_STEPS.includes(sz)) return sz;
    return 'medium';
  }

  function currentFontStep() {
    return normalizeFontStep(localStorage.getItem('hanbit-font') || 'medium');
  }

  function syncHomeFontBtns() {
    const down = document.getElementById('font-step-down');
    const up = document.getElementById('font-step-up');
    const idx = FONT_STEPS.indexOf(currentFontStep());
    if (down) down.disabled = idx <= 0;
    if (up) up.disabled = idx >= FONT_STEPS.length - 1;
  }

  function pickFont(sz) {
    const step = normalizeFontStep(sz);
    document.querySelectorAll('.font-opt').forEach(el => el.classList.toggle('sel', el.dataset.sz === step));
    document.body.classList.remove(...FONT_CLASS_NAMES);
    document.body.classList.add('font-' + step);
  }

  function applyFont(sz) {
    const step = normalizeFontStep(sz);
    document.body.classList.remove(...FONT_CLASS_NAMES);
    document.body.classList.add('font-' + step);
    localStorage.setItem('hanbit-font', step);
    pickFont(step);
    syncHomeFontBtns();
  }

  function fontStepDown() {
    const idx = FONT_STEPS.indexOf(currentFontStep());
    if (idx > 0) applyFont(FONT_STEPS[idx - 1]);
  }

  function fontStepUp() {
    const idx = FONT_STEPS.indexOf(currentFontStep());
    if (idx < FONT_STEPS.length - 1) applyFont(FONT_STEPS[idx + 1]);
  }

  function startApp() {
    const sel = document.querySelector('.font-opt.sel');
    applyFont(sel ? sel.dataset.sz : 'medium');
    go('home');
  }

  function initDark() {
    if (localStorage.getItem('hanbit-dark') === '1') document.documentElement.classList.add('dark');
  }

  function toggleDark() {
    document.documentElement.classList.toggle('dark');
    localStorage.setItem('hanbit-dark', document.documentElement.classList.contains('dark') ? '1' : '0');
  }

  async function openVideo(id) {
    if (!Store.getVideo(id) && !Store.areAllShardsReady()) {
      await Store.prefetchAllShards();
    }
    const v = Store.getVideo(id);
    if (!v) return;
    Store.recordRecent(v);
    window.open(v.url, '_blank', 'noopener');
  }

  async function shareVideo(id) {
    const v = Store.db().videos.find(x => x.id === id);
    if (!v) return;
    const text = `${v.displayTitle}\n${v.url}`;
    if (navigator.share) {
      try { await navigator.share({ title: v.displayTitle, url: v.url }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    try { await navigator.clipboard.writeText(text); UI.toast('링크 복사됨'); }
    catch { prompt('링크:', v.url); }
  }

  function toggleFav(id, btn) {
    const on = Store.toggleFav(id);
    if (btn) btn.textContent = on ? '★' : '☆';
  }

  function openAdminLogin() {
    go('admin-login');
  }

  function finishLoginRedirect(openAdminAfter) {
    if (openAdminAfter) {
      Admin.openAdmin();
      return;
    }
    try { sessionStorage.removeItem('hanbit-return-after-login'); } catch { /* ignore */ }
    navReplace({ s: 'home' });
  }

  function prepareAdminLogin() {
    const emailEl = document.getElementById('admin-email');
    if (emailEl && !emailEl.value && typeof Firebase !== 'undefined') {
      emailEl.value = Firebase.adminEmail() || '';
    }
    const err = document.getElementById('login-err');
    if (err) err.style.display = 'none';
    const pwEl = document.getElementById('admin-pw');
    if (emailEl && pwEl) {
      if (emailEl.value.trim()) pwEl.focus();
      else emailEl.focus();
    }
  }

  function doLogin(openAdminAfter) {
    const email = document.getElementById('admin-email')?.value;
    const pw = document.getElementById('admin-pw')?.value;
    Admin.login(email, pw).then(ok => {
      if (ok) {
        UI.toast(openAdminAfter ? '관리자 설정으로 이동합니다' : '관리자 로그인됨 · 목록에서 편집하세요');
        finishLoginRedirect(!!openAdminAfter);
      } else {
        const err = document.getElementById('login-err');
        if (err) {
          err.style.display = 'block';
          err.textContent = '이메일 또는 비밀번호가 올바르지 않습니다.';
        }
      }
    });
  }

  function refreshList() {
    if (state.s === 'list') renderList(state);
    else if (state.s === 'search') renderSearch(document.getElementById('search-input')?.value || '');
  }

  function onAdminLogout() {
    if (state.s === 'admin' || state.s === 'admin-login') {
      navReplace({ s: 'home' });
      return;
    }
    if (state.s === 'list' && state.view === 'unclassified') {
      navReplace({ s: 'home' });
      return;
    }
    if (state.s === 'list') renderList(state);
    else if (state.s === 'home') renderHome();
    else if (state.s === 'settings') renderSettings();
    else if (state.s === 'search') renderSearch(document.getElementById('search-input')?.value || '');
    else navRender(state);
  }

  return {
    init, go, goHome, nav, navPush, pickFont, applyFont, fontStepDown, fontStepUp, startApp, toggleDark,
    openVideo, shareVideo, toggleFav, doLogin, openAdminLogin, finishLoginRedirect, prepareAdminLogin, exportPdf, doSearch, renderSearch, renderAdminVideoSearch, refreshList, getListState, getListVideoIds, updateSelectionUi, renderSettings, onAdminLogout, onShardsReady, refreshHomeCounts, loadMoreList, selectionAdminBar, setSelectionPool, clearPagedList, filterListFolder
  };
})();

document.addEventListener('DOMContentLoaded', () => App.init());
