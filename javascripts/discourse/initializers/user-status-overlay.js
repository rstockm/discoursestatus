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
          
          // #region agent log
          fetch('http://127.0.0.1:7931/ingest/89deca5e-9e6e-457a-abe7-f4a6e39bf6b5',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'bdd1ba'},body:JSON.stringify({sessionId:'bdd1ba',location:'user-status-overlay.js:31',message:'btn html',data:{html:btn.innerHTML},timestamp:Date.now(),runId:'run1',hypothesisId:'1'})}).catch(()=>{});
          // #endregion

          if (!hasStatus) {
            // Wenn kein Status, zeige Platzhalter
            if (!placeholder) {
              placeholder = document.createElement('div');
              placeholder.className = 'status-placeholder-custom';
              placeholder.innerHTML = '+';
              
              // Hänge es direkt an den Avatar-Container an, damit Positionierung perfekt stimmt
              const avatar = btn.querySelector('img.avatar');
              if (avatar && avatar.parentElement) {
                // #region agent log
                fetch('http://127.0.0.1:7931/ingest/89deca5e-9e6e-457a-abe7-f4a6e39bf6b5',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'bdd1ba'},body:JSON.stringify({sessionId:'bdd1ba',location:'user-status-overlay.js:42',message:'parent html',data:{html:avatar.parentElement.outerHTML, flex:getComputedStyle(avatar.parentElement).display},timestamp:Date.now(),runId:'run1',hypothesisId:'1'})}).catch(()=>{});
                // #endregion
                avatar.parentElement.style.position = 'relative';
                // Verhindern, dass overflow: hidden des Parents das Icon abschneidet
                avatar.parentElement.style.overflow = 'visible';
                avatar.parentElement.appendChild(placeholder);
              } else {
                btn.appendChild(placeholder);
              }
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
        const clickedPlaceholder = e.target.closest('.status-placeholder-custom');
        
        let shouldOpenModal = false;

        // Prüfen ob das Plus-Symbol direkt geklickt wurde
        if (clickedPlaceholder && clickedPlaceholder.closest('.d-header')) {
          shouldOpenModal = true;
        } 
        // Oder ob die rechte Hälfte des Buttons geklickt wurde
        else if (currentUserButton && currentUserButton.closest('.d-header')) {
          const rect = currentUserButton.getBoundingClientRect();
          const clickX = e.clientX - rect.left;
          if (clickX > rect.width / 2) {
            shouldOpenModal = true;
          }
        }
        
        if (shouldOpenModal) {
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
      }, true);
    });
  }
};
