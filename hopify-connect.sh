#!/bin/bash

###############################################
# SCRIPT DE CONNEXION SHOPIFY CLI
# Breslev Books - Esther Ifrah
###############################################

echo "╔════════════════════════════════════════════════════╗"
echo "║                                                    ║"
echo "║   🛍️  CONNEXION SHOPIFY CLI - BRESLEV BOOKS       ║"
echo "║                                                    ║"
echo "╚════════════════════════════════════════════════════╝"
echo ""

# Vérifier que Shopify CLI est installé
if ! command -v shopify &> /dev/null; then
    echo "❌ Shopify CLI n'est pas installé!"
    echo "📦 Installation..."
    npm install -g @shopify/cli @shopify/theme
    echo "✅ Shopify CLI installé!"
    echo ""
fi

# Afficher version
VERSION=$(shopify version)
echo "✅ Shopify CLI version: $VERSION"
echo ""

# Menu principal
echo "Que veux-tu faire?"
echo ""
echo "1) 🔐 Se connecter à Shopify"
echo "2) 🎨 Lancer preview Shopify (shopify theme dev)"
echo "3) 📤 Uploader le thème (unpublished)"
echo "4) 🚀 Uploader et publier le thème"
echo "5) ℹ️  Voir infos du thème"
echo "6) 🔌 Déconnexion"
echo "7) ❌ Annuler"
echo ""

read -p "Choix (1-7): " choice

case $choice in
    1)
        echo ""
        echo "🔐 Connexion à Shopify..."
        echo "⚠️  Un navigateur va s'ouvrir pour l'authentification"
        echo ""
        shopify login
        echo ""
        echo "✅ Connecté!"
        ;;

    2)
        echo ""
        echo "🎨 Lancement du serveur de développement Shopify..."
        echo "⚠️  Une URL temporaire va être générée"
        echo ""
        cd "$(dirname "$0")"
        shopify theme dev
        ;;

    3)
        echo ""
        echo "📤 Upload du thème (non-publié)..."
        echo "⚠️  Le thème sera visible uniquement en preview"
        echo ""
        read -p "Nom du thème (ex: Breslev-Test): " theme_name
        cd "$(dirname "$0")"
        shopify theme push --unpublished --theme="$theme_name"
        echo ""
        echo "✅ Thème uploadé!"
        ;;

    4)
        echo ""
        echo "🚀 Upload et publication du thème..."
        echo "⚠️  ATTENTION: Le thème sera PUBLIÉ sur le site!"
        echo ""
        read -p "Es-tu sûr? (oui/non): " confirm
        if [ "$confirm" = "oui" ]; then
            cd "$(dirname "$0")"
            shopify theme push
            echo ""
            echo "✅ Thème publié!"
        else
            echo "❌ Annulé"
        fi
        ;;

    5)
        echo ""
        echo "ℹ️  Informations du thème..."
        echo ""
        shopify theme info
        ;;

    6)
        echo ""
        echo "🔌 Déconnexion..."
        shopify logout
        echo "✅ Déconnecté!"
        ;;

    7)
        echo ""
        echo "❌ Annulé"
        exit 0
        ;;

    *)
        echo ""
        echo "❌ Choix invalide!"
        exit 1
        ;;
esac

echo ""
echo "╔════════════════════════════════════════════════════╗"
echo "║                                                    ║"
echo "║   ✅ Terminé!                                       ║"
echo "║                                                    ║"
echo "╚════════════════════════════════════════════════════╝"
