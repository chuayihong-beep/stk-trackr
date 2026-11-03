-- Let the owner register listings from the app until a symbol-search provider exists (Stage 2).
grant insert, update on public.securities to authenticated;

create policy owner_insert on public.securities
  for insert to authenticated with check (public.is_owner());
create policy owner_update on public.securities
  for update to authenticated using (public.is_owner()) with check (public.is_owner());
