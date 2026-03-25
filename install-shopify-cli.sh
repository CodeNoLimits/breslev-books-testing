#!/bin/bash

# Script d'installation Shopify CLI
# Exécuter: bash install-shopify-cli.sh

echo "🔧 Installation Shopify CLI..."
echo ""

# Vérifier Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js n'est pas installé"
    echo "Installez Node.js depuis: https://nodejs.org/"
    exit 1
fi

echo "✅ Node.js trouvé: $(node --version)"
echo ""

# Vérifier npm
if ! command -v npm &> /dev/null; then
    echo "❌ npm n'est pas installé"
    exit 1
fi

echo "✅ npm trouvé: $(npm --version)"
echo ""

# Installer Shopify CLI
echo "📦 Installation de @shopify/cli et @shopify/theme..."
npm install -g @shopify/cli @shopify/theme

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Shopify CLI installé avec succès!"
    echo ""
    echo "📋 Prochaines étapes:"
    echo "1. Se connecter: shopify login"
    echo "2. Aller dans le dossier: cd breslev-shopify-complete"
    echo "3. Lancer dev: shopify theme dev"
    echo ""
    
    # Vérifier installation
    if command -v shopify &> /dev/null; then
        echo "✅ Vérification: shopify version"
        shopify version
    fi
else
    echo ""
    echo "❌ Erreur lors de l'installation"
    echo "Essayez avec sudo: sudo npm install -g @shopify/cli @shopify/theme"
    exit 1
fi

