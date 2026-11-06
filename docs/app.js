import { createStore } from "./store.js";

const SLOTS = [
  { id: "mittag", label: "Mittag", hint: "12–15 Uhr", from: 12, to: 15 },
  { id: "nachmittag", label: "Nachmittag", hint: "15–18 Uhr", from: 15, to: 18 },
  { id: "abend", label: "Abend", hint: "ab 18 Uhr", from: 18, to: 22 },
];
const NEXT = { "": "y", y: "m", m: "n", n: "" };
const MARK = { "": "", y: "✓", m: "?", n: "✕" };
const WORD = { y: "kann", m: "vielleicht", n: "kann nicht" };
const WD = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const WD_LONG = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
const MAX_DAYS = 92;

const app = document.getElementById("app");

// ---------- kleine Helfer ----------
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "text") el.textContent = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "style") el.setAttribute("style", v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}
function put(el, ...kids) {
  el.replaceChildren(...kids.flat(Infinity).filter((k) => k != null && k !== false));
}
const ls = {
  get(k, fallback) {
    try {
      const v = localStorage.getItem(k);
      return v == null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {}
  },
};

// ---------- Datum ----------
const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
function dayList(start, end) {
  const out = [];
  for (let d = parse(start); d <= parse(end) && out.length < MAX_DAYS; d = addDays(d, 1)) out.push(d);
  return out;
}
function isoWeek(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t - y0) / 86400000 + 1) / 7);
}
function weeks(days) {
  const out = [];
  let cur = null;
  for (const d of days) {
    const w = isoWeek(d);
    if (!cur || cur.w !== w) out.push((cur = { w, days: [] }));
    cur.days.push(d);
  }
  return out;
}
const short = (d) => `${d.getDate()}.${d.getMonth() + 1}.`;
const isWeekend = (d) => d.getDay() === 0 || d.getDay() === 6;
const todayIso = () => iso(new Date());
const slotOf = (id) => SLOTS.find((s) => s.id === id);
function describeKey(key) {
  const [date, slot] = key.split("_");
  const d = parse(date);
  return `${WD_LONG[d.getDay()]}, ${short(d)} · ${slotOf(slot)?.label ?? slot}`;
}

// ---------- Zustand ----------
const S = {
  store: null,
  pollId: null,
  poll: undefined,
  people: [],
  me: { name: ls.get("tf-name", ""), avail: {} },
  myLoaded: false,
  dirty: false,
  saveTimer: null,
  tab: "eintragen",
  selected: null,
  confirmClear: false,
};

// ---------- Start ----------
main();

async function main() {
  S.pollId = new URLSearchParams(location.search).get("p");
  try {
    S.store = await createStore();
  } catch (e) {
    console.error(e);
    return renderFatal(
      "Die Verbindung zur Datenbank hat nicht geklappt.",
      "Prüfe in Firebase, ob die anonyme Anmeldung aktiviert ist und die Werte in firebase-config.js stimmen. Technische Meldung: " +
        (e && e.message ? e.message : e),
    );
  }
  if (S.store.mode === "demo") document.getElementById("demo-banner").hidden = false;
  if (S.pollId) openPoll();
  else renderLanding();
}

function renderFatal(title, text) {
  put(app, 
    h("section", { class: "panel error-box" }, h("h2", { text: title }), h("p", { class: "muted", text })),
  );
}

