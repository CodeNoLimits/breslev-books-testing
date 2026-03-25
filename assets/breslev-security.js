/**
 * Breslev Books - Sécurité Anti-Piratage
 * Protection supplémentaire contre le vol de contenu
 */

class BreslevSecurity {
  constructor() {
    this.init();
  }

  init() {
    // Désactiver clic droit
    this.disableRightClick();

    // Désactiver sélection de texte sur contenu protégé
    this.disableTextSelection();

    // Désactiver raccourcis clavier
    this.disableKeyboardShortcuts();

    // Détecter outils développeur
    this.detectDevTools();

    // Watermark de protection
    this.addSecurityWatermark();

    // Tracking des tentatives de piratage
    this.trackSecurityEvents();
  }

  /**
   * Désactiver clic droit sur tout le site
   */
  disableRightClick() {
    document.addEventListener('contextmenu', (e) => {
      // Permettre sur inputs/textareas
      if(e.target.matches('input, textarea')) {
        return true;
      }

      e.preventDefault();
      this.logSecurityEvent('right_click_blocked');
      return false;
    });
  }

  /**
   * Désactiver sélection de texte sur contenu protégé
   */
  disableTextSelection() {
    document.addEventListener('selectstart', (e) => {
      // Permettre sur inputs/textareas
      if(e.target.matches('input, textarea')) {
        return true;
      }

      // Bloquer sur contenu protégé
      if(e.target.closest('.protected-content, .digital-book-card, .flipbook-wrapper')) {
        e.preventDefault();
        this.logSecurityEvent('text_selection_blocked');
        return false;
      }
    });

    // CSS supplémentaire
    const style = document.createElement('style');
    style.textContent = `
      .protected-content,
      .digital-book-card,
      .flipbook-wrapper {
        -webkit-user-select: none;
        -moz-user-select: none;
        -ms-user-select: none;
        user-select: none;
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Désactiver raccourcis clavier dangereux
   */
  disableKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Liste noire de raccourcis
      const forbidden = [
        // F12 (DevTools)
        e.key === 'F12',
        // Ctrl+Shift+I / Cmd+Option+I (DevTools)
        (e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'I',
        // Ctrl+Shift+J / Cmd+Option+J (Console)
        (e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'J',
        // Ctrl+U / Cmd+U (View Source)
        (e.ctrlKey || e.metaKey) && e.key === 'U',
        // Ctrl+S / Cmd+S (Save) sur contenu protégé
        (e.ctrlKey || e.metaKey) && e.key === 's' && e.target.closest('.protected-content'),
        // Ctrl+P / Cmd+P (Print) sur contenu protégé
        (e.ctrlKey || e.metaKey) && e.key === 'p' && e.target.closest('.protected-content')
      ];

      if(forbidden.some(condition => condition)) {
        e.preventDefault();
        this.logSecurityEvent('keyboard_shortcut_blocked', { key: e.key });
        return false;
      }
    });
  }

  /**
   * Détecter l'ouverture des outils développeur
   */
  detectDevTools() {
    let devtools = { open: false, orientation: null };
    const threshold = 160;

    const checkDevTools = () => {
      const widthThreshold = window.outerWidth - window.innerWidth > threshold;
      const heightThreshold = window.outerHeight - window.innerHeight > threshold;

      if(widthThreshold || heightThreshold) {
        if(!devtools.open) {
          devtools.open = true;
          this.handleDevToolsOpen();
        }
      } else {
        devtools.open = false;
      }
    };

    // Vérifier toutes les 500ms
    setInterval(checkDevTools, 500);

    // Vérifier au resize
    window.addEventListener('resize', checkDevTools);
  }

  /**
   * Action quand DevTools détectés
   */
  handleDevToolsOpen() {
    this.logSecurityEvent('devtools_opened');

    // Si sur page protégée, afficher avertissement
    if(document.querySelector('.protected-content')) {
      const warning = document.createElement('div');
      warning.className = 'devtools-warning';
      warning.innerHTML = `
        <div class="warning-content">
          <h2>⚠️ Contenu Protégé</h2>
          <p>L'accès aux outils développeur est interdit sur ce contenu.</p>
          <p>Cette tentative a été enregistrée.</p>
          <button onclick="this.parentElement.parentElement.remove()">
            J'ai compris
          </button>
        </div>
      `;

      const style = document.createElement('style');
      style.textContent = `
        .devtools-warning {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.9);
          z-index: 999999;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .warning-content {
          background: white;
          padding: 40px;
          border-radius: 10px;
          text-align: center;
          max-width: 500px;
        }
        .warning-content h2 {
          color: #e91e63;
          margin-bottom: 20px;
        }
        .warning-content button {
          margin-top: 20px;
          padding: 12px 30px;
          background: #1a237e;
          color: white;
          border: none;
          border-radius: 5px;
          cursor: pointer;
          font-weight: bold;
        }
      `;
      document.head.appendChild(style);
      document.body.appendChild(warning);
    }
  }

  /**
   * Ajouter watermark de sécurité invisible
   */
  addSecurityWatermark() {
    // Watermark canvas invisible avec métadonnées
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    canvas.style.display = 'none';

    const ctx = canvas.getContext('2d');
    const metadata = {
      timestamp: Date.now(),
      userAgent: navigator.userAgent,
      screenResolution: `${screen.width}x${screen.height}`,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      language: navigator.language
    };

    // Encoder métadonnées dans canvas
    ctx.fillText(JSON.stringify(metadata), 0, 0);

    document.body.appendChild(canvas);
  }

  /**
   * Logger événements de sécurité
   */
  logSecurityEvent(eventType, data = {}) {
    const event = {
      type: eventType,
      timestamp: new Date().toISOString(),
      url: window.location.href,
      userAgent: navigator.userAgent,
      ...data
    };

    // Logger en console (dev)
    if(window.location.hostname === 'localhost') {
      console.warn('🔒 Security Event:', event);
    }

    // Envoyer au serveur Shopify
    if(typeof Shopify !== 'undefined' && Shopify.shop) {
      fetch('/apps/security-logger', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(event)
      }).catch(() => {
        // Fail silently
      });
    }
  }

  /**
   * Tracking des tentatives de piratage
   */
  trackSecurityEvents() {
    // Compter les tentatives
    let attempts = 0;

    window.addEventListener('securityEvent', () => {
      attempts++;

      // Si trop de tentatives, bloquer temporairement
      if(attempts > 5) {
        this.showLockdown();
      }
    });
  }

  /**
   * Afficher écran de verrouillage
   */
  showLockdown() {
    document.body.innerHTML = `
      <div style="
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100vh;
        background: linear-gradient(135deg, #1a237e 0%, #0d47a1 100%);
        color: white;
        text-align: center;
        padding: 20px;
      ">
        <div>
          <h1 style="font-size: 3rem; margin-bottom: 20px;">🔒</h1>
          <h2 style="margin-bottom: 20px;">Accès Temporairement Bloqué</h2>
          <p style="margin-bottom: 30px;">
            Trop de tentatives d'accès non autorisé ont été détectées.<br>
            Cette session a été enregistrée et signalée.
          </p>
          <p>Veuillez actualiser la page dans quelques minutes.</p>
        </div>
      </div>
    `;

    this.logSecurityEvent('lockdown_triggered');
  }
}

// Initialiser la sécurité au chargement
if(typeof window !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    window.breslevSecurity = new BreslevSecurity();
  });
}

// Exporter pour utilisation dans d'autres scripts
if(typeof module !== 'undefined' && module.exports) {
  module.exports = BreslevSecurity;
}
