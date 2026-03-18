import { withPluginApi } from "discourse/lib/plugin-api";
import { bind } from "discourse-common/utils/decorators";

export default {
  name: "user-status-avatar-overlay",
  
  initialize() {
    withPluginApi("1.13.0", (api) => {
      // Füge Event-Listener zum Document hinzu, um Klicks auf die rechte Avatar-Hälfte abzufangen
      document.addEventListener('click', (e) => {
        const currentUserButton = e.target.closest('#current-user');
        
        if (currentUserButton) {
          const rect = currentUserButton.getBoundingClientRect();
          const clickX = e.clientX - rect.left;
          
          // Wenn Klick in der rechten Hälfte (mehr als 50% der Breite)
          if (clickX > rect.width / 2) {
            e.preventDefault();
            e.stopPropagation();
            
            // Öffne unser benutzerdefiniertes Modal anstelle des Standard-Dropdowns
            const modalService = api.container.lookup('service:modal');
            modalService.show(
              api.container.lookup('component:user-status-custom-modal').constructor,
              { model: {} }
            );
          }
        }
      }, true); // Use capture phase to intercept before Discourse core
    });
  }
};
