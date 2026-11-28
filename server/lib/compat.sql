-- Supabase pieces Karvio's migrations expect, for a plain PostgreSQL database (one per shop).
-- pg_cron and pg_net are replaced by the Karvio Node server itself:
--   * cron.schedule() only records the job; the server runs each job's command on its schedule (UTC).
--   * net.http_post() only queues the call; the server hands the body to that shop's API at once.
-- Run as the shop database's owner, before the migrations. Safe to run again.
create schema if not exists cron;
create table if not exists cron.job(jobname text primary key, schedule text not null, command text not null);
create or replace function cron.schedule(job_name text, schedule text, command text) returns bigint language sql as $$
 insert into cron.job values(job_name,schedule,command)
 on conflict (jobname) do update set schedule=excluded.schedule, command=excluded.command returning 1::bigint $$;
create or replace function cron.unschedule(job_name text) returns boolean language sql as $$
 delete from cron.job where jobname=job_name returning true $$;

create schema if not exists net;
create table if not exists net.calls(id bigserial primary key, url text, body jsonb, headers jsonb,
 created_at timestamptz not null default now(), done_at timestamptz);
create or replace function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds integer default 5000)
returns bigint language sql as $$ insert into net.calls(url, body, headers) values(url, body, headers) returning id $$;

create table if not exists public.karvio_migrations(name text primary key, applied_at timestamptz not null default now());
revoke all on public.karvio_migrations from public;
