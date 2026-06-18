const UI = (() => {
  function esc(s) {
    return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
  }

  function fmtDate(d) {
    if (!d) return '';
    const p = d.split('-');
    if (p.length === 3) return `${p[0]}.${p[1]}.${p[2]}`;
    return d.slice(0, 10);
  }

  function videoCard(v, opts = {}) {
    const fav = Store.isFav(v.id);
    const hidden = v.adminHidden || Store.getOverrides()[v.id]?.adminHidden;
    const scr = (v.scripture || '').trim();
    const scrHtml = scr
      ? `<div class="video-scripture">${esc(scr)}</div>`
      : `<div class="video-scripture empty">&nbsp;</div>`;
    const metaParts = [esc(v.speaker), fmtDate(v.date), v.worship ? esc(v.worship) : ''].filter(Boolean);
    if (opts.showIssue && typeof Store.classifyIssue === 'function') {
      const issues = Store.classifyIssue(v);
      if (issues.length) metaParts.push(esc(issues.join(' · ')));
    }
    if (opts.adminMeta && typeof Admin !== 'undefined' && Admin.isIn?.() && typeof Store.adminVideoMeta === 'function') {
      const meta = Store.adminVideoMeta(v);
      if (meta) metaParts.push(esc(meta));
    }
    const adminBtns = opts.adminMode ? `
      <button class="icon-btn adm" title="숨김/표시" onclick="event.stopPropagation();Admin.toggleHidden('${esc(v.id)}',this)">${hidden ? '👁' : '🚫'}</button>
      <button class="icon-btn adm" title="편집" onclick="event.stopPropagation();Admin.openEdit('${esc(v.id)}')">✎</button>
      ${v.isCustom ? `<button class="icon-btn adm" title="삭제" onclick="event.stopPropagation();Admin.deleteCustom('${esc(v.id)}')">🗑</button>` : ''}` : '';
    const selectBox = opts.adminSelect ? `
      <label class="adm-vid-check" onclick="event.stopPropagation()">
        <input type="checkbox" ${Admin.isSelected(v.id) ? 'checked' : ''} onchange="Admin.toggleSelect('${esc(v.id)}', this.checked)" aria-label="선택">
      </label>` : '';
    const dragHandle = opts.adminSort ? `<button type="button" class="adm-drag-handle" title="드래그하여 순서 변경" onclick="event.stopPropagation()">⠿</button>` : '';
    const selectedCls = opts.adminSelect && Admin.isSelected(v.id) ? ' is-selected' : '';
    return `<div class="video-item${hidden ? ' is-hidden' : ''}${selectedCls}${opts.adminSort ? ' is-sortable' : ''}" data-id="${esc(v.id)}">
      ${selectBox}${dragHandle}
      <div class="video-item-inner" onclick="App.openVideo('${esc(v.id)}')">
        <img class="video-thumb" src="${Store.thumb(v.id)}" alt="" loading="lazy">
        <div class="video-info">
          ${scrHtml}
          <div class="video-title">${esc(v.displayTitle)}${v.isCustom ? ' <span class="badge-custom">추가</span>' : ''}${hidden ? ' <span class="badge-hidden">숨김</span>' : ''}</div>
          <div class="video-meta">${metaParts.join(' · ')}</div>
        </div>
      </div>
      <div class="video-actions">
        <button class="icon-btn" title="즐겨찾기" onclick="event.stopPropagation();App.toggleFav('${esc(v.id)}',this)">${fav ? '★' : '☆'}</button>
        <button class="share-btn-kakao" title="공유" onclick="event.stopPropagation();App.shareVideo('${esc(v.id)}')">공유</button>
        ${adminBtns}
        ${opts.adminIm ? `<label class="adm-check"><input type="checkbox" ${v.associateId==='이임목사'?'checked':''} onchange="Admin.setImPastor('${esc(v.id)}',this.checked)"> 이임</label>` : ''}
      </div>
    </div>`;
  }

  function navCard(st, { icon = '', title, sub = '', count }) {
    const json = esc(JSON.stringify(st));
    const titleText = count != null ? `${title} (${count})` : title;
    return `<div class="nav-card-lg" data-nav='${json}' onclick="App.nav(JSON.parse(this.dataset.nav))">
      ${icon ? `<span class="nc-icon">${icon}</span>` : ''}
      <div><div class="nc-title">${esc(titleText)}</div>${sub ? `<div class="nc-sub">${esc(sub)}</div>` : ''}</div>
    </div>`;
  }

  function renderNavCards(items) {
    if (!items.length) return '<div class="no-data">항목이 없습니다.</div>';
    return `<div class="nav-card-grid">${items.map(it => navCard(it.nav, it)).join('')}</div>`;
  }

  function renderGrouped(map, groupLabel, adminIm, adminMode, opts = {}) {
    if (!map?.size) return '<div class="no-data">영상이 없습니다.</div>';
    const cardOpts = { adminIm, adminMode, adminSelect: adminMode, adminSort: opts.adminSort };
    const entries = [...map.entries()].sort((a, b) => {
      const va = a[1][0], vb = b[1][0];
      if (va.bookOrder !== vb.bookOrder) return va.bookOrder - vb.bookOrder;
      if (opts.sortByChapter && (va.chapter || 0) !== (vb.chapter || 0)) {
        return (va.chapter || 0) - (vb.chapter || 0);
      }
      return (vb.date || '').localeCompare(va.date || '');
    });
    const flat = [];
    entries.forEach(([, items]) => {
      if (opts.sortByChapter && items.length > 1) {
        items.sort((a, b) => {
          if ((a.chapter || 0) !== (b.chapter || 0)) return (a.chapter || 0) - (b.chapter || 0);
          return (a.date || '').localeCompare(b.date || '');
        });
      }
      flat.push(...items);
    });
    return flat.map(v => videoCard(v, cardOpts)).join('') || '<div class="no-data">영상이 없습니다.</div>';
  }

  function toggleGroup(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.toggle('open');
    const hdr = el.previousElementSibling;
    if (hdr) hdr.textContent = (el.classList.contains('open') ? '▼ ' : '▶ ') + hdr.textContent.slice(2);
  }

  function renderFlat(videos, adminIm, adminMode, opts = {}) {
    if (!videos.length) return '<div class="no-data">영상이 없습니다.</div>';
    const pageSize = opts.pageSize || 40;
    const page = opts.page || 1;
    const end = page * pageSize;
    const slice = videos.slice(0, end);
    const html = slice.map(v => videoCard(v, { adminIm, adminMode, adminSelect: adminMode, adminSort: opts.adminSort, showIssue: opts.showIssue, adminMeta: opts.adminMeta })).join('');
    if (end < videos.length) {
      const remain = videos.length - end;
      return html + `<div class="list-load-more-wrap"><button type="button" class="btn btn-outline list-load-more" onclick="App.loadMoreList()">더 보기 (${remain}편)</button></div>`;
    }
    return html;
  }

  function homeMenuCount(key, m) {
    if (m.view) {
      const c = Store.getHomeMenuCount(m.view);
      if (c != null) return c;
    }
    return null;
  }

  function renderHomeMenus() {
    const menus = Store.getMenus();
    const cardsEl = document.getElementById('home-cards');
    const linksEl = document.getElementById('home-links');
    if (!cardsEl) return;

    const order = Store.getHomeMenuOrder();
    let cards = '';
    order.forEach(key => {
      const m = menus[key];
      if (!m || !m.visible) return;
      if (m.screen) {
        const icon = (m.label || '').split(' ')[0] || '🔍';
        const title = (m.label || '').replace(/^[^\s]+\s/u, '').trim() || m.label || key;
        cards += `<div class="nav-card-lg" onclick="App.go('${esc(m.screen)}')">
          <span class="nc-icon">${icon}</span>
          <div><div class="nc-title">${esc(title)}</div>${m.sub ? `<div class="nc-sub">${esc(m.sub)}</div>` : ''}</div>
        </div>`;
        return;
      }
      const nav = { s: 'list', view: m.view };
      const title = m.title || (m.label || '').replace(/^[^\s]+\s/u, '').trim() || key;
      const sub = m.type === 'card' ? (m.sub || '') : (m.sub || '');
      const icon = m.icon || ((m.label || '').split(' ')[0]) || '📂';
      const count = homeMenuCount(key, m);
      cards += navCard(nav, { icon, title, sub, count });
    });
    if (typeof Admin !== 'undefined' && Admin.isIn?.()) {
      const n = Store.unclassifiedVideos().length;
      cards += `<div class="nav-card-lg nav-card-admin" onclick="App.nav({s:'list',view:'unclassified'})">
        <span class="nc-icon">⚠️</span>
        <div><div class="nc-title">분류되지 않은 영상</div>
        <div class="nc-sub">${n}편 · 관리자 전용</div></div>
      </div>`;
    }
    cardsEl.innerHTML = cards;
    cardsEl.classList.toggle('home-counts-ready', Store.areHomeCountsReady?.() === true);
    if (linksEl) {
      linksEl.innerHTML = '';
      linksEl.classList.toggle('home-counts-ready', Store.areHomeCountsReady?.() === true);
    }
  }

  function applyHomeText() {
    const cfg = Store.getConfig();
    const t = cfg.homeTitle || {};
    const g = cfg.homeTagline || {};
    const te = document.getElementById('home-title');
    const ge = document.getElementById('home-tagline');
    if (te) {
      te.textContent = t.text || 'Hanbit Church Sermon';
      te.style.fontSize = t.fontSize || '1.35rem';
      te.style.fontWeight = t.fontWeight || '700';
      te.style.color = t.color || 'var(--primary)';
    }
    if (ge) {
      ge.textContent = g.text || '';
      ge.style.fontSize = g.fontSize || '1rem';
      ge.style.fontWeight = g.fontWeight || '500';
      ge.style.color = g.color || 'var(--primary-light)';
    }
    renderHomeMenus();
  }

  async function refreshAppFooter() {
    const el = document.getElementById('footer-upload-summary');
    if (!el || typeof Store === 'undefined' || !Store.getLastRssSyncSummary) return;
    try {
      const summary = await Store.getLastRssSyncSummary();
      el.textContent = summary
        ? ` (${summary.dateLabel} ${summary.count}개의 영상이 업로드되었습니다.)`
        : '';
    } catch {
      el.textContent = '';
    }
  }

  function toast(msg) {
    let t = document.getElementById('toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'toast';
      t.className = 'toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2200);
  }

  return { esc, videoCard, navCard, renderNavCards, renderGrouped, renderFlat, toggleGroup, applyHomeText, renderHomeMenus, refreshAppFooter, toast, fmtDate };
})();
