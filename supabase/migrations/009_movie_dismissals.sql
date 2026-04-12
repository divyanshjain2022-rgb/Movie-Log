-- Movie dismissals: stores "not interested" feedback for recommendations
create table if not exists movie_dismissals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  movie_title text not null,
  pvr_movie_id text not null,
  reason text not null check (reason in ('language', 'genre', 'director', 'cast', 'story', 'seen_it', 'bad_reviews')),
  reason_detail text,
  created_at timestamptz not null default now()
);

-- Index for fast lookup by user
create index if not exists idx_movie_dismissals_user on movie_dismissals(user_id);

-- Unique constraint: one dismissal per movie per reason per user
create unique index if not exists idx_movie_dismissals_unique
  on movie_dismissals(user_id, pvr_movie_id, reason, coalesce(reason_detail, ''));

-- RLS
alter table movie_dismissals enable row level security;

create policy "Users can view own dismissals"
  on movie_dismissals for select
  using (auth.uid() = user_id);

create policy "Users can insert own dismissals"
  on movie_dismissals for insert
  with check (auth.uid() = user_id);

create policy "Users can delete own dismissals"
  on movie_dismissals for delete
  using (auth.uid() = user_id);
