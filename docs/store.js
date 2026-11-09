// Datenhaltung: Firebase (Firestore + anonyme Anmeldung) oder,
// solange nichts konfiguriert ist, ein Demo-Speicher im Browser.
import { firebaseConfig } from "./firebase-config.js";

const FIREBASE_VERSION = "10.12.2";

export function isConfigured() {
  const key = firebaseConfig && firebaseConfig.apiKey;
  return Boolean(key) && !key.startsWith("DEIN");
}

export async function createStore() {
  return isConfigured() ? firebaseStore(firebaseConfig) : demoStore();
}

async function firebaseStore(config) {
  const base = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;
  const [{ initializeApp }, fs, au] = await Promise.all([
    import(`${base}/firebase-app.js`),
    import(`${base}/firebase-firestore.js`),
    import(`${base}/firebase-auth.js`),
  ]);
  const app = initializeApp(config);
  // Long-Polling statt WebChannel-Streaming: funktioniert auch in
  // eingeschränkten Browsern (In-App-Browser, Firmen-Proxys, Blocker).
  const db = fs.initializeFirestore(app, { experimentalForceLongPolling: true });
  const auth = au.getAuth(app);
  await au.signInAnonymously(auth);
  const uid = auth.currentUser.uid;

  return {
    mode: "firebase",
    uid,
    async createPoll(data) {
      const ref = fs.doc(fs.collection(db, "polls"));
      await fs.setDoc(ref, { ...data, owner: uid, createdAt: fs.serverTimestamp() });
      return ref.id;
    },
    watchPoll(id, onData, onError) {
      return fs.onSnapshot(
        fs.doc(db, "polls", id),
        (snap) => onData(snap.exists() ? snap.data() : null),
        onError,
      );
    },
    watchParticipants(id, onData, onError) {
      return fs.onSnapshot(
        fs.collection(db, "polls", id, "participants"),
        (qs) => onData(qs.docs.map((d) => ({ id: d.id, ...d.data() }))),
        onError,
      );
    },
    async saveMe(id, data) {
      const write = () =>
        withTimeout(
          fs.setDoc(fs.doc(db, "polls", id, "participants", uid), {
            ...data,
            updatedAt: fs.serverTimestamp(),
          }),
          20000,
        );
      try {
        await write();
      } catch (e) {
        // Abgelaufene oder fehlende Anmeldung: Token erneuern und einmal wiederholen.
        if (e && (e.code === "permission-denied" || e.code === "unauthenticated") && auth.currentUser) {
          await auth.currentUser.getIdToken(true);
          await write();
        } else {
          throw e;
        }
      }
    },
    setFixed(id, fixed) {
      return fs.updateDoc(fs.doc(db, "polls", id), { fixed: fixed || null });
    },
    setBring(id, on) {
      return withTimeout(fs.updateDoc(fs.doc(db, "polls", id), { bring: Boolean(on) }), 20000);
    },
    // Mitbring-Liste: polls/{id}/items/{itemId} = { text, addedBy, by, byName, createdAt }
    watchItems(id, onData, onError) {
      return fs.onSnapshot(
        fs.collection(db, "polls", id, "items"),
        (qs) =>
          onData(
            qs.docs.map((d) => {
              const x = d.data({ serverTimestamps: "estimate" });
              return { id: d.id, ...x, createdAt: x.createdAt ? x.createdAt.toMillis() : Date.now() };
            }),
          ),
        onError,
      );
    },
    addItem(id, { text, mine, name }) {
      return withTimeout(
        fs.addDoc(fs.collection(db, "polls", id, "items"), {
          text,
          addedBy: uid,
          by: mine ? uid : null,
          byName: mine ? name : null,
          createdAt: fs.serverTimestamp(),
        }),
        20000,
      );
    },
    claimItem(id, itemId, name) {
      return withTimeout(fs.updateDoc(fs.doc(db, "polls", id, "items", itemId), { by: uid, byName: name }), 20000);
    },
    releaseItem(id, itemId) {
      return withTimeout(fs.updateDoc(fs.doc(db, "polls", id, "items", itemId), { by: null, byName: null }), 20000);
    },
    deleteItem(id, itemId) {
      return withTimeout(fs.deleteDoc(fs.doc(db, "polls", id, "items", itemId)), 20000);
    },
  };
}

