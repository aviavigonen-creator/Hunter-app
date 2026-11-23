-- Jobs now come from the daily jobs file, not from the jobs table,
-- so a saved mark must no longer require the job to exist in that table.
alter table public.user_jobs drop constraint if exists user_jobs_job_id_fkey;
