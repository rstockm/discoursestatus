# Implementierungsplan: Kompatibilitäts- und Sicherheitsverbesserungen

Dieser Plan setzt die Ergebnisse der Repository-Analyse (Discourse-Kompatibilität und Angriffsflächen) in konkrete, umsetzbare Schritte um. Die Reihenfolge ist nach Risiko/Nutzen priorisiert.

Zielversion: Discourse 2026.3.x. Vorgehen: pro Schritt ein eigener Branch, Merge nach `main`, Test auf der Instanz, Rollback per `git revert` möglich.

---

## Übersicht der Schritte

| # | Thema | Priorität | Risiko der Umsetzung | Betroffene Dateien |
|---|-------|-----------|----------------------|--------------------|
| 1 | `team_status_group` URL-Encoding + Validierung | Hoch | Niedrig | `team-status-header-icon.js` |
| 2 | i18n: harte Strings auslagern | Mittel | Niedrig | neue `locales/*.yml`, mehrere `.hbs`/`.js` |
| 3 | Presets auf `type: objects` migrieren | Mittel | Mittel | `settings.yml`, `user-status-custom-modal.js` |
| 4 | localStorage-Historie absichern/optional | Mittel | Niedrig | `settings.yml`, `user-status-custom-modal.js` |
| 5 | Modal-Umleitung entschärfen (Monkeypatch) | Hoch | Hoch | `user-status-overlay.js` |
| 6 | A11y-Restarbeiten abschließen | Mittel | Niedrig | `user-status-custom-modal.hbs`, `team-status-header-icon.hbs` |
| 7 | Optional: Migration auf `apiInitializer`/`.gjs` | Niedrig | Mittel | `user-status-overlay.js` |

---

## Schritt 1: `team_status_group` absichern (URL-Encoding + Validierung)

**Problem:** In [`team-status-header-icon.js`](../javascripts/discourse/components/team-status-header-icon.js) fließt `settings.team_status_group` ungefiltert in einen AJAX-Pfad ein.

**Umsetzung:**
- Gruppennamen vor Einsatz in der URL mit `encodeURIComponent(...)` kodieren.
- Einfache Whitelist-Validierung: nur zulässige Zeichen für Discourse-Gruppennamen (z. B. `^[a-zA-Z0-9_]+$`), sonst Abbruch/Log.
- Bei ungültigem Wert keine AJAX-Anfrage senden.

**Beispiel (Zielzustand):**

```js
async fetchTeamMembers() {
  this.isLoading = true;
  try {
    const rawGroup = settings.team_status_group || "team";
    const groupName = String(rawGroup).trim();
    if (!/^[a-zA-Z0-9_]+$/.test(groupName)) {
      console.warn("discoursestatus: ungültiger Gruppenname", groupName);
      return;
    }
    const response = await ajax(`/groups/${encodeURIComponent(groupName)}/members.json`);
    if (response && response.members) {
      this.teamMembers = response.members;
    }
  } catch (e) {
    console.error("Could not fetch team members for group", settings.team_status_group, e);
  } finally {
    this.isLoading = false;
  }
}
```

**Akzeptanzkriterien:**
- Gültige Gruppe: Liste lädt wie bisher.
- Ungültiger/leerer Wert: keine Anfrage, kein JS-Fehler.

---

## Schritt 2: i18n einführen (harte Strings auslagern)

**Problem:** Deutsche Strings sind in Templates und JS hart kodiert (z. B. "Häufig genutzt", "Datum und Uhrzeit auswählen", Fehlermeldungen, "Team Status", "Lade Team...").

**Umsetzung:**
- Neue Dateien `locales/de.yml` und `locales/en.yml` anlegen.
- Strings über `themePrefix`/`theme-prefix` referenzieren:
  - Templates: `{{i18n (themePrefix "status.frequently_used")}}`
  - JS: `import { i18n } from "discourse-i18n";` und `i18n(themePrefix("status.max_length"))`
- Betroffen: [`user-status-custom-modal.hbs`](../javascripts/discourse/components/modal/user-status-custom-modal.hbs), [`user-status-custom-modal.js`](../javascripts/discourse/components/modal/user-status-custom-modal.js), [`team-status-header-icon.hbs`](../javascripts/discourse/components/team-status-header-icon.hbs).

**Beispiel `locales/de.yml`:**

```yaml
de:
  status:
    frequently_used: "Häufig genutzt"
    quick_select: "Schnellauswahl"
    own_status: "Eigener Status"
    pick_datetime: "Datum und Uhrzeit auswählen"
    max_length: "Statusmeldung darf maximal 30 Zeichen lang sein."
  team:
    title: "Team Status"
    loading: "Lade Team..."
    empty: "Keine Teammitglieder in Gruppe \"%{group}\" gefunden."
```

**Akzeptanzkriterien:**
- Keine sichtbare Änderung bei Sprache DE.
- EN-Fallback vorhanden; keine fehlenden Übersetzungsschlüssel in der Konsole.

---

## Schritt 3: Presets auf `type: objects` migrieren

**Problem:** `status_presets` ist ein kommagetrennter String (`emoji,Label|...`), der manuell geparst wird. Fehleranfällig und schlecht validierbar.

**Umsetzung:**
- In [`settings.yml`](../settings.yml) auf `type: objects` mit Schema `{ emoji, name }` umstellen.
- Parsing in [`user-status-custom-modal.js`](../javascripts/discourse/components/modal/user-status-custom-modal.js) (`get presets`) vereinfachen: Array direkt verwenden, Fallback auf `PRESET_STATUSES` beibehalten.
- Rückwärtskompatibilität: alter String-Parser als Fallback für eine Übergangszeit belassen oder in Release Notes auf Neukonfiguration hinweisen.

