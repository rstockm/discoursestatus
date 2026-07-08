import Component from "@glimmer/component";
import { action } from "@ember/object";
import { tracked } from "@glimmer/tracking";
import { ajax } from "discourse/lib/ajax";

export default class TeamStatusHeaderIcon extends Component {
  @tracked isDropdownOpen = false;
  @tracked teamMembers = [];
  @tracked isLoading = false;

  get icon() {
    return "users";
  }

  @action
  toggleDropdown(event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    
    this.isDropdownOpen = !this.isDropdownOpen;
    if (this.isDropdownOpen && this.teamMembers.length === 0) {
      this.fetchTeamMembers();
    }
  }

  @action
  closeDropdown() {
    this.isDropdownOpen = false;
  }

  @action
  onTeamButtonKeyDown(event) {
    if (event.key === "Escape" && this.isDropdownOpen) {
      event.stopPropagation();
      this.closeDropdown();
    }
  }

  async fetchTeamMembers() {
    this.isLoading = true;
    try {
      const rawGroup = settings.team_status_group || "team";
      const groupName = String(rawGroup).trim();
      if (!/^[a-zA-Z0-9_]+$/.test(groupName)) {
        // eslint-disable-next-line no-console
        console.warn("discoursestatus: ungültiger Gruppenname", groupName);
        return;
      }
      const response = await ajax(
        `/groups/${encodeURIComponent(groupName)}/members.json`
      );
      if (response && response.members) {
        this.teamMembers = response.members;
      }
    } catch (e) {
      console.error(
        "Could not fetch team members for group",
        settings.team_status_group,
        e
      );
    } finally {
      this.isLoading = false;
    }
  }
}
