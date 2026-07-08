import Component from "@glimmer/component";
import { action } from "@ember/object";
import { trackedObject } from "@ember/reactive/collections";
import { service } from "@ember/service";
import { tracked } from "@glimmer/tracking";
import { getOwner } from "@ember/application";
import { popupAjaxError } from "discourse/lib/ajax-error";
import { i18n } from "discourse-i18n";
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
  { emoji: "books", name: "Publikum" },
];

const STORAGE_KEY = "user_status_history";

const TIME_LABELS = {
  one_hour: "In einer Stunde",
  two_hours: "In zwei Stunden",
  later_today: "Im Laufe des Tages",
  tomorrow: "Morgen",
  none: "Nie",
};

function themeTranslation(key, fallback) {
  if (typeof themePrefix !== "undefined") {
    return i18n(themePrefix(key));
  }
  return fallback;
}

function normalizeStatus(status = {}) {
  const initial = { ...status };
  if (initial.ends_at && !initial.endsAt) {
    initial.endsAt = new Date(initial.ends_at);
  }
  return initial;
}

export default class UserStatusCustomModal extends Component {
  @service siteSettings;
  @service currentUser;
  @service userStatus;
  @service dialog;

  @tracked pauseNotifications = false;
  @tracked history = [];

  @tracked selectedShortcutId = null;
  @tracked showCustomPicker = false;

  constructor() {
    super(...arguments);
    this.status = trackedObject(
      normalizeStatus(this.args.model?.status ?? this.currentUser?.status)
    );
    if (typeof this.args.model?.pauseNotifications === "boolean") {
      this.pauseNotifications = this.args.model.pauseNotifications;
    }
    this.loadHistory();
  }

  get hidePauseNotifications() {
    return !!this.args.model?.hidePauseNotifications;
  }

  get isPreferencesCallbackFlow() {
    return typeof this.args.model?.saveAction === "function";
  }

  get historyEnabled() {
    const raw =
      (typeof settings !== "undefined"
        ? settings?.enable_status_history
        : undefined) ??
      this.siteSettings?.enable_status_history ??
      true;
    return raw !== false && raw !== "false";
  }

  get presets() {
    const raw =
      (typeof settings !== "undefined" && settings?.status_presets) ||
      this.siteSettings?.status_presets;

    if (Array.isArray(raw) && raw.length > 0) {
      const objectList = [];
      for (const item of raw) {
        if (item && typeof item === "object" && item.emoji && item.name) {
          objectList.push({
            emoji: String(item.emoji).trim(),
            name: String(item.name).trim(),
          });
        }
      }
      if (objectList.length > 0) {
        return objectList;
      }
    }

    const segments = [];
    if (Array.isArray(raw)) {
      for (const line of raw) {
        if (typeof line === "string" && line.trim()) {
          segments.push(line.trim());
        }
      }
    } else if (typeof raw === "string" && raw.trim()) {
      for (const part of raw.split("|")) {
        const t = part.trim();
        if (t) segments.push(t);
      }
    }

    if (segments.length > 0) {
      try {
        const list = [];
        for (const item of segments) {
          const trimmed = item.trim();
          if (!trimmed) continue;
          const parts = trimmed.split(",");
          if (parts.length >= 2) {
            list.push({
              emoji: parts[0].trim(),
              name: parts.slice(1).join(",").trim(),
            });
          }
        }
        if (list.length > 0) {
          return list;
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn("discoursestatus: could not parse status_presets", e);
      }
    }
    return PRESET_STATUSES;
  }

  get saveDisabled() {
    return !this.status?.emoji || !this.status?.description;
  }

  get showDeleteButton() {
    if (this.isPreferencesCallbackFlow) {
      const s = this.args.model?.status;
      return !!(s && (s.description || s.emoji));
    }
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
      const localISOTime = new Date(d.getTime() - tzOffset)
        .toISOString()
        .slice(0, 16);
      return localISOTime;
    } catch (e) {
      return "";
    }
  }

  get pauseNotificationsValue() {
    if (typeof this.args.model?.pauseNotifications === "boolean") {
      return this.args.model.pauseNotifications;
    }
    return this.pauseNotifications;
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
    try {
      const timezone = this.currentUser?.user_option?.timezone;
      if (!timezone) {
        return [];
      }
      const shortcuts = timeShortcuts(timezone);
      return [
        {
          id: "one_hour",
          name: themeTranslation("time.one_hour", TIME_LABELS.one_hour),
          time: shortcuts.oneHour().time,
        },
        {
          id: "two_hours",
          name: themeTranslation("time.two_hours", TIME_LABELS.two_hours),
          time: shortcuts.twoHours().time,
        },
        {
          id: "later_today",
          name: themeTranslation(
            "time.later_today",
            TIME_LABELS.later_today
          ),
          time: shortcuts.laterToday().time,
        },
        {
          id: "tomorrow",
          name: themeTranslation("time.tomorrow", TIME_LABELS.tomorrow),
          time: shortcuts.tomorrow().time,
        },
        {
          id: "none",
          name: themeTranslation("time.none", TIME_LABELS.none),
          time: null,
        },
      ].map((s) => ({
        ...s,
        activeClass: this.selectedShortcutId === s.id ? "active" : "",
      }));
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("discoursestatus: could not build time shortcuts", e);
      return [];
    }
  }

  @action
  setInlineTime(shortcutId, time) {
    this.selectedShortcutId = shortcutId;
    this.status.endsAt = time;
    this.showCustomPicker = false;
  }

  loadHistory() {
    if (!this.historyEnabled) {
      return;
    }
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
    if (!this.historyEnabled || !description) return;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      let parsed = stored ? JSON.parse(stored) : [];

      const existingIdx = parsed.findIndex(
        (item) => item.emoji === emoji && item.name === description
      );
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

  #userStatusService() {
    return (
      this.userStatus ||
      getOwner(this)?.lookup("service:user-status")
    );
  }

  #handleError(e) {
    if (typeof e === "string") {
      this.dialog.alert(e);
    } else {
      popupAjaxError(e);
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
      const del = this.args.model?.deleteAction;
      if (typeof del === "function") {
        await del();
      } else {
        const userStatus = this.#userStatusService();
        if (userStatus) {
          await userStatus.clear();
        }
      }
      this.args.closeModal?.();
    } catch (e) {
      this.#handleError(e);
    }
  }

  @action
  async saveStatus() {
    if (this.status.description?.length > 30) {
      this.dialog.alert(
        themeTranslation(
          "status.max_length",
          "Statusmeldung darf maximal 30 Zeichen lang sein."
        )
      );
      return;
    }

    this.saveToHistory(this.status.emoji, this.status.description);

    const newStatus = {
      description: this.status.description,
      emoji: this.status.emoji,
      ends_at: this.status.endsAt?.toISOString?.() ?? null,
    };

    const pauseNotifications = this.pauseNotificationsValue;

    try {
      const save = this.args.model?.saveAction;
      if (typeof save === "function") {
        await save(newStatus, pauseNotifications);
      } else {
        const userStatus = this.#userStatusService();
        if (!userStatus) {
          throw "User status service unavailable";
        }
        await userStatus.set(newStatus, pauseNotifications);
      }
      this.args.closeModal?.();
    } catch (e) {
      this.#handleError(e);
    }
  }
}
