import { withPluginApi } from "discourse/lib/plugin-api";

export default {
  name: "team-status-header-initializer",
  initialize() {
    withPluginApi("1.1.0", (api) => {
      // Füge unser Glimmer-Component den Header Icons hinzu
      if (api.addToHeaderIcons) {
        api.addToHeaderIcons("team-status-header-icon");
      }
    });
  }
};
