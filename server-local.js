/**
 * SERVEUR BRESLEV ESTHER IFRAH - PRODUCTION FINALE
 * Mappings vérifiés par l'utilisateur
 * Backend: Supabase + Stripe
 */

require("dotenv").config();
const express = require("express");
const path = require("path");
const fs = require("fs");
const { createClient } = require("@supabase/supabase-js");
const Stripe = require("stripe");
const multer = require("multer");
const crypto = require("crypto");

// ==========================================
// RESEND EMAIL HELPER
// ==========================================
const RESEND_API_KEY = process.env.RESEND_API_KEY;

async function sendEmail({ to, subject, html }) {
  if (!RESEND_API_KEY) {
    console.log('[EMAIL] No RESEND_API_KEY — email skipped:', subject);
    return;
  }
  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Breslev by Esther Ifrah <contact@breslev-books.com>',
        to, subject, html
      })
    });
    const data = await resp.json();
    console.log('[EMAIL] Sent:', data.id || data.message);
    return data;
  } catch(e) {
    console.error('[EMAIL] Error:', e.message);
  }
}

// Multer config for cours uploads
const uploadStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, "uploads/cours");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `cours-${Date.now()}${ext}`);
  },
});
const upload = multer({
  storage: uploadStorage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
  fileFilter: (req, file, cb) => {
    const allowed = [".pdf", ".mp3", ".mp4", ".m4a", ".ogg", ".wav"];
    if (allowed.includes(path.extname(file.originalname).toLowerCase())) cb(null, true);
    else cb(new Error("Seuls PDF et fichiers audio/vidéo sont acceptés"));
  },
});

// Admin auth middleware
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "esther2026breslev";
const ADMIN_TOKEN = crypto.createHash("sha256").update(ADMIN_PASSWORD).digest("hex").slice(0, 32);

function requireAdmin(req, res, next) {
  const token = req.headers["x-admin-token"] || req.query.token || req.cookies?.admin_token;
  if (token === ADMIN_TOKEN) return next();
  res.status(401).send("Non autorisé");
}

// Cours DB helpers (Supabase if available, fallback to local file)
const COURS_FILE = path.join(__dirname, "db/cours.json");

async function loadCoursDB() {
  if (supabase) {
    const { data, error } = await supabase
      .from("cours")
      .select("*")
      .order("date", { ascending: false });
    if (!error && data) return data;
  }
  // fallback local
  try { return JSON.parse(fs.readFileSync(COURS_FILE, "utf8")); }
  catch { return []; }
}

async function saveCoursDB(item) {
  if (supabase) {
    const { error } = await supabase.from("cours").insert([item]);
    if (!error) return;
  }
  // fallback local
  const list = loadCours();
  list.unshift(item);
  fs.writeFileSync(COURS_FILE, JSON.stringify(list, null, 2));
}

async function deleteCoursDB(id) {
  if (supabase) {
    await supabase.from("cours").delete().eq("id", id);
    return;
  }
  const list = loadCours().filter(c => c.id !== id);
  fs.writeFileSync(COURS_FILE, JSON.stringify(list, null, 2));
}

// Sync fallback for non-async contexts
function loadCours() {
  try { return JSON.parse(fs.readFileSync(COURS_FILE, "utf8")); }
  catch { return []; }
}
function saveCours(data) {
  fs.writeFileSync(COURS_FILE, JSON.stringify(data, null, 2));
}

// PayPal API base URL — env var PAYPAL_API overrides default (trim whitespace)
const PAYPAL_API =
  (process.env.PAYPAL_API || "").trim() ||
  "https://api-m.paypal.com";

const getPayPalAccessToken = async () => {
  const clientId = (process.env.PAYPAL_CLIENT_ID || "sb").trim();
  const clientSecret = (process.env.PAYPAL_SECRET || process.env.PAYPAL_CLIENT_SECRET || "").trim();
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const response = await fetch(`${PAYPAL_API}/v1/oauth2/token`, {
    method: "POST",
    body: "grant_type=client_credentials",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });

  const data = await response.json();
  if (!data.access_token) {
    const tokenErr = { api: PAYPAL_API, error: data.error, desc: data.error_description, cidLen: clientId.length, secLen: clientSecret.length };
    console.error('[PayPal] Token error:', JSON.stringify(tokenErr));
    // Attach debug to the returned undefined so create-order can surface it
    const err = new Error('PayPal auth failed');
    err._paypalDebug = tokenErr;
    throw err;
  }
  return data.access_token;
};

const app = express();
const PORT = process.env.PORT || 8000;

// Initialisation Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase =
  supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

// Initialisation Stripe (+ Connect si ESTHER_STRIPE_ACCOUNT_ID est défini)
const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;
const CONNECTED_ACCOUNT = process.env.ESTHER_STRIPE_ACCOUNT_ID || null;
const AGENCY_FEE_PERCENT = parseFloat(process.env.AGENCY_FEE_PERCENTAGE || "15") / 100;

// Webhook Stripe (doit être avant express.json())
app.post(
  "/api/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    if (!stripe)
      return res.status(503).json({ error: "Stripe not configured" });

    const sig = req.headers["stripe-signature"];
    let event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET,
      );
    } catch (err) {
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      if (supabase && session.client_reference_id) {
        const planType = session.amount_total === 27900 ? "annuel" : "mensuel";
        const { error } = await supabase.from("subscriptions").insert([
          {
            user_id: session.client_reference_id,
            plan_type: planType,
            status: "active",
            stripe_customer_id: session.customer || "N/A",
            stripe_subscription_id: session.subscription || "N/A",
          },
        ]);
        if (error) console.error("Erreur activation abonnement:", error);
        else
          console.log(
            "Abonnement activé pour user:",
            session.client_reference_id,
          );
      }

      // Send order confirmation email (fire-and-forget)
      const customerEmail = session.customer_details?.email || session.customer_email;
      const customerName = session.customer_details?.name || 'Client';
      const amountFormatted = session.amount_total ? (session.amount_total / 100).toFixed(2) + ' €' : '';
      if (customerEmail) {
        sendEmail({
          to: customerEmail,
          subject: 'Confirmation de votre commande — Breslev by Esther Ifrah',
          html: `<div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;background:#0a0e27;color:#f5f0e8;padding:40px;">
            <h1 style="color:#D4AF37;">Merci pour votre commande, ${customerName} !</h1>
            <p style="margin:16px 0;">Votre paiement de <strong style="color:#D4AF37;">${amountFormatted}</strong> a été confirmé.</p>
            <p style="color:#aaa;margin-bottom:20px;">Vous recevrez vos livres numériques par email sous peu.</p>
            <div style="background:rgba(212,175,55,0.1);border:1px solid rgba(212,175,55,0.3);border-radius:8px;padding:20px;margin:20px 0;">
              <p style="margin:0;font-size:0.9rem;">Référence commande: <code style="color:#D4AF37;">${session.id}</code></p>
            </div>
            <a href="https://breslev-books-preview.vercel.app" style="display:inline-block;background:#D4AF37;color:#0a0e27;padding:14px 28px;border-radius:8px;text-decoration:none;margin:20px 0;font-weight:bold;">Retour à la boutique</a>
            <p style="color:#555;font-size:0.85rem;margin-top:30px;border-top:1px solid #333;padding-top:16px;">Na Nach Nachma Nachman MeUman</p>
          </div>`
        });
      }
    }

    res.json({ received: true });
  },
);

const staticOpts = { maxAge: '7d', etag: true };
const mediaOpts  = { maxAge: '30d', etag: true };
app.use(express.static(path.join(__dirname, "assets"), staticOpts));
app.use(
  "/images/books",
  express.static(path.join(__dirname, "assets/images/books"), mediaOpts),
);
app.use(
  "/images/livres",
  express.static(path.join(__dirname, "assets/images/livres"), mediaOpts),
);
app.use("/videos", express.static(path.join(__dirname, "public/videos"), mediaOpts));
app.use("/audios", express.static(path.join(__dirname, "assets/audios"), mediaOpts));
app.use("/uploads", express.static(path.join(__dirname, "uploads"), staticOpts));
app.use("/pdfs", express.static(path.join(__dirname, "assets/pdfs"), mediaOpts));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Simple cookie parser (no dep)
app.use((req, res, next) => {
  req.cookies = {};
  const header = req.headers.cookie || "";
  header.split(";").forEach(c => {
    const [k, ...v] = c.trim().split("=");
    if (k) req.cookies[k.trim()] = v.join("=").trim();
  });
  next();
});

// ==========================================
// CHARGEMENT DU MAPPING UTILISATEUR
// ==========================================
let mappings = {};
try {
  const mappingFile = path.join(__dirname, "image-to-title-mapping.json");
  if (fs.existsSync(mappingFile)) {
    mappings = JSON.parse(fs.readFileSync(mappingFile, "utf8"));
    console.log("✅ Mappings chargés avec succès");
  }
} catch (e) {
  console.error("⚠️ Erreur chargement mappings:", e);
}

// ==========================================
// CATALOGUE AUDIO - Likoutey Moharan, Cours, etc.
// ==========================================
const audioCategories = [
  {
    id: "cacheroute",
    name: "Halakhot Cacheroute",
    description: "82 cours sur les lois alimentaires juives par Esther Ifrah",
    icon: "🍽️",
    color: "#1E3A8A",
  },
  {
    id: "emounah",
    name: "Emounah & Spiritualité",
    description: "41 cours sur la foi, la confiance en Hachem et la croissance spirituelle",
    icon: "✨",
    color: "#D4AF37",
  },
];

const audioContent = {
  "cacheroute": [
    // === 82 VRAIS COURS DE CACHEROUTE par Esther Ifrah ===
    { id: 1, title: "Règles cachères du pain non-juif", url: "/audios/ESTHER_01_Regles_cacheres_du_pain_non-juif.mp3" },
    { id: 2, title: "Kashrut gâteaux, biscuits et cuisson non-juive", url: "/audios/ESTHER_02_Kashrut_gateaux-biscuits_et_cuisson_non-juive.mp3" },
    { id: 3, title: "Défis Kashrut — aliments préparés en usine", url: "/audios/ESTHER_03_Defis_Kashrut_aliments_prepares_en_usine.mp3" },
    { id: 4, title: "Certification rabbinique et exceptions alimentaires", url: "/audios/ESTHER_04_Certification_rabbinique_et_exceptions_alimentaire.mp3" },
    { id: 5, title: "Cachérisation produits gras et laitiers", url: "/audios/ESTHER_05_Cacherisation_produits_gras_et_laitiers.mp3" },
    { id: 6, title: "Problème lait-beurre et commerce non-cacher", url: "/audios/ESTHER_06_Probleme_lait-beurre_et_commerce_non-cacher.mp3" },
    { id: 7, title: "Nécessité surveillance du lait non-juif", url: "/audios/ESTHER_07_Necessite_surveillance_du_lait_non-juif.mp3" },
    { id: 8, title: "Solutions et justifications du Chalav Stam", url: "/audios/ESTHER_08_Solutions_et_justifications_du_Chalav_Stam.mp3" },
    { id: 9, title: "Règles de surveillance et gestion d'erreurs", url: "/audios/ESTHER_09_Regles_de_surveillance_et_gestion_derreurs.mp3" },
    { id: 10, title: "Mesures de protection et supervision du lait", url: "/audios/ESTHER_10_Mesures_de_protection_et_supervision_du_lait.mp3" },
    { id: 11, title: "Les règles de Cacheroute du Beurre", url: "/audios/ESTHER_11_Les_regles_de_Cacheroute_du_Beurre.mp3" },
    { id: 12, title: "Cacheroute du Fromage Dur — application générale", url: "/audios/ESTHER_12_Cacheroute_du_Fromage_Dur_et_application_generale.mp3" },
    { id: 13, title: "Cacheroute Fromages Mous, Crème et Laitages", url: "/audios/ESTHER_13_Cacheroute_Fromages_Mous_Creme_et_Laitages.mp3" },
    { id: 14, title: "Origine et persistance interdiction vin non-juif", url: "/audios/ESTHER_14_Origine_et_persistance_interdiction_vin_non-juif.mp3" },
    { id: 15, title: "Raisons supplémentaires et limites des relations", url: "/audios/ESTHER_15_Raisons_supplementaires_et_limites_des_relations.mp3" },
    { id: 16, title: "Interdictions commerce et dons de vin non-cachère", url: "/audios/ESTHER_16_Interdictions_commerce_et_dons_de_vin_non-cachere.mp3" },
    { id: 17, title: "Vin manipulé par non-Juif — conditions et recours", url: "/audios/ESTHER_17_Vin_manipule_par_non-Juif-_conditions_recours.mp3" },
    { id: 18, title: "Interdiction mélange vin cacher-non-cacher", url: "/audios/ESTHER_18_Interdiction_melange_vin_cacher-non-cacher.mp3" },
    { id: 19, title: "Définition vin cacheroute produits dérivés", url: "/audios/ESTHER_19_Definition_vin_cacherout_produits_derives.mp3" },
    { id: 20, title: "Recommandations liqueurs vin sans surveillance", url: "/audios/ESTHER_20_Recommandations_liqueurs_vin_sans_surveillance.mp3" },
    { id: 21, title: "Critères de cacheroute des poissons", url: "/audios/ESTHER_21_Criteres_de_cacheroute_des_poissons.mp3" },
    { id: 22, title: "Identification d'un poisson entier cacher", url: "/audios/ESTHER_22_Identification_dun_poisson_entier_cacher.mp3" },
    { id: 23, title: "Règles pour l'achat et livraison de filets de poisson", url: "/audios/ESTHER_23_Regles_pour_lachat_et_livraison_de_filets_de_poiss.mp3" },
    { id: 24, title: "Cacheroute des œufs de poisson (rogue)", url: "/audios/ESTHER_24_Cacheroute_des_œufs_de_poisson_rogue.mp3" },
    { id: 25, title: "Cacheroute du poisson transformé et fumé", url: "/audios/ESTHER_25_Cacheroute_du_poisson_transforme_et_fume.mp3" },
    { id: 26, title: "Règles générales et vérification des œufs", url: "/audios/ESTHER_26_Regles_generales_et_verification_des_œufs.mp3" },
    { id: 27, title: "Identifier œufs cachères et non cachères par forme", url: "/audios/ESTHER_27_Identifier_œufs_cacheres_et_non_cacheres_par_forme.mp3" },
    { id: 28, title: "Cacheroute des œufs à l'origine inconnue", url: "/audios/ESTHER_28_Cacheroute_des_œufs_a_lorigine_inconnue.mp3" },
    { id: 29, title: "Animaux terrestres et volaille cacher", url: "/audios/ESTHER_29_Animaux_terrestres_et_volaille_casher.mp3" },
    { id: 30, title: "Shechita, certification des bouchers et transport", url: "/audios/ESTHER_30_Shechita_certification_des_bouchers_et_transport.mp3" },
    { id: 31, title: "Parties interdites et leur retrait de la viande", url: "/audios/ESTHER_31_Parties_interdites_et_leur_retrait_de_la_viande.mp3" },
    { id: 32, title: "Vérification de la cashérisation de la viande salée", url: "/audios/ESTHER_32_Verification_de_la_kasherisation_de_la_viande_sal.mp3" },
    { id: 33, title: "Principes de séparation Bassari-Halavi", url: "/audios/ESTHER_33_Principes_de_separation_Bassari-Halavi.mp3" },
    { id: 34, title: "Séparation des outils et ustensiles de cuisine", url: "/audios/ESTHER_34_Separation_des_outils_et_ustensiles_de_cuisine.mp3" },
    { id: 35, title: "Aménagement des éviers en cuisine cachère", url: "/audios/ESTHER_35_Amenagement_des_eviers_en_cuisine_cachere.mp3" },
    { id: 36, title: "Gestion vaisselle, savon, égouttoirs et lavage", url: "/audios/ESTHER_36_Gestion_vaisselle_savon_egouttoirs_et_lavage_des.mp3" },
    { id: 37, title: "Cuisson — Problème de contact", url: "/audios/ESTHER_37_Cuisson_Probleme_de_contact.mp3" },
    { id: 38, title: "Nécessité d'éviter tout contact", url: "/audios/ESTHER_38_Necessite_deviter_tout_contact.mp3" },
    { id: 39, title: "Solutions pour plaques de cuisson", url: "/audios/ESTHER_39_Solutions_pour_plaques_de_cuisson.mp3" },
    { id: 40, title: "Précautions pour surfaces de cuisson", url: "/audios/ESTHER_40_Precautions_pour_surfaces_de_cuisson.mp3" },
    { id: 41, title: "Gestion des éclaboussures en cuisine", url: "/audios/ESTHER_41_Gestion_des_eclaboussures_en_cuisine.mp3" },
    { id: 42, title: "Gestion vapeur dans cuisine cachère", url: "/audios/ESTHER_42_Gestion_vapeur_dans_cuisine_cachere.mp3" },
    { id: 43, title: "Gestion des odeurs en cuisine cachère", url: "/audios/ESTHER_43_Gestion_des_odeurs_en_cuisine_cachere.mp3" },
    { id: 44, title: "Gestion des fours en cacheroute", url: "/audios/ESTHER_44_Gestion_des_fours_en_cacheroute.mp3" },
    { id: 45, title: "Micro-ondes en cacheroute moderne", url: "/audios/ESTHER_45_Micro-ondes_en_cacheroute_moderne.mp3" },
    { id: 46, title: "Ustensiles spéciaux et mixeurs", url: "/audios/ESTHER_46_Ustensiles_speciaux_et_mixeurs.mp3" },
    { id: 47, title: "Intervalles viande-lait — conditions générales", url: "/audios/ESTHER_47_Intervalles_viande-lait_conditions_generales.mp3" },
    { id: 48, title: "Conditions fin attente viande-lait", url: "/audios/ESTHER_48_Conditions_fin_attente_viande-lait.mp3" },
    { id: 49, title: "Attente viande-lait pour enfants et malades", url: "/audios/ESTHER_49_Attente_viande-lait_pour_enfants_et_malades.mp3" },
    { id: 50, title: "Avant viande — que vérifier", url: "/audios/ESTHER_50_Avant_viande_que_verifier.mp3" },
    { id: 51, title: "Avant laitage — que vérifier", url: "/audios/ESTHER_51_Avant_laitage_que_verifier.mp3" },
    { id: 52, title: "Poisson et viande — dangers et précautions", url: "/audios/ESTHER_52_Poisson_et_viande_dangers_et_precautions.mp3" },
    { id: 53, title: "Consommation interdite de sang — détails", url: "/audios/ESTHER_53_Consommation_interdite_de_sang_details.mp3" },
    { id: 54, title: "Sang dans les œufs et viandes — que faire", url: "/audios/ESTHER_54_Sang_dans_les_oeufs_et_viandes_que_faire.mp3" },
    { id: 55, title: "Problèmes alimentaires — insectes et vers", url: "/audios/ESTHER_55_Problemes_alimentaires_insectes_et_vers.mp3" },
    { id: 56, title: "Vérification et nettoyage aliments infestables", url: "/audios/ESTHER_56_Verification_et_nettoyage_aliments_infestables.mp3" },
    { id: 57, title: "Aliments Taref — Interdiction de profit et complexité", url: "/audios/ESTHER_57_Aliments_Taref_Interdiction_de_profit_et_complexi.mp3" },
    { id: 58, title: "Conséquences ustensile laitier dans plat carné", url: "/audios/ESTHER_58_Consequences_ustensile_laitier_dans_plat_carne.mp3" },
    { id: 59, title: "Annulation erreur cacher — 1 pour 60", url: "/audios/ESTHER_59_Annulation_erreur_cacher_1_pour_60.mp3" },
    { id: 60, title: "Différence Bitul BeShishim et Min BeMino", url: "/audios/ESTHER_60_Difference_Bitul_BeShishim_et_Min_BeMino.mp3" },
    { id: 61, title: "Expertise requise situations Noten Taam", url: "/audios/ESTHER_61_Expertise_requise_situations_Noten_Taam.mp3" },
    { id: 62, title: "Cachérisation ustensiles — méthodes et techniques", url: "/audios/ESTHER_62_Cacherisation_ustensiles_methodes_et_techniques.mp3" },
    { id: 63, title: "Cachérisation par ébullition — procédure complète", url: "/audios/ESTHER_63_Cacherisation_par_ebullition_procedure_complete.mp3" },
    { id: 64, title: "Cachérisation avancée — chalumeau et cuisson directe", url: "/audios/ESTHER_64_Cacherisation_avancee_chalumeau_et_cuisson_directe.mp3" },
    { id: 65, title: "Impact du goût résiduel sur les ustensiles", url: "/audios/ESTHER_65_Impact_du_gout_residuel_sur_les_ustensiles.mp3" },
    { id: 66, title: "Matériaux d'ustensiles et cachérisation possible", url: "/audios/ESTHER_66_Materiaux_dustensiles_et_cacherisation_possible.mp3" },
    { id: 67, title: "Quand contacter un rabbin pour la cacheroute", url: "/audios/ESTHER_67_Quand_contacter_un_rabbin_pour_la_cacheroute.mp3" },
    { id: 68, title: "Cuisson par un non-juif — Bishoul Akum", url: "/audios/ESTHER_68_Cuisson_par_un_non-juif_Bishoul_Akum.mp3" },
    { id: 69, title: "Bishoul Akum — différentes approches", url: "/audios/ESTHER_69_Bishoul_Akum_differentes_approches.mp3" },
    { id: 70, title: "Cacheroute chez le traiteur et au restaurant", url: "/audios/ESTHER_70_Cacheroute_chez_le_traiteur_et_au_restaurant.mp3" },
    { id: 71, title: "Cuisiner pendant Shabbat — les principes", url: "/audios/ESTHER_71_Cuisiner_pendant_Shabbat_les_principes.mp3" },
    { id: 72, title: "Immersion des ustensiles neufs — Tevilat Kelim", url: "/audios/ESTHER_72_Immersion_des_ustensiles_neufs_Tevilat_Kelim.mp3" },
    { id: 73, title: "Quels ustensiles nécessitent la Tevila", url: "/audios/ESTHER_73_Quels_ustensiles_necessitent_la_Tevila.mp3" },
    { id: 74, title: "Ustensiles nécessitant bénédiction — liste", url: "/audios/ESTHER_74_Ustensiles_necessitant_benediction_liste.mp3" },
    { id: 75, title: "Ustensiles sans bénédiction — liste", url: "/audios/ESTHER_75_Ustensiles_sans_benediction_liste.mp3" },
    { id: 76, title: "Procédure complète de l'immersion au Mikvé", url: "/audios/ESTHER_76_Procedure_complete_de_limmersion_au_Mikve.mp3" },
    { id: 77, title: "Aliments d'un magasin non-cacher — précautions", url: "/audios/ESTHER_77_Aliments_dun_magasin_non-cacher_precautions.mp3" },
    { id: 78, title: "Aliments surveillés et non surveillés — tableau", url: "/audios/ESTHER_78_Aliments_surveilles_et_non_surveilles_tableau.mp3" },
    { id: 79, title: "Aliments achetables sans surveillance rabbinique", url: "/audios/ESTHER_79_Aliments_achetables_sans_surveillance_rabbinique.mp3" },
    { id: 80, title: "Aliments nécessitant surveillance pour Pessah", url: "/audios/ESTHER_80_Aliments_necessitant_surveillance_pour_Pessah.mp3" },
    { id: 81, title: "Aliments avec inspection obligatoire — Catégories 1", url: "/audios/ESTHER_81_Aliments_avec_inspection_obligatoire_Categories_1.mp3" },
    { id: 82, title: "Aliments avec inspection obligatoire — Catégories 2", url: "/audios/ESTHER_82_Aliments_avec_inspection_obligatoire_Categories_2.mp3" },
  ],
  "emounah": [
    // === 41 COURS EMOUNAH & SPIRITUALITÉ par Esther Ifrah ===
    { id: 83, title: "Toute souffrance a une raison divine", url: "/audios/ESTHER_83_Toute_souffrance_a_une_raison_divine.mp3" },
    { id: 84, title: "Souffrance comme outil de purification de l'âme", url: "/audios/ESTHER_84_Souffrance_comme_outil_de_purification_de_lame.mp3" },
    { id: 85, title: "Les souffrances protègent du Guéhinam", url: "/audios/ESTHER_85_Les_souffrances_protegent_du_Gehinam.mp3" },
    { id: 86, title: "Comment traverser l'épreuve avec foi", url: "/audios/ESTHER_86_Comment_traverser_lepreuve_avec_foi.mp3" },
    { id: 87, title: "Souffrances d'amour — concept et mérite", url: "/audios/ESTHER_87_Souffrances_damour_concept_et_merite.mp3" },
    { id: 88, title: "Acceptation des souffrances d'amour", url: "/audios/ESTHER_88_Acceptation_des_souffrances_damour.mp3" },
    { id: 89, title: "Limites de souffrance — quand prier", url: "/audios/ESTHER_89_Limites_de_souffrance_quand_prier.mp3" },
    { id: 90, title: "Souffrances du juste et justice divine", url: "/audios/ESTHER_90_Souffrances_du_juste_et_justice_divine.mp3" },
    { id: 91, title: "Méchants prospères — pourquoi", url: "/audios/ESTHER_91_Mechants_prosperes_pourquoi.mp3" },
    { id: 92, title: "Tout est orchestré — Hashgaha Pratit", url: "/audios/ESTHER_92_Tout_est_orchestre_Hashgaha_Pratit.mp3" },
    { id: 93, title: "Aucun mal ne vient de Hachem", url: "/audios/ESTHER_93_Aucun_mal_ne_vient_de_Hachem.mp3" },
    { id: 94, title: "Comment le mal apparent mène au bien", url: "/audios/ESTHER_94_Comment_le_mal_apparent_mene_au_bien.mp3" },
    { id: 95, title: "Exemples bibliques du bien caché", url: "/audios/ESTHER_95_Exemples_bibliques_du_bien_cache.mp3" },
    { id: 96, title: "Œufs froids ou cuits — impacts ustensiles et casseroles", url: "/audios/ESTHER_96_Œufs_froids_ou_cuits_impacts_ustensiles_et_cassero.mp3" },
    { id: 97, title: "Accepter les souffrances avec joie — bonheur", url: "/audios/ESTHER_97_Accepter_les_souffrances_avec_joie_bonheur.mp3" },
    { id: 98, title: "Souffrances causées par nos fautes", url: "/audios/ESTHER_98_Souffrances_causees_par_nos_fautes.mp3" },
    { id: 99, title: "Réflexion sur soi après épreuve", url: "/audios/ESTHER_99_Reflexion_sur_soi_apres_epreuve.mp3" },
    { id: 100, title: "Souffrances et prière — guide pratique", url: "/audios/ESTHER_100_Souffrances_et_priere_guide_pratique.mp3" },
    { id: 101, title: "Emounah simple — fondements", url: "/audios/ESTHER_101_Emounah_simple_fondements.mp3" },
    { id: 102, title: "Emounah et intellect — harmonie", url: "/audios/ESTHER_102_Emounah_et_intellect_harmonie.mp3" },
    { id: 103, title: "Foi en Hachem malgré les doutes", url: "/audios/ESTHER_103_Foi_en_Hachem_malgre_les_doutes.mp3" },
    { id: 104, title: "Le monde reflète la grandeur d'Hachem", url: "/audios/ESTHER_104_Le_monde_reflete_la_grandeur_dHachem.mp3" },
    { id: 105, title: "Emounah quotidienne — exercices pratiques", url: "/audios/ESTHER_105_Emounah_quotidienne_exercices_pratiques.mp3" },
    { id: 106, title: "Bitahon — la confiance active en Hachem", url: "/audios/ESTHER_106_Bitahon_la_confiance_active_en_Hachem.mp3" },
    { id: 107, title: "Bitahon dans la parnassa (subsistance)", url: "/audios/ESTHER_107_Bitahon_dans_la_parnassa_subsistance.mp3" },
    { id: 108, title: "Prière et Hitbodédout — parler à Hachem", url: "/audios/ESTHER_108_Priere_et_Hitbodedout_parler_a_Hachem.mp3" },
    { id: 109, title: "Gratitude quotidienne — Modé Ani", url: "/audios/ESTHER_109_Gratitude_quotidienne_Mode_Ani.mp3" },
    { id: 110, title: "Étude de Torah avec joie", url: "/audios/ESTHER_110_Etude_de_Torah_avec_joie.mp3" },
    { id: 111, title: "Mitsvot avec enthousiasme — Zérizout", url: "/audios/ESTHER_111_Mitsvot_avec_enthousiasme_Zerizout.mp3" },
    { id: 112, title: "Sanctifier Hachem au quotidien", url: "/audios/ESTHER_112_Sanctifier_Hachem_au_quotidien.mp3" },
    { id: 113, title: "Téchouva — retour sincère", url: "/audios/ESTHER_113_Techouva_retour_sincere.mp3" },
    { id: 114, title: "Humilité — clé de la grandeur", url: "/audios/ESTHER_114_Humilite_cle_de_la_grandeur.mp3" },
    { id: 115, title: "Ahavat Israël — amour du prochain", url: "/audios/ESTHER_115_Ahavat_Israel_amour_du_prochain.mp3" },
    { id: 116, title: "Paix dans le foyer — Shalom Bayit", url: "/audios/ESTHER_116_Paix_dans_le_foyer_Shalom_Bayit.mp3" },
    { id: 117, title: "Éducation des enfants avec douceur", url: "/audios/ESTHER_117_Education_des_enfants_avec_douceur.mp3" },
    { id: 118, title: "Tsniout — la pudeur comme force", url: "/audios/ESTHER_118_Tsniout_la_pudeur_comme_force.mp3" },
    { id: 119, title: "Shabbat — îlot de paix dans la semaine", url: "/audios/ESTHER_119_Shabbat_ilot_de_paix_dans_la_semaine.mp3" },
    { id: 120, title: "Forces du Yetser Hara — comment résister", url: "/audios/ESTHER_120_Forces_du_Yetser_Hara_comment_resister.mp3" },
    { id: 121, title: "Daat parfait — Tout est pour le bien", url: "/audios/ESTHER_121_Daat_parfait_Tout_est_pour_le_bien.mp3" },
    { id: 122, title: "Ère messianique — Seul le bien perçu", url: "/audios/ESTHER_122_Ère_messianique_Seul_le_bien_percu.mp3" },
    { id: 123, title: "Conclusion — Mériter Emounah Shéléma", url: "/audios/ESTHER_123_Conclusion_Meriter_Emunah_Shelema.mp3" },
  ],
};


