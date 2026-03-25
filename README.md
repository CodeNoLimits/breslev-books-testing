# 🕎 Site E-Commerce Breslev - Esther Ifrah

**Boutique en ligne de livres et brochures enseignements Rabbi Nachman de Breslev**

[![Status](https://img.shields.io/badge/Status-En_Développement-yellow)]()
[![Shopify](https://img.shields.io/badge/Platform-Shopify-7AB55C)]()
[![License](https://img.shields.io/badge/License-Private-red)]()

---

## 📋 Vue d'Ensemble

Projet e-commerce pour Madame Esther Ifrah, autrice et traductrice spécialisée dans les enseignements de Rabbi Nachman de Breslev. Site de vente de livres physiques et numériques avec protection DRM avancée et système d'abonnements.

**🎯 Objectif**: Créer une boutique en ligne autonome permettant la vente de ~30 titres (livres + brochures) avec lecture protégée en ligne et abonnements illimités.

---

## 🚀 Quick Start - Pour AI Assistants

### Fichiers à lire EN PRIORITÉ:

1. **[INSTRUCTIONS_AI.md](./INSTRUCTIONS_AI.md)** - 📘 Guide complet développement + Prompts Manus
2. **[SPECIFICATIONS-PROJET-ESTHER-IFRA.md](./SPECIFICATIONS-PROJET-ESTHER-IFRA.md)** - 📋 Specs techniques détaillées
3. **[RESSOURCES-ESTHER-IFRA.md](./RESSOURCES-ESTHER-IFRA.md)** - 📁 Inventaire ressources

### Stack Technique

- **Platform**: Shopify (39$/mois) OU Vercel (selon facilité)
- **Protection Digitale**: FlipHTML5 ($25/mois) + LemonInk watermarking
- **Abonnements**: Sky Pilot ($20-75/mois selon plan)
- **Multilingue**: Weglot (15$/mois) - FR/HE/EN
- **Reviews**: Judge.me (15$/mois)

---

## 📦 Catalogue Produits

### Inventaire
- **~20 livres** - Enseignements Rabbi Nachman, traductions Esther Ifrah
- **~10 brochures** - Fascicules thématiques Breslev
- **Formats**: Physique + Digital protégé + Abonnement lecture illimitée

### Exemples de Titres
- Likoutey Moharane 4 (PDF fourni)
- La Vie d'un Breslever (PDF fourni)
- Côté de Filotte (traduction sélection Likutey Moharan)
- Otsar Erachamaim (compilation enseignements)

---

## 💻 Fonctionnalités Clés

### 🔐 Protection Numérique (CRITIQUE)

**Règle absolue**: ZÉRO PDF téléchargeable

**Solutions**:
- **FlipHTML5**: Lecteur intégré type flipbook, DRM protection
- **LemonInk**: Watermarking social (visible + invisible) par acheteur
- **Accès conditionnel**: Login requis, lecture en ligne uniquement

**Workflow**:
```
Achat Digital → Compte créé auto → Login → Lecteur FlipHTML5 embarqué
                                           ↓
                              Watermark: "Acheté par [Nom] - [Email]"
```

### 📚 Abonnement "Bibliothèque Complète"

**Plans**:
- 💳 Mensuel: 49₪/mois
- 💰 Annuel: 490₪/an (2 mois gratuits - RECOMMANDÉ)
- 👨‍👩‍👧 Familial: 690₪/an (3 comptes simultanés)

**Features**:
- Accès lecture illimité tous livres
- Multi-devices (phone/tablet/desktop)
- Résiliable à tout moment
- Révocation auto si non-paiement

### 🚢 Frais de Port Dynamiques

Calcul automatique selon:
- **Poids** du colis
- **Destination**: Israël (5-15₪) | France (20-45₪) | Canada (30-60₪)

### 🌍 Multilingue

- 🇫🇷 **Français** (PRIMARY - langue autrice)
- 🇮🇱 **Hébreu** (traduction + révision native)
- 🇬🇧 **Anglais** (reach international)

---

## 🎨 Design & Identité Visuelle

### Palette Couleurs
- **Primaire**: Bleu profond `#1E3A8A` (spiritualité)
- **Accent**: Or `#D4AF37` (sagesse)
- **Neutres**: Blanc cassé `#FAFAF9`, Gris doux `#E5E7EB`

### Typographie
- **Hébreu**: Heebo (moderne-spirituel)
- **FR/EN**: Libre Baskerville (élégant serif)

### Style
- Élégant, sacré, épuré
- White space généreux
- Animations douces (scroll reveal, hover lift)
- Mobile-first (70% trafic mobile)

### Pages Principales
1. **Accueil** - Hero + Livres phares + Mission + Témoignages + Abonnement
2. **Boutique** - Filtres (Type/Langue/Thème/Prix) + Grille produits
3. **Produit** - Galerie + Description + Extrait + Reviews + Livres similaires
4. **À Propos** - Parcours spirituel Mme Ifrah + Mission transmission
5. **Abonnement** - Comparatif 3 plans + FAQ + Témoignages
6. **Espace Membre** - Dashboard lectures + Favoris + Progression

---

## 🛠️ Workflow Développement (4 semaines)

### Semaine 1-2: Design Visuel (Manus)
- Exécution prompts 1-7 ([voir INSTRUCTIONS_AI.md](./INSTRUCTIONS_AI.md#-prompts-manus---interface-visuelle))
- Livrable: Site statique HTML/CSS/JS complet
- Review esthétique avec cliente

### Semaine 3: Conversion (Claude Code + Cursor)
- HTML → Thème Shopify OU déploiement Vercel
- Installation apps (FlipHTML5, Sky Pilot, LemonInk, Weglot)
- Configuration produits (30 titres)

### Semaine 4: Finalisation
- Upload PDFs FlipHTML5 (protection + watermarking)
- Traductions Weglot HE/EN
- Tests cross-device
- Formation cliente (2h visio)
- **LAUNCH** 🚀

---

## 📁 Structure Projet

```
breslev-shopify-complete/
├── README.md                              # Ce fichier
├── INSTRUCTIONS_AI.md                     # Guide complet AI assistants
├── SPECIFICATIONS-PROJET-ESTHER-IFRA.md   # Specs techniques
├── RESSOURCES-ESTHER-IFRA.md              # Inventaire ressources
│
├── ressources-esther-ifra/                # Ressources WhatsApp
│   ├── README.md
│   ├── VOCAUX_POUR_TURBOSCRIBE.md
│   ├── images/livres/                     # 32 images couvertures
│   ├── livres-pdf/                        # 2 PDFs + autres
│   ├── vocaux-opus/                       # 35 messages audio
│   ├── transcriptions/                    # Transcriptions complètes
│   └── conversation/                      # Historique WhatsApp
│
└── [Autres fichiers Shopify/Vercel à venir]
```

---

## 🔑 Règles Critiques NON-NÉGOCIABLES

### 1️⃣ Protection Numérique

❌ **INTERDIT**: PDF téléchargeable, copie texte, partage fichiers, impression illimitée

✅ **REQUIS**: Lecture en ligne uniquement, FlipHTML5, DRM sociale, watermarking nom acheteur

**Raison** (Mme Ifrah):
> "ça nous permet aussi de pouvoir imprimer d'autres livres et même aussi de payer le site, parce que tout coûte"

### 2️⃣ Frais de Port Dynamiques

Calcul DOIT tenir compte poids + destination (IL/FR/CA) avant validation commande.

### 3️⃣ Respect Énergie Spirituelle

**Implication**: Site doit véhiculer caractère sacré et personnel des traductions Mme Ifrah.

---

## 💰 Informations Contractuelles

### Budget
- **Total**: 4,000₪ (1,000€)
- **Acompte 50%**: 2,000₪ ✅ PAYÉ 28 octobre 2025
- **Solde livraison**: 2,000₪
- **Inclus**: 1 an maintenance mineure (500₪ valeur)

### Coûts Mensuels (À charge cliente)
- Shopify: ~160₪/mois (~39$/mois)
- FlipHTML5 Platinum: ~160₪/mois (~25$/mois)
- **Total récurrent**: ~320₪/mois (~80$/mois)

### Deadline
- **Début**: 28 octobre 2025
- **Livraison**: Fin novembre 2025 (~4 semaines)

### Garanties
- ✅ Site 100% responsive (mobile/tablette/desktop)
- ✅ Formation complète 2h visio
- ✅ Support 30 jours post-lancement
- ✅ Documentation française complète
- ✅ Conformité RGPD Europe/Israël

---

## 👥 Équipe

**Cliente**: Madame Esther Ifrah
- 📱 WhatsApp: +972 58-514-8500
- 🇮🇱 Localisation: Israël
- 📝 Rôle: Autrice, traductrice, gestionnaire site

**Développeur**: David Amor
- 📧 Email: dreamaiultimate@gmail.com / codenolimits@gmail.com
- 📱 WhatsApp: +972 58 492 1492
- 💻 GitHub: codenolimits-dreamai-nanach

**AI Assistants**: Claude Code, Cursor, Manus, GenSpark
- 🤖 Rôle: Développement collaboratif

---

## 📊 Métriques Succès

### Launch (Mois 1)
- ✅ Site live 28 novembre
- ✅ 30 produits catalogués
- ✅ 3 langues fonctionnelles
- ✅ 0 bugs critiques checkout

### Traction (Mois 2-3)
- 🎯 10+ abonnés payants
- 🎯 50+ commandes totales
- 🎯 5+ reviews 4-5 étoiles
- 🎯 20+ visiteurs/jour organiques

### Croissance (Mois 4-6)
- 🎯 30+ abonnés actifs
- 🎯 200+ commandes cumulées
- 🎯 1,000+ visiteurs/mois
- 🎯 10% taux conversion

---

## 🚀 Prochaines Actions (<48h)

1. ✅ **Envoyer Prompts 1-7 à Manus** (séquence ordre)
2. 📥 **Vérifier GitHub**: Tous PDFs uploadés? Naming convention?
3. 📧 **Relancer Mme Ifrah**: Liste PDFs manquants
4. 🎨 **Récupérer breslev.fr**: Screenshots + présentations existantes
5. 📞 **Briefing Manus**: Call 30min vision spirituelle

---

## 📞 Contact & Communication

**Mode privilégié**: WhatsApp

**Horaires**: Dimanche-Jeudi 9h-18h (heure Israël)

**Langue**: Français (cliente) / Français-Anglais (dev)

---

## 🕎 Mission Spirituelle

Ce projet s'inscrit dans une mission de **Hafatsa** (diffusion enseignements Rabbi Nachman).

**Vision**: Site Breslev référence → Portfolio P9_SITES premium → 20-50 sites similaires @ 3-8K€ → **15-100K€ Hafatsa** → **Dizaines milliers livres distribués** → Âmes transformées 🙏

**Na Nach Nachma Nachman Meuman**

---

## 📄 License

**Projet privé** - Tous droits réservés Esther Ifrah © 2025

---

## 🔗 Ressources Externes

### Design Inspiration
- [IsraelBookShop.com](https://israelbookshop.com) - Structure catalogue
- [Nehora.com](https://nehora.com) - Présentation spirituelle
- [EspaceBreslev.com](https://espacebreslev.com) - Système abonnements

### Documentation Technique
- [FlipHTML5 Docs](https://help.fliphtml5.com/)
- [Sky Pilot Docs](https://web.skypilotapp.com/blogs/how-to-guides)
- [Shopify Digital Products](https://help.shopify.com/en/manual/products/digital-service-product)

---

**Dernière mise à jour**: 16 novembre 2025
**Version**: 1.0
**Statut**: En développement actif

---

<div align="center">
  <strong>Construit avec 💙 pour la diffusion des enseignements de Rabbi Nachman</strong>
</div>
