/* PWA: service worker + 홈 화면 설치 */
const Pwa = (() => {
  const SS_DISMISS = 'hanbit-pwa-dismiss';
  const YOUTUBE_CHANNEL = 'https://www.youtube.com/@HanbitMethodistChurch';
  let deferredPrompt = null;
  let promptWaiters = [];

  function isDismissed() {
    return sessionStorage.getItem(SS_DISMISS) === '1';
  }

  function capturePrompt(e) {
    e.preventDefault();
    deferredPrompt = e;
    if (window.__hanbitBip) window.__hanbitBip = e;
    promptWaiters.splice(0).forEach((fn) => fn(e));
    if (!isDismissed() && !isStandalone()) {
      showBanner(isIOS() ? 'ios' : 'install');
    }
  }

  function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone === true;
  }

  function isMobile() {
    return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  }

  function isIOS() {
    return /iPhone|iPad|iPod/i.test(navigator.userAgent);
  }

  function isAndroid() {
    return /Android/i.test(navigator.userAgent);
  }

  function bannerEl() {
    return document.getElementById('pwa-install');
  }

  function showBanner(mode) {
    if (isStandalone() || isDismissed()) return;
    const el = bannerEl();
    if (!el) return;

    const title = el.querySelector('.pwa-install-title');
    const desc = el.querySelector('.pwa-install-desc');
    const btn = el.querySelector('.pwa-install-btn');
    const iosHint = el.querySelector('.pwa-ios-hint');

    if (mode === 'ios') {
      if (title) title.textContent = '홈 화면에 추가';
      if (desc) desc.textContent = 'Safari에서 홈 화면에 추가하면 앱처럼 사용할 수 있습니다.';
      if (btn) { btn.style.display = ''; btn.textContent = '추가 방법'; btn.disabled = false; }
      if (iosHint) iosHint.hidden = false;
    } else {
      if (title) title.textContent = '앱 설치';
      if (desc) desc.textContent = '한빛 설교 앱을 홈 화면에 추가하면 더 편하게 이용할 수 있습니다.';
      if (btn) {
        btn.style.display = '';
        btn.textContent = deferredPrompt ? '설치하기' : '설치 준비 중…';
        btn.disabled = !deferredPrompt;
      }
      if (iosHint) iosHint.hidden = true;
    }

    el.classList.remove('hidden');
  }

  function hideBanner() {
    bannerEl()?.classList.add('hidden');
  }

  function dismiss() {
    sessionStorage.setItem(SS_DISMISS, '1');
    hideBanner();
  }

  function waitForPrompt(ms) {
    if (deferredPrompt || window.__hanbitBip) {
      return Promise.resolve(deferredPrompt || window.__hanbitBip);
    }
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), ms);
      promptWaiters.push((prompt) => {
        clearTimeout(timer);
        resolve(prompt);
      });
    });
  }

  async function install() {
    const btn = bannerEl()?.querySelector('.pwa-install-btn');
    if (btn) btn.disabled = true;

    try {
      let prompt = deferredPrompt || window.__hanbitBip;
      if (!prompt && isAndroid()) prompt = await waitForPrompt(2500);
      if (!prompt && !isIOS()) prompt = await waitForPrompt(800);

      if (prompt) {
        deferredPrompt = prompt;
        await prompt.prompt();
        const choice = await prompt.userChoice;
        deferredPrompt = null;
        window.__hanbitBip = null;
        if (choice.outcome === 'accepted') hideBanner();
        return;
      }

      if (isIOS()) {
        const hint = bannerEl()?.querySelector('.pwa-ios-hint');
        if (hint) hint.hidden = false;
        UI.toast('Safari: 하단 공유(↑) → 「홈 화면에 추가」');
        return;
      }

      if (isMobile()) {
        UI.toast('브라우저 ⋮ 메뉴 → 「앱 설치」 또는 「홈 화면에 추가」');
      }
    } finally {
      if (btn) btn.disabled = !deferredPrompt && !isIOS();
      if (btn && !isIOS()) btn.textContent = deferredPrompt ? '설치하기' : '설치 준비 중…';
    }
  }

  function appBuild() {
    return document.querySelector('meta[name="hanbit-app-build"]')?.content || '47';
  }

  function registerSw() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register(`./sw.js?v=${appBuild()}`).catch((e) => console.warn('SW', e));
  }

  function initInstallUi() {
    if (isStandalone()) return;

    if (window.__hanbitBip) {
      deferredPrompt = window.__hanbitBip;
      if (!isDismissed()) showBanner(isIOS() ? 'ios' : 'install');
    }

    window.addEventListener('beforeinstallprompt', capturePrompt);

    window.addEventListener('appinstalled', () => {
      deferredPrompt = null;
      window.__hanbitBip = null;
      hideBanner();
    });

    setTimeout(() => {
      if (isStandalone() || isDismissed() || !isMobile()) return;
      showBanner(isIOS() ? 'ios' : 'install');
    }, 800);
  }

  function init() {
    registerSw();
    initInstallUi();
  }

  return { init, install, dismiss, YOUTUBE_CHANNEL, isStandalone, isMobile };
})();
