-- Fotos dos servidores: coluna + bucket Supabase Storage
-- Execute no SQL Editor do projeto Supabase (isqslnnixdudhpunwnpx).

ALTER TABLE public.funcionarios
  ADD COLUMN IF NOT EXISTS foto_url text;

COMMENT ON COLUMN public.funcionarios.foto_url IS
  'Caminho no bucket funcionarios-fotos (ex: 123/avatar.jpg). Fotos são JPG ~180 KB.';

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'funcionarios-fotos',
  'funcionarios-fotos',
  true,
  307200,
  ARRAY['image/jpeg']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "funcionarios_fotos_select" ON storage.objects;
DROP POLICY IF EXISTS "funcionarios_fotos_insert" ON storage.objects;
DROP POLICY IF EXISTS "funcionarios_fotos_update" ON storage.objects;
DROP POLICY IF EXISTS "funcionarios_fotos_delete" ON storage.objects;

CREATE POLICY "funcionarios_fotos_select"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'funcionarios-fotos');

CREATE POLICY "funcionarios_fotos_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'funcionarios-fotos');

CREATE POLICY "funcionarios_fotos_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'funcionarios-fotos');

CREATE POLICY "funcionarios_fotos_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'funcionarios-fotos');
