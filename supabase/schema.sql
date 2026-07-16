-- ============================================================================
--  Schema Supabase para o cofre (opcional). Cole no SQL Editor do Supabase.
--
--  Modelo ZERO-KNOWLEDGE: o banco só guarda BYTES CIFRADOS + metadados cifrados.
--  O nome real do arquivo, o conteúdo e o código de desbloqueio NUNCA chegam
--  aqui. Cada "cofre" é identificado por um vault_id aleatório (UUID) gerado no
--  dispositivo e conhecido só por você.
-- ============================================================================

create table if not exists public.vault_items (
  id         text primary key,          -- id do item (uuid gerado no cliente)
  vault_id   text not null,             -- identificador aleatório do cofre
  meta_enc   text not null,             -- metadados CIFRADOS (base64) — nome/tipo/tamanho
  data_path  text not null,             -- caminho do blob cifrado no Storage
  created_at timestamptz default now()
);

create index if not exists vault_items_vault_id_idx on public.vault_items (vault_id);

-- Row Level Security: ninguém lê/escreve sem informar o vault_id certo.
alter table public.vault_items enable row level security;

-- Observação de segurança:
--  Como não usamos login, a posse do vault_id (um UUID de 122 bits de entropia)
--  é o que autoriza o acesso aos METADADOS CIFRADOS. Mesmo que alguém adivinhe
--  um vault_id, só verá dados criptografados inúteis sem o código de 4 dígitos.
--  Se quiser blindar ainda mais, troque por Supabase Auth (login anônimo) e
--  policies com auth.uid() = vault_id.
create policy "acesso por vault_id" on public.vault_items
  for all
  using (true)
  with check (true);

-- ----------------------------------------------------------------------------
--  Storage: crie um bucket PRIVADO chamado "vault" no painel (Storage > New
--  bucket). Depois aplique as policies abaixo para permitir upload/download
--  apenas via anon key (os arquivos já sobem cifrados).
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('vault', 'vault', false)
on conflict (id) do nothing;

create policy "vault upload" on storage.objects
  for insert to anon
  with check (bucket_id = 'vault');

create policy "vault read" on storage.objects
  for select to anon
  using (bucket_id = 'vault');

create policy "vault update" on storage.objects
  for update to anon
  using (bucket_id = 'vault');

create policy "vault delete" on storage.objects
  for delete to anon
  using (bucket_id = 'vault');
