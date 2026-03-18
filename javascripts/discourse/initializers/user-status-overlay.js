import { withPluginApi } from "discourse/lib/plugin-api";

export default {
  name: "user-status-avatar-overlay",
  
  initialize(container) {
    withPluginApi("1.13.0", (api) => {
      
      // Update Placeholder Logik
      const updatePlaceholder = () => {
        const currentUser = api.getCurrentUser();
        if (!currentUser) return;
        
        // Finde den Profil-Button im Header
        const headerButtons = document.querySelectorAll('.d-header #current-user, .d-header .current-user, .d-header .user-menu-toggle');
        
        headerButtons.forEach(btn => {
          // Prüfen ob Nutzer einen Status hat
          const status = currentUser.get('status');
          const hasStatus = status && (status.description || status.emoji);
          
          let placeholder = btn.querySelector('.status-placeholder-custom');
          
          if (!hasStatus) {
            // Wenn kein Status, zeige Platzhalter
            if (!placeholder) {
              placeholder = document.createElement('div');
              placeholder.className = 'status-placeholder-custom';
              placeholder.innerHTML = '+';
              btn.appendChild(placeholder);
            }
          } else {
            // Wenn Status vorhanden, entferne Platzhalter
            if (placeholder) {
              placeholder.remove();
            }
          }
        });
      };

      // Führe das Update bei relevanten Events aus
      api.onPageChange(updatePlaceholder);
      
      // Auch auf Änderungen des currentUser status reagieren
      const currentUser = api.getCurrentUser();
      if (currentUser) {
        currentUser.addObserver('status', updatePlaceholder);
        // Initiale Ausführung verzögern, bis DOM gerendert ist
        setTimeout(updatePlaceholder, 500);
      }

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
