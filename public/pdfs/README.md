# 📚 PDFS LIVRES BRESLEV - FLIPHTML5

## Structure des PDFs

Placez tous les PDFs des livres dans ce dossier avec la nomenclature suivante :

### Livres principaux (20 livres) :
1. `chemot-hatsadikim.pdf` - Chemot Hatsadikim (Les Noms des Justes)
2. `vie-breslever.pdf` - La Vie Breslever
3. `likoutey-moharane-tome1.pdf` - Likoutey Moharane Tome 1
4. `likoutey-moharane-tome2.pdf` - Likoutey Moharane Tome 2
5. `sippurei-maasiyot.pdf` - Sippurei Maasiyot (Contes du Rebbe)
6. `tikoun-phonetique.pdf` - Tikoun Hatzot Phonétique
7. `likoutey-tefilot.pdf` - Likoutey Tefilot
8. `sefer-hamiddot.pdf` - Sefer HaMiddot
9. `chayei-moharan.pdf` - Chayei Moharan
10. `sichot-haran.pdf` - Sichot HaRan
11. `shivchei-haran.pdf` - Shivchei HaRan
12. `tikun-haklali.pdf` - Tikun HaKlali
13. `likutei-halachot.pdf` - Likutei Halachot
14. `likutei-etzot.pdf` - Likutei Etzot
15. `alim-litroufah.pdf` - Alim Litroufah
16. `kitzur-likutey-moharan.pdf` - Kitzur Likutey Moharan
17. `yamei-moharnat.pdf` - Yamei Moharnat
18. `orot-rabbi-nachman.pdf` - Orot Rabbi Nachman
19. `histapchout-hanefesh.pdf` - Histapchout HaNefesh
20. `avodat-hashem.pdf` - Avodat Hashem

### Brochures (10 brochures) :
1. `brochure-tikun-haklali.pdf` - Brochure Tikun HaKlali
2. `brochure-hitbodedout.pdf` - Brochure Hitbodedout
3. `brochure-machir-tov.pdf` - Brochure Machir Tov
4. `brochure-joie.pdf` - Brochure La Joie
5. `brochure-priere.pdf` - Brochure La Prière
6. `brochure-emounah.pdf` - Brochure La Foi
7. `brochure-techouvah.pdf` - Brochure Techouvah
8. `brochure-parnassa.pdf` - Brochure Parnassa
9. `brochure-shalom-bayit.pdf` - Brochure Shalom Bayit
10. `brochure-etudes-torah.pdf` - Brochure Études de Torah

## Intégration FlipHTML5

### Étape 1 : Upload sur FlipHTML5
1. Créer compte sur https://fliphtml5.com
2. Upload chaque PDF individuellement
3. Configurer DRM : activer watermark avec email client
4. Activer protection : désactiver téléchargement, impression limitée
5. Récupérer l'embed code pour chaque livre

### Étape 2 : Configuration des embeds
Après upload, FlipHTML5 génère un code comme :
```html
<iframe src="https://online.fliphtml5.com/[ID]/[BOOK_ID]/"
        width="100%"
        height="600"
        frameborder="0"
        allowfullscreen>
</iframe>
```

### Étape 3 : Mapping dans le système
Mettre à jour `config/fliphtml5-mapping.json` avec :
```json
{
  "chemot-hatsadikim": {
    "fliphtml5_id": "YOUR_FLIPHTML5_ID",
    "book_id": "YOUR_BOOK_ID",
    "embed_url": "https://online.fliphtml5.com/...",
    "watermark_enabled": true,
    "download_disabled": true
  }
}
```

## Sécurité DRM

Les PDFs sont protégés par :
- **Watermarking LemonInk** : Email client visible sur chaque page
- **FlipHTML5 DRM** : Lecture uniquement en ligne, pas de téléchargement
- **SKY PILOT** : Accès conditionné à l'abonnement actif
- **JavaScript protection** : Désactivation clic droit, screenshots bloqués

## Notes importantes

- **Format** : PDF optimisé pour web (< 50MB par fichier)
- **Résolution** : 150 DPI minimum pour lisibilité
- **Taille pages** : A4 standard (210x297mm)
- **Compression** : Utiliser compression PDF pour réduire poids
- **OCR** : Texte searchable activé pour meilleure expérience

## Structure finale attendue

```
public/pdfs/
├── README.md (ce fichier)
├── chemot-hatsadikim.pdf
├── vie-breslever.pdf
├── likoutey-moharane-tome1.pdf
├── [... autres livres ...]
└── brochures/
    ├── brochure-tikun-haklali.pdf
    ├── brochure-hitbodedout.pdf
    └── [... autres brochures ...]
```

## API FlipHTML5 (automatisation)

Pour automatiser l'upload :
```bash
# Utiliser FlipHTML5 API
curl -X POST https://api.fliphtml5.com/v1/upload \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -F "file=@chemot-hatsadikim.pdf" \
  -F "title=Chemot Hatsadikim" \
  -F "drm_enabled=true"
```

---

📝 **Action requise** : Placez vos PDFs dans ce dossier et suivez les étapes d'intégration FlipHTML5.
