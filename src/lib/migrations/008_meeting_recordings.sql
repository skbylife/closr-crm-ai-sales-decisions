-- Meeting Recordings table for Decode meeting recording feature
-- Stores audio recordings, transcripts, and AI decode results

CREATE TABLE IF NOT EXISTS meeting_recordings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  user_id UUID NOT NULL,
  account_id UUID,
  title TEXT NOT NULL,
  meeting_date TIMESTAMPTZ DEFAULT now(),
  attendee_contact_ids JSONB DEFAULT '[]',
  context TEXT,
  audio_url TEXT,
  duration_seconds INT,
  transcript JSONB,
  decode_result JSONB,
  status TEXT DEFAULT 'uploading' CHECK (status IN ('uploading', 'transcribing', 'decoding', 'done', 'error')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meeting_recordings_org ON meeting_recordings(org_id);
CREATE INDEX IF NOT EXISTS idx_meeting_recordings_account ON meeting_recordings(account_id);

-- Supabase Storage Bucket Setup (MANUAL):
-- 1. Go to Supabase Dashboard → Storage
-- 2. Create a new bucket named: meeting-recordings
-- 3. Set it as PRIVATE (not public)
-- 4. Add policy for authenticated users:
--    - SELECT: auth.uid() = (SELECT user_id FROM meeting_recordings WHERE audio_url LIKE '%' || storage.filename(name))
--    - INSERT: auth.role() = 'authenticated'
--    - Or simpler: allow all operations for authenticated users on this bucket
-- 5. File size limit recommendation: 100MB
-- 6. Allowed MIME types: audio/webm, audio/mp4, audio/mpeg, audio/ogg, audio/wav
