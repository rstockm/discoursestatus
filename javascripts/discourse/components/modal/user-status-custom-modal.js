import Component from "@glimmer/component";
import { action } from "@ember/object";
import { inject as service } from "@ember/service";
import { tracked } from "@glimmer/tracking";
import { timeShortcuts, TIME_SHORTCUT_TYPES } from "discourse/lib/time-shortcut";
import ItsATrap from "@discourse/itsatrap";

const PRESET_STATUSES = [
  { emoji: "house_with_garden", name: "Homeoffice" },
  { emoji: "palm_tree", name: "Urlaub" },
  { emoji: "face_with_medical_mask", name: "Krank" },
  { emoji: "desktop_computer", name: "Büro" },
  { emoji: "train", name: "Mobil" },
  { emoji: "hot_beverage", name: "Pause" },
  { emoji: "spiral_calendar", name: "Meeting" },
  { emoji: "headphones", name: "Fokus" },
  { emoji: "x", name: "Abwesend" },
  { emoji: "books", name: "Publikum" }
];

const STORAGE_KEY = "user_status_history";

class TrackedStatus {
  @tracked emoji = "speech_balloon";
  @tracked description = "";
  @tracked endsAt = null;

  constructor(initial = {}) {
    if (initial) {
      this.emoji = initial.emoji || "speech_balloon";
      this.description = initial.description || "";
      this.endsAt = initial.ends_at ? new Date(initial.ends_at) : null;
    }
  }
}

export default class UserStatusCustomModal extends Component {
  @service siteSettings;
  @service currentUser;
  @service userStatus;
  @service dialog;

  @tracked status = new TrackedStatus(this.currentUser?.status);
  @tracked pauseNotifications = false;
  @tracked history = [];
  
  timeShortcutsArray = this.buildTimeShortcuts();
  _itsatrap = new ItsATrap();
  
  @tracked selectedShortcutId = null;

  constructor() {
    super(...arguments);
    this.loadHistory();
  }

  willDestroy() {
    super.willDestroy(...arguments);
    this._itsatrap.destroy();
  }
  
  get presets() {
    return PRESET_STATUSES;
  }

  get saveDisabled() {
    // Discourse erlaubt das Speichern, solange ENTWEDER ein Emoji ODER ein Text vorhanden ist.
    // Ein Status darf nicht komplett leer sein (außer man löscht ihn, was der Mülleimer-Button macht).
    // Da das Standard-Emoji "speech_balloon" ist, ist diese Bedingung fast immer erfüllt.
    if (!this.status.emoji && !this.status.description) {
      return true;
    }
    return false;
  }

  get showDeleteButton() {
    return !!this.currentUser?.status;
  }

  get prefilledDateTime() {
    // Verhindert, dass der Custom Picker aufklappt, außer "Custom" wurde explizit gewählt
    if (this.selectedShortcutId === "custom") {
      return this.status.endsAt;
    }
    // Gebe null zurück, damit das Dropdown initial geschlossen bleibt, 
    // auch wenn bereits ein Status mit Zeit gesetzt ist.
    return null;
  }

  get customTimeShortcutLabels() {
    return {
      [TIME_SHORTCUT_TYPES.NONE]: "Nie",
    };
  }

  get hiddenTimeShortcutOptions() {
    return [
      TIME_SHORTCUT_TYPES.NONE,
      TIME_SHORTCUT_TYPES.ONE_HOUR,
      TIME_SHORTCUT_TYPES.TWO_HOURS,
      TIME_SHORTCUT_TYPES.LATER_TODAY,
      TIME_SHORTCUT_TYPES.TOMORROW,
      TIME_SHORTCUT_TYPES.THIS_WEEKEND,
      TIME_SHORTCUT_TYPES.NEXT_WEEK,
      TIME_SHORTCUT_TYPES.NEXT_MONTH,
      TIME_SHORTCUT_TYPES.TWO_WEEKS,
      TIME_SHORTCUT_TYPES.LAST_CUSTOM
    ];
  }

  buildTimeShortcuts() {
    if (!this.currentUser) return [];
    const shortcuts = timeShortcuts(this.currentUser.user_option.timezone);
    return [
      shortcuts.oneHour(), 
      shortcuts.twoHours(), 
      shortcuts.laterToday(), 
      shortcuts.tomorrow()
    ];
  }

