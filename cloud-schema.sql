begin;
create table public.anime_collections (
 user_id uuid primary key references auth.users(id) on delete cascade,
 payload jsonb not null default '{"titles":[],"settings":{}}'::jsonb,
 revision bigint not null default 1,
 updated_at timestamptz not null default now(),
 constraint collection_payload check (jsonb_typeof(payload) = 'object' and jsonb_typeof(payload->'titles') = 'array' and jsonb_typeof(payload->'settings') = 'object')
);
alter table public.anime_collections enable row level security;
revoke all on public.anime_collections from anon, authenticated;
grant select, insert, update on public.anime_collections to authenticated;
create policy own_collection_read on public.anime_collections for select to authenticated using ((select auth.uid()) = user_id);
create policy own_collection_create on public.anime_collections for insert to authenticated with check ((select auth.uid()) = user_id and revision = 1);
create policy own_collection_update on public.anime_collections for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create function public.anime_collection_revision() returns trigger language plpgsql set search_path = '' as $$
begin
 new.revision := old.revision + 1;
 new.updated_at := now();
 return new;
end;
$$;
create trigger anime_collection_revision before update on public.anime_collections for each row execute function public.anime_collection_revision();
commit;
