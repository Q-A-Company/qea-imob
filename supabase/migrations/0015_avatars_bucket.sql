insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Leitura pública (decisão confirmada) — foto de perfil de colaborador,
-- baixa sensibilidade, evita a complexidade de signed URLs pra um <img>
-- simples. Path usa o UUID do usuário como pasta, então não é descoberta
-- por adivinhação trivial.
create policy "avatars_read" on storage.objects
  for select using (bucket_id = 'avatars');

-- Escrita: cada usuário só mexe na própria pasta (path convention:
-- {user_id}/arquivo.ext). Serve de base pro futuro self-service; o upload
-- feito pelo Admin nesta rodada usa service role e ignora esta policy
-- (service role sempre ignora RLS de Storage também).
create policy "avatars_write_own_folder" on storage.objects
  for insert with check (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatars_update_own_folder" on storage.objects
  for update using (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatars_delete_own_folder" on storage.objects
  for delete using (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text
  );
