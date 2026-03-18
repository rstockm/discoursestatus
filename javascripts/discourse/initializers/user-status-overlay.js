import { withPluginApi } from "discourse/lib/plugin-api";

export default {
  name: "user-status-avatar-overlay",
  
  initialize() {
    withPluginApi("1.13.0", (api) => {
      document.addEventListener('click', (e) => {
        // Die ID kann #current-user oder in neueren Versionen .current-user, .user-menu-toggle sein
        const currentUserButton = e.target.closest('#current-user') || e.target.closest('.current-user') || e.target.closest('.user-menu-toggle');
        
        if (currentUserButton) {
          // Nur im Header auslösen
          if (!currentUserButton.closest('.d-header')) return;

          const rect = currentUserButton.getBoundingClientRect();
          const clickX = e.clientX - rect.left;
          
          if (clickX > rect.width / 2) {
            e.preventDefault();
            e.stopPropagation();
            
            const modalService = api.container.lookup('service:modal');
            
            // In neueren Discourse-Versionen (Glimmer) die Klasse suchen, andernfalls String-Name
            const modalFactory = api.container.factoryFor('component:modal/user-status-custom-modal');
            const customModalComponent = modalFactory ? modalFactory.class : 'user-status-custom-modal';
            
            if (modalService && customModalComponent) {
              modalService.show(customModalComponent, { model: {} });
            }
          }
        }
      }, true);
    });
  }
};