// ---------- Startseite: neue Umfrage ----------
function renderLanding() {
  document.title = "Terminfinder";
  const start = todayIso();
  const end = iso(addDays(new Date(), 41));
  const recent = ls.get("tf-recent", []);

  const status = h("p", { class: "status" });
  const form = h(
    "form",
    { class: "panel", id: "create-form" },
    h("h2", { text: "Neue Terminsuche" }),
    h("label", {}, "Worum geht's?", h("input", { id: "f-title", name: "title", required: true, maxlength: 100, placeholder: "z. B. Spieleabend, Grillen bei Jonas" })),
    h("label", {}, h("span", {}, "Notiz ", h("span", { class: "muted small", text: "(optional)" })), h("textarea", { id: "f-note", name: "note", rows: 2, maxlength: 300, placeholder: "Ort, Dauer, was mitbringen …" })),
    h(
      "div",
      { class: "row" },
      h("label", {}, "Von", h("input", { id: "f-start", name: "start", type: "date", value: start, required: true })),
      h("label", {}, "Bis", h("input", { id: "f-end", name: "end", type: "date", value: end, required: true })),
    ),
    h("p", { class: "muted small", text: "Jeder kann pro Tag Mittag, Nachmittag und Abend markieren. Maximal 3 Monate." }),
    h("div", {}, h("button", { class: "btn-primary", type: "submit", text: "Terminsuche erstellen" })),
    status,
  );
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const title = String(fd.get("title")).trim();
    const note = String(fd.get("note") || "").trim();
    const s = String(fd.get("start"));
    const en = String(fd.get("end"));
    if (!title) return;
    if (en < s) return setStatus(status, "Das Enddatum liegt vor dem Startdatum.", true);
    if (dayList(s, en).length >= MAX_DAYS && iso(addDays(parse(s), MAX_DAYS - 1)) < en)
      return setStatus(status, "Bitte höchstens 3 Monate auswählen.", true);
    setStatus(status, "Wird erstellt …");
    form.querySelector("button[type=submit]").disabled = true;
    try {
      const id = await S.store.createPoll({ title, note, start: s, end: en });
      history.pushState(null, "", `?p=${encodeURIComponent(id)}`);
      S.pollId = id;
      openPoll();
    } catch (err) {
      console.error(err);
      form.querySelector("button[type=submit]").disabled = false;
      setStatus(status, "Erstellen hat nicht geklappt: " + (err.message || err), true);
    }
  });

  put(app, 
    h(
      "header",
      { class: "poll-head" },
      h("p", { class: "eyebrow", text: "Terminfinder" }),
      h("h1", { text: "Wann habt ihr alle Zeit?" }),
      h("p", { class: "muted", text: "Erstelle eine Terminsuche, schick den Link in die Gruppe und sieh sofort, an welchen Tagen die meisten können." }),
    ),
    form,
    recent.length
      ? h(
          "section",
          { class: "panel" },
          h("h2", { text: "Zuletzt geöffnet" }),
          h("ul", { class: "recent" }, recent.map((r) => h("li", {}, h("a", { href: `?p=${encodeURIComponent(r.id)}`, text: r.title })))),
        )
      : null,
  );
}

function setStatus(el, text, err = false) {
  el.textContent = text;
  el.classList.toggle("err", err);
}

// ---------- Umfrage ----------
function openPoll() {
  put(app, h("p", { class: "muted", text: "Lädt die Terminsuche …" }));
  const onErr = (e) => {
    console.error(e);
    renderFatal("Die Terminsuche konnte nicht geladen werden.", (e && e.message) || String(e));
  };
  S.store.watchPoll(
    S.pollId,
    (poll) => {
      const first = S.poll === undefined;
      S.poll = poll;
      if (!poll) return renderFatal("Diese Terminsuche gibt es nicht.", "Prüfe den Link oder erstelle eine neue Terminsuche.");
      if (first) {
        rememberRecent(S.pollId, poll.title);
        buildPollShell();
      }
      renderPollHead();
      renderBody();
    },
    onErr,
  );
  S.store.watchParticipants(
    S.pollId,
    (people) => {
      S.people = people;
      const mine = people.find((p) => p.id === S.store.uid);
      if (mine && !S.dirty) {
        S.me = { name: mine.name || "", avail: { ...(mine.avail || {}) } };
        const nameInput = document.getElementById("my-name");
        if (nameInput && document.activeElement !== nameInput) nameInput.value = S.me.name;
      }
      S.myLoaded = true;
      if (S.poll) renderBody();
    },
    onErr,
  );
}

function rememberRecent(id, title) {
  const list = ls.get("tf-recent", []).filter((r) => r.id !== id);
  list.unshift({ id, title });
  ls.set("tf-recent", list.slice(0, 8));
}

function pollUrl() {
  return `${location.origin}${location.pathname}?p=${encodeURIComponent(S.pollId)}`;
}