**Beispiel `settings.yml`:**

```yaml
status_presets:
  type: objects
  default:
    - emoji: house_with_garden
      name: Homeoffice
    - emoji: palm_tree
      name: Urlaub
  schema:
    name: preset
    properties:
      emoji:
        type: string
        required: true
      name:
        type: string
        required: true
```

**Akzeptanzkriterien:**
- Admin kann Presets in strukturierter UI pflegen.
- Modal zeigt konfigurierte Presets; leere/fehlerhafte Konfiguration fällt auf Defaults zurück.

---

## Schritt 4: localStorage-Historie absichern/optional machen

**Problem:** Statushistorie (`user_status_history`, u. a. "Krank") liegt in `localStorage` und ist same-origin lesbar; potenziell sensibel.

**Umsetzung:**
- Neues Boolean-Setting `enable_status_history` (Default `true`).
- In [`user-status-custom-modal.js`](../javascripts/discourse/components/modal/user-status-custom-modal.js) `loadHistory`/`saveToHistory` nur ausführen, wenn aktiviert.
- `try/catch` bleibt; bei deaktivierter Historie keinerlei Schreibzugriff.
- Optional: Begrenzung/Bereinigung alter Einträge dokumentieren.

**Akzeptanzkriterien:**
- Setting aus: keine Historie, kein `localStorage`-Schreibzugriff, "Häufig genutzt" wird ausgeblendet.
- Setting an: Verhalten wie bisher.

---

## Schritt 5: Modal-Umleitung entschärfen (größter Kompatibilitätsrisiko-Punkt)

**Problem:** [`user-status-overlay.js`](../javascripts/discourse/initializers/user-status-overlay.js) überschreibt `modal.show` direkt auf der Singleton-Instanz und importiert internes Core-Modal. Update-anfällig und kollisionsgefährdet.

**Umsetzung (Optionen, absteigend bevorzugt):**
1. Prüfen, ob eine offizielle Plugin-API existiert, um das User-Status-Modal zu ersetzen/erweitern (z. B. Value-Transformer, Component-Override via `api.renderInOutlet`/Connector oder gezieltes `modifyClass` auf der Komponente statt auf dem Service).
2. Falls Monkeypatch bleibt: defensiver machen
   - Guard bei fehlender/anderer `modal.show`-Signatur.
   - Klaren Namespace-Marker + einmalige Anwendung (bereits via `__discoursestatusUserStatusShowWrapped`).
   - Try/catch um den Wrapper, damit Fehler nicht andere Modals blockieren.
   - `minimum_discourse_version`/`maximum_discourse_version` in `about.json` setzen, um bekannte Kompatibilität zu dokumentieren.
3. Regressionstest-Checkliste für alle 3 Einstiegspunkte (Platzhalter, Menü, Konto).

**Akzeptanzkriterien:**
- Alle 3 Wege öffnen dasselbe Custom-Modal.
- Andere Modals im Forum funktionieren unverändert.
- Bei unerwarteter Core-Signatur: Fallback auf natives Verhalten statt Fehler.

---

## Schritt 6: A11y-Restarbeiten abschließen

**Problem:** Offene Punkte aus dem WCAG-Review.

**Umsetzung:**
- Trash-Button in [`user-status-custom-modal.hbs`](../javascripts/discourse/components/modal/user-status-custom-modal.hbs) mit `@translatedAriaLabel` (z. B. i18n "Status entfernen").
- `datetime-local` Input mit zugehörigem `<label>`/`aria-label` versehen.
- Team-Dropdown in [`team-status-header-icon.hbs`](../javascripts/discourse/components/team-status-header-icon.hbs): `<a href>` → semantischer Button oder `role="button"` + Tastaturbedienung + `aria-expanded`; Emoji-Teil mit `aria-hidden="true"`.
- Kontraste (z. B. `darkgreen` auf `#e0e0e0`, `#007175`) messen und ggf. anpassen.

**Akzeptanzkriterien:**
- Screenreader liest sinnvolle Namen, keine Emoji-Beschreibungen.
- Team-Dropdown per Tastatur bedienbar.

---

## Schritt 7 (optional): Migration auf `apiInitializer` / `.gjs`

**Problem:** Aktuell klassischer Initializer mit `withPluginApi` und globalen DOM-Listenern.

**Umsetzung:**
- Perspektivisch auf `javascripts/api-initializers/*.gjs` und `apiInitializer` umstellen.
- Platzhalter-Logik möglichst über Discourse-Outlets/Component-Overrides statt manueller DOM-Manipulation.
- Nur angehen, wenn Schritte 1–6 stabil sind (größerer Umbau).

---

## Test- und Rollout-Strategie

1. Pro Schritt eigener Branch (`fix/team-group-encoding`, `chore/i18n`, ...).
2. Merge nach `main`, Theme auf der Instanz aktualisieren, hart neu laden.
3. Manuelle Regressionstests:
   - Status setzen/ändern/löschen über alle 3 Wege.
   - Team-Dropdown laden (gültige/ungültige Gruppe).
   - Tastatur- und Screenreader-Check.
4. Bei Fehlern: `git revert <commit>` oder vorheriges Theme-Release in Discourse aktivieren.

---

## Definition of Done (gesamt)

- Keine ungefilterten Settings in URLs.
- Keine funktional kritischen harten Strings mehr (i18n vorhanden).
- Presets strukturiert konfigurierbar.
- Historie abschaltbar.
- Modal-Umleitung defensiv und dokumentiert kompatibel.
- WCAG-Restpunkte umgesetzt.
