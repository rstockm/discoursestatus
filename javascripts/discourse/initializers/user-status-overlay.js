import { next } from "@ember/runloop";
import CoreUserStatusModal from "discourse/components/modal/user-status";
import { withPluginApi } from "discourse/lib/plugin-api";

/**
 * Core öffnet user-status mit model: { status, saveAction, deleteAction, … }.
 * Bei mehreren Theme-Komponenten kann dieselbe Modul-Referenz doppelt gebündelt sein —
 * dann schlagen Klassenvergleiche fehl. Diese Form ist für das Core-Modal spezifisch genug.
 * "status" per `in` prüfen (nicht nur own property), falls das Model ein Proxy/Ember-Object ist.
 */
function looksLikeCoreUserStatusModalInvocation(modalClass, opts) {
  if (typeof modalClass !== "function") {
    return false;
  }
  const m = opts?.model;
  if (!m || typeof m !== "object") {
    return false;
  }
  if (typeof m.saveAction !== "function" || typeof m.deleteAction !== "function") {
    return false;
  }
  return "status" in m;
}

/**
 * modifyClass am Modal-Service kann durch andere Theme-Komponenten wirkungslos werden.
 * Die Singleton-Instanz direkt wrappen — so greift die Umleitung zuverlässig.
 */
function patchModalServiceInstance(api) {
  const modal = api.container.lookup("service:modal");
  if (!modal || modal.__discoursestatusUserStatusShowWrapped) {
    return;
  }

  const previous = modal.show.bind(modal);
  modal.__discoursestatusUserStatusShowWrapped = true;

  modal.show = async function (...args) {
    const first = args[0];
    const second = args[1];

    const customFactory = api.container.factoryFor(
      "component:modal/user-status-custom-modal"
    );
    const coreFactory = api.container.factoryFor("component:modal/user-status");
    const customCls = customFactory?.class;
    const coreCls = coreFactory?.class;

    if (!customCls) {
      return previous(...args);
    }
    if (first === customCls) {
      return previous(...args);
    }

    const isCoreUserStatus =
      first === "user-status" ||
      first === coreCls ||
      first === CoreUserStatusModal ||
      (typeof first === "function" && first.name === "UserStatusModal");

    if (isCoreUserStatus) {
      return previous(customCls, second ?? {});
    }
    if (looksLikeCoreUserStatusModalInvocation(first, second)) {
      return previous(customCls, second ?? {});
    }

    return previous(...args);
  };
}

export default {
  name: "user-status-avatar-overlay",

  initialize(container) {
    withPluginApi("1.13.0", (api) => {
      patchModalServiceInstance(api);
      next(() => patchModalServiceInstance(api));

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
              placeholder.title = 'Status festlegen'; // Verhindert, dass der "Benachrichtigungen" Tooltip beim Hovern über das + erscheint
              
              const avatar = btn.querySelector('img.avatar');
              if (avatar) {
                const parent = avatar.parentElement;
                parent.style.position = 'relative';
                parent.style.overflow = 'visible';
                parent.appendChild(placeholder);
                
                // Exakte Positionierung per JavaScript erzwingen, um CSS-Konflikte des Themes zu umgehen
                const updatePos = () => {
                  if (!avatar.offsetWidth) return;
                  // Setze das Icon an die exakte Pixelposition relativ zum Bild
                  placeholder.style.left = (avatar.offsetLeft + avatar.offsetWidth - 14) + 'px';
                  placeholder.style.top = (avatar.offsetTop + avatar.offsetHeight - 14) + 'px';
                  // Bottom/Right überschreiben, da wir Left/Top nutzen
                  placeholder.style.bottom = 'auto';
                  placeholder.style.right = 'auto';
                };
                
                updatePos();
                setTimeout(updatePos, 100);
                setTimeout(updatePos, 500); // Fallback für langsames Laden des Bildes
              } else {
                btn.appendChild(placeholder);
              }
            } else {
              // Update position in case of resize/redraw
              const avatar = btn.querySelector('img.avatar');
              if (avatar) {
                 placeholder.style.left = (avatar.offsetLeft + avatar.offsetWidth - 14) + 'px';
                 placeholder.style.top = (avatar.offsetTop + avatar.offsetHeight - 14) + 'px';
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