function buildPollShell() {
  document.title = `${S.poll.title} · Terminfinder`;
  const nameInput = h("input", {
    id: "my-name",
    maxlength: 40,
    autocomplete: "nickname",
    placeholder: "Dein Name",
    value: S.me.name,
    oninput: (e) => {
      S.me.name = e.target.value;
      e.target.classList.remove("field-attn");
      scheduleSave();
    },
  });
  put(app, 
    h("header", { class: "poll-head", id: "poll-head" }),
    h(
      "div",
      { class: "tabs", role: "tablist" },
      tabButton("eintragen", "Meine Zeiten"),
      tabButton("uebersicht", "Übersicht"),
    ),
    h(
      "section",
      { class: "panel", id: "tab-eintragen", role: "tabpanel" },
      h("label", {}, "Wie heißt du?", nameInput),
      h(
        "div",
        { class: "legend" },
        h("span", { class: "muted", text: "Tippen wechselt:" }),
        h("span", {}, h("i", { class: "dot y" }), "kann"),
        h("span", {}, h("i", { class: "dot m" }), "vielleicht"),
        h("span", {}, h("i", { class: "dot n" }), "kann nicht"),
        h("span", {}, h("i", { class: "dot" }), "offen"),
      ),
      h("div", { class: "chips", id: "quick" }),
      h("p", { class: "status", id: "save-status", role: "status" }),
      h("div", { id: "my-grid" }),
    ),
    h("section", { class: "panel", id: "tab-uebersicht", role: "tabpanel" }),
  );
  renderTabs();
}

function tabButton(id, label) {
  return h("button", {
    type: "button",
    role: "tab",
    id: `tabbtn-${id}`,
    "aria-selected": String(S.tab === id),
    text: label,
    onclick: () => {
      S.tab = id;
      renderTabs();
      renderBody();
    },
  });
}

function renderTabs() {
  for (const id of ["eintragen", "uebersicht"]) {
    document.getElementById(`tabbtn-${id}`).setAttribute("aria-selected", String(S.tab === id));
    document.getElementById(`tab-${id}`).hidden = S.tab !== id;
  }
}

function renderPollHead() {
  const head = document.getElementById("poll-head");
  if (!head) return;
  const p = S.poll;
  const url = pollUrl();
  const linkInput = h("input", { id: "share-link", readonly: true, value: url, "aria-label": "Link zur Terminsuche", onfocus: (e) => e.target.select() });
  const copyBtn = h("button", {
    type: "button",
    class: "btn-primary",
    text: "Link kopieren",
    onclick: async () => {
      try {
        await navigator.clipboard.writeText(url);
        copyBtn.textContent = "Kopiert ✓";
      } catch {
        linkInput.focus();
        linkInput.select();
        copyBtn.textContent = "Markiert, jetzt kopieren";
      }
      setTimeout(() => (copyBtn.textContent = "Link kopieren"), 2200);
    },
  });
  const waText = `${p.title}: Wann hast du Zeit? Trag dich hier ein: ${url}`;
  put(head, 
    h("p", { class: "eyebrow" }, h("a", { href: location.pathname, style: "color:inherit", text: "Terminfinder" }), ` · ${short(parse(p.start))} bis ${short(parse(p.end))}`),
    h("h1", { text: p.title }),
    p.note ? h("p", { class: "note muted", text: p.note }) : null,
    p.fixed ? fixedBox(p) : null,
    h(
      "div",
      { class: "share" },
      linkInput,
      copyBtn,
      h("a", { class: "small", href: `https://wa.me/?text=${encodeURIComponent(waText)}`, target: "_blank", rel: "noopener", text: "In WhatsApp teilen" }),
    ),
  );
}

// ---------- Kalender-Export ----------
function eventTimes(key) {
  const [date, slotId] = key.split("_");
  const slot = slotOf(slotId);
  const ymd = date.replaceAll("-", "");
  return { start: `${ymd}T${pad(slot.from)}0000`, end: `${ymd}T${pad(slot.to)}0000` };
}

