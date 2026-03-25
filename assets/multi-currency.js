/**
 * BRESLEV BOOKS - MULTI-CURRENCY SYSTEM
 * Gestion automatique des devises multiples
 * Compatible avec Shopify Markets
 */

class BreslevCurrency {
  constructor() {
    this.currencies = {
      EUR: { symbol: '€', rate: 1, format: '{amount}€' },
      USD: { symbol: '$', rate: 1.1, format: '${amount}' },
      ILS: { symbol: '₪', rate: 4.2, format: '{amount}₪' },
      CAD: { symbol: 'C$', rate: 1.5, format: 'C${amount}' }
    };

    this.currentCurrency = this.getStoredCurrency() || 'EUR';
    this.init();
  }

  /**
   * Initialisation
   */
  init() {
    this.detectUserLocation();
    this.createCurrencySelector();
    this.bindEvents();
    this.convertPrices();
  }

  /**
   * Détection automatique de la localisation
   */
  async detectUserLocation() {
    // Si devise déjà stockée, on garde celle-là
    if (this.getStoredCurrency()) {
      return;
    }

    try {
      // Utiliser l'API de géolocalisation de Shopify si disponible
      if (window.Shopify && window.Shopify.country) {
        this.setCountryCurrency(window.Shopify.country);
        return;
      }

      // Sinon, essayer avec une API tierce
      const response = await fetch('https://ipapi.co/json/');
      const data = await response.json();

      if (data.country_code) {
        this.setCountryCurrency(data.country_code);
      }
    } catch (error) {
      console.log('Géolocalisation non disponible, devise EUR par défaut');
    }
  }

  /**
   * Définir la devise selon le pays
   */
  setCountryCurrency(countryCode) {
    const currencyMap = {
      'US': 'USD',
      'CA': 'CAD',
      'IL': 'ILS',
      'FR': 'EUR',
      'BE': 'EUR',
      'CH': 'EUR',
      'LU': 'EUR'
    };

    const currency = currencyMap[countryCode] || 'EUR';
    this.setCurrency(currency);
  }

  /**
   * Création du sélecteur de devises
   */
  createCurrencySelector() {
    const selectors = document.querySelectorAll('[data-currency-selector]');

    selectors.forEach(selector => {
      const select = document.createElement('select');
      select.className = 'currency-selector';
      select.setAttribute('aria-label', 'Sélectionner la devise');

      Object.keys(this.currencies).forEach(code => {
        const option = document.createElement('option');
        option.value = code;
        option.textContent = `${code} ${this.currencies[code].symbol}`;
        option.selected = code === this.currentCurrency;
        select.appendChild(option);
      });

      selector.innerHTML = '';
      selector.appendChild(select);
    });
  }

  /**
   * Liaison des événements
   */
  bindEvents() {
    document.addEventListener('change', (e) => {
      if (e.target.closest('.currency-selector')) {
        this.setCurrency(e.target.value);
      }
    });
  }

  /**
   * Définir la devise active
   */
  setCurrency(currencyCode) {
    if (!this.currencies[currencyCode]) {
      console.error(`Devise ${currencyCode} non supportée`);
      return;
    }

    this.currentCurrency = currencyCode;
    this.storeCurrency(currencyCode);
    this.convertPrices();
    this.updateSelectors();

    // Événement personnalisé pour d'autres scripts
    document.dispatchEvent(new CustomEvent('currency:changed', {
      detail: { currency: currencyCode }
    }));
  }

  /**
   * Conversion de tous les prix
   */
  convertPrices() {
    const priceElements = document.querySelectorAll('[data-price]');

    priceElements.forEach(element => {
      const basePrice = parseFloat(element.dataset.price);
      if (isNaN(basePrice)) return;

      const convertedPrice = this.convert(basePrice, 'EUR', this.currentCurrency);
      element.textContent = this.format(convertedPrice, this.currentCurrency);
    });

    // Conversion des prix dans le panier
    this.convertCartPrices();
  }