  get inlineTimeShortcuts() {
    if (!this.currentUser) return [];
    const shortcuts = timeShortcuts(this.currentUser.user_option.timezone);
    return [
      { id: "one_hour", name: "In einer Stunde", time: shortcuts.oneHour().time },
      { id: "two_hours", name: "In zwei Stunden", time: shortcuts.twoHours().time },
      { id: "later_today", name: "Im Laufe des Tages", time: shortcuts.laterToday().time },
      { id: "tomorrow", name: "Morgen", time: shortcuts.tomorrow().time },
      { id: "none", name: "Nie", time: null }
    ].map(s => ({
      ...s,
      activeClass: this.selectedShortcutId === s.id ? 'active' : ''
    }));
  }

  @action
  setInlineTime(shortcutId, time) {
    this.selectedShortcutId = shortcutId;
    this.status.endsAt = time;
  }

  loadHistory() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        let parsed = JSON.parse(stored);
        parsed.sort((a, b) => b.count - a.count);
        this.history = parsed.slice(0, 3);
      }
    } catch (e) {
      console.error("Could not load status history", e);
    }
  }

  saveToHistory(emoji, description) {
    if (!description) return;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      let parsed = stored ? JSON.parse(stored) : [];
      
      const existingIdx = parsed.findIndex(item => item.emoji === emoji && item.name === description);
      if (existingIdx >= 0) {
        parsed[existingIdx].count = (parsed[existingIdx].count || 1) + 1;
      } else {
        parsed.push({ emoji, name: description, count: 1 });
      }
      
      localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
    } catch (e) {
      console.error("Could not save status history", e);
    }
  }

  @action
  setQuickStatus(emoji, description) {
    this.status.emoji = emoji;
    this.status.description = description;
    // Set default end time if not set, optional
  }

  @action
  onTimeSelected(time) {
    this.selectedShortcutId = "custom";
    this.status.endsAt = time;
  }

  @action
  async deleteStatus() {
    try {
      if (this.userStatus) {
        await this.userStatus.clear();
      }
      this.args.closeModal();
    } catch (e) {
      if (typeof e === "string") this.dialog.alert(e);
      else console.error(e);
    }
  }

  @action
  async saveStatus() {
    if (this.status.description.length > 30) {
      this.dialog.alert("Statusmeldung darf maximal 30 Zeichen lang sein.");
      return;
    }

    this.saveToHistory(this.status.emoji, this.status.description);

    // Format `ends_at` as ISO string if it's a valid date/time, otherwise use exactly what was passed.
    // Discourse time shortcuts (like moment.js objects) might need formatting, or they might be raw strings.
    let formattedEndsAt = null;
    if (this.status.endsAt) {
      if (typeof this.status.endsAt === "string") {
        formattedEndsAt = this.status.endsAt;
      } else if (typeof this.status.endsAt.toISOString === "function") {
        formattedEndsAt = this.status.endsAt.toISOString();
      } else if (this.status.endsAt.format) { // Moment.js handling which Discourse often uses
        formattedEndsAt = this.status.endsAt.format();
      } else {
        formattedEndsAt = new Date(this.status.endsAt).toISOString();
      }
    }

    const newStatus = {
      description: this.status.description,
      emoji: this.status.emoji,
      ends_at: formattedEndsAt,
    };

    // #region agent log
    fetch('http://127.0.0.1:7931/ingest/89deca5e-9e6e-457a-abe7-f4a6e39bf6b5',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'bdd1ba'},body:JSON.stringify({sessionId:'bdd1ba',location:'user-status-custom-modal.js:223',message:'Saving status payload',data:{newStatus, originalEndsAt: this.status.endsAt},timestamp:Date.now(),runId:'run2',hypothesisId:'1'})}).catch(()=>{});
    // #endregion

    try {
      if (this.userStatus) {
        await this.userStatus.set(newStatus, this.pauseNotifications);
      } else {
        // Fallback falls userStatus service in dieser Version fehlt
        await this.currentUser.saveStatus(newStatus);
      }
      this.args.closeModal();
    } catch (e) {
      // #region agent log
      fetch('http://127.0.0.1:7931/ingest/89deca5e-9e6e-457a-abe7-f4a6e39bf6b5',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'bdd1ba'},body:JSON.stringify({sessionId:'bdd1ba',location:'user-status-custom-modal.js:235',message:'Error saving status',data:{error:e},timestamp:Date.now(),runId:'run2',hypothesisId:'1'})}).catch(()=>{});
      // #endregion
      if (typeof e === "string") this.dialog.alert(e);
      else console.error(e);
    }
  }
}
