const Firebase = (() => {
  let app = null;
  let fs = null;
  let auth = null;
  let ready = false;
  let authInitDone = false;

  const CFG = () => window.HANBIT_FIREBASE || {};
  const enabled = () => CFG().enabled === true && CFG().config?.projectId;

  const AUTH_ERR = '관리자 로그인이 필요합니다. 설정에서 다시 로그인해 주세요.';
  const PERM_ERR = 'Firebase 저장 권한이 없습니다. Firebase Console에서 Firestore 보안 규칙(firestore.rules)을 배포했는지 확인해 주세요.';
  const FIELD_DELETE = '__field_delete__';

  function prepareOverridePatch(patch) {
    const out = {};
    Object.entries(patch || {}).forEach(([k, v]) => {
      if (v === undefined) return;
      if (v === FIELD_DELETE) out[k] = firebase.firestore.FieldValue.delete();
      else out[k] = v;
    });
    return out;
  }

  function patchToUpdatePaths(id, patch) {
    const prepared = prepareOverridePatch(patch);
    const updatePayload = {};
    Object.entries(prepared).forEach(([k, v]) => {
      updatePayload[`items.${id}.${k}`] = v;
    });
    return updatePayload;
  }

  async function ensureOverridesDoc(ref) {
    const snap = await ref.get();
    if (!snap.exists) await ref.set({ items: {} });
  }

  function mapWriteError(e) {
    const msg = e?.message || String(e);
    if (/Missing or insufficient permissions/i.test(msg)) return new Error(PERM_ERR);
    if (/auth\/|id-token|user-token/i.test(msg)) return new Error('인증이 만료되었습니다. 다시 로그인해 주세요.');
    return e instanceof Error ? e : new Error(msg);
  }

  function init() {
    if (!enabled()) return Promise.resolve(false);
    if (ready) return Promise.resolve(true);
    if (typeof firebase === 'undefined') {
      return Promise.reject(new Error('Firebase SDK not loaded'));
    }
    app = firebase.apps.length ? firebase.app() : firebase.initializeApp(CFG().config);
    fs = firebase.firestore();
    auth = firebase.auth();
    auth.setPersistence(firebase.auth.Auth.Persistence.SESSION);
    if (!authInitDone) {
      authInitDone = true;
      auth.onAuthStateChanged(() => { /* 세션 복원 */ });
    }
    ready = true;
    return Promise.resolve(true);
  }

  async function waitForAuthUser(ms = 8000) {
    await init();
    if (auth.currentUser) return auth.currentUser;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        unsub();
        resolve(null);
      }, ms);
      const unsub = auth.onAuthStateChanged(user => {
        clearTimeout(timer);
        unsub();
        resolve(user);
      });
    });
  }

  async function requireAuth() {
    await init();
    const user = auth.currentUser || await waitForAuthUser();
    if (!user) throw new Error(AUTH_ERR);
    try {
      await user.getIdToken(true);
    } catch (e) {
      throw new Error('인증이 만료되었습니다. 다시 로그인해 주세요.');
    }
    return user;
  }

  function isEnabled() { return enabled(); }

  function isAdmin() {
    return !!(auth && auth.currentUser);
  }

  async function signIn(email, password) {
    await init();
    const cred = await auth.signInWithEmailAndPassword(email, password);
    await cred.user.getIdToken(true);
    return cred.user;
  }

  async function signOut() {
    if (auth) await auth.signOut();
  }

  async function getConfig() {
    await init();
    const snap = await fs.doc('config/app').get();
    if (snap.exists) return snap.data();
    return fetch('data/config.json').then(r => r.json()).catch(() => ({}));
  }

  async function saveConfig(patch) {
    await requireAuth();
    if (!patch || !Object.keys(patch).length) return;
    try {
      await fs.doc('config/app').set(patch, { merge: true });
    } catch (e) {
      throw mapWriteError(e);
    }
  }

  async function getOverrides() {
    await init();
    const snap = await fs.doc('overrides/videos').get();
    if (!snap.exists) return {};
    const d = snap.data();
    return d.items || d;
  }

  async function saveOverride(id, patch) {
    await requireAuth();
    const ref = fs.doc('overrides/videos');
    const updatePayload = patchToUpdatePaths(id, patch);
    if (!Object.keys(updatePayload).length) return;
    try {
      await ensureOverridesDoc(ref);
      await ref.update(updatePayload);
    } catch (e) {
      throw mapWriteError(e);
    }
  }

  async function saveOverridesBatch(batch) {
    await requireAuth();
    const ids = Object.keys(batch || {});
    if (!ids.length) return;
    const ref = fs.doc('overrides/videos');
    try {
      await ensureOverridesDoc(ref);
      const PER_UPDATE = 25;
      for (let i = 0; i < ids.length; i += PER_UPDATE) {
        const updatePayload = {};
        ids.slice(i, i + PER_UPDATE).forEach(id => {
          Object.assign(updatePayload, patchToUpdatePaths(id, batch[id]));
        });
        if (Object.keys(updatePayload).length) await ref.update(updatePayload);
      }
    } catch (e) {
      throw mapWriteError(e);
    }
  }

  async function readOverridesFromServer() {
    await init();
    const ref = fs.doc('overrides/videos');
    try {
      const snap = await ref.get({ source: 'server' });
      return snap.exists ? (snap.data().items || {}) : {};
    } catch (e) {
      const snap = await ref.get();
      return snap.exists ? (snap.data().items || {}) : {};
    }
  }

  async function verifyOverridesSaved(ids, expectedMap) {
    let lastErr = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      if (attempt) await new Promise(r => setTimeout(r, 250 * attempt));
      const items = await readOverridesFromServer();
      let ok = true;
      for (const id of ids) {
        const exp = expectedMap[id] || {};
        const saved = items[id];
        if (!saved) {
          ok = false;
          lastErr = new Error(`저장 확인 실패 (${id}). 잠시 후 다시 시도해 주세요.`);
          break;
        }
        if (exp.bucket && saved.bucket !== exp.bucket) {
          ok = false;
          lastErr = new Error(`분류 저장 실패 (${id}). 다시 로그인 후 시도해 주세요.`);
          break;
        }
        if (exp.worship && saved.worship !== exp.worship) {
          ok = false;
          lastErr = new Error(`예배 종류 저장 실패 (${id}: ${saved.worship || '없음'}).`);
          break;
        }
        if (exp.prayerSeries && saved.prayerSeries !== exp.prayerSeries) {
          ok = false;
          lastErr = new Error(`시리즈 저장 실패 (${id}).`);
          break;
        }
        if (exp.seriesMeta?.sub && saved.seriesMeta?.sub !== exp.seriesMeta.sub) {
          ok = false;
          lastErr = new Error(`시리즈(sub) 저장 실패 (${id}).`);
          break;
        }
        if (exp.seriesMeta?.year && String(saved.seriesMeta?.year || '') !== String(exp.seriesMeta.year)) {
          ok = false;
          lastErr = new Error(`연도 저장 실패 (${id}: ${saved.seriesMeta?.year || '없음'}).`);
          break;
        }
      }
      if (ok) return;
    }
    throw lastErr || new Error('저장 확인 실패');
  }

  async function getCustomVideos() {
    await init();
    const snap = await fs.doc('custom/videos').get();
    return snap.exists ? (snap.data().list || []) : [];
  }

  async function saveCustomVideos(list) {
    await requireAuth();
    try {
      await fs.doc('custom/videos').set({ list });
    } catch (e) {
      throw mapWriteError(e);
    }
  }

  const UPLOAD_LOG_RETENTION_DAYS = 7;

  function uploadLogCutoffIso() {
    const d = new Date(Date.now() - UPLOAD_LOG_RETENTION_DAYS * 86400000);
    return d.toISOString();
  }

  async function getUploadLogs() {
    await requireAuth();
    const cutoff = uploadLogCutoffIso();
    try {
      const snap = await fs.collection('uploadLogs').get();
      return snap.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(e => (e.syncedAt || '') >= cutoff)
        .sort((a, b) => (b.syncedAt || '').localeCompare(a.syncedAt || ''));
    } catch (e) {
      throw mapWriteError(e);
    }
  }

  async function addUploadLog(entry) {
    await requireAuth();
    if (!entry?.videoId) return;
    const id = entry.id || `${entry.source || 'manual'}_${entry.videoId}_${Date.now()}`;
    try {
      await fs.collection('uploadLogs').doc(id).set({ ...entry, id });
    } catch (e) {
      throw mapWriteError(e);
    }
  }

  async function purgeOldUploadLogs() {
    await requireAuth();
    const cutoff = uploadLogCutoffIso();
    try {
      const snap = await fs.collection('uploadLogs').get();
      const batch = fs.batch();
      let n = 0;
      snap.docs.forEach(doc => {
        if ((doc.data().syncedAt || '') < cutoff) {
          batch.delete(doc.ref);
          n += 1;
        }
      });
      if (n) await batch.commit();
    } catch (e) {
      throw mapWriteError(e);
    }
  }

  function adminEmail() {
    return CFG().adminEmail || 'admin@hanbit.kr';
  }

  return {
    init, isEnabled, isAdmin, signIn, signOut, requireAuth, waitForAuthUser,
    getConfig, saveConfig, getOverrides, saveOverride, saveOverridesBatch, verifyOverridesSaved,
    getCustomVideos, saveCustomVideos, adminEmail,
    getUploadLogs, addUploadLog, purgeOldUploadLogs
  };
})();
