create table if not exists batches (
  id text primary key,
  name text not null,
  status text not null,
  settings_snapshot text not null,
  total_tasks integer not null default 0,
  success_count integer not null default 0,
  failed_count integer not null default 0,
  created_at text not null,
  updated_at text not null
);

create table if not exists tasks (
  id text primary key,
  batch_id text not null,
  prompt text not null,
  note text,
  model text not null,
  aspect_ratio text,
  resolution text,
  size text not null,
  n integer not null,
  reference_mode text not null,
  reference_image_id text,
  parent_image_id text,
  status text not null,
  remote_task_id text,
  error_message text,
  retry_count integer not null default 0,
  created_at text not null,
  updated_at text not null,
  foreign key (batch_id) references batches(id) on delete cascade
);

create table if not exists generated_images (
  id text primary key,
  batch_id text not null,
  task_id text not null,
  filename text not null,
  local_path text not null,
  mime_type text not null,
  created_at text not null,
  foreign key (batch_id) references batches(id) on delete cascade,
  foreign key (task_id) references tasks(id) on delete cascade
);

create table if not exists reference_images (
  id text primary key,
  filename text not null,
  local_path text not null,
  mime_type text not null,
  remote_url text,
  created_at text not null
);

create table if not exists generation_jobs (
  id text primary key,
  task_id text not null,
  output_index integer not null,
  mode text not null,
  status text not null,
  provider_id text,
  provider_revision text,
  protocol_type text,
  remote_task_id text,
  remote_result_url text,
  requested_size text,
  attempt_count integer not null default 0,
  actual_width integer,
  actual_height integer,
  error_stage text,
  error_message text,
  created_at text not null,
  updated_at text not null,
  unique (task_id, output_index),
  foreign key (task_id) references tasks(id) on delete cascade
);

create index if not exists generation_jobs_task_status_idx
  on generation_jobs(task_id, status);

create index if not exists generation_jobs_provider_revision_idx
  on generation_jobs(provider_id, provider_revision, status);

create table if not exists coursewares (
  id text primary key,
  name text not null,
  source_kind text not null,
  raw_import_text text,
  import_mode text,
  legacy_batch_id text unique,
  global_reference_image_id text,
  pages_json text not null,
  revision integer not null default 0,
  created_at text not null,
  updated_at text not null
);

create table if not exists textless_runs (
  id text primary key,
  courseware_id text not null,
  request_id text not null,
  source_revision integer not null,
  prompt_text text not null,
  model text not null,
  manifest_json text not null,
  created_at text not null,
  unique (courseware_id, request_id),
  foreign key (courseware_id) references coursewares(id)
);

create table if not exists courseware_task_links (
  task_id text primary key,
  courseware_id text not null,
  page_id text not null,
  purpose text not null,
  textless_run_id text,
  source_image_id text,
  created_at text not null,
  foreign key (task_id) references tasks(id) on delete cascade,
  foreign key (courseware_id) references coursewares(id),
  foreign key (textless_run_id) references textless_runs(id)
);

create index if not exists courseware_task_links_page_idx
  on courseware_task_links(courseware_id, page_id);

create table if not exists image_job_results (
  image_id text primary key,
  job_id text not null,
  attempt_number integer not null,
  validation_status text not null,
  actual_width integer,
  actual_height integer,
  created_at text not null,
  foreign key (image_id) references generated_images(id) on delete cascade,
  foreign key (job_id) references generation_jobs(id) on delete cascade
);

create index if not exists image_job_results_job_idx
  on image_job_results(job_id, attempt_number);
