import Component from "@glimmer/component";
import { action } from "@ember/object";
import { inject as service } from "@ember/service";
import { tracked } from "@glimmer/tracking";

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
  { emoji: "books", name: "Im Publikumsbereich" }
];

const STORAGE_KEY = "user_status_history";

export default class UserStatusCustomModal extends Component {
  @service siteSettings;
  @service currentUser;
  @service dialog;

  @tracked customEmoji = "speech_balloon";
  @tracked customText = "";
  @tracked history = [];
  
  constructor() {
    super(...arguments);
    this.loadHistory();
  }
  
  get presets() {
    return PRESET_STATUSES;
  }

  loadHistory() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        let parsed = JSON.parse(stored);
        // Sort by count descending and take top 3
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
  setStatus(emoji, description) {
    if (!this.currentUser) return;
    
    this.saveToHistory(emoji, description);
    
    // Discourse core endpoint is PUT /user-status
    // Future Feature (Scheduling):
    // To support "ends_at", add it to this payload.
    // Example: ends_at: new Date(Date.now() + 3600*1000).toISOString()
    return this.currentUser.saveStatus({
      description,
      emoji
    }).then(() => {
      this.args.closeModal();
      window.location.reload();
    });
  }

  @action
  clearStatus() {
    if (!this.currentUser) return;
    
    return this.currentUser.clearStatus().then(() => {
      this.args.closeModal();
      window.location.reload();
    });
  }

  @action
  saveCustomStatus() {
    if (this.customText.length > 30) {
      this.dialog.alert("Statusmeldung darf maximal 30 Zeichen lang sein.");
      return;
    }
    this.setStatus(this.customEmoji, this.customText);
  }
}
