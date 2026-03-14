-- Migration : création du bucket Supabase Storage "chantier-documents"
-- + policies RLS user-scoped (identiques à la convention du bucket "devis")

-- 1. Créer le bucket (privé, limite 10 Mo par fichier)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chantier-documents',
  'chantier-documents',
  false,
  10485760,   -- 10 Mo
  null        -- tous les types MIME autorisés (validation côté serveur dans l'API)
)
ON CONFLICT (id) DO NOTHING;

-- 2. Policy SELECT : un utilisateur ne peut lire que SES fichiers
CREATE POLICY "chantier_documents_select"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'chantier-documents'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- 3. Policy INSERT : un utilisateur ne peut uploader que dans son dossier
CREATE POLICY "chantier_documents_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'chantier-documents'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- 4. Policy UPDATE
CREATE POLICY "chantier_documents_update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'chantier-documents'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- 5. Policy DELETE : un utilisateur ne peut supprimer que SES fichiers
CREATE POLICY "chantier_documents_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'chantier-documents'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
