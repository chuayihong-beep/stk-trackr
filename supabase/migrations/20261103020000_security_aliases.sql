-- Names the collector matches in headlines besides the legal company name, e.g. 'Maybank'.
alter table public.securities add column aliases text[] not null default '{}';
