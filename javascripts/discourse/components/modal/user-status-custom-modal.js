import Component from "@glimmer/component";
import { action } from "@ember/object";
import { inject as service } from "@ember/service";
import { tracked } from "@glimmer/tracking";
import { timeShortcuts } from "discourse/lib/time-shortcut";

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
  
  @tracked selectedShortcutId = null;
  @tracked showCustomPicker = false;

  constructor() {
    super(...arguments);
    this.loadHistory();
  }
  
  get presets() {
    return PRESET_STATUSES;
  }

  get saveDisabled() {
    if (!this.status.emoji && !this.status.description) {
      return true;
    }
    return false;
  }

  get showDeleteButton() {
    return !!this.currentUser?.status;
  }

  get isCustomActive() {
    return this.selectedShortcutId === "custom";
  }

  get customDateTimeLocal() {
    if (!this.status.endsAt) return "";
    try {
      let d;
      if (typeof this.status.endsAt.toDate === "function") {
        d = this.status.endsAt.toDate();
      } else {
        d = new Date(this.status.endsAt);
      }
      if (isNaN(d.getTime())) return "";
      
      const tzOffset = d.getTimezoneOffset() * 60000;
      const localISOTime = (new Date(d.getTime() - tzOffset)).toISOString().slice(0, 16);
      return localISOTime;
    } catch (e) {
      return "";
    }
  }

  @action
  toggleCustomPicker() {
    this.showCustomPicker = !this.showCustomPicker;
    if (this.showCustomPicker && this.selectedShortcutId !== "custom") {
      this.selectedShortcutId = "custom";
    }
  }

  @action
  onCustomDateTimeChange(event) {
    const val = event.target.value;
    if (!val) {
      this.status.endsAt = null;
      return;
    }
    this.status.endsAt = new Date(val);
    this.selectedShortcutId = "custom";
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
    this.showCustomPicker = false;
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

    let formattedEndsAt = null;
    if (this.status.endsAt) {
      try {
        if (typeof this.status.endsAt.toISOString === "function") {
          formattedEndsAt = this.status.endsAt.toISOString();
        } else if (typeof this.status.endsAt.toDate === "function") {
          formattedEndsAt = this.status.endsAt.toDate().toISOString();
        } else {
          const d = new Date(this.status.endsAt);
          if (!isNaN(d.getTime())) {
            formattedEndsAt = d.toISOString();
          } else {
            formattedEndsAt = this.status.endsAt;
          }
        }
      } catch (err) {
        console.error("Error formatting date", err);
        formattedEndsAt = this.status.endsAt;
      }
    }

    const newStatus = {
      description: this.status.description,
      emoji: this.status.emoji,
      ends_at: formattedEndsAt,
    };

    try {
      if (this.userStatus) {
        await this.userStatus.set(newStatus, this.pauseNotifications);
      } else {
        await this.currentUser.saveStatus(newStatus);
      }
      this.args.closeModal();
    } catch (e) {
      if (typeof e === "string") this.dialog.alert(e);
      else console.error(e);
    }
  }
}