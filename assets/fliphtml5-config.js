// Configuration FlipHTML5 Business pour lecture protégée
class BreslevDigitalReader {
  constructor() {
    this.config = {
      licenseKey: 'FLIPHTML5_BUSINESS_KEY', // À obtenir après achat
      domain: 'breslev.fr',
      protection: {
        // Protection totale contre copie
        copyProtection: true,
        printProtection: true,
        downloadProtection: true,
        rightClickDisabled: true,
        textSelectionDisabled: true,
        screenshotProtection: true,
        
        // Watermarking dynamique
        watermark: {
          enabled: true,
          template: '© Esther Ifrah - {{customer.email}} - {{order.number}}',
          position: 'diagonal',
          opacity: 0.08,
          fontSize: 48,
          color: '#1a237e',
          repeat: true
        },
        
        // Tracking lecture
        analytics: {
          trackPages: true,
          trackTime: true,
          trackCompletion: true,
          sendToShopify: true
        }
      },
      
      // Interface utilisateur
      ui: {
        logo: '/assets/logo-breslev.png',
        theme: {
          primary: '#6B46C1',
          secondary: '#EC4899',
          background: '#ffffff'
        },
        tools: {
          download: false, // JAMAIS
          print: false,    // JAMAIS
          share: false,    // Désactivé
          search: true,    // OK
          zoom: true,      // OK
          fullscreen: true,// OK
          bookmark: true,  // OK
          notes: true      // OK pour abonnés
        }
      }
    };
  }
  
  initReader(bookId, customerData) {
    // Vérifier l'abonnement
    if(!this.hasAccess(customerData)) {
      return this.showSubscriptionPrompt();
    }
    
    // Charger le livre avec protection
    const flipbook = new FlipHTML5.Viewer({
      pdf: `/books/${bookId}.pdf`,
      container: '#reader-container',
      ...this.config,
      
      // Ajouter données client pour watermark
      customerInfo: {
        email: customerData.email,
        name: customerData.name,
        subscriptionType: customerData.subscription,
        ipAddress: customerData.ip
      },
      
      // Callbacks
      onReady: () => this.trackReading(bookId),
      onPageChange: (page) => this.saveProgress(bookId, page),
      onError: (error) => this.handleError(error)
    });
    
    return flipbook;
  }
  
  hasAccess(customer) {
    // Vérifier si client a acheté le livre OU a un abonnement actif
    return customer.purchases.includes(this.bookId) || 
           customer.subscription?.status === 'active';
  }
  
  trackReading(bookId) {
    // Envoyer stats à Shopify
    fetch('/apps/reading-tracker', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': Shopify.shop.accessToken
      },
      body: JSON.stringify({
        book_id: bookId,
        customer_id: __st.cid,
        started_at: new Date().toISOString(),
        session_id: this.generateSessionId()
      })
    });
  }
  
  saveProgress(bookId, page) {
    // Sauvegarder progression
    localStorage.setItem(`reading_${bookId}`, JSON.stringify({
      page,
      timestamp: new Date().toISOString()
    }));
  }
  
  showSubscriptionPrompt() {
    // Afficher modal d'abonnement
    const modal = document.createElement('div');
    modal.className = 'subscription-prompt-modal';
    modal.innerHTML = `
      <div class="modal-content">
        <h2>Accès Requis</h2>
        <p>Pour lire ce livre, vous devez soit l'acheter, soit avoir un abonnement actif.</p>
        <a href="/pages/abonnement" class="btn-subscribe">Voir les abonnements</a>
        <a href="/collections/all" class="btn-browse">Parcourir le catalogue</a>
      </div>
    `;
    document.body.appendChild(modal);
  }
  
  generateSessionId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }
  
  handleError(error) {
    console.error('FlipHTML5 Error:', error);
    // Fallback vers PDF simple si erreur
    alert('Erreur de chargement. Tentative de chargement du PDF standard...');
  }
}

// Initialiser au chargement
document.addEventListener('DOMContentLoaded', () => {
  if(document.querySelector('#digital-reader')) {
    const reader = new BreslevDigitalReader();
    
    // Récupérer données client depuis Shopify
    if(typeof Shopify !== 'undefined' && Shopify.customer) {
      reader.initReader(
        window.bookId || document.querySelector('[data-book-id]')?.dataset.bookId,
        {
          email: Shopify.customer.email,
          name: Shopify.customer.name,
          subscription: Shopify.customer.metafields?.subscription,
          purchases: Shopify.customer.orders?.map(o => o.line_items).flat().map(i => i.product_id) || []
        }
      );
    }
  }
});