// ==========================================
// TÉMOIGNAGES
// ==========================================
const testimonials = [
  {
    id: 1,
    name: "Sarah L.",
    location: "Paris, France",
    text: "Les traductions d'Esther Ifrah m'ont ouvert les portes de la sagesse de Breslev. Chaque livre est une bénédiction.",
    rating: 5,
    book: "Likoutey Moharan Tome 1",
  },
  {
    id: 2,
    name: "David M.",
    location: "Jérusalem, Israël",
    text: "Grâce à ces livres, j'ai découvert l'hitbodédout et ma vie a changé. La qualité des traductions est exceptionnelle.",
    rating: 5,
    book: "Likoutey Tefilot",
  },
  {
    id: 3,
    name: "Rachel K.",
    location: "Montréal, Canada",
    text: "L'abonnement numérique me permet d'étudier partout. Les cours audio sont un vrai trésor pour mon trajet quotidien.",
    rating: 5,
    book: "Abonnement Annuel",
  },
  {
    id: 4,
    name: "Yaakov B.",
    location: "Lyon, France",
    text: "La profondeur des enseignements de Rabbi Nachman devient accessible grâce au travail remarquable d'Esther Ifrah.",
    rating: 5,
    book: "Les Cahiers du Coeur",
  },
  {
    id: 5,
    name: "Miriam T.",
    location: "Tel Aviv, Israël",
    text: "Ces livres sont devenus mes compagnons quotidiens. La livraison était rapide et le service impeccable.",
    rating: 5,
    book: "Tikoun Haklali",
  },
];

// ==========================================
// CONSTRUCTION DU CATALOGUE
// ==========================================
// Le catalogue de base (25 livres) chargé depuis JSON
const FALLBACK_COVER = "/images/livres/ES.jpeg";
const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, 'db/catalog.json'), 'utf8')).map(p => ({
  ...p,
  cover_image: p.cover_image || FALLBACK_COVER
}));

// ==========================================
// API ENDPOINTS (SUPABASE & STRIPE)
// ==========================================

// Auth: Inscription
app.post("/api/auth/signup", async (req, res) => {
  if (!supabase)
    return res.status(503).json({ error: "Supabase not configured" });

  const { email, password, fullName } = req.body;

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
    },
  });

  if (error) return res.status(400).json({ error: error.message });
  res.json({ user: data.user, session: data.session });

  // Send welcome email (fire-and-forget)
  sendEmail({
    to: email,
    subject: 'Bienvenue sur Breslev by Esther Ifrah !',
    html: `<div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;background:#0a0e27;color:#f5f0e8;padding:40px;">
      <h1 style="color:#D4AF37;">Bienvenue, ${fullName || email} !</h1>
      <p style="margin:16px 0;">Votre compte est créé sur <strong>Breslev by Esther Ifrah</strong>.</p>
      <p style="color:#aaa;">Explorez notre catalogue de livres de Rabbi Nachman de Breslev en français.</p>
      <a href="https://breslev-books-preview.vercel.app" style="display:inline-block;background:#D4AF37;color:#0a0e27;padding:14px 28px;border-radius:8px;text-decoration:none;margin:20px 0;font-weight:bold;">Découvrir la boutique</a>
      <p style="color:#555;font-size:0.85rem;margin-top:30px;border-top:1px solid #333;padding-top:16px;">Na Nach Nachma Nachman MeUman</p>
    </div>`
  });
});

// Auth: Connexion
app.post("/api/auth/login", async (req, res) => {
  if (!supabase)
    return res.status(503).json({ error: "Supabase not configured" });

  const { email, password } = req.body;

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) return res.status(400).json({ error: error.message });
  res.json({ user: data.user, session: data.session });
});