  /**
   * Conversion des prix du panier
   */
  async convertCartPrices() {
    try {
      const response = await fetch('/cart.js');
      const cart = await response.json();

      // Mettre à jour le total du panier
      const cartTotals = document.querySelectorAll('[data-cart-total]');
      cartTotals.forEach(total => {
        const convertedTotal = this.convert(cart.total_price / 100, 'EUR', this.currentCurrency);
        total.textContent = this.format(convertedTotal, this.currentCurrency);
      });

    } catch (error) {
      console.error('Erreur de conversion du panier:', error);
    }
  }

  /**
   * Conversion d'un montant
   */
  convert(amount, fromCurrency, toCurrency) {
    if (fromCurrency === toCurrency) {
      return amount;
    }

    // Conversion vers EUR d'abord (devise de base)
    let amountInEUR = amount;
    if (fromCurrency !== 'EUR') {
      amountInEUR = amount / this.currencies[fromCurrency].rate;
    }

    // Puis conversion vers devise cible
    if (toCurrency !== 'EUR') {
      return amountInEUR * this.currencies[toCurrency].rate;
    }

    return amountInEUR;
  }

  /**
   * Formatage d'un montant
   */
  format(amount, currency) {
    const currencyData = this.currencies[currency];
    if (!currencyData) return `${amount.toFixed(2)} ${currency}`;

    // Arrondir au 0.99 le plus proche pour un affichage psychologique
    const rounded = Math.ceil(amount) - 0.01;

    // Format selon la devise
    return currencyData.format.replace('{amount}', rounded.toFixed(2));
  }

  /**
   * Mise à jour des sélecteurs
   */
  updateSelectors() {
    const selectors = document.querySelectorAll('.currency-selector');
    selectors.forEach(select => {
      select.value = this.currentCurrency;
    });
  }

  /**
   * Stockage de la devise dans cookie
   */
  storeCurrency(currency) {
    // Cookie pour 30 jours
    const expires = new Date();
    expires.setDate(expires.getDate() + 30);
    document.cookie = `breslev_currency=${currency}; expires=${expires.toUTCString()}; path=/`;

    // LocalStorage comme backup
    try {
      localStorage.setItem('breslev_currency', currency);
    } catch (e) {
      console.log('LocalStorage non disponible');
    }
  }

  /**
   * Récupération de la devise stockée
   */
  getStoredCurrency() {
    // Essayer le cookie d'abord
    const cookieMatch = document.cookie.match(/breslev_currency=([^;]+)/);
    if (cookieMatch) {
      return cookieMatch[1];
    }

    // Sinon localStorage
    try {
      return localStorage.getItem('breslev_currency');
    } catch (e) {
      return null;
    }
  }

  /**
   * Mise à jour des taux de change (à appeler périodiquement)
   */
  async updateExchangeRates() {
    try {
      // Utiliser une API de taux de change gratuite
      const response = await fetch('https://api.exchangerate-api.com/v4/latest/EUR');
      const data = await response.json();

      if (data.rates) {
        // Mettre à jour les taux
        Object.keys(this.currencies).forEach(code => {
          if (data.rates[code]) {
            this.currencies[code].rate = data.rates[code];
          }
        });

        // Reconvertir tous les prix
        this.convertPrices();

        console.log('Taux de change mis à jour');
      }
    } catch (error) {
      console.error('Erreur de mise à jour des taux:', error);
    }
  }
}

// Initialisation au chargement
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.breslevCurrency = new BreslevCurrency();

    // Mise à jour des taux toutes les heures
    setInterval(() => {
      window.breslevCurrency.updateExchangeRates();
    }, 3600000);
  });
} else {
  window.breslevCurrency = new BreslevCurrency();
}

// Export pour utilisation dans d'autres scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = BreslevCurrency;
}
