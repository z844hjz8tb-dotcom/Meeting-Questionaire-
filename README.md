# Terminfinder

Eine kleine Web-App, um im Freundeskreis einen Termin zu finden, ohne WhatsApp-Chaos und ohne Doodle.

- Du erstellst eine Terminsuche (Anlass + Zeitraum) und schickst den Link in die Gruppe.
- Jeder trägt seinen Namen ein und tippt pro Tag an, ob er **mittags**, **nachmittags** oder **abends** kann (kann / vielleicht / kann nicht).
- Die **Übersicht** zeigt live, welche Termine am besten passen, und wer wann kann.
- Wer die Terminsuche erstellt hat, kann einen Termin als fest markieren.

Kein Konto nötig: Jeder Browser wird im Hintergrund anonym angemeldet. Wer seinen Eintrag ändern will, öffnet den Link einfach wieder im selben Browser.

Die App liegt im Ordner `docs/` (reines HTML/CSS/JS, kein Build-Schritt). Daten liegen in einer kostenlosen Firebase-Datenbank.

## Einrichtung (einmalig, ca. 10 Minuten)

### 1. Firebase-Projekt anlegen

1. Auf <https://console.firebase.google.com> mit einem Google-Konto anmelden und **Projekt hinzufügen** wählen (Google Analytics kann aus bleiben).
2. Links **Build → Authentication → Jetzt starten**, dann unter **Anmeldemethode** den Anbieter **Anonym** aktivieren.
3. Links **Build → Firestore Database → Datenbank erstellen**, Standort z. B. `eur3 (europe-west)`, im **Produktionsmodus** starten.
4. In Firestore auf den Reiter **Regeln** gehen, den Inhalt von [`firestore.rules`](firestore.rules) hineinkopieren und **Veröffentlichen**.
5. Auf der Projektübersicht auf das Web-Symbol **`</>`** klicken, eine App registrieren (Hosting nicht nötig) und die angezeigten Werte von `firebaseConfig` in [`docs/firebase-config.js`](docs/firebase-config.js) eintragen.

Die Werte in `firebase-config.js` sind nicht geheim und dürfen im Repo stehen. Geschützt werden die Daten durch die Regeln.

### 2. Auf GitHub Pages veröffentlichen

1. Im Repo auf GitHub: **Settings → Pages**.
2. Bei **Source** „Deploy from a branch“ wählen, Branch `main`, Ordner `/docs`, **Save**.
3. Nach ein bis zwei Minuten ist die App unter `https://<dein-github-name>.github.io/<repo-name>/` erreichbar.
4. In Firebase unter **Authentication → Einstellungen → Autorisierte Domains** die Domain `<dein-github-name>.github.io` hinzufügen.

Fertig: Terminsuche erstellen, Link kopieren oder direkt über „In WhatsApp teilen“ verschicken.

## Lokal ausprobieren

```bash
cd docs
python3 -m http.server 8000
```

Dann <http://localhost:8000> öffnen. Ohne eingetragene Firebase-Werte läuft die App im **Demo-Modus**: alles funktioniert, die Daten bleiben aber nur im eigenen Browser.

## Kosten

Der kostenlose Spark-Tarif von Firebase reicht für einen Freundeskreis bei Weitem (50.000 Lesevorgänge und 20.000 Schreibvorgänge pro Tag).

## Stand (November 2026)

Läuft live unter <https://z844hjz8tb-dotcom.github.io/Meeting-Questionaire-/> mit dem Firebase-Projekt `terminfinder-bcf99`.

Fertig:
- Terminsuche erstellen, Link teilen (kopieren oder WhatsApp, mit Vorschau-Karte)
- Eintragen pro Tag: Mittag, Nachmittag, Abend (kann / vielleicht / kann nicht), Schnell-Füllen
- Live-Übersicht: beste Termine, Kalender nach KW, wer wann kann
- Ersteller legt den Termin fest; alle können ihn in den Kalender übernehmen (.ics, auf dem iPhone per data:-URL, und Google Kalender)
- Speichern mit automatischer Wiederholung und Fehlercode in der Meldung
- Mitbring-Liste (optional pro Terminsuche): Wunschliste, „Bring ich mit“, eigene Sachen eintragen, Übersicht nach Personen

Ideen für später:
1. Eintrag auf anderem Gerät übernehmen („Bist du Julia?“), damit niemand doppelt in der Liste steht
2. „Generell Zeit“ als Wochenmuster merken und neue Terminsuchen damit vorausfüllen
3. Terminsuche bearbeiten oder löschen, vergangene Tage ausblenden, Kommentar pro Person, App-Symbol für den Homescreen