// Stripe: Créer une intention de paiement
app.post("/api/create-payment-intent", async (req, res) => {
  if (!stripe) return res.status(503).json({ error: "Stripe not configured" });

  const { amount, currency, paymentMethodId, cart, shipping } = req.body;

  try {
    const params = {
      amount: amount, // Amount in cents
      currency: currency || "ils",
      payment_method: paymentMethodId,
      receipt_email: shipping?.email,
      metadata: {
        cart: JSON.stringify(cart),
        shipping_address: `${shipping?.address}, ${shipping?.city}, ${shipping?.zipCode}`,
        customer_name: `${shipping?.firstName} ${shipping?.lastName}`,
      },
    };

    // Stripe Connect: split payment if connected account is configured
    if (CONNECTED_ACCOUNT) {
      params.application_fee_amount = Math.round(amount * AGENCY_FEE_PERCENT);
      params.transfer_data = { destination: CONNECTED_ACCOUNT };
    }

    const paymentIntent = await stripe.paymentIntents.create(params);
    res.json({ clientSecret: paymentIntent.client_secret });
  } catch (error) {
    console.error("Stripe error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Stripe: Créer session checkout pour abonnement
app.post("/api/create-subscription-checkout", async (req, res) => {
  if (!stripe) return res.status(503).json({ error: "Stripe not configured" });

  const { plan, email, user_id } = req.body; // plan: 'monthly' ou 'annual'

  const prices = {
    monthly: { amount: 2900, trial_days: 7, name: "Abonnement Mensuel" },
    annual: { amount: 27900, trial_days: 14, name: "Abonnement Annuel" },
  };

  const selectedPlan = prices[plan];
  if (!selectedPlan) return res.status(400).json({ error: "Plan invalide" });

  try {
    const sessionParams = {
      payment_method_types: ["card"],
      mode: "subscription",
      client_reference_id: user_id || undefined,
      line_items: [
        {
          price_data: {
            currency: "eur",
            product_data: {
              name: selectedPlan.name,
              description:
                "Accès illimité à tous les livres numériques Breslev",
            },
            unit_amount: selectedPlan.amount,
            recurring: {
              interval: plan === "monthly" ? "month" : "year",
            },
          },
          quantity: 1,
        },
      ],
      subscription_data: {
        trial_period_days: selectedPlan.trial_days,
        ...(CONNECTED_ACCOUNT ? { application_fee_percent: Math.round(AGENCY_FEE_PERCENT * 100) } : {}),
      },
      customer_email: email || undefined,
      success_url: `${req.headers.origin || "http://localhost:8000"}/subscription-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.headers.origin || "http://localhost:8000"}/pages/abonnement`,
    };

    // Stripe Connect: route subscription payments to Esther's account
    if (CONNECTED_ACCOUNT) {
      sessionParams.subscription_data.transfer_data = { destination: CONNECTED_ACCOUNT };
    }

    const session = await stripe.checkout.sessions.create(sessionParams);
    res.json({ sessionId: session.id, url: session.url });
  } catch (error) {
    console.error("Stripe subscription error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Stripe: Créer session checkout pour achat normal
app.post("/api/checkout", async (req, res) => {
  if (!stripe) return res.status(503).json({ error: "Stripe not configured" });

  const { items } = req.body;

  if (!items || !items.length) {
    return res.status(400).json({ error: "Panier vide" });
  }

  try {
    const line_items = items.map((item) => ({
      price_data: {
        currency: "ils",
        product_data: {
          name: item.title || item.name || item.id,
          images: item.image ? [item.image.startsWith('http') ? item.image : `${req.headers.origin || "http://localhost:8000"}${item.image}`] : [],
        },
        unit_amount: Math.round((item.price) * 100),
      },
      quantity: item.quantity || 1,
    }));
    
    // Add shipping if global cart has it or calculate basic
    // For simplicity treating as digital/free shipping initially based on instructions

    const checkoutParams = {
      payment_method_types: ["card"],
      mode: "payment",
      line_items,
      success_url: `${req.headers.origin || "http://localhost:8000"}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.headers.origin || "http://localhost:8000"}/cart`,
    };

    // Stripe Connect: split payment for one-time purchases
    if (CONNECTED_ACCOUNT) {
      const totalAmount = line_items.reduce((sum, li) => sum + (li.price_data.unit_amount * li.quantity), 0);
      checkoutParams.payment_intent_data = {
        application_fee_amount: Math.round(totalAmount * AGENCY_FEE_PERCENT),
        transfer_data: { destination: CONNECTED_ACCOUNT },
      };
    }

    const session = await stripe.checkout.sessions.create(checkoutParams);
    res.json({ id: session.id, sessionId: session.id, url: session.url });
  } catch (error) {
    console.error("Stripe checkout error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Stripe Connect: Create onboarding link for Esther (admin only)
app.post("/api/connect/onboard", async (req, res) => {
  if (!stripe) return res.status(503).json({ error: "Stripe not configured" });
  const { password } = req.body;
  if (password !== process.env.ADMIN_PASSWORD) return res.status(403).json({ error: "Unauthorized" });

  try {
    // Create Express connected account for Esther
    const account = await stripe.accounts.create({
      type: "express",
      country: "IL",
      email: "hayil.fr@gmail.com",
      capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
      business_type: "individual",
      business_profile: { name: "Breslev by Esther Ifrah", url: "https://breslev-books-preview.vercel.app" },
    });

    // Create onboarding link
    const accountLink = await stripe.accountLinks.create({
      account: account.id,
      refresh_url: `${req.headers.origin || "http://localhost:8000"}/admin`,
      return_url: `${req.headers.origin || "http://localhost:8000"}/admin?connect_success=true&account_id=${account.id}`,
      type: "account_onboarding",
    });

    console.log(`[CONNECT] Created account ${account.id} for Esther`);
    res.json({ accountId: account.id, onboardingUrl: accountLink.url });
  } catch (error) {
    console.error("Connect error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Stripe Connect: Check connected account status
app.get("/api/connect/status", async (req, res) => {
  if (!stripe || !CONNECTED_ACCOUNT) return res.json({ connected: false });
  try {
    const account = await stripe.accounts.retrieve(CONNECTED_ACCOUNT);
    res.json({
      connected: true,
      accountId: account.id,
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      detailsSubmitted: account.details_submitted,
    });
  } catch (error) {
    res.json({ connected: false, error: error.message });
  }
});

// API: Vérifier abonnement
app.get("/api/check-subscription", async (req, res) => {
  const { email, user_id } = req.query;
  if (!email && !user_id) return res.json({ active: false });

  // Admins ont toujours accès (vérifié par email)
  const adminEmails = ["dreamaiultimate@gmail.com", "estherifra@breslev.com"];
  if (email && adminEmails.includes(email)) {
    return res.json({ active: true, plan: "Admin", isAdmin: true });
  }

  // Vérifier dans Supabase par user_id
  if (supabase && user_id) {
    try {
      const { data, error } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("user_id", user_id)
        .eq("status", "active")
        .single();

      if (data && !error) {
        return res.json({ active: true, plan: data.plan_type });
      }
    } catch (err) {
      console.error("Erreur vérification abonnement:", err);
    }
  }

  res.json({ active: false });
});

// ==========================================
// LAYOUT & HELPERS
// ==========================================

function getLayout(content, title = "Breslev Esther IFRAH", options = {}) {
  const siteUrl = "https://librairie-breslev.com";
  const defaultDescription =
    "Livres et enseignements de Rabbi Nachman de Breslev traduits en francais par Esther Ifrah. Likoutey Moharan, Likoutey Tefilot et plus de 30 ouvrages authentiques.";
  const description = options.description || defaultDescription;
  const image = options.image || siteUrl + "/og-image.png";
  const pageUrl = options.url || siteUrl;

  return `
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta name="theme-color" content="#0a1128">
      <meta name="apple-mobile-web-app-capable" content="yes">
      <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">

      <!-- SEO Meta Tags -->
      <title>${title} | Livres Breslev en Francais</title>
      <meta name="description" content="${description}">
      <meta name="keywords" content="Breslev, Rabbi Nachman, Likoutey Moharan, livres juifs, hassidisme, Esther Ifrah, spiritualite juive, Torah, priere, Tikoun Haklali">
      <meta name="author" content="Esther Ifrah - Breslev">
      <meta name="robots" content="index, follow">
      <link rel="canonical" href="${pageUrl}">

      <!-- Open Graph / Facebook / WhatsApp -->
      <meta property="og:type" content="website">
      <meta property="og:url" content="${pageUrl}">
      <meta property="og:title" content="${title} | Breslev Esther Ifrah">
      <meta property="og:description" content="${description}">
      <meta property="og:image" content="${image}">
      <meta property="og:image:width" content="1200">
      <meta property="og:image:height" content="630">
      <meta property="og:locale" content="fr_FR">
      <meta property="og:site_name" content="Breslev by Esther Ifrah">

      <!-- Twitter Card -->
      <meta name="twitter:card" content="summary_large_image">
      <meta name="twitter:title" content="${title} | Breslev Esther Ifrah">
      <meta name="twitter:description" content="${description}">
      <meta name="twitter:image" content="${image}">

      <!-- Favicons -->
      <link rel="icon" type="image/svg+xml" href="/favicon.svg">
      <link rel="icon" type="image/png" sizes="32x32" href="/favicon.svg">
      <link rel="apple-touch-icon" href="/favicon.svg">

      <!-- DNS prefetch for external resources -->
      <link rel="dns-prefetch" href="https://js.stripe.com">
      <link rel="dns-prefetch" href="https://cdnjs.cloudflare.com">

      <!-- Google Fonts — preconnect + preload critical, lazy load rest -->
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&display=swap">
      <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&display=swap" rel="stylesheet">
      <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;1,400&family=Outfit:wght@300;400;500;600&display=swap" rel="stylesheet" media="print" onload="this.media='all'">
      <noscript><link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;1,400&family=Outfit:wght@300;400;500;600&display=swap" rel="stylesheet"></noscript>

      <!-- JSON-LD Structured Data for Google -->
      <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "BookStore",
        "name": "Breslev by Esther Ifrah",
        "description": "${defaultDescription}",
        "url": "${siteUrl}",
        "logo": "${siteUrl}/favicon.svg",
        "sameAs": [
          "https://www.facebook.com/profile.php?id=100089800498498",
          "https://www.youtube.com/@BreslevEsther",
          "https://www.instagram.com/breslevbyesther",
          "https://www.tiktok.com/@breslev.esther"
        ],
        "address": {
          "@type": "PostalAddress",
          "addressCountry": "IL"
        },
        "priceRange": "$$",
        "openingHours": "Mo-Su 00:00-24:00"
      }
      </script>
      <link rel="stylesheet" href="/breslev-premium.css">
      <style>
        /* Hero card: fond bleu-marine + bouton doré (demande David 16 mars) */
        .hero-content {
          background: rgba(15, 30, 80, 0.95) !important;
          border: 2px solid #d4af37 !important;
        }
        .hero-content p { color: #ffffff !important; }
        .hero-content .btn-primary {
          background: #d4af37 !important;
          color: #1e3a8a !important;
          font-weight: 600 !important;
        }
        .hero-content .btn-primary:hover {
          background: #c9a030 !important;
        }
      </style>
      <link rel="stylesheet" href="/fixes-layout.css">
      <link rel="stylesheet" href="/mobile-responsive.css">
      <link rel="stylesheet" href="/couleurs-gaies-mobile.css">
      <link rel="stylesheet" href="/theme-elegance.css">
      <link rel="stylesheet" href="/premium-upgrades.css" media="print" onload="this.media='all'">
      <link rel="stylesheet" href="/checkout-styles.css" media="print" onload="this.media='all'">
      <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" media="print" onload="this.media='all'">
      <noscript><link rel="stylesheet" href="/premium-upgrades.css"><link rel="stylesheet" href="/checkout-styles.css"><link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css"></noscript>
      <!-- Stripe Integration — loaded async, only init on payment pages -->
      <script src="https://js.stripe.com/v3/" async></script>
      <script>
        window.STRIPE_PUBLISHABLE_KEY = "${process.env.STRIPE_PUBLIC_KEY || 'pk_live_JbJRtjb23Aujij7TTHOft6jR008MOj8TLY'}";
      </script>

      <script src="/cart-system.js" defer></script>
      <script src="/shipping-config.js" defer></script>
    </head>
    <body>
      <div class="menu-overlay" id="menuOverlay"></div>
      <nav class="navbar">
        <div class="navbar__container">
          <button class="mobile-menu-toggle" id="mobileMenuToggle" aria-label="Menu">
            <span></span>
            <span></span>
            <span></span>
          </button>
          <a href="/" class="navbar__logo" style="display: flex; align-items: center; gap: 0.6rem;">
          <span style="background: linear-gradient(135deg, #D4AF37, #F5E6A3, #D4AF37); width: 38px; height: 38px; border-radius: 8px; display: flex; align-items: center; justify-content: center;"><i class="fas fa-book-open" style="color: #1a1a2e; font-size: 1.1rem;"></i></span>
          <span style="font-weight: 800; letter-spacing: 0.08em;">BRESLEV</span>
          <span style="font-size: 0.6em; font-weight: 300; opacity: 0.7; margin-left: -0.3rem;">by Esther Ifrah</span>
        </a>
          <ul class="navbar__nav" id="navMenu">
            <li><a href="/" class="navbar__nav-link">Accueil</a></li>
            <li><a href="/collections/all" class="navbar__nav-link" style="font-weight: 700; color: var(--gold) !important; letter-spacing: 0.15em;">Bibliothèque</a></li>
            <li><a href="/audio" class="navbar__nav-link"><i class="fas fa-headphones"></i> Audio</a></li>
            <li><a href="/cours" class="navbar__nav-link"><i class="fas fa-graduation-cap"></i> Cours du Jour</a></li>
            <li><a href="/etudes" class="navbar__nav-link"><i class="fas fa-star-of-david"></i> Études</a></li>
            <li><a href="/a-propos" class="navbar__nav-link">À propos</a></li>
            <li><a href="/contact" class="navbar__nav-link"><i class="fas fa-envelope"></i> Contact</a></li>
            <li><a href="/search" class="navbar__nav-link"><i class="fas fa-search"></i></a></li>
          </ul>
          <div class="navbar__actions">
            <a href="/cart" class="btn btn-outline" style="border: 1.5px solid rgba(212,175,55,0.4); border-radius: 50%; width: 42px; height: 42px; display: flex; align-items: center; justify-content: center; position: relative; transition: all 0.3s ease;">
              <i class="fas fa-shopping-cart" style="font-size: 1.1rem; color: #D4AF37;"></i>
              <span class="cart-badge" style="display: none; position: absolute; top: -4px; right: -4px; background: linear-gradient(135deg, #D4AF37, #F5E6A3); color: #1a1a2e; font-size: 0.65rem; font-weight: 700; min-width: 18px; height: 18px; border-radius: 50%; display: flex; align-items: center; justify-content: center;">0</span>
            </a>
          </div>
        </div>
      </nav>
      <div style="height: 2px; background: linear-gradient(90deg, transparent, #D4AF37, #F5E6A3, #D4AF37, transparent);"></div>
      <main style="padding-top: 80px; min-height: 100vh;">${content}</main>
      <script>
        // ===== 3D TILT EFFECT ON BOOK CARDS =====
        // Research: "highest perceived-quality ROI per hour" — Albertine/Gallimard style
        // Only on desktop (>= 768px) — skip on touch devices
        function initBookTilt() {
          if (window.matchMedia('(hover: none)').matches) return; // touch devices
          document.querySelectorAll('.book-card').forEach(card => {
            card.addEventListener('mousemove', function(e) {
              const rect = card.getBoundingClientRect();
              const x = (e.clientX - rect.left) / rect.width;
              const y = (e.clientY - rect.top) / rect.height;
              const rotX = (y - 0.5) * -8;  // -4deg to +4deg
              const rotY = (x - 0.5) * 8;
              card.style.transform = \`perspective(700px) rotateX(\${rotX}deg) rotateY(\${rotY}deg) translateY(-6px)\`;
              card.style.transition = 'transform 0.08s ease';
            });
            card.addEventListener('mouseleave', function() {
              card.style.transition = 'transform 0.45s cubic-bezier(0.34, 1.56, 0.64, 1)';
              card.style.transform = 'perspective(700px) rotateX(0) rotateY(0) translateY(0)';
            });
          });
        }
        document.addEventListener('DOMContentLoaded', initBookTilt);

        // Mobile Menu Toggle
        const mobileMenuToggle = document.getElementById('mobileMenuToggle');
        const navMenu = document.getElementById('navMenu');
        const menuOverlay = document.getElementById('menuOverlay');

        if (mobileMenuToggle && navMenu && menuOverlay) {
          mobileMenuToggle.addEventListener('click', function() {
            this.classList.toggle('active');
            navMenu.classList.toggle('active');
            menuOverlay.classList.toggle('active');
            document.body.style.overflow = navMenu.classList.contains('active') ? 'hidden' : '';
          });

          menuOverlay.addEventListener('click', function() {
            mobileMenuToggle.classList.remove('active');
            navMenu.classList.remove('active');
            menuOverlay.classList.remove('active');
            document.body.style.overflow = '';
          });

          // Close menu when clicking a link
          navMenu.querySelectorAll('.navbar__nav-link').forEach(link => {
            link.addEventListener('click', () => {
              mobileMenuToggle.classList.remove('active');
              navMenu.classList.remove('active');
              menuOverlay.classList.remove('active');
              document.body.style.overflow = '';
            });
          });
        }
      </script>

      <!-- SCROLL REVEAL — Intersection Observer -->
      <script>
        (function() {
          // Add reveal class to key sections on DOMContentLoaded
          document.addEventListener('DOMContentLoaded', function() {
            // Sections to animate on scroll
            const revealTargets = [
              '.section-header',
              '.section-title',
              '.cours-du-jour-preview',
              '.testimonials-grid',
              '.audio-categories-grid',
            ];
            revealTargets.forEach(sel => {
              document.querySelectorAll(sel).forEach(el => {
                if (!el.classList.contains('reveal')) el.classList.add('reveal');
              });
            });
            // Stagger the book cards grid
            document.querySelectorAll('.grid-products').forEach(el => {
              el.classList.add('reveal-stagger');
            });

            // Intersection Observer
            var io = new IntersectionObserver(function(entries) {
              entries.forEach(function(entry) {
                if (entry.isIntersecting) {
                  entry.target.classList.add('visible');
                  io.unobserve(entry.target);
                }
              });
            }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });

            document.querySelectorAll('.reveal, .reveal-stagger').forEach(el => io.observe(el));
          });
        })();
      </script>

      <!-- TRUST BADGES -->
      <section style="padding: 3rem 0; background-color: #ffffff; border-top: 1px solid #f0f0f0; border-bottom: 1px solid #f0f0f0;">
        <div class="container">
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 2rem;">
            <!-- Badge 1: Livraison -->
            <div style="display: flex; align-items: center; gap: 1.25rem; padding: 1.5rem; background-color: #f5f5f5; border-radius: 0.75rem; transition: all 0.3s ease;">
              <div style="flex-shrink: 0; width: 60px; height: 60px; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #1e5799, #2a6cb6); border-radius: 50%; color: white;">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="1" y="3" width="15" height="13"></rect><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle>
                </svg>
              </div>
              <div style="flex: 1;">
                <h3 style="font-family: 'Cinzel', serif; font-size: 1.125rem; font-weight: 600; color: #1a1a1a; margin-bottom: 0.25rem; line-height: 1.3;">Livraison Rapide</h3>
                <p style="font-size: 0.875rem; color: #666666; line-height: 1.5; margin: 0; font-family: 'Cormorant Garamond', serif;">Gratuite dès 59€<br>Expédition 24/48h</p>
              </div>
            </div>
            <!-- Badge 2: Sécurité -->
            <div style="display: flex; align-items: center; gap: 1.25rem; padding: 1.5rem; background-color: #f5f5f5; border-radius: 0.75rem; transition: all 0.3s ease;">
              <div style="flex-shrink: 0; width: 60px; height: 60px; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #1e5799, #2a6cb6); border-radius: 50%; color: white;">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                </svg>
              </div>
              <div style="flex: 1;">
                <h3 style="font-family: 'Cinzel', serif; font-size: 1.125rem; font-weight: 600; color: #1a1a1a; margin-bottom: 0.25rem; line-height: 1.3;">Paiement Sécurisé</h3>
                <p style="font-size: 0.875rem; color: #666666; line-height: 1.5; margin: 0; font-family: 'Cormorant Garamond', serif;">SSL - Stripe - PayPal</p>
              </div>
            </div>
            <!-- Badge 3: Qualité -->
            <div style="display: flex; align-items: center; gap: 1.25rem; padding: 1.5rem; background-color: #f5f5f5; border-radius: 0.75rem; transition: all 0.3s ease;">
              <div style="flex-shrink: 0; width: 60px; height: 60px; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #1e5799, #2a6cb6); border-radius: 50%; color: white;">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"></path>
                </svg>
              </div>
              <div style="flex: 1;">
                <h3 style="font-family: 'Cinzel', serif; font-size: 1.125rem; font-weight: 600; color: #1a1a1a; margin-bottom: 0.25rem; line-height: 1.3;">Traductions Fidèles</h3>
                <p style="font-size: 0.875rem; color: #666666; line-height: 1.5; margin: 0; font-family: 'Cormorant Garamond', serif;">Respect des enseignements</p>
              </div>
            </div>
            <!-- Badge 4: Support -->
            <div style="display: flex; align-items: center; gap: 1.25rem; padding: 1.5rem; background-color: #f5f5f5; border-radius: 0.75rem; transition: all 0.3s ease;">
              <div style="flex-shrink: 0; width: 60px; height: 60px; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #1e5799, #2a6cb6); border-radius: 50%; color: white;">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                </svg>
              </div>
              <div style="flex: 1;">
                <h3 style="font-family: 'Cinzel', serif; font-size: 1.125rem; font-weight: 600; color: #1a1a1a; margin-bottom: 0.25rem; line-height: 1.3;">Service Client</h3>
                <p style="font-size: 0.875rem; color: #666666; line-height: 1.5; margin: 0; font-family: 'Cormorant Garamond', serif;">Assistance via WhatsApp</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer class="footer">
        <div class="container">
          <div class="footer__grid">
             <div>
               <h4 class="text-gold-animated">Breslev Esther Ifrah</h4>
               <p class="text-muted" style="font-style:italic; color:rgba(255,255,255,0.55); line-height:1.7; margin-bottom:1rem;">«Sache que chaque herbe a son propre chant<br>et de ces chants naît la mélodie du cœur.»</p>
               <p class="text-muted" style="font-size:0.82rem; color:rgba(255,255,255,0.35);">— Rabbi Nachman de Breslev</p>
               <div class="social-links" style="margin-top:1.2rem;">
                 <a href="https://www.tiktok.com/@breslev.esther" target="_blank" rel="noopener" class="social-link" title="TikTok"><i class="fab fa-tiktok"></i></a>
                 <a href="https://www.instagram.com/breslevbyesther" target="_blank" rel="noopener" class="social-link" title="Instagram"><i class="fab fa-instagram"></i></a>
                 <a href="https://www.facebook.com/profile.php?id=100089800498498" target="_blank" rel="noopener" class="social-link" title="Facebook"><i class="fab fa-facebook-f"></i></a>
                 <a href="https://www.youtube.com/@BreslevEsther" target="_blank" rel="noopener" class="social-link" title="YouTube"><i class="fab fa-youtube"></i></a>
               </div>
             </div>
             <div>
               <h4 class="text-gold-animated">Bibliothèque</h4>
               <ul class="footer__links">
                 <li><a href="/collections/all" class="footer__link">Tous les livres</a></li>
                 <li><a href="/audio" class="footer__link">Cours audio</a></li>
                 <li><a href="/cours" class="footer__link">Cours du Jour</a></li>
                 <li><a href="/pages/abonnement" class="footer__link">Abonnement</a></li>
               </ul>
             </div>
             <div>
               <h4 class="text-gold-animated">À propos</h4>
               <ul class="footer__links">
                 <li><a href="/account" class="footer__link">Mon compte</a></li>
                 <li><a href="/cart" class="footer__link">Mon panier</a></li>
               </ul>
               <div style="margin-top:1.5rem;">
                 <p style="font-size:0.78rem; color:rgba(255,255,255,0.6); line-height:1.6;">Traductions authentiques des<br>enseignements de Rabbi Nachman</p>
               </div>
             </div>
          </div>
          <div class="footer__bottom">&copy; 2026 Breslev by Esther Ifrah &nbsp;·&nbsp; <a href="/admin" style="color:rgba(255,255,255,0.45);font-size:0.78rem;">Admin</a></div>
        </div>
      </footer>
    </body>
    </html>
  `;
}

// ==========================================
// ROUTES
// ==========================================

app.get("/", (req, res) => {
  const heroHTML = `
    <section class="hero-section">
      <video class="hero-video-bg" autoplay muted loop playsinline preload="metadata">
        <source src="/videos/veo31/Une_vido_4k_202511161353_jbkex.mp4" type="video/mp4">
      </video>
      <div class="hero-overlay"></div>
      <div class="hero-content fade-in">
        <h1 class="hero-title text-gold-animated" style="font-family: var(--font-cinzel); font-weight: 700; text-transform: uppercase;">Breslev Esther IFRAH</h1>
        <p style="font-size: clamp(1.1rem, 2.5vw, 1.4rem); margin-bottom: 2.5rem; font-family: var(--font-cormorant); font-style: italic; font-weight: 600; color: rgba(253, 230, 138, 0.9); letter-spacing: 0.02em;">Traductions authentiques des enseignements de Rabbi Nachman</p>
        <div style="display: flex; gap: 1.2rem; justify-content: center; flex-wrap: wrap; align-items: center;">
          <a href="/collections/all" class="btn" style="padding: 1rem 2.5rem; font-size: 0.8rem; letter-spacing: 0.2em; text-transform: uppercase; font-weight: 600; background: #D4AF37; color: #0F172A; border: none; font-family: var(--font-sans); text-decoration: none; transition: all 0.3s ease;">Explorer les Livres</a>
          <button onclick="document.getElementById('heroAudio').paused ? document.getElementById('heroAudio').play() : document.getElementById('heroAudio').pause(); this.querySelector('i').classList.toggle('fa-play'); this.querySelector('i').classList.toggle('fa-pause');" style="padding: 1rem 2.5rem; font-size: 0.8rem; letter-spacing: 0.2em; text-transform: uppercase; font-weight: 600; background: transparent; border: 1px solid rgba(212,175,55,0.5); color: #E8D5A3; cursor: pointer; font-family: var(--font-sans); transition: all 0.3s ease;">
            <i class="fas fa-play"></i> Écouter Esther
          </button>
          <audio id="heroAudio" preload="none" src="/audios/esther-welcome.mp3"></audio>
        </div>
      </div>
    </section>
  `;

  // Divider + section "Pourquoi Breslev" entre hero et livres
  const dividerHTML = `
    <!-- Divider décoratif SVG -->
    <div style="text-align:center; padding: 2.5rem 0 0; background: #faf9f6;">
      <svg width="320" height="30" viewBox="0 0 320 30" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <line x1="0" y1="15" x2="130" y2="15" stroke="#D4AF37" stroke-width="1" stroke-opacity="0.4"/>
        <path d="M155 5 L160 15 L155 25 L150 15 Z" fill="#D4AF37" fill-opacity="0.7"/>
        <circle cx="160" cy="15" r="4" fill="#D4AF37" fill-opacity="0.9"/>
        <path d="M165 5 L170 15 L165 25 L160 15 Z" fill="#D4AF37" fill-opacity="0.7"/>
        <line x1="190" y1="15" x2="320" y2="15" stroke="#D4AF37" stroke-width="1" stroke-opacity="0.4"/>
      </svg>
    </div>
    <!-- Section mission -->
    <section style="background: #faf9f6; padding: 2.5rem 0 3rem;">
      <div class="container" style="max-width: 960px;">
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.5rem; text-align: center;">
          <div class="fade-in" style="padding: 1.5rem; background: #ffffff; border-radius: 16px; border: 1px solid rgba(212,175,55,0.15); box-shadow: 0 2px 16px rgba(30,58,138,0.05);">
            <div style="font-size: 2rem; margin-bottom: 0.8rem;">📚</div>
            <h3 style="font-family: 'Cinzel', serif; color: #1E3A8A; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 0.6rem;">Traductions authentiques</h3>
            <p style="color: #6B7280; font-size: 0.9rem; line-height: 1.6;">Les enseignements de Rabbi Nachman traduits fidèlement en français</p>
          </div>
          <div class="fade-in" style="padding: 1.5rem; background: #ffffff; border-radius: 16px; border: 1px solid rgba(212,175,55,0.15); box-shadow: 0 2px 16px rgba(30,58,138,0.05);">
            <div style="font-size: 2rem; margin-bottom: 0.8rem;">🌟</div>
            <h3 style="font-family: 'Cinzel', serif; color: #1E3A8A; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 0.6rem;">Sagesse millénaire</h3>
            <p style="color: #6B7280; font-size: 0.9rem; line-height: 1.6;">Une pensée spirituelle profonde adaptée à notre époque</p>
          </div>
          <div class="fade-in" style="padding: 1.5rem; background: #ffffff; border-radius: 16px; border: 1px solid rgba(212,175,55,0.15); box-shadow: 0 2px 16px rgba(30,58,138,0.05);">
            <div style="font-size: 2rem; margin-bottom: 0.8rem;">🙏</div>
            <h3 style="font-family: 'Cinzel', serif; color: #1E3A8A; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 0.6rem;">Étude quotidienne</h3>
            <p style="color: #6B7280; font-size: 0.9rem; line-height: 1.6;">Des cours audio et PDF pour votre chemin spirituel de chaque jour</p>
          </div>
        </div>
      </div>
    </section>
    <!-- Divider bas -->
    <div style="text-align:center; padding: 0 0 2rem; background: #faf9f6;">
      <svg width="200" height="16" viewBox="0 0 200 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <line x1="0" y1="8" x2="80" y2="8" stroke="#D4AF37" stroke-width="1" stroke-opacity="0.3"/>
        <circle cx="100" cy="8" r="3" fill="#D4AF37" fill-opacity="0.6"/>
        <line x1="120" y1="8" x2="200" y2="8" stroke="#D4AF37" stroke-width="1" stroke-opacity="0.3"/>
      </svg>
    </div>
  `;

  let productsHTML = `<div class="container section">
    <div class="section-header">
      <h2 class="section-title text-gold-animated title-reveal">Notre Sélection</h2>
      <div class="section-divider"></div>
      <p class="section-subtitle">Découvrez nos ouvrages de référence de Rabbi Nachman traduits pour vous.</p>
      <div style="margin-top: 0.8rem;">
        <button onclick="var a=document.getElementById('booksIntro'); a.paused?a.play():a.pause(); this.querySelector('i').classList.toggle('fa-play');this.querySelector('i').classList.toggle('fa-pause');" style="background: linear-gradient(135deg, #D4AF37, #E8C547); color: #1E3A8A; border: none; padding: 0.6rem 1.4rem; border-radius: 20px; cursor: pointer; font-size: 0.85rem; font-weight: 600;"><i class="fas fa-play"></i> Présentation par Esther</button>
        <audio id="booksIntro" preload="none" src="/audios/esther-books.mp3"></audio>
      </div>
    </div>
    <div class="grid-products">`;

  catalog
    .filter((p) => p.featured)
    .forEach((product) => {
      const isIndisponible = product.unavailable === true || product.inStock === false || product.available_physical === false;
      const indisponibleBadge = isIndisponible ? '<div style="position: absolute; top: 10px; left: 10px; background: #e74c3c; color: #ffffff; padding: 0.3rem 0.6rem; border-radius: 4px; font-size: 0.75rem; font-weight: bold; z-index: 10; box-shadow: 0 2px 5px rgba(0,0,0,0.2);">INDISPONIBLE</div>' : '';
      const imgFilter = isIndisponible ? 'filter: grayscale(100%); opacity: 0.6;' : '';
      const cardOpacity = isIndisponible ? 'opacity: 0.8;' : '';
      productsHTML += `
      <div class="book-card fade-in hover-lift glare-card" style="${cardOpacity}">
        <a href="${isIndisponible ? '#' : '/products/' + product.id}" style="text-decoration: none; color: inherit; ${isIndisponible ? 'cursor: not-allowed;' : ''}">
          <div class="book-cover-container">
            <img src="${product.cover_image}" alt="${product.title_fr}" class="book-cover" loading="lazy" style="${imgFilter}">
            ${indisponibleBadge}
            ${product.fliphtml5_url ? '<div class="badge-digital">📖 LECTURE EN LIGNE</div>' : ""}
          </div>
          <div class="book-info">
            <div>
              <div class="book-author">${product.author}</div>
              <h3 class="book-title">${product.title_fr}</h3>
            </div>
            <div class="book-price">${product.price_eur || product.price_physical}€</div>
          </div>
        </a>
        <div style="padding: 0 1.5rem 1.5rem;">
          <button
            class="btn ${isIndisponible ? '' : 'btn-add-to-cart goldPulse hover-glow'}"
            ${isIndisponible ? 'disabled' : `
            data-product-id="${product.id}"
            data-product-title="${product.title_fr}"
            data-product-author="${product.author}"
            data-product-price="${product.price_eur || product.price_physical}"
            data-product-image="${product.cover_image}"`}
            style="width:100%; padding: 0.9rem; border-radius: 8px; font-weight: 600; cursor: ${isIndisponible ? 'not-allowed' : 'pointer'}; transition: all 0.3s ease; border: ${isIndisponible ? '1px solid #dcdcdc' : '1px solid var(--color-gold)'}; color: ${isIndisponible ? '#888' : 'var(--color-gold)'}; background: transparent;">
            <i class="fas ${isIndisponible ? 'fa-times' : 'fa-shopping-cart'}"></i> ${isIndisponible ? 'Indisponible' : 'Ajouter au panier'}
          </button>
        </div>
      </div>
    `;
    });
  productsHTML += "</div></div>";

  // Section Cours du Jour (preview on homepage — rotation quotidienne)
  let coursJourHTML = "";
  try {
    const audioList = JSON.parse(fs.readFileSync(path.join(__dirname, 'db/audioLessons.json'), 'utf8'));
    if (audioList.length > 0) {
      const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
      // Prefer Thora OGG courses for homepage feature
      const featuredList = audioList;
      const todayIndex = dayOfYear % featuredList.length;
      const dernierCours = featuredList[todayIndex];
      coursJourHTML = `
        <section style="background: linear-gradient(135deg, #0F172A 0%, #1E3A8A 100%); padding: 3rem 0;">
          <div class="container">
            <div class="cours-du-jour-preview" style="max-width: 700px; margin: 0 auto;">
              <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1.5rem;">
                <span style="background: var(--color-gold); color: #1E3A8A; padding: 0.4rem 1.2rem; border-radius: 20px; font-size: 0.85rem; font-weight: 700;">✨ COURS DU JOUR</span>
                <span style="color: rgba(255,255,255,0.6); font-size: 0.85rem;">${new Date().toLocaleDateString("fr-FR", {weekday:"long",day:"numeric",month:"long",year:"numeric"})}</span>
              </div>
              <h3 class="text-gold-animated" style="font-size: 1.6rem; margin-bottom: 0.8rem;">${dernierCours.title}</h3>
              ${dernierCours.description ? `<p style="color: rgba(255,255,255,0.8); line-height: 1.7; margin-bottom: 1.5rem;">${dernierCours.description.slice(0,150)}${dernierCours.description.length>150?"...":""}</p>` : ""}
              <div style="margin-bottom: 1.5rem; background: rgba(255,255,255,0.08); padding: 1rem; border-radius: 12px;">
                <audio controls style="width:100%;" controlsList="nodownload">
                  <source src="${dernierCours.url}">
                </audio>
              </div>
              <a href="/cours" style="display: inline-flex; align-items: center; gap: 0.5rem; color: var(--color-gold); font-weight: 600; border: 1px solid rgba(212,175,55,0.4); padding: 0.7rem 1.5rem; border-radius: 30px; transition: all 0.3s;">
                <i class="fas fa-headphones"></i> Voir tous les cours
              </a>
            </div>
          </div>
        </section>`;
    }
  } catch(e) {}

  // Section Audio
  const audioSectionHTML = `
    <section class="audio-section" style="background: linear-gradient(135deg, #1E3A8A 0%, #0F172A 100%); padding: 4rem 0; color: white;">
      <div class="container">
        <div class="text-center mb-8">
          <span style="background: rgba(212, 175, 55, 0.2); color: var(--color-gold); padding: 0.5rem 1rem; border-radius: 20px; font-size: 0.9rem;">🎧 NOUVEAU</span>
          <h2 class="text-gold-animated" style="margin-top: 1rem; font-size: 2.5rem;">Bibliothèque Audio</h2>
          <p style="color: rgba(255,255,255,0.8); font-size: 1.1rem; max-width: 600px; margin: 1rem auto;">Écoutez les enseignements de Rabbi Nachman où que vous soyez</p>
        </div>
        <div class="audio-categories-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1.5rem;">
          ${audioCategories
            .map(
              (cat) => `
            <a href="/audio/${cat.id}" class="audio-category-card hover-lift glare-card" style="background: rgba(255,255,255,0.1); backdrop-filter: blur(10px); border: 1px solid rgba(212, 175, 55, 0.3); border-radius: 16px; padding: 2rem; text-decoration: none; color: white; transition: all 0.3s ease; display: block;">
              <div style="font-size: 3rem; margin-bottom: 1rem;">${cat.icon}</div>
              <h3 style="color: var(--color-gold); font-size: 1.3rem; margin-bottom: 0.5rem;">${cat.name}</h3>
              <p style="color: rgba(255,255,255,0.7); font-size: 0.95rem;">${cat.description}</p>
              <div style="margin-top: 1rem; color: var(--color-gold);">
                <i class="fas fa-headphones"></i> ${audioContent[cat.id]?.length || 0} cours
              </div>
            </a>
          `,
            )
            .join("")}
        </div>
        <div class="text-center" style="margin-top: 2rem;">
          <a href="/audio" class="btn btn-primary hover-glow" style="background: var(--color-gold); color: #1E3A8A; padding: 1rem 2.5rem; font-size: 1.1rem;">
            <i class="fas fa-play-circle"></i> Explorer tous les cours audio
          </a>
        </div>
      </div>
    </section>
  `;

  // Section Témoignages
  const testimonialsSectionHTML = `
    <section class="testimonials-section" style="background: linear-gradient(135deg, #FEFEFE 0%, #F5F0E6 100%); padding: 4rem 0;">
      <div class="container">
        <div class="text-center mb-8">
          <span style="background: rgba(212, 175, 55, 0.2); color: #B8860B; padding: 0.5rem 1rem; border-radius: 20px; font-size: 0.9rem;">❤️ TÉMOIGNAGES</span>
          <h2 style="color: #1E3A8A; margin-top: 1rem; font-size: 2.5rem;">Ce que disent nos lecteurs</h2>
          <p style="color: #666; font-size: 1.1rem; max-width: 600px; margin: 1rem auto;">Des milliers de personnes ont transformé leur vie grâce aux enseignements de Rabbi Nachman</p>
        </div>
        <div class="testimonials-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1.5rem;">
          ${testimonials
            .slice(0, 3)
            .map(
              (t) => `
            <div class="testimonial-card hover-lift" style="background: white; border-radius: 16px; padding: 2rem; box-shadow: 0 10px 40px rgba(30, 58, 138, 0.1); border: 1px solid rgba(212, 175, 55, 0.2);">
              <div style="display: flex; margin-bottom: 1rem;">
                ${Array(t.rating)
                  .fill()
                  .map(
                    () =>
                      '<i class="fas fa-star" style="color: #D4AF37; margin-right: 2px;"></i>',
                  )
                  .join("")}
              </div>
              <p style="color: #444; font-size: 1rem; line-height: 1.7; margin-bottom: 1.5rem; font-style: italic;">"${t.text}"</p>
              <div style="display: flex; align-items: center; gap: 1rem;">
                <div style="width: 48px; height: 48px; background: linear-gradient(135deg, #1E3A8A, #3B82F6); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold;">${t.name.charAt(0)}</div>
                <div>
                  <div style="font-weight: 600; color: #1E3A8A;">${t.name}</div>
                  <div style="font-size: 0.85rem; color: #888;">${t.location}</div>
                </div>
              </div>
              <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid rgba(212, 175, 55, 0.2);">
                <span style="font-size: 0.85rem; color: #888;">📖 ${t.book}</span>
              </div>
            </div>
          `,
            )
            .join("")}
        </div>
        <div class="text-center" style="margin-top: 3rem;">
          <a href="/temoignages" class="btn btn-outline hover-glow" style="border: 2px solid #1E3A8A; color: #1E3A8A; padding: 1rem 2.5rem;">
            Voir tous les témoignages
          </a>
        </div>
      </div>
    </section>
  `;

  // Section "Suivez Esther" — réseaux sociaux
  const suivezEstherHTML = `
    <section style="background: linear-gradient(135deg, #FAFAF9 0%, #F0EDE5 100%); padding: 4rem 0;">
      <div class="container">
        <div class="text-center mb-8">
          <span style="background: rgba(212, 175, 55, 0.2); color: #B8860B; padding: 0.5rem 1rem; border-radius: 20px; font-size: 0.9rem;">📱 RESTEZ CONNECTÉS</span>
          <h2 style="color: #1E3A8A; margin-top: 1rem; font-size: 2.5rem; font-family: 'Cinzel', serif;">Suivez Esther</h2>
          <p style="color: #666; font-size: 1.1rem; max-width: 600px; margin: 1rem auto;">Retrouvez les enseignements et actualités Breslev sur nos réseaux</p>
        </div>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1.5rem; max-width: 900px; margin: 0 auto;">
          <a href="https://www.facebook.com/profile.php?id=100089800498498" target="_blank" rel="noopener" class="hover-lift" style="background: #ffffff; border-radius: 16px; padding: 2rem; text-align: center; text-decoration: none; box-shadow: 0 4px 20px rgba(30,58,138,0.08); border: 1px solid rgba(212,175,55,0.15); transition: all 0.3s ease; display: block;">
            <div style="width: 64px; height: 64px; background: #1877F2; border-radius: 16px; display: flex; align-items: center; justify-content: center; margin: 0 auto 1rem;">
              <i class="fab fa-facebook-f" style="font-size: 1.8rem; color: white;"></i>
            </div>
            <h3 style="color: #1E3A8A; font-size: 1.2rem; margin-bottom: 0.5rem; font-family: 'Cinzel', serif;">Facebook</h3>
            <p style="color: #888; font-size: 0.9rem;">Actualités et partages quotidiens</p>
          </a>
          <a href="https://www.youtube.com/@BreslevEsther" target="_blank" rel="noopener" class="hover-lift" style="background: #ffffff; border-radius: 16px; padding: 2rem; text-align: center; text-decoration: none; box-shadow: 0 4px 20px rgba(30,58,138,0.08); border: 1px solid rgba(212,175,55,0.15); transition: all 0.3s ease; display: block;">
            <div style="width: 64px; height: 64px; background: #FF0000; border-radius: 16px; display: flex; align-items: center; justify-content: center; margin: 0 auto 1rem;">
              <i class="fab fa-youtube" style="font-size: 1.8rem; color: white;"></i>
            </div>
            <h3 style="color: #1E3A8A; font-size: 1.2rem; margin-bottom: 0.5rem; font-family: 'Cinzel', serif;">YouTube</h3>
            <p style="color: #888; font-size: 0.9rem;">Cours vidéo et enseignements</p>
          </a>
          <a href="https://www.instagram.com/breslevbyesther" target="_blank" rel="noopener" class="hover-lift" style="background: #ffffff; border-radius: 16px; padding: 2rem; text-align: center; text-decoration: none; box-shadow: 0 4px 20px rgba(30,58,138,0.08); border: 1px solid rgba(212,175,55,0.15); transition: all 0.3s ease; display: block;">
            <div style="width: 64px; height: 64px; background: linear-gradient(135deg, #833AB4, #FD1D1D, #F77737); border-radius: 16px; display: flex; align-items: center; justify-content: center; margin: 0 auto 1rem;">
              <i class="fab fa-instagram" style="font-size: 1.8rem; color: white;"></i>
            </div>
            <h3 style="color: #1E3A8A; font-size: 1.2rem; margin-bottom: 0.5rem; font-family: 'Cinzel', serif;">Instagram</h3>
            <p style="color: #888; font-size: 0.9rem;">Photos et moments inspirants</p>
          </a>
        </div>
      </div>
    </section>
  `;

  res.send(
    getLayout(
      heroHTML + coursJourHTML + productsHTML + audioSectionHTML + testimonialsSectionHTML + suivezEstherHTML,
    ),
  );
});

// Aliases pour la landing page client
app.get("/boutique", (req, res) => res.redirect(301, "/collections/all"));
app.get("/connexion", (req, res) => res.redirect(301, "/account"));

app.get("/collections/all", (req, res) => {
  let content = `
    <div class="container section">
      <div class="section-header">
        <h1 class="section-title text-gold-animated title-reveal" style="font-size: clamp(2.5rem, 5vw, 4rem); font-weight: 900; letter-spacing: 0.05em; text-shadow: 0 2px 8px rgba(212,175,55,0.3);">Bibliothèque Complète</h1>
        <div class="section-divider"></div>
        <p class="section-subtitle" style="font-size: clamp(1.1rem, 2.5vw, 1.4rem);">${catalog.length} ouvrages authentiques de Rabbi Nachman disponibles.</p>
        <div style="margin-top: 0.8rem;">
          <button onclick="var a=document.getElementById('booksIntro'); a.paused?a.play():a.pause(); this.querySelector('i').classList.toggle('fa-play');this.querySelector('i').classList.toggle('fa-pause');" style="background: linear-gradient(135deg, #D4AF37, #E8C547); color: #1E3A8A; border: none; padding: 0.6rem 1.4rem; border-radius: 20px; cursor: pointer; font-size: 0.85rem; font-weight: 600;"><i class="fas fa-play"></i> Présentation par Esther</button>
          <audio id="booksIntro" preload="none" src="/audios/esther-books.mp3"></audio>
        </div>
      </div>
      <div class="grid-products">
  `;

  catalog.forEach((product) => {
    const isIndisponible = product.unavailable === true || product.inStock === false || product.available_physical === false;
    const indisponibleBadge = isIndisponible ? '<div style="position: absolute; top: 10px; left: 10px; background: #e74c3c; color: #ffffff; padding: 0.3rem 0.6rem; border-radius: 4px; font-size: 0.75rem; font-weight: bold; z-index: 10; box-shadow: 0 2px 5px rgba(0,0,0,0.2);">INDISPONIBLE</div>' : '';
    const imgFilter = isIndisponible ? 'filter: grayscale(100%); opacity: 0.6;' : '';
    const cardOpacity = isIndisponible ? 'opacity: 0.8;' : '';

    content += `
      <div class="book-card fade-in hover-lift glare-card" style="${cardOpacity}">
        <a href="${isIndisponible ? '#' : '/products/' + product.id}" style="text-decoration: none; color: inherit; ${isIndisponible ? 'cursor: not-allowed;' : ''}">
          <div class="book-cover-container">
            <img src="${product.cover_image}" alt="${product.title_fr}" class="book-cover" loading="lazy" style="${imgFilter}">
            ${indisponibleBadge}
            ${product.fliphtml5_url ? '<div class="badge-digital">📖 LECTURE EN LIGNE</div>' : ""}
          </div>
          <div class="book-info">
            <div>
              <div class="book-author">${product.author}</div>
              <h3 class="book-title">${product.title_fr}</h3>
            </div>
            <div class="book-price">${product.price_eur || product.price_physical}€</div>
          </div>
        </a>
        <div style="padding: 0 1.5rem 1.5rem; background: #ffffff; margin-top: -1px; z-index: 2; position: relative;">
          <button
            class="btn ${isIndisponible ? '' : 'btn-add-to-cart goldPulse hover-glow'}"
            ${isIndisponible ? 'disabled' : `
            data-product-id="${product.id}"
            data-product-title="${product.title_fr}"
            data-product-author="${product.author}"
            data-product-price="${product.price_eur || product.price_physical}"
            data-product-image="${product.cover_image}"`}
            style="width:100%; padding: 0.9rem; border-radius: 8px; font-weight: 600; cursor: ${isIndisponible ? 'not-allowed' : 'pointer'}; transition: all 0.3s ease; border: ${isIndisponible ? '1px solid #dcdcdc' : '1px solid var(--color-gold)'}; color: ${isIndisponible ? '#888' : 'var(--color-gold)'}; background: transparent;">
            <i class="fas ${isIndisponible ? 'fa-times' : 'fa-shopping-cart'}"></i> ${isIndisponible ? 'Indisponible' : 'Ajouter au panier'}
          </button>
        </div>
      </div>
    `;
  });

  content += "</div></div>";
  res.send(getLayout(content, "Bibliothèque"));
});

app.get("/products/:id", (req, res) => {
  const product = catalog.find((p) => p.id == req.params.id);
  if (!product) return res.status(404).send("Livre non trouvé");

  // Check if user is logged in (via Supabase token cookie)
  const isLoggedIn = !!(req.cookies?.sb_token || req.cookies?.admin_token);
  const userName = req.cookies?.user_name || 'Lecteur';

  // Livres connexes (même auteur ou aléatoires)
  const relatedBooks = catalog
    .filter(
      (p) =>
        p.id !== product.id &&
        (p.author === product.author || Math.random() > 0.5),
    )
    .slice(0, 3);

  const content = `
    <style>
      .product-page {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 1rem;
      }

      .product-image-section {
        width: 100%;
        max-width: 350px;
        margin-bottom: 2rem;
      }

      .product-image-section img {
        width: 100%;
        height: auto;
        border-radius: 12px;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      }

      .product-info-section {
        width: 100%;
        text-align: center;
      }

      .product-info-section h1 {
        color: var(--color-gold);
        font-size: 1.8rem;
        margin-bottom: 0.5rem;
      }

      .product-author {
        color: #666;
        font-size: 1rem;
        margin-bottom: 1rem;
      }

      .product-price {
        color: #1E3A8A;
        font-size: 2.5rem;
        font-weight: bold;
        margin-bottom: 0.5rem;
      }

      .product-description {
        color: #555;
        font-size: 1.1rem;
        line-height: 1.8;
        margin-bottom: 1.5rem;
      }

      .product-actions {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        width: 100%;
        max-width: 400px;
        margin: 0 auto;
      }

      .product-actions .btn {
        width: 100%;
        padding: 1rem;
        font-size: 1.1rem;
      }

      .product-badges {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
        margin-bottom: 1.5rem;
        justify-content: center;
      }

      .product-badge {
        background: rgba(212, 175, 55, 0.15);
        color: #B8860B;
        padding: 0.5rem 1rem;
        border-radius: 20px;
        font-size: 0.85rem;
        font-weight: 600;
      }

      .product-features {
        background: rgba(30, 58, 138, 0.05);
        border-radius: 12px;
        padding: 1.5rem;
        margin-top: 2rem;
      }

      .product-features ul {
        list-style: none;
        padding: 0;
        margin: 0;
      }

      .product-features li {
        padding: 0.75rem 0;
        border-bottom: 1px solid rgba(212, 175, 55, 0.2);
        color: #444;
      }

      .product-features li:last-child {
        border-bottom: none;
      }

      .product-features i {
        color: var(--color-gold);
        margin-right: 0.75rem;
      }

      /* Desktop: side by side layout */
      @media (min-width: 768px) {
        .product-page {
          flex-direction: row;
          align-items: flex-start;
          gap: 4rem;
          max-width: 1200px;
          margin: 0 auto;
          padding: 2rem;
        }

        .product-image-section {
          flex: 0 0 45%;
          max-width: 500px;
          position: sticky;
          top: 100px;
        }

        .product-info-section {
          flex: 1;
          text-align: left;
        }

        .product-info-section h1 {
          font-size: 2.5rem;
        }

        .product-badges {
          justify-content: flex-start;
        }

        .product-actions {
          flex-direction: row;
          max-width: none;
          margin: 0;
        }

        .product-actions .btn {
          flex: 1;
        }
      }

      .related-books {
        background: linear-gradient(135deg, #FAFAF9 0%, #F5F0E6 100%);
        padding: 3rem 0;
        margin-top: 3rem;
      }

      .related-books-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 1.5rem;
      }

      .related-book-card {
        background: white;
        border-radius: 12px;
        overflow: hidden;
        box-shadow: 0 4px 20px rgba(0,0,0,0.1);
        transition: transform 0.3s ease;
      }

      .related-book-card:hover {
        transform: translateY(-5px);
      }

      .related-book-card img {
        width: 100%;
        height: 180px;
        object-fit: cover;
      }

      .related-book-card .info {
        padding: 1rem;
      }
    </style>

    <div class="container mt-8 mb-8">
      <div style="margin-bottom: 1.5rem;">
        <a href="/collections/all" style="color: var(--color-gold); text-decoration: none;"><i class="fas fa-arrow-left"></i> Retour à la bibliothèque</a>
      </div>

      <div class="product-page">
        <!-- Image en premier (grande sur mobile) -->
        <div class="product-image-section">
          <img src="${product.cover_image}" alt="${product.title_fr}" loading="lazy" width="400" height="580">
          ${product.fliphtml5_url ? '<div style="text-align: center; margin-top: 1rem;"><span style="background: #22C55E; color: white; padding: 0.5rem 1rem; border-radius: 20px; font-size: 0.85rem;"><i class="fas fa-tablet-alt"></i> Version numérique disponible</span></div>' : ""}
        </div>

        <!-- Infos produit -->
        <div class="product-info-section">
          <div class="product-badges">
            <span class="product-badge"><i class="fas fa-book"></i> Livre physique</span>
            ${product.available_digital ? '<span class="product-badge"><i class="fas fa-tablet-alt"></i> Numérique</span>' : ""}
            <span class="product-badge"><i class="fas fa-truck"></i> Livraison mondiale</span>
          </div>

          <div class="product-author">${product.author}</div>
          <h1 class="title-reveal">${product.title_fr}
            ${(product.unavailable === true || product.inStock === false || product.available_physical === false) ? '<span style="display:inline-block; font-size:0.5em; vertical-align:middle; margin-left:10px; padding:4px 10px; background:#e74c3c; color:white; border-radius:4px; text-transform:uppercase;">Indisponible</span>' : ''}
          </h1>
          
          <div style="display: flex; align-items: baseline; gap: 1rem; margin-bottom: 1rem; ${typeof window === "undefined" ? "" : "justify-content: flex-start;"}">
            <div class="product-price">${product.price_eur || product.price_physical}€</div>
            ${product.available_digital ? `<div style="color: #666;">ou <span style="color: #22C55E; font-weight: 600;">${product.price_digital}€</span> en numérique</div>` : ""}
          </div>

          <p class="product-description">${product.description_long || product.description_long_fr || product.description_fr}</p>

          <div class="product-actions">
            ${(product.unavailable === true || product.inStock === false || product.available_physical === false) ?
              `<button class="btn" disabled style="background: #9CA3AF; color: #ffffff; cursor: not-allowed; border: none; padding: 15px 40px; border-radius: 30px; font-weight: bold; font-family: var(--font-texte);">
                <i class="fas fa-times"></i> Rupture de stock
              </button>` : 
              `<button
                class="btn btn-primary btn-add-to-cart btn-cta-primary goldPulse hover-glow"
                data-product-id="${product.id}"
                data-product-title="${product.title_fr}"
                data-product-author="${product.author}"
                data-product-price="${product.price_physical}"
                data-product-image="${product.cover_image}"
                style="background: transparent; border: 1px solid #1a1a2e; color: #1a1a2e; font-weight: 600; letter-spacing: 0.15em; font-size: 0.75rem; text-transform: uppercase; transition: all 0.3s ease;" onmouseover="this.style.background='#1a1a2e';this.style.color='#fff'" onmouseout="this.style.background='transparent';this.style.color='#1a1a2e'">
                <i class="fas fa-shopping-cart"></i> Ajouter au panier
              </button>`
            }
            ${product.pdf_file ? `<button onclick="document.getElementById('flipbook-section').scrollIntoView({behavior:'smooth'})" class="btn btn-outline" style="border-color: var(--color-gold); color: var(--color-gold);"><i class="fas fa-book-reader"></i> Feuilleter le livre</button>` : ""}
          </div>

          <div class="product-features">
            <h4 style="color: #1E3A8A; margin-bottom: 1rem;">Ce livre comprend :</h4>
            <ul>
              <li><i class="fas fa-check-circle"></i> Traduction authentique par Esther Ifrah</li>
              <li><i class="fas fa-check-circle"></i> Qualité d'impression premium</li>
              <li><i class="fas fa-check-circle"></i> Livraison sécurisée depuis Israël</li>
              ${product.available_digital ? '<li><i class="fas fa-check-circle"></i> Accès numérique inclus avec abonnement</li>' : ""}
              <li><i class="fas fa-check-circle"></i> Service client en français</li>
            </ul>
          </div>
        </div>
      </div>
    </div>

    ${product.pdf_file ? `
    <section id="flipbook-section" style="padding: 3rem 0; background: linear-gradient(180deg, #f8f6f3 0%, #eee8de 100%);">
      <div class="container" style="max-width: 900px;">
        <h2 style="text-align: center; color: #1E3A8A; margin-bottom: 0.5rem; font-family: 'Cinzel', serif;">
          <i class="fas fa-book-open" style="color: #d4af37;"></i> Feuilleter le livre
        </h2>
        <p style="text-align: center; color: #666; margin-bottom: 1.5rem; font-family: 'Cormorant Garamond', serif; font-size: 1.1rem;">
          ${isLoggedIn ? 'Bonne lecture ! Votre accès est complet.' : 'Aperçu gratuit — 5 premières pages. Achetez pour lire la suite.'}
        </p>
        <div id="flipbook-container"></div>
      </div>
    </section>
    ` : ''}

    ${
      relatedBooks.length > 0
        ? `
      <section class="related-books">
        <div class="container">
          <h2 style="text-align: center; color: #1E3A8A; margin-bottom: 2rem;">Vous aimerez aussi</h2>
          <div class="related-books-grid">
            ${relatedBooks
              .map(
                (book) => `
              <a href="/products/${book.id}" class="related-book-card hover-lift glare-card" style="text-decoration: none; color: inherit;">
                <img src="${book.cover_image}" alt="${book.title_fr}" loading="lazy" width="200" height="290">
                <div class="info">
                  <div style="font-size: 0.85rem; color: #888;">${book.author}</div>
                  <h4 style="color: #2c3e50; font-size: 1rem; margin: 0.5rem 0;">${book.title_fr}</h4>
                  <div style="color: #1E3A8A; font-weight: 600;">${book.price_eur || book.price_physical}€</div>
                </div>
              </a>
            `,
              )
              .join("")}
          </div>
        </div>
      </section>
    `
        : ""
    }
    ${product.pdf_file ? `
    <link rel="stylesheet" href="/flipbook-styles.css">
    <script src="/page-flip.browser.js"></script>
    <script src="/flipbook-viewer.js"></script>
    <script>
      document.addEventListener('DOMContentLoaded', function() {
        if (document.getElementById('flipbook-container')) {
          initFlipbook('flipbook-container', '${product.pdf_file}', {
            isPaid: ${isLoggedIn},
            userName: '${userName.replace(/'/g, "\\'")}'
          });
        }
      });
    </script>
    ` : ''}
  `;
  res.send(getLayout(content, product.title_fr, {
    description: (product.description_fr || '').slice(0, 160),
    image: product.cover_image ? `https://librairie-breslev.com${product.cover_image}` : undefined,
    url: `https://librairie-breslev.com/products/${product.id}`,
  }));
});

// API Endpoint for Product JSON (used by cart logic)
app.get("/products/:id.js", (req, res) => {
  const product = catalog.find((p) => p.id == req.params.id);
  if (!product) return res.status(404).json({ error: "Product not found" });

  // Mock Shopify Product JSON structure
  res.json({
    id: product.id,
    title: product.title_fr,
    handle: product.id,
    description: product.description_fr,
    price: product.price_physical * 100,
    variants: [
      {
        id: product.id,
        title: "Default Title",
        option1: "Default Title",
        price: product.price_physical * 100,
        available: true,
        inventory_quantity: 100,
      },
    ],
    images: [product.cover_image],
    featured_image: product.cover_image,
  });
});

app.get("/pages/abonnement", (req, res) => {
  const stripeKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "";
  const content = `
    <script src="https://js.stripe.com/v3/"></script>
    <div class="container mt-12 mb-12">
      <div class="text-center mb-12">
        <h1>Abonnement</h1>
        <p class="text-large" style="color: var(--color-gold);">Accédez à toute la sagesse de Breslev en illimité</p>
      </div>

      <!-- Section Connexion/Inscription -->
      <div id="auth-section" style="max-width: 500px; margin: 0 auto 4rem; background: var(--color-bg-card); border: 1px solid rgba(212, 175, 55, 0.3); border-radius: 8px; padding: 2rem;">
        <div id="auth-status" style="text-align: center; margin-bottom: 1.5rem;">
          <p class="text-muted">Connectez-vous ou créez un compte pour vous abonner</p>
        </div>

        <div id="auth-forms">
          <!-- Bouton Google OAuth -->
          <button class="hover-lift" onclick="signInWithGoogle()" style="width: 100%; padding: 0.85rem; margin-bottom: 1.5rem; background: #fff; color: #333; border: none; border-radius: 4px; cursor: pointer; font-weight: 600; display: flex; align-items: center; justify-content: center; gap: 10px;">
            <svg width="20" height="20" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            Continuer avec Google
          </button>

          <div style="text-align: center; margin-bottom: 1.5rem; position: relative;">
            <span style="background: var(--color-bg-card); padding: 0 1rem; color: var(--color-text-muted); position: relative; z-index: 1;">ou</span>
            <div style="position: absolute; top: 50%; left: 0; right: 0; height: 1px; background: rgba(212, 175, 55, 0.3); z-index: 0;"></div>
          </div>

          <!-- Toggle Connexion/Inscription -->
          <div style="display: flex; margin-bottom: 1.5rem; border: 1px solid rgba(212, 175, 55, 0.3); border-radius: 4px; overflow: hidden;">
            <button id="login-tab" onclick="showLoginForm()" style="flex: 1; padding: 0.75rem; background: var(--color-gold); color: #000; border: none; cursor: pointer; font-weight: 600;">Connexion</button>
            <button id="signup-tab" onclick="showSignupForm()" style="flex: 1; padding: 0.75rem; background: transparent; color: var(--color-gold); border: none; cursor: pointer; font-weight: 600;">Inscription</button>
          </div>

          <!-- Formulaire Connexion -->
          <form id="login-form" style="display: block;">
            <div style="margin-bottom: 1rem;">
              <label style="display: block; margin-bottom: 0.5rem; color: var(--color-gold);">Email</label>
              <input type="email" id="login-email" required style="width: 100%; padding: 0.75rem; background: rgba(255,255,255,0.05); border: 1px solid rgba(212, 175, 55, 0.3); border-radius: 4px; color: #2c3e50;">
            </div>
            <div style="margin-bottom: 1.5rem;">
              <label style="display: block; margin-bottom: 0.5rem; color: var(--color-gold);">Mot de passe</label>
              <input type="password" id="login-password" required style="width: 100%; padding: 0.75rem; background: rgba(255,255,255,0.05); border: 1px solid rgba(212, 175, 55, 0.3); border-radius: 4px; color: #2c3e50;">
            </div>
            <button type="submit" class="btn btn-primary hover-glow" style="width: 100%;">Se connecter</button>
          </form>

          <!-- Formulaire Inscription -->
          <form id="signup-form" style="display: none;">
            <div style="margin-bottom: 1rem;">
              <label style="display: block; margin-bottom: 0.5rem; color: var(--color-gold);">Nom complet</label>
              <input type="text" id="signup-name" required style="width: 100%; padding: 0.75rem; background: rgba(255,255,255,0.05); border: 1px solid rgba(212, 175, 55, 0.3); border-radius: 4px; color: #2c3e50;">
            </div>
            <div style="margin-bottom: 1rem;">
              <label style="display: block; margin-bottom: 0.5rem; color: var(--color-gold);">Email</label>
              <input type="email" id="signup-email" required style="width: 100%; padding: 0.75rem; background: rgba(255,255,255,0.05); border: 1px solid rgba(212, 175, 55, 0.3); border-radius: 4px; color: #2c3e50;">
            </div>
            <div style="margin-bottom: 1.5rem;">
              <label style="display: block; margin-bottom: 0.5rem; color: var(--color-gold);">Mot de passe</label>
              <input type="password" id="signup-password" required minlength="6" style="width: 100%; padding: 0.75rem; background: rgba(255,255,255,0.05); border: 1px solid rgba(212, 175, 55, 0.3); border-radius: 4px; color: #2c3e50;">
            </div>
            <button type="submit" class="btn btn-primary hover-glow" style="width: 100%;">Créer mon compte</button>
          </form>

          <div id="auth-message" style="margin-top: 1rem; text-align: center; display: none;"></div>
        </div>

        <!-- État connecté -->
        <div id="user-logged-in" style="display: none; text-align: center;">
          <p style="color: var(--color-gold); margin-bottom: 1rem;"><i class="fas fa-check-circle"></i> Connecté en tant que <span id="user-email"></span></p>
          <button onclick="logout()" class="btn btn-outline" style="padding: 0.5rem 1rem;">Déconnexion</button>
        </div>
      </div>

      <div class="grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 4rem; max-width: 1000px; margin: 0 auto;">
        <!-- Plan Mensuel -->
        <div style="background: var(--color-bg-card); border: 2px solid rgba(212, 175, 55, 0.3); border-radius: 8px; padding: 3rem; text-align: center; transition: transform 0.3s ease;">
          <h3 class="mb-4">Mensuel</h3>
          <p class="text-muted mb-6">Flexibilité maximale</p>
          <div class="mb-6"><span style="font-size: 3rem; font-weight: bold; color: var(--color-gold);">29€</span><span class="text-muted">/mois</span></div>
          <ul style="text-align: left; margin-bottom: 2rem; list-style: none; padding: 0;">
            <li style="margin-bottom: 0.5rem;"><i class="fas fa-check" style="color: var(--color-gold); margin-right: 10px;"></i>Accès aux 30+ titres numériques</li>
            <li style="margin-bottom: 0.5rem;"><i class="fas fa-check" style="color: var(--color-gold); margin-right: 10px;"></i>Nouveautés incluses automatiquement</li>
            <li style="margin-bottom: 0.5rem;"><i class="fas fa-check" style="color: var(--color-gold); margin-right: 10px;"></i>Lecture sur 3 appareils simultanés</li>
            <li style="margin-bottom: 0.5rem;"><i class="fas fa-check" style="color: var(--color-gold); margin-right: 10px;"></i>Annulation à tout moment</li>
          </ul>
          <button onclick="subscribe('monthly')" class="btn btn-outline subscription-btn hover-glow" style="width: 100%;" data-plan="monthly">
            <i class="fas fa-credit-card"></i> Essai gratuit 7 jours
          </button>
        </div>

        <!-- Plan Annuel -->
        <div style="background: var(--color-bg-card); border: 2px solid var(--color-gold); border-radius: 8px; padding: 3rem; text-align: center; position: relative; transform: scale(1.05); box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
          <div style="position: absolute; top: -12px; right: 20px; background: var(--color-gold); color: #000; padding: 4px 12px; font-weight: bold; font-size: 0.8rem; border-radius: 4px;">Économisez 20%</div>
          <h3 class="mb-4">Annuel</h3>
          <p class="text-muted mb-6">Le meilleur rapport qualité-prix</p>
          <div class="mb-2"><span style="font-size: 3rem; font-weight: bold; color: var(--color-gold);">279€</span><span class="text-muted">/an</span></div>
          <div class="text-muted mb-6" style="text-decoration: line-through;">Au lieu de 348€</div>
          <ul style="text-align: left; margin-bottom: 2rem; list-style: none; padding: 0;">
            <li style="margin-bottom: 0.5rem;"><i class="fas fa-check" style="color: var(--color-gold); margin-right: 10px;"></i>Tous les avantages du mensuel</li>
            <li style="margin-bottom: 0.5rem;"><i class="fas fa-star" style="color: var(--color-gold); margin-right: 10px;"></i><strong>2 mois GRATUITS</strong></li>
            <li style="margin-bottom: 0.5rem;"><i class="fas fa-star" style="color: var(--color-gold); margin-right: 10px;"></i>Accès anticipé aux nouveautés</li>
            <li style="margin-bottom: 0.5rem;"><i class="fas fa-star" style="color: var(--color-gold); margin-right: 10px;"></i>Webinaires exclusifs</li>
          </ul>
          <button onclick="subscribe('annual')" class="btn btn-primary subscription-btn hover-glow" style="width: 100%;" data-plan="annual">
            <i class="fas fa-credit-card"></i> Essai gratuit 14 jours
          </button>
        </div>
      </div>
    </div>

    <script>
      const stripeKey = '${stripeKey}';
      let currentUser = null;

      // Vérifier session au chargement
      document.addEventListener('DOMContentLoaded', () => {
        const savedUser = localStorage.getItem('breslev_user');
        if (savedUser) {
          currentUser = JSON.parse(savedUser);
          showLoggedInState();
        }
      });

      function showLoginForm() {
        document.getElementById('login-form').style.display = 'block';
        document.getElementById('signup-form').style.display = 'none';
        document.getElementById('login-tab').style.background = 'var(--color-gold)';
        document.getElementById('login-tab').style.color = '#000';
        document.getElementById('signup-tab').style.background = 'transparent';
        document.getElementById('signup-tab').style.color = 'var(--color-gold)';
      }

      function showSignupForm() {
        document.getElementById('login-form').style.display = 'none';
        document.getElementById('signup-form').style.display = 'block';
        document.getElementById('signup-tab').style.background = 'var(--color-gold)';
        document.getElementById('signup-tab').style.color = '#000';
        document.getElementById('login-tab').style.background = 'transparent';
        document.getElementById('login-tab').style.color = 'var(--color-gold)';
      }

      function showLoggedInState() {
        document.getElementById('auth-forms').style.display = 'none';
        document.getElementById('auth-status').style.display = 'none';
        document.getElementById('user-logged-in').style.display = 'block';
        document.getElementById('user-email').textContent = currentUser.email;
      }

      function showMessage(message, isError = false) {
        const msgDiv = document.getElementById('auth-message');
        msgDiv.style.display = 'block';
        msgDiv.style.color = isError ? '#e74c3c' : 'var(--color-gold)';
        msgDiv.textContent = message;
      }

      // Connexion
      document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;

        try {
          const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
          });
          const data = await res.json();

          if (data.error) {
            showMessage(data.error, true);
          } else {
            currentUser = data.user;
            localStorage.setItem('breslev_user', JSON.stringify(data.user));
            localStorage.setItem('breslev_session', JSON.stringify(data.session));
            showLoggedInState();
          }
        } catch (err) {
          showMessage('Erreur de connexion', true);
        }
      });

      // Inscription
      document.getElementById('signup-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const fullName = document.getElementById('signup-name').value;
        const email = document.getElementById('signup-email').value;
        const password = document.getElementById('signup-password').value;

        try {
          const res = await fetch('/api/auth/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, fullName })
          });
          const data = await res.json();

          if (data.error) {
            showMessage(data.error, true);
          } else {
            showMessage('Compte créé ! Vérifiez votre email pour confirmer.');
            currentUser = data.user;
            localStorage.setItem('breslev_user', JSON.stringify(data.user));
            if (data.session) {
              localStorage.setItem('breslev_session', JSON.stringify(data.session));
              showLoggedInState();
            }
          }
        } catch (err) {
          showMessage('Erreur lors de l\\'inscription', true);
        }
      });

      function logout() {
        currentUser = null;
        localStorage.removeItem('breslev_user');
        localStorage.removeItem('breslev_session');
        document.getElementById('auth-forms').style.display = 'block';
        document.getElementById('auth-status').style.display = 'block';
        document.getElementById('user-logged-in').style.display = 'none';
        showLoginForm();
      }

      // Google OAuth avec Supabase JS
      async function signInWithGoogle() {
        // Utiliser le SDK Supabase pour Google OAuth
        const supabaseUrl = 'https://bxnhuwfabturyayohpht.supabase.co';
        const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ4bmh1d2ZhYnR1cnlheW9ocGh0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM2MDI5NTMsImV4cCI6MjA3OTE3ODk1M30._X0SKEFU05l-JJUjC_JSBKcB_64KbG2Xdr8l1TnqBPg';

        // Fix redirect URI to match exactly what is registered in Supabase/Google Auth Provider
        // Fallback to local if accessed locally, otherwise force the registered Vercel preview domain
        const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        const redirectTo = isLocalhost 
            ? window.location.origin + '/auth/callback'
            : 'https://breslev-books-preview.vercel.app/auth/callback';

        const authUrl = supabaseUrl + '/auth/v1/authorize?provider=google&redirect_to=' + encodeURIComponent(redirectTo);

        window.location.href = authUrl;
      }

      // Vérifier le hash au chargement (retour OAuth)
      (function checkOAuthReturn() {
        const hash = window.location.hash;
        if (hash && hash.includes('access_token')) {
          const params = new URLSearchParams(hash.substring(1));
          const accessToken = params.get('access_token');

          if (accessToken) {
            fetch('https://bxnhuwfabturyayohpht.supabase.co/auth/v1/user', {
              headers: {
                'Authorization': 'Bearer ' + accessToken,
                'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ4bmh1d2ZhYnR1cnlheW9ocGh0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM2MDI5NTMsImV4cCI6MjA3OTE3ODk1M30._X0SKEFU05l-JJUjC_JSBKcB_64KbG2Xdr8l1TnqBPg'
              }
            })
            .then(res => res.json())
            .then(user => {
              if (user && user.email) {
                currentUser = user;
                localStorage.setItem('breslev_user', JSON.stringify(user));
                localStorage.setItem('breslev_session', JSON.stringify({ access_token: accessToken }));
                // Nettoyer l'URL et afficher l'état connecté
                window.history.replaceState({}, document.title, '/pages/abonnement');
                showLoggedInState();
              }
            })
            .catch(err => console.error('OAuth error:', err));
          }
        }
      })();

      // Abonnement Stripe
      async function subscribe(plan) {
        if (!currentUser) {
          showMessage('Veuillez vous connecter d\\'abord', true);
          document.getElementById('auth-section').scrollIntoView({ behavior: 'smooth' });
          return;
        }

        try {
          const res = await fetch('/api/create-subscription-checkout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ plan, email: currentUser.email, user_id: currentUser.id })
          });
          const data = await res.json();

          if (data.error) {
            alert('Erreur: ' + data.error);
            return;
          }

          // Rediriger vers Stripe Checkout
          if (data.url) {
            window.location.href = data.url;
          } else if (stripeKey && data.sessionId) {
            const stripe = Stripe(stripeKey);
            await stripe.redirectToCheckout({ sessionId: data.sessionId });
          }
        } catch (err) {
          alert('Erreur lors de la création de l\\'abonnement');
        }
      }
    </script>
  `;
  res.send(getLayout(content, "Abonnement"));
});

app.get("/cart", (req, res) => {
  const stripeKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "";
  const paypalClientId = process.env.PAYPAL_CLIENT_ID || "";

  const content = `
    <div class="container mt-12 mb-12">
      <h1 class="text-center mb-8">Mon Panier</h1>
      <div id="checkout-container">
        <p class="text-center text-muted">Chargement du panier...</p>
      </div>
    </div>

    <script>
      window.STRIPE_PUBLISHABLE_KEY = '${stripeKey}';
      window.PAYPAL_CLIENT_ID = '${paypalClientId}';
    </script>
    <script src="https://js.stripe.com/v3/"></script>
    <script src="https://www.paypal.com/sdk/js?client-id=${paypalClientId}&currency=ILS&disable-funding=credit,card"></script>
    <script src="/checkout-system.js"></script>
  `;
  res.send(getLayout(content, "Panier & Checkout"));
});

// Route pour le lecteur FlipHTML5 (Likouté Moharan Tome 1)
app.get("/reader/:bookSlug", (req, res) => {
  const { bookSlug } = req.params;
  const { generateFlipHTML5Iframe } = require("./assets/fliphtml5-reader.js");

  const content = `
    <link rel="stylesheet" href="/checkout-styles.css">
    <script src="/fliphtml5-reader.js"></script>
    
    <div class="container mt-12 mb-12">
      <div style="max-width: 1200px; margin: 0 auto;">
        <div id="fliphtml5-reader"></div>
        
        <script>
          loadFlipHTML5Reader('fliphtml5-reader', '${bookSlug}');
        </script>
        
        <div style="margin-top: 2rem; text-align: center;">
          <a href="/products/1" class="btn btn-primary">
            <i class="fas fa-shopping-cart"></i> Acheter ce livre
          </a>
        </div>
      </div>
    </div>
  `;

  res.send(getLayout(content, "Lecteur numérique"));
});

// PayPal: Créer commande
app.post("/api/paypal/create-order", async (req, res) => {
  try {
    const { amount, currency } = req.body;
    const accessToken = await getPayPalAccessToken();

    if (!accessToken) {
      return res.status(500).json({ error: 'PayPal auth failed — credentials may need updating' });
    }

    const response = await fetch(`${PAYPAL_API}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [
          {
            amount: {
              currency_code: currency || "ILS",
              value: (amount / 100).toFixed(2),
            },
          },
        ],
      }),
    });

    const order = await response.json();
    if (!order.id) {
      console.error('[PayPal] create-order failed:', JSON.stringify(order), '| API:', PAYPAL_API, '| token prefix:', accessToken.substring(0, 20));
    }
    res.json(order);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PayPal: Capturer paiement
app.post("/api/paypal/capture-order", async (req, res) => {
  try {
    const { orderID } = req.body;
    const accessToken = await getPayPalAccessToken();

    const response = await fetch(
      `${PAYPAL_API}/v2/checkout/orders/${orderID}/capture`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );

    const captureData = await response.json();
    res.json(captureData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Virement / Chèque order confirmation
app.post("/api/virement-order", async (req, res) => {
  try {
    const { email, name, total, cart, shipping } = req.body;
    // Send confirmation email with virement instructions
    if (email && sendEmail) {
      const itemsList = (cart || []).map(i => `<li>${i.title || i.name} × ${i.quantity} — ${(i.price || 0).toFixed(2)} €</li>`).join('');
      await sendEmail({
        to: email,
        subject: 'Votre commande — instructions de paiement — Breslev by Esther Ifrah',
        html: `<div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;padding:24px;">
          <h2 style="color:#8B6914;">Confirmation de commande</h2>
          <p>Bonjour ${name || ''},</p>
          <p>Votre commande a bien été enregistrée. Pour finaliser, veuillez effectuer votre paiement :</p>
          <ul>${itemsList}</ul>
          <p><strong>Total : ${total} €</strong></p>
          <hr>
          <h3>Par virement bancaire</h3>
          <p>Bénéficiaire : <strong>Mme Joelle Ifrah</strong><br>
          Les coordonnées bancaires vous seront communiquées par retour de mail.</p>
          <h3>Par chèque</h3>
          <p>À l'ordre de <strong>Mme Joelle Ifrah</strong><br>
          L'adresse d'envoi vous sera communiquée par retour de mail.</p>
          <p style="color:#666;font-size:0.9em;">Pour toute question : <a href="https://wa.me/33612345678">WhatsApp</a></p>
        </div>`
      });
    }
    res.json({ success: true });
  } catch (error) {
    res.json({ success: true }); // Don't fail the order on email error
  }
});

app.post("/cart/add", (req, res) => res.redirect("/cart"));

// Page de succès après abonnement
app.get("/subscription-success", async (req, res) => {
  const { session_id } = req.query;
  let subscriptionInfo = null;

  // Récupérer les infos de la session Stripe si disponible
  if (stripe && session_id) {
    try {
      const session = await stripe.checkout.sessions.retrieve(session_id);
      subscriptionInfo = {
        email: session.customer_email,
        plan: session.amount_total === 27900 ? "annuel" : "mensuel",
      };

      // Sauvegarder l'abonnement dans Supabase
      if (supabase && session.customer_email) {
        const { error } = await supabase.from("subscriptions").insert([
          {
            email: session.customer_email,
            plan_type: subscriptionInfo.plan,
            status: "active",
            stripe_subscription_id: session.subscription,
            stripe_customer_id: session.customer,
            created_at: new Date().toISOString(),
          },
        ]);
        if (error) console.error("Erreur sauvegarde abonnement:", error);
      }
    } catch (err) {
      console.error("Erreur récupération session:", err);
    }
  }

  const content = `
    <div class="container mt-12 mb-12" style="text-align: center;">
      <div style="max-width: 600px; margin: 0 auto; background: var(--color-bg-card); border: 2px solid var(--color-gold); border-radius: 16px; padding: 4rem;">
        <div style="font-size: 5rem; margin-bottom: 2rem;">🎉</div>
        <h1 style="color: var(--color-gold); margin-bottom: 1rem;">Bienvenue dans la famille Breslev !</h1>
        <p class="text-large" style="margin-bottom: 2rem;">Votre abonnement ${subscriptionInfo?.plan || ""} est maintenant actif.</p>

        <div style="background: rgba(212, 175, 55, 0.1); border-radius: 8px; padding: 1.5rem; margin-bottom: 2rem;">
          <p style="margin-bottom: 0.5rem;"><i class="fas fa-check-circle" style="color: var(--color-gold);"></i> Accès illimité à tous les livres numériques</p>
          <p style="margin-bottom: 0.5rem;"><i class="fas fa-check-circle" style="color: var(--color-gold);"></i> Nouvelles publications incluses</p>
          <p><i class="fas fa-check-circle" style="color: var(--color-gold);"></i> Support prioritaire</p>
        </div>

        <p class="text-muted" style="margin-bottom: 2rem;">Un email de confirmation a été envoyé à ${subscriptionInfo?.email || "votre adresse"}.</p>

        <div style="display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap;">
          <a href="/collections/all" class="btn btn-primary">
            <i class="fas fa-book-open"></i> Commencer à lire
          </a>
          <a href="/" class="btn btn-outline">
            Retour à l'accueil
          </a>
        </div>
      </div>
    </div>
  `;
  res.send(getLayout(content, "Abonnement activé !"));
});

// Search API
app.get("/api/search", (req, res) => {
  const q = (req.query.q || "").toLowerCase().trim();
  if (!q) return res.json({ results: [] });
  const results = catalog.filter(b => {
    const fields = [b.title_fr, b.title, b.author, b.description_fr, b.description_long, b.categories].filter(Boolean).join(" ").toLowerCase();
    return fields.includes(q);
  }).map(b => ({ id: b.id, title: b.title_fr || b.title, author: b.author, price: b.price_physical, image: b.cover_image, slug: b.slug || b.id }));
  res.json({ results, query: q });
});

// Search page
app.get("/search", (req, res) => {
  const q = (req.query.q || "").trim();
  const results = q ? catalog.filter(b => {
    const fields = [b.title_fr, b.title, b.author, b.description_fr, b.description_long].filter(Boolean).join(" ").toLowerCase();
    return fields.includes(q.toLowerCase());
  }) : [];

  const resultsHTML = results.length > 0
    ? results.map(b => {
      const img = b.cover_image || '';
      const fname = img.split('/').pop();
      return '<a href="/products/' + b.id + '" style="display:flex;gap:1.5rem;padding:1.5rem;background:white;border:1px solid rgba(212,175,55,0.15);border-radius:12px;text-decoration:none;color:inherit;transition:all 0.3s ease;align-items:center;" onmouseover="this.style.boxShadow=\'0 8px 24px rgba(30,58,138,0.1)\'" onmouseout="this.style.boxShadow=\'none\'">' +
        '<img src="' + img + '" alt="" style="width:80px;height:120px;object-fit:contain;border-radius:8px;background:#f8f7f4;" loading="lazy">' +
        '<div><div style="font-size:0.7rem;text-transform:uppercase;letter-spacing:0.15em;color:#8B7355;margin-bottom:0.3rem;">' + (b.author || '') + '</div>' +
        '<div style="font-family:Cinzel,serif;font-size:1.1rem;color:#1a1a2e;margin-bottom:0.3rem;">' + (b.title_fr || b.title || '') + '</div>' +
        '<div style="color:#92400e;font-weight:600;">' + (b.price_eur || b.price_physical || '') + '€</div></div></a>';
    }).join('')
    : (q ? '<div style="text-align:center;padding:3rem;color:#6B7280;"><p style="font-size:1.2rem;">Aucun résultat pour "' + q.replace(/</g,'&lt;') + '"</p><a href="/collections/all" style="color:#D4AF37;">Voir tous les livres</a></div>' : '');

  const content = '<div class="container" style="max-width:800px;margin:0 auto;padding:3rem 1rem;">' +
    '<h1 style="font-family:Cinzel,serif;color:#1E3A8A;font-size:2rem;margin-bottom:2rem;">' + (q ? 'Résultats pour "' + q.replace(/</g,'&lt;') + '"' : 'Recherche') + '</h1>' +
    '<form action="/search" method="GET" style="margin-bottom:2rem;">' +
    '<input type="text" name="q" value="' + (q || '').replace(/"/g,'&quot;') + '" placeholder="Rechercher un livre, un auteur..." autofocus style="width:100%;padding:1rem 1.5rem;border:2px solid rgba(212,175,55,0.3);border-radius:12px;font-size:1rem;outline:none;font-family:inherit;" onfocus="this.style.borderColor=\'#D4AF37\'" onblur="this.style.borderColor=\'rgba(212,175,55,0.3)\'">' +
    '</form>' +
    (results.length > 0 ? '<p style="color:#6B7280;margin-bottom:1rem;">' + results.length + ' résultat(s)</p>' : '') +
    '<div style="display:grid;gap:1rem;">' + resultsHTML + '</div></div>';
  res.send(getLayout(content, (q ? q + " — " : "") + "Recherche — Breslev by Esther Ifrah"));
});

// Page Mon Compte
app.get("/account", (req, res) => {
  const content = `
    <!-- Section bannière Breslev au-dessus du formulaire -->
    <div style="background: linear-gradient(135deg, var(--navy, #1E3A8A) 0%, var(--dark, #0F172A) 100%); padding: 4rem 2rem; text-align: center; margin-bottom: 0;">
      <p style="font-family: 'Cinzel', serif; font-size: 0.75rem; letter-spacing: 0.2em; text-transform: uppercase; color: rgba(212,175,55,0.7); margin-bottom: 1rem;">Votre espace spirituel</p>
      <h1 class="text-gold-animated" style="font-family: 'Cinzel', serif; font-size: clamp(1.8rem, 4vw, 2.8rem); letter-spacing: 0.05em; margin-bottom: 1.5rem;">Mon Compte</h1>
      <p style="font-family: 'Cormorant Garamond', serif; font-style: italic; font-size: 1.2rem; color: rgba(255,255,255,0.7); max-width: 500px; margin: 0 auto; line-height: 1.7;">
        «&nbsp;Chaque Juif a une part unique dans la Torah.&nbsp;»
      </p>
      <p style="font-family: 'Cinzel', serif; font-size: 0.72rem; letter-spacing: 0.15em; color: rgba(212,175,55,0.5); margin-top: 0.8rem;">— Rabbi Nachman</p>
    </div>

    <div class="container mb-12">
      <div style="max-width: 800px; margin: 0 auto;">

        <!-- État non connecté -->
        <div id="account-logged-out" style="text-align: center; background: #fff; border: 1px solid rgba(212, 175, 55, 0.3); border-radius: 0 0 16px 16px; padding: 3rem 2rem;">
          <div style="width: 64px; height: 64px; background: rgba(212,175,55,0.1); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 1.5rem;">
            <i class="fas fa-user" style="font-size: 1.5rem; color: var(--gold, #D4AF37);"></i>
          </div>
          <h3 style="font-family: 'Cinzel', serif; color: var(--navy, #1E3A8A); margin-bottom: 0.5rem;">Bienvenue</h3>
          <p style="color: #888; margin-bottom: 2rem; font-family: 'Cormorant Garamond', serif; font-size: 1.05rem;">Connectez-vous pour accéder à vos livres numériques et cours</p>
          <a href="/pages/abonnement" class="btn-primary" style="background: var(--navy, #1E3A8A); color: #fff; padding: 0.9rem 2rem; border-radius: 8px; text-decoration: none; font-family: 'Cinzel', serif; font-size: 0.78rem; letter-spacing: 0.1em; text-transform: uppercase; display: inline-flex; align-items: center; gap: 0.5rem;">
            <i class="fas fa-sign-in-alt"></i> Se connecter / S'inscrire
          </a>

          <!-- Trust signals -->
          <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; margin-top: 2.5rem; max-width: 400px; margin-left: auto; margin-right: auto;">
            <div style="text-align: center;">
              <i class="fas fa-book-open" style="font-size: 1.5rem; color: var(--gold, #D4AF37); margin-bottom: 0.4rem; display: block;"></i>
              <p style="font-size: 0.8rem; color: #888;">18 livres</p>
            </div>
            <div style="text-align: center;">
              <i class="fas fa-headphones" style="font-size: 1.5rem; color: var(--gold, #D4AF37); margin-bottom: 0.4rem; display: block;"></i>
              <p style="font-size: 0.8rem; color: #888;">Audio Breslev</p>
            </div>
            <div style="text-align: center;">
              <i class="fas fa-graduation-cap" style="font-size: 1.5rem; color: var(--gold, #D4AF37); margin-bottom: 0.4rem; display: block;"></i>
              <p style="font-size: 0.8rem; color: #888;">Cours du jour</p>
            </div>
          </div>
        </div>

        <!-- État connecté -->
        <div id="account-logged-in" style="display: none;">
          <div style="background: var(--color-bg-card); border: 1px solid rgba(212, 175, 55, 0.3); border-radius: 8px; padding: 2rem; margin-bottom: 2rem;">
            <h3 style="color: var(--color-gold); margin-bottom: 1rem;"><i class="fas fa-user"></i> Informations</h3>
            <p><strong>Email:</strong> <span id="account-email"></span></p>
            <p><strong>Membre depuis:</strong> <span id="account-created"></span></p>
          </div>

          <div style="background: var(--color-bg-card); border: 1px solid rgba(212, 175, 55, 0.3); border-radius: 8px; padding: 2rem; margin-bottom: 2rem;">
            <h3 style="color: var(--color-gold); margin-bottom: 1rem;"><i class="fas fa-crown"></i> Mon Abonnement</h3>
            <div id="subscription-status">
              <p class="text-muted">Chargement...</p>
            </div>
          </div>

          <div style="text-align: center;">
            <button onclick="logoutAccount()" class="btn btn-outline">
              <i class="fas fa-sign-out-alt"></i> Déconnexion
            </button>
          </div>
        </div>
      </div>
    </div>

    <script>
      document.addEventListener('DOMContentLoaded', () => {
        const savedUser = localStorage.getItem('breslev_user');
        if (savedUser) {
          const user = JSON.parse(savedUser);
          document.getElementById('account-logged-out').style.display = 'none';
          document.getElementById('account-logged-in').style.display = 'block';
          document.getElementById('account-email').textContent = user.email;
          document.getElementById('account-created').textContent = new Date(user.created_at).toLocaleDateString('fr-FR');

          // Vérifier l'abonnement - Admins = accès illimité
          const adminEmails = ['dreamaiultimate@gmail.com', 'estherifra@breslev.com'];
          if (adminEmails.includes(user.email)) {
            document.getElementById('subscription-status').innerHTML = '<p style="color: var(--color-gold);"><i class="fas fa-crown"></i> Compte Administrateur</p><p class="text-muted">Accès illimité à tous les livres</p>';
          } else {
            // Vérifier dans Supabase si abonnement actif
            fetch('/api/check-subscription?email=' + encodeURIComponent(user.email) + '&user_id=' + encodeURIComponent(user.id))
              .then(res => res.json())
              .then(data => {
                if (data.active) {
                  document.getElementById('subscription-status').innerHTML = '<p style="color: var(--color-gold);"><i class="fas fa-star"></i> Abonnement actif (' + data.plan + ')</p><p class="text-muted">Accès illimité à tous les livres</p>';
                } else {
                  document.getElementById('subscription-status').innerHTML = '<p style="color: #e74c3c;"><i class="fas fa-times-circle"></i> Pas d\\'abonnement actif</p><a href="/pages/abonnement" class="btn btn-primary" style="margin-top: 1rem;">S\\'abonner</a>';
                }
              })
              .catch(() => {
                document.getElementById('subscription-status').innerHTML = '<p class="text-muted">Impossible de vérifier l\\'abonnement</p>';
              });
          }
        }
      });

      function logoutAccount() {
        localStorage.removeItem('breslev_user');
        localStorage.removeItem('breslev_session');
        window.location.href = '/';
      }
    </script>
  `;
  res.send(getLayout(content, "Mon Compte"));
});

// Page compte test pour Esther IFRAH
app.get("/test-account", (req, res) => {
  const content = `
    <div class="container mt-12 mb-12" style="text-align: center;">
      <div style="max-width: 500px; margin: 0 auto; background: var(--color-bg-card); border: 2px solid var(--color-gold); border-radius: 16px; padding: 3rem;">
        <h1 style="margin-bottom: 2rem;">Compte Test Esther IFRAH</h1>
        <p class="text-muted mb-6">Ce bouton vous connecte automatiquement avec un compte de test administrateur.</p>

        <button onclick="loginAsEsther()" class="btn btn-primary" style="width: 100%; margin-bottom: 1rem;">
          <i class="fas fa-sign-in-alt"></i> Se connecter comme Esther IFRAH
        </button>

        <p class="text-muted" style="font-size: 0.8rem;">Email: estherifra@breslev.com</p>
      </div>
    </div>

    <script>
      function loginAsEsther() {
        // Créer un utilisateur test
        const testUser = {
          id: 'test-esther-ifra',
          email: 'estherifra@breslev.com',
          created_at: new Date().toISOString(),
          user_metadata: { full_name: 'Esther IFRAH' }
        };

        localStorage.setItem('breslev_user', JSON.stringify(testUser));
        localStorage.setItem('breslev_session', JSON.stringify({ access_token: 'test-token' }));

        alert('Connecté en tant que Esther IFRAH (Admin)');
        window.location.href = '/account';
      }
    </script>
  `;
  res.send(getLayout(content, "Compte Test"));
});

// Route callback Google OAuth
app.get("/auth/callback", (req, res) => {
  const content = `
    <div class="container mt-12" style="text-align: center;">
      <div style="font-size: 3rem; margin-bottom: 1rem;">
        <i class="fas fa-spinner fa-spin" style="color: var(--color-gold);"></i>
      </div>
      <h2>Connexion en cours...</h2>
      <p class="text-muted">Veuillez patienter</p>
    </div>
    <script>
      // Récupérer le token depuis le hash
      let accessToken = null;
      if (window.location.hash) {
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        accessToken = hashParams.get('access_token');
      }

      if (accessToken) {
        fetch('https://bxnhuwfabturyayohpht.supabase.co/auth/v1/user', {
          headers: {
            'Authorization': 'Bearer ' + accessToken,
            'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ4bmh1d2ZhYnR1cnlheW9ocGh0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM2MDI5NTMsImV4cCI6MjA3OTE3ODk1M30._X0SKEFU05l-JJUjC_JSBKcB_64KbG2Xdr8l1TnqBPg'
          }
        })
        .then(res => res.json())
        .then(user => {
          if (user && user.email) {
            localStorage.setItem('breslev_user', JSON.stringify(user));
            localStorage.setItem('breslev_session', JSON.stringify({ access_token: accessToken }));
            window.location.href = '/pages/abonnement';
          } else {
            window.location.href = '/pages/abonnement?error=auth';
          }
        })
        .catch(() => {
          window.location.href = '/pages/abonnement?error=auth';
        });
      } else {
        window.location.href = '/pages/abonnement';
      }
    </script>
  `;
  res.send(getLayout(content, "Connexion..."));
});

// ==========================================
// ROUTES AUDIO
// ==========================================
// CONTACT
// ==========================================

app.get("/contact", (req, res) => {
  const content = `
    <div class="container" style="max-width: 700px; margin: 0 auto; padding: 4rem 1.5rem;">
      <div style="text-align: center; margin-bottom: 3rem;">
        <span style="background: rgba(212,175,55,0.15); color: var(--color-gold); padding: 0.5rem 1.2rem; border-radius: 20px; font-size: 0.85rem; font-family: var(--font-heading); letter-spacing: 0.1em; text-transform: uppercase;">Contact</span>
        <h1 style="font-family: 'Cinzel', serif; color: #0F172A; font-size: clamp(1.8rem,3vw,2.8rem); margin: 1.2rem 0 0.5rem;">Nous contacter</h1>
        <p style="color: #6B7280; font-size: 1.05rem; max-width: 480px; margin: 0 auto;">Pour toute question sur vos commandes, livraisons, ou pour des informations sur les livres.</p>
      </div>

      <div style="background: #ffffff; border: 1px solid rgba(212,175,55,0.2); border-radius: 20px; padding: 2.5rem; box-shadow: 0 4px 30px rgba(30,58,138,0.06); margin-bottom: 2rem;">
        <form id="contactForm" onsubmit="handleContact(event)">
          <div style="margin-bottom: 1.5rem;">
            <label style="display: block; font-size: 0.85rem; font-weight: 600; color: #1E3A8A; margin-bottom: 0.5rem; letter-spacing: 0.05em; text-transform: uppercase;">Nom complet</label>
            <input type="text" name="name" required placeholder="Votre prénom et nom"
              style="width: 100%; padding: 0.85rem 1rem; border: 1px solid rgba(212,175,55,0.3); border-radius: 10px; font-size: 1rem; outline: none; transition: border-color 0.2s; font-family: 'Cormorant Garamond', serif; background: #FFFEF7; box-sizing: border-box;"
              onfocus="this.style.borderColor='#D4AF37'" onblur="this.style.borderColor='rgba(212,175,55,0.3)'">
          </div>
          <div style="margin-bottom: 1.5rem;">
            <label style="display: block; font-size: 0.85rem; font-weight: 600; color: #1E3A8A; margin-bottom: 0.5rem; letter-spacing: 0.05em; text-transform: uppercase;">Email</label>
            <input type="email" name="email" required placeholder="votre@email.com"
              style="width: 100%; padding: 0.85rem 1rem; border: 1px solid rgba(212,175,55,0.3); border-radius: 10px; font-size: 1rem; outline: none; transition: border-color 0.2s; font-family: 'Cormorant Garamond', serif; background: #FFFEF7; box-sizing: border-box;"
              onfocus="this.style.borderColor='#D4AF37'" onblur="this.style.borderColor='rgba(212,175,55,0.3)'">
          </div>
          <div style="margin-bottom: 1.5rem;">
            <label style="display: block; font-size: 0.85rem; font-weight: 600; color: #1E3A8A; margin-bottom: 0.5rem; letter-spacing: 0.05em; text-transform: uppercase;">Sujet</label>
            <select name="subject" style="width: 100%; padding: 0.85rem 1rem; border: 1px solid rgba(212,175,55,0.3); border-radius: 10px; font-size: 1rem; outline: none; font-family: 'Cormorant Garamond', serif; background: #FFFEF7; box-sizing: border-box; color: #2C3E50;">
              <option value="commande">Ma commande</option>
              <option value="livre">Question sur un livre</option>
              <option value="livraison">Livraison</option>
              <option value="abonnement">Abonnement numérique</option>
              <option value="autre">Autre</option>
            </select>
          </div>
          <div style="margin-bottom: 2rem;">
            <label style="display: block; font-size: 0.85rem; font-weight: 600; color: #1E3A8A; margin-bottom: 0.5rem; letter-spacing: 0.05em; text-transform: uppercase;">Message</label>
            <textarea name="message" required rows="5" placeholder="Décrivez votre demande..."
              style="width: 100%; padding: 0.85rem 1rem; border: 1px solid rgba(212,175,55,0.3); border-radius: 10px; font-size: 1rem; outline: none; transition: border-color 0.2s; font-family: 'Cormorant Garamond', serif; background: #FFFEF7; resize: vertical; box-sizing: border-box;"
              onfocus="this.style.borderColor='#D4AF37'" onblur="this.style.borderColor='rgba(212,175,55,0.3)'"></textarea>
          </div>
          <button type="submit" class="hover-glow" style="width: 100%; background: linear-gradient(135deg, #D4AF37, #A8892A); color: #0F172A; border: none; padding: 1rem 2rem; border-radius: 12px; font-family: 'Cinzel', serif; font-size: 0.85rem; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; cursor: pointer; transition: all 0.3s ease;">
            Envoyer le message
          </button>
          <div id="contactSuccess" style="display:none; margin-top:1rem; padding:1rem; background:rgba(34,197,94,0.1); border-radius:10px; text-align:center; color:#16a34a; font-weight:600;">
            ✅ Message envoyé ! Nous vous répondrons dans les 24-48h.
          </div>
        </form>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
        <div style="background: linear-gradient(135deg, #0F172A, #1E3A8A); border-radius: 16px; padding: 1.5rem; text-align: center;">
          <div style="font-size: 1.8rem; margin-bottom: 0.5rem;">📧</div>
          <div style="font-family: 'Cinzel', serif; color: #D4AF37; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 0.3rem;">Email</div>
          <div style="color: rgba(255,255,255,0.85); font-size: 0.9rem;">breslevbyesther@gmail.com</div>
        </div>
        <div style="background: linear-gradient(135deg, #0F172A, #1E3A8A); border-radius: 16px; padding: 1.5rem; text-align: center;">
          <div style="font-size: 1.8rem; margin-bottom: 0.5rem;">⏰</div>
          <div style="font-family: 'Cinzel', serif; color: #D4AF37; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 0.3rem;">Délai réponse</div>
          <div style="color: rgba(255,255,255,0.85); font-size: 0.9rem;">24-48h (sauf Shabbat)</div>
        </div>
      </div>

      <script>
        async function handleContact(e) {
          e.preventDefault();
          const form = e.target;
          const btn = form.querySelector('button[type="submit"]');
          const errDiv = document.getElementById('contactError');
          if (errDiv) errDiv.style.display = 'none';
          btn.textContent = '⏳ Envoi...';
          btn.disabled = true;
          try {
            const data = Object.fromEntries(new FormData(form));
            const res = await fetch('/api/contact', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(data)
            });
            const result = await res.json();
            if (res.ok) {
              document.getElementById('contactSuccess').style.display = 'block';
              btn.style.display = 'none';
              form.reset();
            } else {
              throw new Error(result.error || 'Erreur serveur');
            }
          } catch (err) {
            btn.textContent = 'Envoyer le message';
            btn.disabled = false;
            const errEl = document.getElementById('contactError') || document.createElement('div');
            errEl.id = 'contactError';
            errEl.style.cssText = 'margin-top:1rem;padding:1rem;background:rgba(239,68,68,0.1);border-radius:10px;text-align:center;color:#dc2626;font-weight:600;';
            errEl.textContent = err.message;
            form.appendChild(errEl);
          }
        }
      </script>
    </div>
  `;
  res.send(getLayout(content, "Contact — Breslev by Esther Ifrah"));
});

// API: Contact form — REAL email sending
app.post("/api/contact", async (req, res) => {
  const { name, email, subject, message } = req.body;
  if (!name || !email || !message) {
    return res.status(400).json({ error: "Nom, email et message requis" });
  }

  const subjectMap = {
    commande: "Commande", livre: "Question livre",
    livraison: "Livraison", abonnement: "Abonnement", autre: "Autre"
  };
  const subjectLabel = subjectMap[subject] || subject || "Contact";

  try {
    await sendEmail({
      to: "breslevbyesther@gmail.com",
      subject: "[Breslev Site] " + subjectLabel + " — " + name,
      html: '<div style="font-family:sans-serif;max-width:600px;">' +
        '<h2 style="color:#1E3A8A;">Nouveau message du site</h2>' +
        '<p><strong>Nom:</strong> ' + name + '</p>' +
        '<p><strong>Email:</strong> <a href="mailto:' + email + '">' + email + '</a></p>' +
        '<p><strong>Sujet:</strong> ' + subjectLabel + '</p>' +
        '<hr style="border:1px solid #D4AF37;margin:1rem 0;">' +
        '<p style="white-space:pre-wrap;">' + message.replace(/</g, '&lt;') + '</p>' +
        '<hr style="border:1px solid #eee;margin:1rem 0;">' +
        '<p style="color:#999;font-size:0.85rem;">Via breslev-books-preview.vercel.app</p></div>'
    });

    // Auto-reply to sender
    await sendEmail({
      to: email,
      subject: "Merci pour votre message — Breslev by Esther Ifrah",
      html: '<div style="font-family:sans-serif;max-width:600px;">' +
        '<h2 style="color:#1E3A8A;">Chalom ' + name + ',</h2>' +
        '<p>Merci pour votre message. Nous avons bien reçu votre demande concernant : <strong>' + subjectLabel + '</strong>.</p>' +
        '<p>Nous vous répondrons dans les 24 à 48 heures (hors Shabbat et fêtes).</p>' +
        '<p style="margin-top:2rem;color:#D4AF37;font-style:italic;">Na Nach Nachma Nachman MeOuman</p>' +
        '<p>— Breslev by Esther Ifrah</p></div>'
    });

    console.log("[CONTACT] Message from " + name + " (" + email + "): " + subjectLabel);
    res.json({ success: true });
  } catch (error) {
    console.error("[CONTACT] Error:", error);
    res.status(500).json({ error: "Erreur d'envoi. Réessayez ou écrivez à breslevbyesther@gmail.com" });
  }
});

// ==========================================

// ===== PAGE À PROPOS =====
app.get("/a-propos", (req, res) => {
  const content = `
    <div class="container" style="max-width: 800px; margin: 0 auto; padding: 4rem 1.5rem;">
      <div style="text-align: center; margin-bottom: 3rem;">
        <span style="background: rgba(212,175,55,0.15); color: var(--color-gold); padding: 0.5rem 1.2rem; border-radius: 20px; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.1em;">À PROPOS</span>
        <h1 style="margin-top: 1rem; color: #1E3A8A; font-size: 2.5rem; font-family: 'Cinzel', serif;">Esther Ifrah</h1>
        <p style="color: #6B7280; font-size: 1.1rem; max-width: 550px; margin: 0.5rem auto; font-style: italic;">Traductrice et enseignante des textes de Rabbi Nachman de Breslev</p>
      </div>

      <div style="background: white; border: 1px solid rgba(212,175,55,0.2); border-radius: 20px; padding: 3rem; box-shadow: 0 4px 30px rgba(30,58,138,0.06); margin-bottom: 2rem;">
        <h2 style="font-family: 'Cinzel', serif; color: #1E3A8A; font-size: 1.4rem; margin-bottom: 1.5rem;">Ma Mission</h2>
        <p style="color: #374151; line-height: 1.9; font-family: 'Cormorant Garamond', serif; font-size: 1.1rem; margin-bottom: 1.5rem;">
          Depuis plus de vingt ans, je me consacre à rendre accessibles en français les enseignements de Rabbi Nachman de Breslev. Chaque livre que je traduis est le fruit d'un travail minutieux, alliant fidélité au texte original hébreu et beauté de la langue française.
        </p>
        <p style="color: #374151; line-height: 1.9; font-family: 'Cormorant Garamond', serif; font-size: 1.1rem; margin-bottom: 1.5rem;">
          Ma collection comprend aujourd'hui ${catalog.length} ouvrages : les huit tomes du Likoutey Moharan, les Sipourey Maasiot (Contes de Rabbi Nachman), le Tikoun HaKlali, le Likouté Tefilot, et bien d'autres trésors de la tradition hassidique de Breslev.
        </p>
        <p style="color: #374151; line-height: 1.9; font-family: 'Cormorant Garamond', serif; font-size: 1.1rem;">
          En parallèle des livres, je propose des cours audio — 123 enseignements sur la Cacheroute et l'Emounah disponibles en ligne — pour accompagner l'étude quotidienne de chacun, où qu'il soit dans le monde.
        </p>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin-bottom: 2rem;">
        <div style="background: linear-gradient(135deg, #1E3A8A 0%, #0F172A 100%); border-radius: 16px; padding: 2rem; text-align: center; color: white;">
          <div style="font-size: 2.5rem; font-family: 'Cinzel', serif; color: #D4AF37; font-weight: 700;">${catalog.length}</div>
          <div style="font-size: 0.85rem; color: rgba(255,255,255,0.7); text-transform: uppercase; letter-spacing: 0.1em; margin-top: 0.5rem;">Livres traduits</div>
        </div>
        <div style="background: linear-gradient(135deg, #1E3A8A 0%, #0F172A 100%); border-radius: 16px; padding: 2rem; text-align: center; color: white;">
          <div style="font-size: 2.5rem; font-family: 'Cinzel', serif; color: #D4AF37; font-weight: 700;">36</div>
          <div style="font-size: 0.85rem; color: rgba(255,255,255,0.7); text-transform: uppercase; letter-spacing: 0.1em; margin-top: 0.5rem;">Cours audio</div>
        </div>
      </div>

      <div style="background: white; border: 1px solid rgba(212,175,55,0.2); border-radius: 20px; padding: 2.5rem; box-shadow: 0 4px 30px rgba(30,58,138,0.06);">
        <h2 style="font-family: 'Cinzel', serif; color: #1E3A8A; font-size: 1.4rem; margin-bottom: 1.5rem;">Coordonnées</h2>
        <p style="color: #374151; line-height: 1.8;"><strong>Email :</strong> <a href="mailto:breslevbyesther@gmail.com" style="color: #D4AF37;">breslevbyesther@gmail.com</a></p>
        <p style="color: #374151; line-height: 1.8;"><strong>Adresse :</strong> 110, rue Méa Chéarim, Jérusalem, Israël</p>
        <div style="display: flex; gap: 1rem; margin-top: 1.5rem;">
          <a href="https://www.facebook.com/profile.php?id=100089800498498" target="_blank" rel="noopener" style="color: #1E3A8A; font-size: 1.5rem;"><i class="fab fa-facebook"></i></a>
          <a href="https://www.youtube.com/@BreslevEsther" target="_blank" rel="noopener" style="color: #1E3A8A; font-size: 1.5rem;"><i class="fab fa-youtube"></i></a>
          <a href="https://www.instagram.com/breslevbyesther" target="_blank" rel="noopener" style="color: #1E3A8A; font-size: 1.5rem;"><i class="fab fa-instagram"></i></a>
          <a href="https://www.tiktok.com/@breslev.esther" target="_blank" rel="noopener" style="color: #1E3A8A; font-size: 1.5rem;"><i class="fab fa-tiktok"></i></a>
        </div>
      </div>

      <div style="text-align: center; margin-top: 3rem;">
        <a href="/collections/all" class="btn btn-primary" style="font-weight: 700;">Découvrir mes livres</a>
      </div>
    </div>
  `;
  res.send(getLayout(content, "À propos — Esther Ifrah — Breslev"));
});

// ===== PAGE VOYAGES =====
app.get("/voyages", (req, res) => {
  const content = `
    <div class="container" style="max-width: 900px; margin: 0 auto; padding: 4rem 1.5rem;">
      <div style="text-align: center; margin-bottom: 3rem;">
        <span style="background: rgba(212,175,55,0.15); color: var(--color-gold); padding: 0.5rem 1.2rem; border-radius: 20px; font-size: 0.85rem; font-family: var(--font-heading); letter-spacing: 0.1em; text-transform: uppercase;">Pèlerinages & Voyages</span>
        <h1 style="font-family: 'Cinzel', serif; color: #0F172A; font-size: clamp(2rem,4vw,3rem); margin: 1.2rem 0 0.5rem; font-weight: 900;">Voyages Sacrés</h1>
        <div class="section-divider"></div>
        <p style="color: #6B7280; font-size: 1.1rem; max-width: 600px; margin: 0 auto; font-family: 'Cormorant Garamond', serif; font-size: 1.2rem;">
          Guides spirituels et informations pratiques pour vos pèlerinages en Eretz Israël, à Uman et sur les traces de Rabbi Nahman.
        </p>
      </div>

      <!-- UMAN — ROCH HACHANA -->
      <div style="background: #ffffff; border: 1px solid rgba(212,175,55,0.2); border-radius: 20px; padding: 2.5rem; box-shadow: 0 4px 30px rgba(30,58,138,0.06); margin-bottom: 2rem;">
        <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1.5rem;">
          <div style="width: 50px; height: 50px; background: rgba(212,175,55,0.15); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 1.5rem;">✈️</div>
          <div>
            <h2 style="font-family: 'Cinzel', serif; color: #1E3A8A; font-size: 1.5rem; margin: 0; font-weight: 700;">Uman — Roch Hachana</h2>
            <p style="color: var(--color-gold); font-size: 0.9rem; margin: 0.3rem 0 0;">Ukraine — Tombe de Rabbi Nachman de Breslev</p>
          </div>
        </div>
        <p style="color: #374151; font-size: 1.05rem; line-height: 1.8; font-family: 'Cormorant Garamond', serif;">
          Chaque année, des dizaines de milliers de Breslevers du monde entier se rassemblent à <strong>Uman</strong> (Ukraine) pour Roch Hachana, près de la tombe de Rabbi Nachman de Breslev (5531–5571). Ce pèlerinage est l'un des plus importants du monde juif hassidique.
        </p>
        <p style="color: #374151; font-size: 1.05rem; line-height: 1.8; font-family: 'Cormorant Garamond', serif; margin-top: 1rem;">
          Rabbi Nachman a promis : <em>"Quiconque viendra sur ma tombe à Roch Hachana [...] je le tirerai par les <em>payot</em> du fond de l'enfer."</em> Cette promesse attire chaque année des fidèles de France, d'Israël et du monde entier.
        </p>
        <div style="margin-top: 1.5rem; padding: 1rem 1.5rem; background: rgba(212,175,55,0.08); border-left: 3px solid var(--color-gold); border-radius: 0 8px 8px 0;">
          <p style="margin: 0; font-style: italic; color: #1E3A8A; font-family: 'Cormorant Garamond', serif; font-size: 1.1rem;">
            "Na Nach Nachma Nachman MéOuman" — ננח נחמ נחמן מאומן
          </p>
        </div>
      </div>

      <!-- ERETZ ISRAEL -->
      <div style="background: #ffffff; border: 1px solid rgba(212,175,55,0.2); border-radius: 20px; padding: 2.5rem; box-shadow: 0 4px 30px rgba(30,58,138,0.06); margin-bottom: 2rem;">
        <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1.5rem;">
          <div style="width: 50px; height: 50px; background: rgba(212,175,55,0.15); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 1.5rem;">🕍</div>
          <div>
            <h2 style="font-family: 'Cinzel', serif; color: #1E3A8A; font-size: 1.5rem; margin: 0; font-weight: 700;">Eretz Israël — Méa Chéarim</h2>
            <p style="color: var(--color-gold); font-size: 0.9rem; margin: 0.3rem 0 0;">Jérusalem — 110, rue Méa Chéarim</p>
          </div>
        </div>
        <p style="color: #374151; font-size: 1.05rem; line-height: 1.8; font-family: 'Cormorant Garamond', serif;">
          Esther Ifrah et sa famille sont établis au cœur de <strong>Méa Chéarim</strong>, le quartier hassidique de Jérusalem. La librairie Breslev — <em>Éditions Mayanot Hatsadik</em> — se trouve au <strong>110, rue Méa Chéarim</strong>.
        </p>
        <p style="color: #374151; font-size: 1.05rem; line-height: 1.8; font-family: 'Cormorant Garamond', serif; margin-top: 1rem;">
          Pour tout pèlerin souhaitant visiter Jérusalem, le quartier de Méa Chéarim est incontournable. Vous y trouverez la communauté Breslev vivante, les synagogues, les librairies et les cours quotidiens.
        </p>
        <p style="color: #374151; font-size: 0.9rem; margin-top: 1rem;">
          <i class="fas fa-phone" style="color: var(--color-gold); margin-right: 8px;"></i>
          <strong>Contact Jérusalem :</strong> +972 58-514-8500 &nbsp;|&nbsp; info@breslev.fr &nbsp;|&nbsp; hayil.fr@gmail.com
        </p>
      </div>

      <!-- LE LIVRE SUR LES VOYAGES -->
      <div style="background: linear-gradient(135deg, rgba(212,175,55,0.1) 0%, rgba(30,58,138,0.05) 100%); border: 1px solid rgba(212,175,55,0.3); border-radius: 20px; padding: 2.5rem; margin-bottom: 2rem;">
        <h2 style="font-family: 'Cinzel', serif; color: #1E3A8A; font-size: 1.4rem; margin: 0 0 1rem; font-weight: 700;">📖 Le Voyage de Rabbi Nahman</h2>
        <p style="color: #374151; font-size: 1.05rem; line-height: 1.8; font-family: 'Cormorant Garamond', serif;">
          Rabbi Nahman a accompli deux voyages qui ont transformé sa vie spirituelle : son voyage en <strong>Eretz Israël</strong> (1798–1799) et son voyage en <strong>Lemberg</strong>. Ces périples sont documentés et commentés dans les enseignements Breslev.
        </p>
        <div style="margin-top: 1.5rem; text-align: center;">
          <a href="/products/7" style="display: inline-block; background: var(--color-gold); color: #0F172A; padding: 0.9rem 2rem; border-radius: 10px; font-weight: 700; text-decoration: none; font-family: var(--font-heading); letter-spacing: 0.05em; transition: all 0.3s;">
            <i class="fas fa-book-open" style="margin-right: 8px;"></i>Découvrir le livre
          </a>
        </div>
      </div>

      <!-- INFO PRATIQUE -->
      <div style="background: #ffffff; border: 1px solid rgba(212,175,55,0.2); border-radius: 20px; padding: 2rem; text-align: center;">
        <h3 style="font-family: 'Cinzel', serif; color: #1E3A8A; margin-bottom: 0.5rem;">Informations & Inscription aux voyages</h3>
        <p style="color: #6B7280; font-family: 'Cormorant Garamond', serif; font-size: 1.05rem; margin-bottom: 1rem;">
          Pour vous inscrire à un voyage ou obtenir des informations sur les pèlerinages organisés depuis France et Israël, contactez Esther Ifrah directement.
        </p>
        <a href="/contact" style="display: inline-block; background: transparent; border: 2px solid var(--color-gold); color: var(--color-gold); padding: 0.75rem 1.5rem; border-radius: 10px; font-weight: 600; text-decoration: none; font-family: var(--font-heading); letter-spacing: 0.05em;">
          <i class="fas fa-envelope" style="margin-right: 8px;"></i>Nous contacter
        </a>
      </div>
    </div>
  `;
  res.send(getLayout(content, "Voyages Sacrés — Uman & Eretz Israël"));
});

// ===== PAGE ÉTUDES HASSIDIQUES =====
app.get("/etudes", (req, res) => {
  const etudes = [
    {
      title: "Azamra — Je Chanterai",
      source: "Likoutey Moharan I, Torah 282",
      text: "Il faut toujours chercher le point positif en chaque personne, même chez celui qui semble complètement mauvais. En trouvant un seul point de bien, on peut le ramener au mérite et l'aider à revenir vers Hachem.",
      theme: "Regard positif",
      icon: "🌟"
    },
    {
      title: "La Hitbodédout",
      source: "Likoutey Moharan II, Torah 25",
      text: "Le plus important, c'est de se réserver un moment chaque jour pour parler avec Hachem, dans sa propre langue, comme on parle à un ami. C'est la base de tout le service divin.",
      theme: "Prière personnelle",
      icon: "🙏"
    },
    {
      title: "Na Nach Nachma Nachman MeOuman",
      source: "Le Petek — Lettre miraculeuse",
      text: "Cette formule mystique, révélée dans une lettre trouvée par Rabbi Israël Ber Odesser, contient le secret du Tikoun complet. Elle est liée au Chant Simple-Double-Triple-Quadruple qui sera révélé à la fin des temps.",
      theme: "Le Petek",
      icon: "📜"
    },
    {
      title: "L'Épanchement de l'Âme",
      source: "Hishtapkhout HaNefesh",
      text: "Quand une personne déverse son cœur devant Hachem, même si elle ne ressent rien, même si les mots ne viennent pas — le simple fait de se tenir là avec l'intention de prier, c'est déjà une prière immense.",
      theme: "Téfila",
      icon: "💧"
    },
    {
      title: "Les Contes de Rabbi Nachman",
      source: "Sipourey Maasiot — Introduction",
      text: "Rabbi Nachman disait : 'Les gens pensent que les contes sont faits pour s'endormir, mais en vérité, on raconte des contes pour se réveiller.' Chaque histoire contient des secrets profonds de la Torah.",
      theme: "Les Contes",
      icon: "📖"
    },
    {
      title: "Le Tikoun HaKlali",
      source: "Les 10 Psaumes de Réparation",
      text: "Rabbi Nachman a révélé que la récitation de ces dix Psaumes spécifiques (16, 32, 41, 42, 59, 77, 90, 105, 137, 150) constitue un Tikoun général pour l'âme. Il a promis : 'Celui qui viendra sur ma tombe et récitera ces psaumes, je ferai tout pour lui.'",
      theme: "Tikoun",
      icon: "✨"
    },
    {
      title: "Émouna et Joie",
      source: "Likoutey Moharan I, Torah 48",
      text: "La joie n'est pas un luxe, c'est une obligation. Rabbi Nachman enseigne que la tristesse bloque les portes de la prière, tandis que la joie les ouvre toutes grandes. Même une joie simulée finit par devenir vraie.",
      theme: "Simha",
      icon: "😊"
    },
    {
      title: "Le Voyage à Uman",
      source: "Tradition Breslev",
      text: "Rabbi Nachman a dit avant de quitter ce monde : 'Mon feu brûlera jusqu'à la venue du Mashiah.' Des centaines de milliers de personnes se rendent chaque année sur sa tombe à Uman, en Ukraine, particulièrement pour Roch Hachana.",
      theme: "Uman",
      icon: "✈️"
    }
  ];

  const etudesCards = etudes.map((e) => {
    return '<div style="background: white; border: 1px solid rgba(212,175,55,0.2); border-radius: 16px; padding: 2rem; box-shadow: 0 4px 20px rgba(0,0,0,0.04); transition: transform 0.3s ease;" class="hover-lift">' +
      '<div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem; flex-wrap: wrap;">' +
      '<span style="font-size: 2rem;">' + e.icon + '</span>' +
      '<div><h2 style="font-family: Cinzel, serif; color: #1E3A8A; font-size: 1.3rem; margin: 0;">' + e.title + '</h2>' +
      '<span style="color: var(--color-gold); font-size: 0.85rem; font-style: italic;">' + e.source + '</span></div>' +
      '<span style="margin-left: auto; background: rgba(212,175,55,0.1); color: #8B6914; padding: 0.3rem 0.8rem; border-radius: 12px; font-size: 0.75rem; font-weight: 600; text-transform: uppercase;">' + e.theme + '</span>' +
      '</div>' +
      '<p style="color: #374151; font-size: 1.05rem; line-height: 1.8; font-family: Cormorant Garamond, serif; border-left: 3px solid var(--color-gold); padding-left: 1.5rem; margin: 0;">' + e.text + '</p>' +
      '</div>';
  }).join('');

  const content = `
    <div class="container" style="max-width: 900px; margin: 0 auto; padding: 3rem 1rem;">
      <div style="text-align: center; margin-bottom: 3rem;">
        <span style="background: rgba(212,175,55,0.15); color: var(--color-gold); padding: 0.5rem 1.2rem; border-radius: 20px; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.1em;">ÉTUDE QUOTIDIENNE</span>
        <h1 style="margin-top: 1rem; color: #1E3A8A; font-size: 2.5rem; font-family: 'Cinzel', serif;">Textes d'Études Hassidiques</h1>
        <p style="color: #666; font-size: 1.1rem; max-width: 550px; margin: 0.5rem auto;">Enseignements fondamentaux de Rabbi Nachman de Breslev, traduits et compilés par Esther Ifrah.</p>
      </div>
      <div style="display: grid; gap: 1.5rem;">
        ${etudesCards}
      </div>
      <div style="text-align: center; margin-top: 3rem; padding: 2.5rem; background: linear-gradient(135deg, #1E3A8A 0%, #0F172A 100%); border-radius: 20px; color: white;">
        <h3 class="text-gold-animated" style="font-family: 'Cinzel', serif; font-size: 1.4rem; margin-bottom: 1rem;">Approfondir vos études</h3>
        <p style="color: rgba(255,255,255,0.8); margin-bottom: 1.5rem;">Retrouvez tous ces enseignements et bien plus dans les livres d'Esther Ifrah.</p>
        <a href="/collections/all" class="btn btn-primary goldPulse" style="font-weight: 700;">Découvrir les Livres</a>
      </div>
    </div>
  `;
  res.send(getLayout(content, "Études Hassidiques — Breslev by Esther Ifrah"));
});

// ==========================================

// Page principale Audio
app.get("/audio", (req, res) => {
  const content = `
    <div class="container mt-12 mb-12">
      <div class="text-center mb-12">
        <span style="background: rgba(212, 175, 55, 0.2); color: var(--color-gold); padding: 0.5rem 1rem; border-radius: 20px; font-size: 0.9rem;">🎧 BIBLIOTHÈQUE AUDIO</span>
        <h1 style="margin-top: 1rem;">Cours & Enseignements Audio</h1>
        <p class="text-muted" style="max-width: 600px; margin: 1rem auto;">Écoutez les enseignements de Rabbi Nachman de Breslev où que vous soyez. Parfait pour le trajet, la marche ou la méditation.</p>
      </div>

      <div class="audio-categories-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 2rem;">
        ${audioCategories
          .map(
            (cat) => `
          <a href="/audio/${cat.id}" class="audio-category-card" style="background: linear-gradient(135deg, ${cat.color}15 0%, ${cat.color}05 100%); border: 2px solid ${cat.color}30; border-radius: 20px; padding: 2.5rem; text-decoration: none; color: inherit; transition: all 0.3s ease; display: block;">
            <div style="font-size: 4rem; margin-bottom: 1.5rem;">${cat.icon}</div>
            <h3 style="color: ${cat.color}; font-size: 1.5rem; margin-bottom: 0.75rem;">${cat.name}</h3>
            <p style="color: #666; font-size: 1rem; margin-bottom: 1.5rem;">${cat.description}</p>
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="color: ${cat.color}; font-weight: 600;"><i class="fas fa-headphones"></i> ${audioContent[cat.id]?.length || 0} cours</span>
              <span style="background: ${cat.color}; color: white; padding: 0.5rem 1rem; border-radius: 20px; font-size: 0.85rem;">Écouter →</span>
            </div>
          </a>
        `,
          )
          .join("")}
      </div>

      <div style="background: linear-gradient(135deg, #1E3A8A 0%, #0F172A 100%); border-radius: 20px; padding: 3rem; margin-top: 4rem; text-align: center; color: white;">
        <h3 class="text-gold-animated" style="margin-bottom: 1rem;">🎁 Accès illimité avec l'abonnement</h3>
        <p style="color: rgba(255,255,255,0.8); margin-bottom: 2rem;">Débloquez tous les cours audio et les livres numériques avec notre abonnement mensuel ou annuel.</p>
        <a href="/pages/abonnement" class="btn btn-primary hover-glow" style="background: var(--color-gold); color: #1E3A8A;">Découvrir les abonnements</a>
      </div>
    </div>
  `;
  res.send(getLayout(content, "Bibliothèque Audio"));
});

// Page catégorie Audio
app.get("/audio/:categoryId", (req, res) => {
  const { categoryId } = req.params;
  const category = audioCategories.find((c) => c.id === categoryId);
  const tracks = audioContent[categoryId] || [];

  if (!category) {
    return res
      .status(404)
      .send(
        getLayout(
          '<div class="container mt-12 text-center"><h1>Catégorie non trouvée</h1><a href="/audio" class="btn btn-primary hover-glow">Retour</a></div>',
          "Erreur",
        ),
      );
  }

  const content = `
    <div class="container mt-12 mb-12">
      <div style="margin-bottom: 2rem;">
        <a href="/audio" style="color: var(--color-gold); text-decoration: none;"><i class="fas fa-arrow-left"></i> Retour aux catégories</a>
      </div>

      <div class="text-center mb-8">
        <div style="font-size: 4rem; margin-bottom: 1rem;">${category.icon}</div>
        <h1 style="color: ${category.color};">${category.name}</h1>
        <p class="text-muted">${category.description}</p>
      </div>

      <div class="audio-tracks-list" style="max-width: 800px; margin: 0 auto;">
        ${tracks
          .map(
            (track, index) => `
          <div class="audio-track-item" style="background: white; border: 1px solid rgba(212, 175, 55, 0.2); border-radius: 12px; padding: 1.5rem; margin-bottom: 1rem; display: flex; align-items: center; gap: 1.5rem; transition: all 0.3s ease;">
            <div style="width: 60px; height: 60px; background: linear-gradient(135deg, ${category.color} 0%, ${category.color}99 100%); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-size: 1.5rem; flex-shrink: 0;">
              <i class="fas fa-play"></i>
            </div>
            <div style="flex: 1;">
              <h4 style="color: #2c3e50; margin-bottom: 0.25rem;">${track.title}</h4>
              <p style="color: #888; font-size: 0.9rem; margin: 0;">${track.description}</p>
            </div>
            <div style="text-align: right; flex-shrink: 0;">
              <div style="color: ${category.color}; font-weight: 600;">${track.duration}</div>
              <button class="play-audio-btn" data-track-id="${track.id}" data-url="${track.url}" style="background: ${category.color}20; color: ${category.color}; border: none; padding: 0.5rem 1rem; border-radius: 20px; cursor: pointer; margin-top: 0.5rem; font-size: 0.85rem;">
                <i class="fas fa-headphones"></i> Écouter
              </button>
            </div>
          </div>
        `,
          )
          .join("")}
      </div>

      ${
        tracks.length === 0
          ? `
        <div class="text-center" style="padding: 3rem; background: rgba(212, 175, 55, 0.1); border-radius: 12px;">
          <p style="color: #888; margin-bottom: 1rem;">Les cours de cette catégorie seront bientôt disponibles.</p>
          <a href="/pages/abonnement" class="btn btn-primary hover-glow">S'abonner pour être notifié</a>
        </div>
      `
          : ""
      }

      <div style="background: linear-gradient(135deg, #F5F0E6 0%, #FEFEFE 100%); border-radius: 20px; padding: 2rem; margin-top: 3rem; text-align: center;">
        <p style="color: #666; margin-bottom: 1rem;"><i class="fas fa-info-circle" style="color: var(--color-gold);"></i> Ces cours audio sont inclus dans l'abonnement numérique.</p>
        <a href="/pages/abonnement" class="btn btn-outline hover-glow" style="border-color: var(--color-gold); color: var(--color-gold);">Voir les abonnements</a>
      </div>
    </div>

    <!-- Player Audio Fixe -->
    <div id="audio-player-bar" style="display: none; position: fixed; bottom: 0; left: 0; width: 100%; background: linear-gradient(135deg, #1E3A8A 0%, #0F172A 100%); padding: 1rem 2rem; box-shadow: 0 -5px 25px rgba(0,0,0,0.3); z-index: 1000; border-top: 3px solid var(--color-gold);">
      <div style="max-width: 800px; margin: 0 auto;">
        <div style="display: flex; align-items: center; gap: 1rem; color: white; margin-bottom: 0.5rem;">
          <button id="audio-play-pause" style="background: linear-gradient(135deg, #D4AF37, #F5E6A3); border: none; width: 44px; height: 44px; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
            <i class="fas fa-play" id="play-icon" style="color: #1a1a2e; font-size: 1.1rem; margin-left: 2px;"></i>
          </button>
          <div style="flex: 1; min-width: 0;">
            <h4 id="audio-player-title" style="margin: 0; font-size: 0.95rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;"></h4>
            <div style="display: flex; align-items: center; gap: 0.5rem; margin-top: 0.4rem;">
              <span id="audio-current-time" style="font-size: 0.75rem; color: rgba(255,255,255,0.6); min-width: 40px;">0:00</span>
              <input type="range" id="audio-progress" min="0" max="100" value="0" style="flex: 1; height: 4px; accent-color: #D4AF37; cursor: pointer;">
              <span id="audio-duration" style="font-size: 0.75rem; color: rgba(255,255,255,0.6); min-width: 40px;">0:00</span>
            </div>
          </div>
          <button id="audio-close" style="background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); color: white; width: 32px; height: 32px; border-radius: 50%; cursor: pointer; font-size: 0.9rem; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">✕</button>
        </div>
      </div>
    </div>

    <script>
      const playerBar = document.getElementById('audio-player-bar');
      const playerTitle = document.getElementById('audio-player-title');
      const playPauseBtn = document.getElementById('audio-play-pause');
      const playIcon = document.getElementById('play-icon');
      const progressBar = document.getElementById('audio-progress');
      const currentTimeEl = document.getElementById('audio-current-time');
      const durationEl = document.getElementById('audio-duration');
      const closeBtn = document.getElementById('audio-close');
      let currentAudio = null;

      function formatTime(s) {
        if (isNaN(s)) return '0:00';
        const m = Math.floor(s / 60);
        const sec = Math.floor(s % 60);
        return m + ':' + (sec < 10 ? '0' : '') + sec;
      }

      document.querySelectorAll('.play-audio-btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
          e.preventDefault();
          const url = this.dataset.url;
          const trackContainer = this.closest('.audio-track-item');
          const title = trackContainer.querySelector('h4').innerText;

          if (!url) {
            alert('Ce cours sera disponible prochainement.');
            return;
          }

          if (currentAudio) { currentAudio.pause(); currentAudio = null; }

          currentAudio = new Audio(url);
          playerTitle.innerText = title;
          playerBar.style.display = 'block';
          playIcon.className = 'fas fa-spinner fa-spin';

          currentAudio.addEventListener('loadedmetadata', () => {
            durationEl.innerText = formatTime(currentAudio.duration);
            progressBar.max = Math.floor(currentAudio.duration);
          });
          currentAudio.addEventListener('canplay', () => {
            playIcon.className = 'fas fa-pause';
            currentAudio.play();
          });
          currentAudio.addEventListener('timeupdate', () => {
            progressBar.value = Math.floor(currentAudio.currentTime);
            currentTimeEl.innerText = formatTime(currentAudio.currentTime);
          });
          currentAudio.addEventListener('ended', () => {
            playIcon.className = 'fas fa-play';
          });
          currentAudio.addEventListener('error', () => {
            playIcon.className = 'fas fa-exclamation-triangle';
            playerTitle.innerText = 'Erreur de chargement — ' + title;
          });
        });
      });

      playPauseBtn.addEventListener('click', () => {
        if (!currentAudio) return;
        if (currentAudio.paused) {
          currentAudio.play();
          playIcon.className = 'fas fa-pause';
        } else {
          currentAudio.pause();
          playIcon.className = 'fas fa-play';
        }
      });

      progressBar.addEventListener('input', () => {
        if (currentAudio) currentAudio.currentTime = progressBar.value;
      });

      closeBtn.addEventListener('click', () => {
        if (currentAudio) { currentAudio.pause(); currentAudio = null; }
        playerBar.style.display = 'none';
      });
    </script>
  `;
  res.send(getLayout(content, category.name + " | Audio"));
});

// ==========================================
// PAGE TÉMOIGNAGES
// ==========================================

app.get("/temoignages", (req, res) => {
  const content = `
    <div class="container mt-12 mb-12">
      <div class="text-center mb-12">
        <span style="background: rgba(212, 175, 55, 0.2); color: #B8860B; padding: 0.5rem 1rem; border-radius: 20px; font-size: 0.9rem;">❤️ TÉMOIGNAGES</span>
        <h1 style="margin-top: 1rem;">Ce que disent nos lecteurs</h1>
        <p class="text-muted" style="max-width: 600px; margin: 1rem auto;">Des milliers de personnes à travers le monde ont été touchées par les enseignements de Rabbi Nachman traduits par Esther Ifrah.</p>
      </div>

      <div class="testimonials-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(350px, 1fr)); gap: 2rem; max-width: 1200px; margin: 0 auto;">
        ${testimonials
          .map(
            (t) => `
          <div class="testimonial-card" style="background: white; border-radius: 20px; padding: 2.5rem; box-shadow: 0 10px 40px rgba(30, 58, 138, 0.08); border: 1px solid rgba(212, 175, 55, 0.15);">
            <div style="display: flex; margin-bottom: 1.5rem;">
              ${Array(t.rating)
                .fill()
                .map(
                  () =>
                    '<i class="fas fa-star" style="color: #D4AF37; margin-right: 4px; font-size: 1.1rem;"></i>',
                )
                .join("")}
            </div>
            <p style="color: #444; font-size: 1.1rem; line-height: 1.8; margin-bottom: 2rem; font-style: italic;">"${t.text}"</p>
            <div style="display: flex; align-items: center; gap: 1rem;">
              <div style="width: 56px; height: 56px; background: linear-gradient(135deg, #1E3A8A, #3B82F6); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 1.3rem;">${t.name.charAt(0)}</div>
              <div>
                <div style="font-weight: 700; color: #1E3A8A; font-size: 1.1rem;">${t.name}</div>
                <div style="font-size: 0.9rem; color: #888;">${t.location}</div>
              </div>
            </div>
            <div style="margin-top: 1.5rem; padding-top: 1.5rem; border-top: 1px solid rgba(212, 175, 55, 0.2);">
              <span style="font-size: 0.9rem; color: #666;"><i class="fas fa-book" style="color: var(--color-gold); margin-right: 0.5rem;"></i>${t.book}</span>
            </div>
          </div>
        `,
          )
          .join("")}
      </div>

      <div style="background: linear-gradient(135deg, #1E3A8A 0%, #0F172A 100%); border-radius: 20px; padding: 4rem; margin-top: 4rem; text-align: center; color: white;">
        <h2 class="text-gold-animated" style="margin-bottom: 1rem;">Partagez votre témoignage</h2>
        <p style="color: rgba(255,255,255,0.8); margin-bottom: 2rem; max-width: 500px; margin-left: auto; margin-right: auto;">Comment les enseignements de Rabbi Nachman ont-ils touché votre vie ? Nous serions honorés de lire votre histoire.</p>
        <a href="mailto:contact@breslev-esther-ifrah.com?subject=Mon témoignage" class="btn hover-glow" style="background: var(--color-gold); color: #1E3A8A; padding: 1rem 2.5rem; font-size: 1.1rem;">
          <i class="fas fa-envelope"></i> Envoyer mon témoignage
        </a>
      </div>
    </div>
  `;
  res.send(getLayout(content, "Témoignages"));
});

// ==========================================
// COURS — PAGE PUBLIQUE (tous les cours audio)
// ==========================================
app.get("/cours", async (req, res) => {
  let coursList = [];
  try {
    coursList = JSON.parse(fs.readFileSync(path.join(__dirname, 'db/audioLessons.json'), 'utf8'));
  } catch (e) {
    console.error("Erreur de lecture audioLessons:", e);
  }

  // Tous les cours sont maintenant de vrais fichiers ESTHER_*.mp3
  // Rotation quotidienne : cours du jour
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
  const todayIndex = coursList.length > 0 ? dayOfYear % coursList.length : 0;
  const today = coursList.length > 0 ? coursList[todayIndex] : null;

  // Tous les autres cours (sans le cours du jour)
  const others = coursList.filter((_, i) => i !== todayIndex);


  const todayHTML = today ? `
    <div style="background: linear-gradient(135deg, #1E3A8A 0%, #0F172A 100%); border-radius: 24px; padding: 3rem; margin-bottom: 3rem; color: white; box-shadow: 0 20px 60px rgba(30,58,138,0.3);">
      <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1.5rem; flex-wrap: wrap;">
        <span style="background: var(--color-gold); color: #1E3A8A; padding: 0.4rem 1.2rem; border-radius: 20px; font-size: 0.85rem; font-weight: 700; text-transform: uppercase;">Cours du Jour</span>
        <span style="color: rgba(255,255,255,0.6); font-size: 0.9rem;">${new Date().toLocaleDateString("fr-FR", {weekday:"long",year:"numeric",month:"long",day:"numeric"})}</span>
      </div>
      <h2 class="text-gold-animated" style="font-size: 2rem; margin-bottom: 1rem;">${today.title}</h2>
      <p style="color: rgba(255,255,255,0.85); font-size: 1.1rem; line-height: 1.8; margin-bottom: 2rem;">${today.description}</p>
      <div style="background: rgba(255,255,255,0.1); padding: 1.5rem; border-radius: 16px; border: 1px solid rgba(212,175,55,0.3);">
        <audio controls style="width:100%; border-radius:8px; outline:none;" controlsList="nodownload">
          <source src="${today.url}">
          Votre navigateur ne supporte pas l'audio.
        </audio>
      </div>
    </div>` : `
    <div style="text-align: center; padding: 5rem 2rem; background: #EEF0FA; border-radius: 24px; border: 1px solid rgba(212,175,55,0.25);">
      <h3 style="font-family: 'Cinzel', serif; color: #1E3A8A; font-size: 1.6rem; font-weight: 600;">Aucun cours disponible</h3>
    </div>`;

  const coursCards = others.map((c, i) => {
    const isEmounah = c.series && c.series.includes('Emounah');
    const cardColor = isEmounah
      ? 'border: 1px solid rgba(212,175,55,0.4); background: linear-gradient(to right, #fffef7, white);'
      : 'border: 1px solid rgba(30,58,138,0.15); background: white;';
    const badgeHTML = c.series
      ? `<span style="background: ${isEmounah ? 'rgba(212,175,55,0.15)' : 'rgba(30,58,138,0.1)'}; color: ${isEmounah ? '#8B6914' : '#1E3A8A'}; font-size: 0.7rem; font-weight: 700; padding: 0.2rem 0.6rem; border-radius: 10px; text-transform: uppercase; margin-left: 0.5rem;">${c.series}</span>`
      : '';
    
    return `
    <div class="cours-card" data-index="${i}" data-title="${(c.title || '').toLowerCase()}" style="${cardColor} border-radius: 16px; padding: 1.5rem 2rem; box-shadow: 0 4px 20px rgba(0,0,0,0.06); display: ${i < 20 ? 'flex' : 'none'}; flex-direction: column; gap: 1rem; transition: all 0.3s ease;">
      <div style="display: flex; align-items: center; gap: 1rem;">
        <div style="width: 48px; height: 48px; background: ${isEmounah ? 'linear-gradient(135deg, #D4AF37, #8B6914)' : 'linear-gradient(135deg, #1E3A8A, #3B82F6)'}; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: 700; flex-shrink: 0; font-size: 0.9rem;">${c.id}</div>
        <div style="flex: 1; min-width: 0;">
          <div style="font-weight: 600; color: #2c3e50; font-size: 1.05rem;">${c.title}${badgeHTML}</div>
          <div style="font-size: 0.82rem; color: #888;">${new Date(c.date).toLocaleDateString("fr-FR")} &middot; ${c.duration}</div>
        </div>
      </div>
      <audio controls style="width:100%; height:40px;" controlsList="nodownload" preload="none">
        <source src="${c.url}">
      </audio>
    </div>`;
  }).join("");

  const content = `
    <div class="container" style="padding: 3rem 1rem; max-width: 900px; margin: 0 auto;">
      <div style="text-align: center; margin-bottom: 3rem;">
        <span style="background: rgba(212,175,55,0.15); color: var(--color-gold); padding: 0.5rem 1.2rem; border-radius: 20px; font-size: 0.9rem;">ESPACE SPIRITUEL</span>
        <h1 style="margin-top: 1rem; color: #1E3A8A; font-size: 2.5rem; font-family: 'Cinzel', serif;">Cours Audio Breslev</h1>
        <p style="color: #666; font-size: 1.1rem; max-width: 550px; margin: 0.5rem auto;">${coursList.length} enseignements audio d'Esther Ifrah. Un nouveau cours mis en avant chaque jour.</p>
        <div style="margin-top: 1rem;">
          <button onclick="var a=document.getElementById('coursIntro'); a.paused?a.play():a.pause(); this.querySelector('i').classList.toggle('fa-play');this.querySelector('i').classList.toggle('fa-pause');" style="background: linear-gradient(135deg, #1E3A8A, #3B82F6); color: white; border: none; padding: 0.7rem 1.5rem; border-radius: 20px; cursor: pointer; font-size: 0.9rem;"><i class="fas fa-play"></i> Mot d'Esther</button>
          <audio id="coursIntro" preload="none" src="/audios/esther-courses.mp3"></audio>
        </div>
      </div>

      <!-- VIDÉOS AVATAR ESTHER -->
      <div id="avatarVideosSection" style="margin-bottom: 3rem;">
        <h2 style="color: #1E3A8A; font-family: 'Cinzel', serif; font-size: 1.6rem; margin-bottom: 1.5rem; border-bottom: 2px solid var(--color-gold, #D4AF37); padding-bottom: 0.5rem;">
          <i class="fas fa-video" style="color: var(--color-gold, #D4AF37); margin-right: 0.5rem;"></i> Cours Vidéo par Esther
        </h2>
        <div id="avatarVideoGrid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1.5rem;">
          <p style="color: #888;">Chargement des vidéos...</p>
        </div>
      </div>

      ${todayHTML}

      <div style="margin-bottom: 2rem;">
        <input type="text" id="coursSearch" placeholder="Rechercher un cours..." style="width: 100%; padding: 1rem 1.5rem; border: 2px solid rgba(212,175,55,0.3); border-radius: 12px; font-size: 1rem; outline: none; transition: border-color 0.2s; font-family: inherit;" onfocus="this.style.borderColor='#D4AF37'" onblur="this.style.borderColor='rgba(212,175,55,0.3)'">
      </div>

      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 1rem;">
        <h3 style="color: #1E3A8A; border-bottom: 2px solid var(--color-gold, #D4AF37); padding-bottom: 0.5rem; display: inline-block; margin: 0;">Tous les enseignements <span style="color: var(--color-gold)">${coursList.length}</span></h3>
        <span style="font-size: 0.85rem; color: #888;">Cacheroute &amp; Emounah</span>
      </div>

      <div id="coursList" style="display: grid; gap: 1rem;">
        ${coursCards}
      </div>

      <div id="loadMoreContainer" style="text-align: center; margin-top: 2rem; ${others.length <= 20 ? 'display:none;' : ''}">
        <button id="loadMoreBtn" onclick="loadMoreCours()" style="background: linear-gradient(135deg, #1E3A8A, #3B82F6); color: white; border: none; padding: 1rem 2.5rem; border-radius: 12px; font-size: 1rem; font-weight: 600; cursor: pointer; transition: opacity 0.2s;">
          <i class="fas fa-plus-circle"></i> Charger plus de cours
        </button>
        <p id="coursCount" style="color: #888; font-size: 0.9rem; margin-top: 0.5rem;">Affichage: <span id="shownCount">20</span> / ${others.length}</p>
      </div>
    </div>

    <script>
      // Load avatar videos
      fetch('/api/avatar-videos').then(r => r.json()).then(data => {
        var grid = document.getElementById('avatarVideoGrid');
        if (!data.videos || !data.videos.length) { grid.innerHTML = ''; return; }
        grid.innerHTML = data.videos.map(function(v) {
          return '<div style="background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08); border: 1px solid rgba(30,58,138,0.1);">' +
            '<video controls style="width:100%; display:block; max-height:200px; object-fit:cover;" controlsList="nodownload" preload="metadata">' +
            '<source src="' + v.url + '" type="video/mp4"></video>' +
            '<div style="padding: 0.8rem 1rem; font-weight: 600; color: #2c3e50; font-size: 0.9rem;">' + v.name + '</div>' +
            '</div>';
        }).join('');
      }).catch(function() {
        document.getElementById('avatarVideosSection').style.display = 'none';
      });

      (function() {
        var coursVisible = 20;
        var totalCours = ${others.length};
        var BATCH = 20;

        window.loadMoreCours = function() {
          var cards = document.querySelectorAll('.cours-card');
          var end = Math.min(coursVisible + BATCH, totalCours);
          for (var i = coursVisible; i < end; i++) {
            if (cards[i]) cards[i].style.display = 'flex';
          }
          coursVisible = end;
          document.getElementById('shownCount').textContent = coursVisible;
          if (coursVisible >= totalCours) {
            document.getElementById('loadMoreContainer').style.display = 'none';
          }
        };

        document.getElementById('coursSearch').addEventListener('input', function() {
          var q = this.value.toLowerCase().trim();
          var cards = document.querySelectorAll('.cours-card');
          cards.forEach(function(card) {
            var text = card.textContent.toLowerCase();
            card.style.display = (!q || text.indexOf(q) !== -1) ? 'flex' : 'none';
          });
          document.getElementById('loadMoreContainer').style.display = q ? 'none' : (coursVisible < totalCours ? 'block' : 'none');
        });
      })();
    </script>`;

  res.send(getLayout(content, "Cours Audio — " + coursList.length + " enseignements"));
});

// ==========================================
// ADMIN — LOGIN
// ==========================================
app.get("/admin/login", (req, res) => {
  res.send(`<!DOCTYPE html><html lang="fr"><head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Admin — Connexion</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{background:linear-gradient(135deg,#1E3A8A,#0F172A);min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:'Segoe UI',sans-serif}
      .card{background:white;border-radius:24px;padding:3rem;width:100%;max-width:420px;box-shadow:0 30px 60px rgba(0,0,0,0.3)}
      h1{color:#1E3A8A;margin-bottom:0.5rem;font-size:1.8rem}
      .subtitle{color:#888;margin-bottom:2rem;font-size:0.95rem}
      input{width:100%;padding:0.9rem 1.2rem;border:2px solid #e5e7eb;border-radius:12px;font-size:1rem;outline:none;transition:border-color 0.2s}
      input:focus{border-color:#1E3A8A}
      button{width:100%;padding:1rem;background:linear-gradient(135deg,#1E3A8A,#3B82F6);color:white;border:none;border-radius:12px;font-size:1rem;font-weight:600;cursor:pointer;margin-top:1rem;transition:opacity 0.2s}
      button:hover{opacity:0.9}
      .error{color:#ef4444;font-size:0.9rem;margin-top:0.5rem;display:none}
    </style></head><body>
    <div class="card">
      <div style="text-align:center;font-size:3rem;margin-bottom:1rem;">🔐</div>
      <h1 style="text-align:center">Espace Admin</h1>
      <p class="subtitle" style="text-align:center">Breslev Esther Ifrah</p>
      <form method="POST" action="/admin/login">
        <input type="password" name="password" placeholder="Mot de passe admin" required autofocus>
        <p class="error" id="err">Mot de passe incorrect</p>
        <button type="submit"><i class="fas fa-sign-in-alt"></i> Connexion</button>
      </form>
    </div>
    <script>const p=new URLSearchParams(location.search);if(p.get('error'))document.getElementById('err').style.display='block'</script>
  </body></html>`);
});

app.post("/admin/login", express.urlencoded({ extended: false }), (req, res) => {
  if (req.body.password === ADMIN_PASSWORD) {
    res.setHeader("Set-Cookie", `admin_token=${ADMIN_TOKEN}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`);
    res.redirect("/admin");
  } else {
    res.redirect("/admin/login?error=1");
  }
});

app.get("/admin/logout", (req, res) => {
  res.setHeader("Set-Cookie", "admin_token=; Path=/; Max-Age=0");
  res.redirect("/admin/login");
});

// ==========================================
// ADMIN — TABLEAU DE BORD
// ==========================================
app.get("/admin", async (req, res) => {
  const token = req.cookies?.admin_token;
  if (token !== ADMIN_TOKEN) return res.redirect("/admin/login");

  const coursList = await loadCoursDB();

  const coursRows = coursList.length > 0
    ? coursList.map((c, i) => `
      <tr style="border-bottom:1px solid #f0f0f0;">
        <td style="padding:1rem">${new Date(c.date).toLocaleDateString("fr-FR")}</td>
        <td style="padding:1rem;font-weight:600">${c.titre}</td>
        <td style="padding:1rem"><span style="background:#e8f4fd;color:#1E3A8A;padding:0.2rem 0.6rem;border-radius:6px;font-size:0.8rem">${c.categorie||"-"}</span></td>
        <td style="padding:1rem">${c.fichier?`<a href="/uploads/cours/${c.fichier}" target="_blank" style="color:#1E3A8A">📎 ${c.fichier.slice(0,20)}...</a>`:"Texte seulement"}</td>
        <td style="padding:1rem"><a href="/admin/delete-cours/${c.id}" onclick="return confirm('Supprimer ?')" style="color:#ef4444;font-size:0.85rem">🗑️ Suppr.</a></td>
      </tr>`).join("")
    : `<tr><td colspan="5" style="text-align:center;padding:2rem;color:#888">Aucun cours encore</td></tr>`;

  res.send(`<!DOCTYPE html><html lang="fr"><head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Admin — Breslev</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{background:#f4f6f9;font-family:'Segoe UI',sans-serif;color:#333}
      .topbar{background:linear-gradient(135deg,#1E3A8A,#0F172A);padding:1rem 2rem;display:flex;align-items:center;justify-content:space-between;color:white}
      .topbar h1{font-size:1.3rem}
      .topbar a{color:rgba(255,255,255,0.7);text-decoration:none;font-size:0.9rem}
      .container{max-width:1100px;margin:0 auto;padding:2rem}
      .card{background:white;border-radius:20px;padding:2rem;margin-bottom:2rem;box-shadow:0 4px 20px rgba(0,0,0,0.06)}
      h2{color:#1E3A8A;margin-bottom:1.5rem;font-size:1.4rem}
      label{display:block;font-size:0.9rem;font-weight:600;color:#555;margin-bottom:0.4rem;margin-top:1rem}
      input,select,textarea{width:100%;padding:0.8rem 1rem;border:2px solid #e5e7eb;border-radius:10px;font-size:0.95rem;outline:none;font-family:inherit;transition:border-color 0.2s}
      input:focus,select:focus,textarea:focus{border-color:#1E3A8A}
      textarea{min-height:100px;resize:vertical}
      .grid2{display:grid;grid-template-columns:1fr 1fr;gap:1.5rem}
      .btn-primary{background:linear-gradient(135deg,#1E3A8A,#3B82F6);color:white;border:none;padding:1rem 2rem;border-radius:12px;font-size:1rem;font-weight:600;cursor:pointer;margin-top:1.5rem;display:inline-flex;align-items:center;gap:0.5rem;transition:opacity 0.2s}
      .btn-primary:hover{opacity:0.9}
      table{width:100%;border-collapse:collapse}
      th{text-align:left;padding:0.8rem 1rem;background:#f8fafc;color:#666;font-size:0.85rem;font-weight:600;border-bottom:2px solid #e5e7eb}
      .stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:1rem;margin-bottom:2rem}
      .stat{background:white;border-radius:16px;padding:1.5rem;box-shadow:0 4px 20px rgba(0,0,0,0.05);text-align:center}
      .stat .num{font-size:2.5rem;font-weight:700;color:#1E3A8A}
      .stat .label{color:#888;font-size:0.9rem}
      .upload-zone{border:2px dashed #d0d9e8;border-radius:12px;padding:2rem;text-align:center;color:#888;cursor:pointer;transition:all 0.2s}
      .upload-zone:hover{border-color:#1E3A8A;background:#f0f4ff}
      @media(max-width:768px){.grid2{grid-template-columns:1fr}}
    </style></head><body>
    <div class="topbar">
      <h1>🔰 Admin Breslev — Esther Ifrah</h1>
      <div style="display:flex;gap:2rem;align-items:center">
        <a href="/cours" target="_blank"><i class="fas fa-external-link-alt"></i> Voir le site</a>
        <a href="/admin/logout"><i class="fas fa-sign-out-alt"></i> Déconnexion</a>
      </div>
    </div>

    <div class="container">
      <div class="stats">
        <div class="stat"><div class="num">${coursList.length}</div><div class="label">📚 Cours publiés</div></div>
        <div class="stat"><div class="num">${catalog.length}</div><div class="label">📖 Livres catalogue</div></div>
        <div class="stat"><div class="num">${coursList.filter(c=>c.date===new Date().toISOString().split("T")[0]).length > 0 ? "✅" : "⏳"}</div><div class="label">Cours du jour</div></div>
      </div>

      <div class="card">
        <h2><i class="fas fa-plus-circle"></i> Publier un nouveau cours</h2>
        <form method="POST" action="/api/admin/upload-cours" enctype="multipart/form-data">
          <div class="grid2">
            <div>
              <label>Titre du cours *</label>
              <input type="text" name="titre" placeholder="Ex: Torah 1 - Azamra, La joie..." required>
            </div>
            <div>
              <label>Catégorie</label>
              <select name="categorie">
                <option value="">Choisir...</option>
                <option value="Likoutey Moharan">Likoutey Moharan</option>
                <option value="Cours quotidien">Cours quotidien</option>
                <option value="Histoire">Histoire de Rabbi Nachman</option>
                <option value="Prière">Prière & Tikoune</option>
                <option value="Conseil pratique">Conseil pratique</option>
              </select>
            </div>
          </div>
          <label>Date du cours</label>
          <input type="date" name="date" value="${new Date().toISOString().split("T")[0]}">
          <label>Description (optionnel)</label>
          <textarea name="description" placeholder="Résumé, points clés, message spirituel..."></textarea>
          <label>Fichier PDF ou Audio (optionnel, max 50MB)</label>
          <input type="file" name="fichier" accept=".pdf,.mp3,.mp4,.m4a,.ogg,.wav" style="border:2px dashed #d0d9e8;padding:1rem;cursor:pointer;">
          <button class="btn-primary" type="submit"><i class="fas fa-cloud-upload-alt"></i> Publier le cours</button>
        </form>
      </div>

      <div class="card">
        <h2><i class="fas fa-list"></i> Cours publiés (${coursList.length})</h2>
        <div style="overflow-x:auto">
          <table>
            <thead><tr><th>Date</th><th>Titre</th><th>Catégorie</th><th>Fichier</th><th>Action</th></tr></thead>
            <tbody>${coursRows}</tbody>
          </table>
        </div>
      </div>
    </div>
  </body></html>`);
});

// API: Upload cours
app.post("/api/admin/upload-cours", (req, res, next) => {
  const token = req.cookies?.admin_token;
  if (token !== ADMIN_TOKEN) return res.redirect("/admin/login");
  next();
}, upload.single("fichier"), async (req, res) => {
  const { titre, description, categorie, date } = req.body;
  if (!titre) return res.status(400).send("Titre requis");

  // If Supabase + file, upload to Supabase Storage
  let fichierRef = null;
  if (req.file) {
    if (supabase) {
      const fileBuffer = fs.readFileSync(req.file.path);
      const { data: storageData, error: storageErr } = await supabase.storage
        .from("cours-files")
        .upload(`public/${req.file.filename}`, fileBuffer, {
          contentType: req.file.mimetype,
          upsert: true,
        });
      if (!storageErr) {
        const { data: urlData } = supabase.storage
          .from("cours-files")
          .getPublicUrl(`public/${req.file.filename}`);
        fichierRef = urlData?.publicUrl || req.file.filename;
      } else {
        fichierRef = req.file.filename; // fallback to local
      }
    } else {
      fichierRef = req.file.filename;
    }
  }

  await saveCoursDB({
    id: Date.now().toString(),
    titre: titre.trim(),
    description: (description || "").trim(),
    categorie: categorie || "",
    date: date || new Date().toISOString().split("T")[0],
    fichier: fichierRef,
    createdAt: new Date().toISOString(),
  });
  res.redirect("/admin?success=1");
});

// API: Delete cours
app.get("/admin/delete-cours/:id", async (req, res) => {
  const token = req.cookies?.admin_token;
  if (token !== ADMIN_TOKEN) return res.redirect("/admin/login");
  await deleteCoursDB(req.params.id);
  res.redirect("/admin");
});

// API: List cours (JSON)
app.get("/api/cours", async (req, res) => {
  res.json(await loadCoursDB());
});

// API: list avatar videos
app.get("/api/avatar-videos", (req, res) => {
  const avatarDir = path.join(__dirname, "public/videos/avatar");
  try {
    const files = fs.readdirSync(avatarDir).filter(f => f.endsWith(".mp4")).sort();
    const videos = files.map(f => ({
      name: f.replace(/-/g, " ").replace(/\.\./g, ".").replace(/\.mp4$/, ""),
      url: "/videos/avatar/" + encodeURIComponent(f),
      filename: f,
    }));
    res.json({ total: videos.length, videos });
  } catch (e) {
    res.json({ total: 0, videos: [] });
  }
});

// API: list all available audio files from disk
app.get("/api/audio-files", (req, res) => {
  try {
    const audioDir = path.join(__dirname, "assets/audios");
    const files = fs.readdirSync(audioDir)
      .filter(f => f.endsWith(".opus") || f.endsWith(".ogg") || f.endsWith(".mp3") || f.endsWith(".m4a"))
      .sort();
    res.json({ total: files.length, files: files.map(f => ({ name: f, url: "/audios/" + encodeURIComponent(f) })) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// API: get audioLessons DB
app.get("/api/audio-lessons", (req, res) => {
  try {
    const lessons = JSON.parse(fs.readFileSync(path.join(__dirname, "db/audioLessons.json"), "utf8"));
    res.json({ total: lessons.length, lessons });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

if (require.main === module) {
  app.listen(PORT, () => {
    const audioCount = fs.readdirSync(path.join(__dirname, "assets/audios")).filter(f => f.endsWith(".opus") || f.endsWith(".ogg")).length;
    console.log(`🚀 BRESLEV ESTHER IFRAH - PRODUCTION`);
    console.log(`📍 http://localhost:${PORT}`);
    console.log(`📚 ${catalog.length} livres catalogués`);
    console.log(`🎧 ${audioCount} fichiers audio accessibles`);
  });
}

module.exports = app;
