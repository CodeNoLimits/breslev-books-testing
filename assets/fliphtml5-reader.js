/**
 * CONFIGURATION FLIPHTML5 - Lecteur de livres numériques
 * Intégration pour Likouté Moharan Tome 1
 */

const FLIPHTML5_CONFIG = {
  // Likouté Moharan Tome 1 - URL FlipHTML5
  'likoutey-moharane-tome-1': {
    url: 'https://online.fliphtml5.com/rlhwa/tphw/',
    bookId: 'rlhwa_tphw',
    title: 'Likoutey Moharane - Tome 1',
    author: 'Rabbi Nachman de Breslev',
    
    // Configuration du lecteur
    readerConfig: {
      width: '100%',
      height: '600px',
      autoFlip: false,
      showDownload: false,
      showPrint: false,
      showShare: true,
      showZoom: true,
      showSearch: true,
      showBookmark: true,
      showThumbnail: true,
      backgroundColor: '#1a1a2e',
      toolbarColor: '#d4af37'
    },
    
    // DRM & Protection
    drm: {
      watermark: true,
      copyProtection: true,
      printProtection: true,
      downloadProtection: true
    }
  }
};

/**
 * Génère l'iframe FlipHTML5 pour un livre
 */
function generateFlipHTML5Iframe(bookSlug, customConfig = {}) {
  const config = FLIPHTML5_CONFIG[bookSlug];
  if (!config) return null;
  
  const mergedConfig = { ...config.readerConfig, ...customConfig };
  
  return `
    <div class="fliphtml5-container" style="position: relative; width: 100%; max-width: 1200px; margin: 0 auto;">
      <div class="fliphtml5-header" style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 1.5rem; border-radius: 8px 8px 0 0;">
        <h3 style="color: #d4af37; margin: 0; font-size: 1.5rem;">${config.title}</h3>
        <p style="color: #fff; margin: 0.5rem 0 0 0; opacity: 0.9;">${config.author}</p>
      </div>
      
      <iframe 
        src="${config.url}" 
        width="${mergedConfig.width}" 
        height="${mergedConfig.height}"
        seamless="seamless" 
        scrolling="no" 
        frameborder="0" 
        allowtransparency="true" 
        allowfullscreen="true"
        style="border-radius: 0 0 8px 8px; box-shadow: 0 10px 40px rgba(0,0,0,0.3);"
      ></iframe>
      
      <div class="fliphtml5-footer" style="background: #f8f9fa; padding: 1rem; border-radius: 0 0 8px 8px; text-align: center; border-top: 1px solid #e0e0e0;">
        <p style="margin: 0; color: #666; font-size: 0.9rem;">
          <i class="fas fa-lock" style="color: #d4af37;"></i>
          Contenu protégé - Lecture en ligne uniquement
        </p>
      </div>
    </div>
  `;
}

/**
 * Charge le lecteur FlipHTML5 dans un élément
 */
function loadFlipHTML5Reader(containerId, bookSlug) {
  const container = document.getElementById(containerId);
  if (!container) {
    console.error(`Container ${containerId} not found`);
    return;
  }
  
  const iframe = generateFlipHTML5Iframe(bookSlug);
  if (iframe) {
    container.innerHTML = iframe;
  } else {
    container.innerHTML = `
      <div style="padding: 2rem; text-align: center; background: #f8f9fa; border-radius: 8px;">
        <i class="fas fa-exclamation-circle" style="font-size: 3rem; color: #dc3545; margin-bottom: 1rem;"></i>
        <p style="color: #666;">Livre numérique non disponible pour le moment.</p>
      </div>
    `;
  }
}

// Export pour utilisation dans le serveur
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { FLIPHTML5_CONFIG, generateFlipHTML5Iframe };
}
