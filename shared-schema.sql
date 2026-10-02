begin;
create table public.anime_shared_collections (
 id text primary key check (id = 'main'),
 payload jsonb not null,
 revision bigint not null default 1,
 updated_at timestamptz not null default now(),
 constraint shared_payload check (coalesce(jsonb_typeof(payload) = 'object' and jsonb_typeof(payload->'titles') = 'array' and jsonb_typeof(payload->'settings') = 'object', false))
);
alter table public.anime_shared_collections enable row level security;
revoke all on public.anime_shared_collections from anon, authenticated;
grant select on public.anime_shared_collections to anon, authenticated;
grant update (payload) on public.anime_shared_collections to anon, authenticated;
create policy shared_read on public.anime_shared_collections for select to anon, authenticated using (id = 'main');
create policy shared_update on public.anime_shared_collections for update to anon, authenticated using (id = 'main') with check (id = 'main');
create trigger shared_revision before update on public.anime_shared_collections for each row execute function public.anime_collection_revision();
-- Seed the main row from the collection export before publishing.
commit;