function icsEscape(text) {
  return String(text).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

function buildIcs(p) {
  const { start, end } = eventTimes(p.fixed);
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const details = [p.note, `Terminsuche: ${pollUrl()}`].filter(Boolean).join("\n");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Terminfinder//DE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${S.pollId}-${p.fixed}@terminfinder`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${icsEscape(p.title)}`,
    `DESCRIPTION:${icsEscape(details)}`,
    `URL:${pollUrl()}`,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}

function googleCalendarUrl(p) {
  const { start, end } = eventTimes(p.fixed);
  const q = new URLSearchParams({
    action: "TEMPLATE",
    text: p.title,
    dates: `${start}/${end}`,
    details: [p.note, `Terminsuche: ${pollUrl()}`].filter(Boolean).join("\n"),
    ctz: Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Berlin",
  });
  return `https://calendar.google.com/calendar/render?${q}`;
}

function fixedBox(p) {
  const slot = slotOf(p.fixed.split("_")[1]);
  const ics = buildIcs(p);
  const fileName = `${p.title.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "termin"}.ics`;
  // iPhone/iPad: Safari zeigt bei blob:-Links zwar die Kalender-Vorschau,
  // "Hinzufügen" bewirkt dort aber oft nichts. Eine data:-URL ohne
  // download-Attribut öffnet Safari direkt als Kalendertermin.
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const icsUrl = isIOS
    ? `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`
    : URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
  return h(
    "div",
    { class: "fixed" },
    h("p", { text: `Termin steht: ${describeKey(p.fixed)}` }),
    h("p", { class: "small muted", text: `Im Kalender eingetragen als ${pad(slot.from)}:00 bis ${pad(slot.to)}:00 Uhr.` }),
    h(
      "div",
      { class: "chips" },
      h("a", { class: "btn btn-primary", href: icsUrl, download: isIOS ? null : fileName, text: "In meinen Kalender" }),
      h("a", { class: "btn", href: googleCalendarUrl(p), target: "_blank", rel: "noopener", text: "Google Kalender" }),
    ),
  );
}

// Alle Teilnehmenden, mit meinem lokalen (evtl. noch ungespeicherten) Stand.
function participants() {
  const others = S.people.filter((p) => p.id !== S.store.uid && p.name);
  const mine = S.me.name.trim() || Object.keys(S.me.avail).length ? [{ id: S.store.uid, name: S.me.name.trim() || "Du", avail: S.me.avail, isMe: true }] : [];
  return [...others, ...mine].sort((a, b) => a.name.localeCompare(b.name, "de"));
}

function renderBody() {
  if (!S.poll || !document.getElementById("my-grid")) return;
  if (S.tab === "eintragen") renderMine();
  else renderOverview();
}

// ---------- Meine Zeiten ----------
function renderMine() {
  const days = dayList(S.poll.start, S.poll.end);
  const today = todayIso();
  const grid = document.getElementById("my-grid");
  put(grid, 
    h("div", { class: "grid-head" }, h("span", { text: "Tag" }), SLOTS.map((s) => h("span", { title: s.hint }, s.label, h("br"), h("span", { class: "small", text: s.hint })))),
    weeks(days).map((w) =>
      h(
        "div",
        { class: "week" },
        h("p", { class: "eyebrow week-label", text: `KW ${w.w}` }),
        w.days.map((d) => {
          const di = iso(d);
          return h(
            "div",
            { class: `day${isWeekend(d) ? " weekend" : ""}${di < today ? " past" : ""}` },
            h("span", { class: "day-label" }, h("b", { text: WD[d.getDay()] }), short(d)),
            SLOTS.map((s) => {
              const key = `${di}_${s.id}`;
              const v = S.me.avail[key] || "";
              return h("button", {
                type: "button",
                class: `cell ${v}`,
                "data-key": key,
                "aria-label": `${WD_LONG[d.getDay()]} ${short(d)} ${s.label}: ${v ? WORD[v] : "offen"}`,
                text: MARK[v],
                onclick: () => toggle(key),
              });
            }),
          );
        }),
      ),
    ),
  );
  renderQuick();
}

function toggle(key) {
  const v = NEXT[S.me.avail[key] || ""];
  if (v) S.me.avail[key] = v;
  else delete S.me.avail[key];
  const btn = document.querySelector(`#my-grid .cell[data-key="${key}"]`);
  if (btn) {
    btn.className = `cell ${v}`;
    btn.textContent = MARK[v];
    const [date, slot] = key.split("_");
    const d = parse(date);
    btn.setAttribute("aria-label", `${WD_LONG[d.getDay()]} ${short(d)} ${slotOf(slot).label}: ${v ? WORD[v] : "offen"}`);
  }
  scheduleSave();
}

function renderQuick() {
  const box = document.getElementById("quick");
  const days = dayList(S.poll.start, S.poll.end);
  const fill = (pred, value) => {
    for (const d of days)
      for (const s of SLOTS) {
        const key = `${iso(d)}_${s.id}`;
        if (pred(d, s) && !S.me.avail[key]) S.me.avail[key] = value;
      }
    renderMine();
    scheduleSave();
  };
  const hasAny = Object.keys(S.me.avail).length > 0;
  put(box, 
    h("span", { class: "muted small", style: "align-self:center", text: "Schnell füllen:" }),
    h("button", { type: "button", text: "Alle Abende: kann", onclick: () => fill((d, s) => s.id === "abend", "y") }),
    h("button", { type: "button", text: "Wochenenden: kann", onclick: () => fill((d) => isWeekend(d), "y") }),
    h("button", { type: "button", text: "Rest: kann nicht", onclick: () => fill(() => true, "n") }),
    hasAny
      ? S.confirmClear
        ? h("button", {
            type: "button",
            class: "btn-danger",
            text: "Wirklich alles leeren?",
            onclick: () => {
              S.me.avail = {};
              S.confirmClear = false;
              renderMine();
              scheduleSave();
            },
          })
        : h("button", {
            type: "button",
            class: "btn-quiet",
            text: "Alles leeren",
            onclick: () => {
              S.confirmClear = true;
              renderQuick();
              setTimeout(() => {
                S.confirmClear = false;
                if (S.tab === "eintragen") renderQuick();
              }, 4000);
            },
          })
      : null,
  );
}

function scheduleSave() {
  S.dirty = true;
  clearTimeout(S.saveTimer);
  const status = document.getElementById("save-status");
  if (!S.me.name.trim()) {
    if (status) setStatus(status, "Trag oben deinen Namen ein, dann wird gespeichert.", true);
    document.getElementById("my-name")?.classList.add("field-attn");
    return;
  }
  if (status) setStatus(status, "Speichert …");
  S.saveTimer = setTimeout(save, 600);
}

const SAVE_ERRORS = {
  "permission-denied": "Die Datenbank hat den Eintrag abgelehnt.",
  unauthenticated: "Die Anmeldung im Hintergrund ist abgelaufen. Lade die Seite bitte neu.",
  unavailable: "Keine Verbindung zum Server.",
  timeout: "Der Server antwortet nicht.",
  "resource-exhausted": "Gerade zu viele Anfragen.",
};

async function save(attempt = 1) {
  const status = document.getElementById("save-status");
  const name = S.me.name.trim();
  if (!name) return;
  ls.set("tf-name", name);
  try {
    await S.store.saveMe(S.pollId, { name, avail: { ...S.me.avail } });
    S.dirty = false;
    if (status) setStatus(status, "Gespeichert ✓ Die anderen sehen deine Zeiten sofort.");
  } catch (e) {
    console.error(e);
    const code = (e && e.code) || (e && e.name) || "unbekannt";
    if (attempt < 3 && code !== "permission-denied") {
      if (status) setStatus(status, "Speichern klappt gerade nicht, neuer Versuch …");
      clearTimeout(S.saveTimer);
      S.saveTimer = setTimeout(() => save(attempt + 1), 2500 * attempt);
      return;
    }
    const why = SAVE_ERRORS[code] || "Unbekannter Fehler.";
    if (status) setStatus(status, `Speichern hat nicht geklappt. ${why} Tippe ein Feld erneut an, um es noch mal zu versuchen. (Fehlercode: ${code})`, true);
  }
}

// ---------- Übersicht ----------
function tally(people) {
  const map = {};
  for (const p of people)
    for (const [k, v] of Object.entries(p.avail || {})) {
      if (!WORD[v]) continue;
      (map[k] ??= { y: [], m: [], n: [] })[v].push(p);
    }
  return map;
}
const scoreOf = (t) => (t ? t.y.length + t.m.length * 0.5 : 0);

function renderOverview() {
  const box = document.getElementById("tab-uebersicht");
  const people = participants();
  const n = people.length;
  if (!n) {
    put(box, 
      h("h2", { text: "Noch keine Einträge" }),
      h("p", { class: "muted", text: "Sobald jemand seine Zeiten einträgt, siehst du hier, wann die meisten können. Fang am besten selbst an und schick dann den Link herum." }),
    );
    return;
  }
  const today = todayIso();
  const days = dayList(S.poll.start, S.poll.end);
  const t = tally(people);
  const keys = days.flatMap((d) => SLOTS.map((s) => `${iso(d)}_${s.id}`)).filter((k) => k.slice(0, 10) >= today);
  const ranked = keys
    .filter((k) => scoreOf(t[k]) > 0)
    .sort((a, b) => scoreOf(t[b]) - scoreOf(t[a]) || (t[a]?.n.length ?? 0) - (t[b]?.n.length ?? 0) || a.localeCompare(b));
  const best = ranked.length ? scoreOf(t[ranked[0]]) : 0;
  const isOwner = S.poll.owner === S.store.uid;

  const top = ranked.slice(0, 5).map((k) => {
    const x = t[k];
    return h(
      "li",
      { onclick: () => select(k), title: "Details anzeigen" },
      h("span", { class: "score", text: x.y.length }),
      h("span", { class: "top-when", text: describeKey(k) }),
      h(
        "span",
        { class: "top-who" },
        `${x.y.length} von ${n} können`,
        x.m.length ? ` · ${x.m.length} vielleicht` : "",
        x.n.length ? ` · ${x.n.length} können nicht` : "",
      ),
    );
  });

  put(box, 
    h("div", { class: "detail" }, h("p", { class: "eyebrow", text: `${n} ${n === 1 ? "Person hat" : "Personen haben"} eingetragen` }), h("div", { class: "people" }, people.map((p) => h("span", { class: "name", text: p.isMe ? `${p.name} (du)` : p.name })))),
    h("h2", { text: "Beste Termine" }),
    top.length ? h("ol", { class: "top-list" }, top) : h("p", { class: "muted", text: "Für die kommenden Tage hat noch niemand „kann“ eingetragen." }),
    S.selected ? renderDetail(S.selected, t, people, isOwner) : null,
    h("h2", { text: "Alle Tage" }),
    h("p", { class: "muted small", text: "Die Zahl zeigt, wie viele können, „+1?“ heißt: eine Person vielleicht. Je kräftiger das Grün, desto mehr Leute haben Zeit. Umrandet sind die besten Termine. Tippe auf ein Feld, um zu sehen, wer kann." }),
    h(
      "div",
      {},
      h("div", { class: "grid-head" }, h("span", { text: "Tag" }), SLOTS.map((s) => h("span", { text: s.label }))),
      weeks(days).map((w) =>
        h(
          "div",
          { class: "week" },
          h("p", { class: "eyebrow week-label", text: `KW ${w.w}` }),
          w.days.map((d) => {
            const di = iso(d);
            return h(
              "div",
              { class: `day${isWeekend(d) ? " weekend" : ""}${di < today ? " past" : ""}` },
              h("span", { class: "day-label" }, h("b", { text: WD[d.getDay()] }), short(d)),
              SLOTS.map((s) => {
                const k = `${di}_${s.id}`;
                const x = t[k];
                const sc = scoreOf(x);
                const pct = Math.round((sc / n) * 100);
                const cls = ["cell", "heat"];
                if (!x || (!x.y.length && !x.m.length)) cls.push("none");
                if (pct >= 60) cls.push("strong");
                if (sc > 0 && sc === best && di >= today) cls.push("best");
                if (S.selected === k) cls.push("sel");
                return h("button", {
                  type: "button",
                  class: cls.join(" "),
                  style: `--pct:${pct}`,
                  "aria-label": `${describeKey(k)}: ${x ? x.y.length : 0} können, ${x ? x.m.length : 0} vielleicht`,
                  text: x && (x.y.length || x.m.length) ? `${x.y.length}${x.m.length ? ` +${x.m.length}?` : ""}` : "–",
                  onclick: () => select(k),
                });
              }),
            );
          }),
        ),
      ),
    ),
  );
}

function select(key) {
  S.selected = S.selected === key ? null : key;
  renderOverview();
  if (S.selected) document.getElementById("detail")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function renderDetail(key, t, people, isOwner) {
  const x = t[key] || { y: [], m: [], n: [] };
  const answered = new Set([...x.y, ...x.m, ...x.n].map((p) => p.id));
  const open = people.filter((p) => !answered.has(p.id));
  const group = (label, list, cls) =>
    list.length
      ? h("div", { class: "who-group" }, h("p", { class: "eyebrow", text: `${label} (${list.length})` }), h("div", { class: "names" }, list.map((p) => h("span", { class: `name ${cls}`, text: p.name }))))
      : null;
  const fixedHere = S.poll.fixed === key;
  return h(
    "section",
    { class: "panel detail", id: "detail" },
    h("h3", { text: describeKey(key) }),
    group("Kann", x.y, "y"),
    group("Vielleicht", x.m, "m"),
    group("Kann nicht", x.n, "n"),
    group("Keine Angabe", open, ""),
    h(
      "div",
      { class: "chips" },
      isOwner
        ? h("button", {
            type: "button",
            class: fixedHere ? "" : "btn-primary",
            text: fixedHere ? "Festlegung aufheben" : "Als Termin festlegen",
            onclick: async () => {
              try {
                await S.store.setFixed(S.pollId, fixedHere ? null : key);
              } catch (e) {
                console.error(e);
              }
            },
          })
        : null,
      h("button", { type: "button", class: "btn-quiet", text: "Schließen", onclick: () => select(key) }),
    ),
  );
}

addEventListener("popstate", () => location.reload());
