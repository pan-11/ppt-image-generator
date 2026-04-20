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
  model text not null,
  aspect_ratio text,
  resolution text,
  size text not null,
  n integer not null,
  reference_mode text not null,
  reference_image_id text,
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
