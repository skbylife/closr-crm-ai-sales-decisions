-- Application-owned metadata. File bytes live only in the operator's Docker volume.
CREATE TABLE IF NOT EXISTS public.native_file_objects (
  id uuid PRIMARY KEY,
  bucket text NOT NULL CHECK (bucket = 'task-attachments'),
  logical_path text NOT NULL,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  task_id text NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  disk_name text NOT NULL UNIQUE CHECK (disk_name ~ '^[0-9a-f-]{36}\.bin$'),
  filename text NOT NULL,
  mime_type text NOT NULL,
  byte_size integer NOT NULL CHECK (byte_size >= 0 AND byte_size <= 10485760),
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (bucket, logical_path)
);
CREATE INDEX IF NOT EXISTS native_file_objects_task_idx ON public.native_file_objects(org_id, task_id);
ALTER TABLE public.native_file_objects ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.native_file_objects FROM PUBLIC, closr_app;
-- Only authenticated file API handlers use the server role, and they independently
-- check current organization membership and task scope for every read/write/delete.
