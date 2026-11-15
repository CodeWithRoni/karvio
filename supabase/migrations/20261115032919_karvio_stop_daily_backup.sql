-- The owner turned off the nightly in-database snapshot (Settings → Database no longer offers it).
-- Snapshots already saved stay in karvio_private.backups; nothing else changes. Restores still save
-- their own safety copy first.
select cron.unschedule(jobname) from cron.job where jobname = 'karvio-daily-backup';