function withTimeout(promise, ms) {
  let t;
  const timeout = new Promise((_, reject) => {
    t = setTimeout(() => reject(Object.assign(new Error("Keine Antwort vom Server"), { code: "timeout" })), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
}

function demoStore() {
  const KEY = "tf-demo-db";
  const subs = new Set();
  const load = () => {
    try {
      return JSON.parse(localStorage.getItem(KEY)) || { polls: {} };
    } catch {
      return { polls: {} };
    }
  };
  const emit = () => subs.forEach((f) => f());
  const save = (db) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(db));
    } catch {}
    emit();
  };
  addEventListener("storage", (e) => e.key === KEY && emit());

  let uid = null;
  try {
    uid = localStorage.getItem("tf-demo-uid");
    if (!uid) {
      uid = "u" + Math.random().toString(36).slice(2, 10);
      localStorage.setItem("tf-demo-uid", uid);
    }
  } catch {
    uid = "u-local";
  }

  const watch = (fn) => {
    subs.add(fn);
    queueMicrotask(fn);
    return () => subs.delete(fn);
  };

  return {
    mode: "demo",
    uid,
    async createPoll(data) {
      const db = load();
      const id = Math.random().toString(36).slice(2, 12);
      db.polls[id] = { ...data, owner: uid, participants: {} };
      save(db);
      return id;
    },
    watchPoll(id, onData) {
      return watch(() => {
        const p = load().polls[id];
        if (!p) return onData(null);
        const { participants, items, ...rest } = p;
        onData(rest);
      });
    },
    watchParticipants(id, onData) {
      return watch(() => {
        const p = load().polls[id];
        onData(p ? Object.entries(p.participants).map(([k, v]) => ({ id: k, ...v })) : []);
      });
    },
    async saveMe(id, data) {
      const db = load();
      if (!db.polls[id]) return;
      db.polls[id].participants[uid] = { ...data, updatedAt: Date.now() };
      save(db);
    },
    async setFixed(id, fixed) {
      const db = load();
      if (!db.polls[id]) return;
      db.polls[id].fixed = fixed || null;
      save(db);
    },
    async setBring(id, on) {
      const db = load();
      if (!db.polls[id]) return;
      db.polls[id].bring = Boolean(on);
      save(db);
    },
    watchItems(id, onData) {
      return watch(() => {
        const p = load().polls[id];
        onData(p && p.items ? Object.entries(p.items).map(([k, v]) => ({ id: k, ...v })) : []);
      });
    },
    async addItem(id, { text, mine, name }) {
      const db = load();
      const p = db.polls[id];
      if (!p) return;
      p.items ??= {};
      p.items[Math.random().toString(36).slice(2, 12)] = {
        text,
        addedBy: uid,
        by: mine ? uid : null,
        byName: mine ? name : null,
        createdAt: Date.now() + Object.keys(p.items).length, // stabile Reihenfolge bei schnellem Anlegen
      };
      save(db);
    },
    async claimItem(id, itemId, name) {
      const db = load();
      const it = db.polls[id]?.items?.[itemId];
      if (!it) return;
      if (it.by && it.by !== uid) throw Object.assign(new Error("schon vergeben"), { code: "permission-denied" });
      Object.assign(it, { by: uid, byName: name });
      save(db);
    },
    async releaseItem(id, itemId) {
      const db = load();
      const it = db.polls[id]?.items?.[itemId];
      if (!it) return;
      Object.assign(it, { by: null, byName: null });
      save(db);
    },
    async deleteItem(id, itemId) {
      const db = load();
      if (db.polls[id]?.items) delete db.polls[id].items[itemId];
      save(db);
    },
  };
}
