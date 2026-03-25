/**
 * CONFIGURATION FRAIS DE LIVRAISON - Depuis Jérusalem
 * Tarifs optimisés par zone géographique
 * MISE À JOUR: +35% sur les frais de livraison (demande client 18/01)
 */

// Coefficient de majoration (+35%)
const SHIPPING_MARKUP = 1.35;

const SHIPPING_RATES = {
  // Israël - Livraison locale
  IL: {
    name: 'Israël',
    zones: ['IL'],
    rates: [
      { name: 'Standard (3-5 jours)', price: Math.round(35 * SHIPPING_MARKUP), days: '3-5' },
      { name: 'Express (1-2 jours)', price: Math.round(60 * SHIPPING_MARKUP), days: '1-2' }
    ],
    currency: 'ILS'
  },
  
  // France & Europe
  EU: {
    name: 'Europe',
    zones: ['FR', 'BE', 'CH', 'DE', 'IT', 'ES', 'NL', 'AT', 'PT', 'GB', 'IE'],
    rates: [
      { name: 'Standard (7-14 jours)', price: Math.round(65 * SHIPPING_MARKUP), days: '7-14' },
      { name: 'Express (4-7 jours)', price: Math.round(120 * SHIPPING_MARKUP), days: '4-7' }
    ],
    currency: 'ILS'
  },
  
  // USA & Canada
  NA: {
    name: 'Amérique du Nord',
    zones: ['US', 'CA'],
    rates: [
      { name: 'Standard (10-21 jours)', price: Math.round(80 * SHIPPING_MARKUP), days: '10-21' },
      { name: 'Express (5-10 jours)', price: Math.round(150 * SHIPPING_MARKUP), days: '5-10' }
    ],
    currency: 'ILS'
  },
  
  // Reste du monde
  WORLD: {
    name: 'International',
    zones: ['*'],
    rates: [
      { name: 'Standard (14-28 jours)', price: Math.round(90 * SHIPPING_MARKUP), days: '14-28' },
      { name: 'Express (7-14 jours)', price: Math.round(180 * SHIPPING_MARKUP), days: '7-14' }
    ],
    currency: 'ILS'
  }
};

// Livraison gratuite au-dessus de certains montants (seuils ajustés)
const FREE_SHIPPING_THRESHOLD = {
  IL: 250,  // 250 ILS (augmenté)
  EU: 150,  // 150 EUR (augmenté)
  NA: 200,  // 200 USD (augmenté)
  WORLD: 250 // 250 USD (augmenté)
};

function getShippingZone(countryCode) {
  for (const [zone, config] of Object.entries(SHIPPING_RATES)) {
    if (config.zones.includes(countryCode) || config.zones.includes('*')) {
      return { zone, ...config };
    }
  }
  return { zone: 'WORLD', ...SHIPPING_RATES.WORLD };
}

function calculateShipping(countryCode, cartTotal) {
  const shippingZone = getShippingZone(countryCode);
  const threshold = FREE_SHIPPING_THRESHOLD[shippingZone.zone];
  
  if (cartTotal >= threshold) {
    return {
      ...shippingZone,
      rates: [{ name: 'Livraison gratuite', price: 0, days: shippingZone.rates[0].days }],
      freeShipping: true
    };
  }
  
  return {
    ...shippingZone,
    freeShipping: false,
    remainingForFree: threshold - cartTotal,
    markup: '+35% inclus'
  };
}

// Export pour utilisation dans le serveur
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SHIPPING_RATES, FREE_SHIPPING_THRESHOLD, getShippingZone, calculateShipping, SHIPPING_MARKUP };
}
