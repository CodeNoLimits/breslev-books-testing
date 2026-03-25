-- Table cours quotidiens pour Esther Ifrah
-- À exécuter dans Supabase SQL Editor: https://app.supabase.com/project/bxnhuwfabturyayohpht/sql

CREATE TABLE IF NOT EXISTS cours (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  titre TEXT NOT NULL,
  description TEXT DEFAULT '',
  categorie TEXT DEFAULT '',
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  fichier TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

-- Index par date pour tri rapide
CREATE INDEX IF NOT EXISTS cours_date_idx ON cours (date DESC);

-- RLS: tout le monde peut lire, seuls les admin peuvent écrire
ALTER TABLE cours ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read" ON cours FOR SELECT USING (true);
CREATE POLICY "Service role write" ON cours FOR ALL USING (auth.role() = 'service_role');

-- Storage bucket pour les fichiers de cours
INSERT INTO storage.buckets (id, name, public)
VALUES ('cours-files', 'cours-files', true)
ON CONFLICT (id) DO NOTHING;

-- Politique de lecture publique sur le bucket
CREATE POLICY "Public bucket read" ON storage.objects
  FOR SELECT USING (bucket_id = 'cours-files');

CREATE POLICY "Service role upload" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'cours-files');
