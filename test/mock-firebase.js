/* Tiny in-memory stand-in for the Firebase compat SDK — enough to exercise the app offline in tests. */
(function(){
  const docs = {};            // path -> data
  const listeners = [];       // {match(path), fn}
  const notify = () => listeners.forEach(l => l.fn());
  const segs = p => p.split('/').filter(Boolean);
  const snap = (path) => ({ id: segs(path).pop(), exists: path in docs, data: () => docs[path], ref: docRef(path) });
  function docRef(path){
    return {
      id: segs(path).pop(), path,
      async get(){ return snap(path); },
      async set(d){ docs[path] = JSON.parse(JSON.stringify(d)); notify(); },
      async update(d){ docs[path] = { ...(docs[path]||{}), ...JSON.parse(JSON.stringify(d)) }; notify(); },
      async delete(){ delete docs[path]; notify(); },
      onSnapshot(fn){ const l = { fn: () => fn(snap(path)) }; listeners.push(l); setTimeout(l.fn, 0); return () => { const i = listeners.indexOf(l); if (i>=0) listeners.splice(i,1); }; },
      collection(c){ return collRef(path + '/' + c); },
    };
  }
  function collRef(path, filter){
    const matches = () => Object.keys(docs).filter(p => p.startsWith(path + '/') && segs(p).length === segs(path).length + 1)
      .map(p => snap(p)).filter(s => !filter || filter(s.data()));
    const qs = () => { const d = matches(); return { docs: d, size: d.length, empty: !d.length }; };
    return {
      path,
      doc(id){ return docRef(path + '/' + (id || Math.random().toString(36).slice(2, 10))); },
      async add(d){ const r = this.doc(); await r.set(d); return r; },
      where(f, op, v){ return collRef(path, d => op === 'array-contains' ? (d[f]||[]).includes(v) : d[f] === v); },
      limit(){ return this; }, orderBy(){ return this; },
      async get(){ return qs(); },
      onSnapshot(fn){ const l = { fn: () => fn(qs()) }; listeners.push(l); setTimeout(l.fn, 0); return () => { const i = listeners.indexOf(l); if (i>=0) listeners.splice(i,1); }; },
    };
  }
  let authUser = null; const authListeners = [];
  const emitAuth = () => authListeners.forEach(f => f(authUser));
  window.__mock = { docs, signIn(email, uid){ authUser = { email, uid: uid || 'u_' + email.split('@')[0], displayName: email.split('@')[0] }; emitAuth(); } };
  window.firebase = {
    initializeApp(){},
    firestore(){ return { doc: docRef, collection: p => collRef(p), enablePersistence: async () => {} }; },
    auth(){ return { onAuthStateChanged(f){ authListeners.push(f); setTimeout(() => f(authUser), 0); },
      async signInWithPopup(){ window.__mock.signIn('matt@example.com'); }, async signInWithEmailAndPassword(e){ window.__mock.signIn(e); },
      async createUserWithEmailAndPassword(e){ window.__mock.signIn(e); }, async signOut(){ authUser = null; emitAuth(); } }; },
    messaging: Object.assign(() => ({ onMessage(){}, async getToken(){ return 'tok'; }, async deleteToken(){} }), { isSupported: () => true }),
  };
  window.firebase.auth.GoogleAuthProvider = function(){};
})();
