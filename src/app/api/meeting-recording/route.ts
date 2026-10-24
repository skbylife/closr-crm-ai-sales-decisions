import { requireAuth, requireAdmin, requireAccountAccess, guardResponse } from '@/lib/api-guard';
import { NextRequest } from "next/server";

const BUCKET_NAME = "meeting-recordings";

function isMissingTable(error: unknown, table: string) {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return message.includes(`relation \"public.${table}\" does not exist`) || message.includes(`Could not find the table 'public.${table}'`);
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

// POST: Upload audio + create meeting_recordings row
export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const title = formData.get("title") as string | null;
    const accountId = formData.get("accountId") as string | null;
    const attendeeContactIds = formData.get("attendeeContactIds") as string | null;
    const context = formData.get("context") as string | null;
    const durationStr = formData.get("duration") as string | null;

    if (!file || !title) {
      return Response.json(
        { error: "缺少必填字段：file, title" },
        { status: 400 }
      );
    }

    const supabase = requireAdmin();
    const duration = durationStr ? parseInt(durationStr, 10) : null;

    // 1. Create the DB row first with status='uploading'
    const recordId = crypto.randomUUID();
    const { error: insertError } = await supabase
      .from("meeting_recordings")
      .insert({
        id: recordId,
        org_id: ctx.orgId,
        user_id: ctx.userId,
        account_id: accountId || null,
        title,
        attendee_contact_ids: attendeeContactIds
          ? JSON.parse(attendeeContactIds)
          : [],
        context: context || null,
        duration_seconds: duration,
        status: "uploading",
      });

    if (insertError) {
      console.error("[meeting-recording] Insert error:", insertError);
      return Response.json(
        { error: "创建录音记录失败" },
        { status: 500 }
      );
    }

    // 2. Upload audio to Supabase Storage
    const ext = file.name?.split(".").pop() || "webm";
    const storagePath = `${ctx.orgId}/${recordId}.${ext}`;
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(storagePath, buffer, {
        contentType: file.type || "audio/webm",
        upsert: false,
      });

    if (uploadError) {
      console.error("[meeting-recording] Upload error:", uploadError);
      // Clean up the DB row
      await supabase.from("meeting_recordings").delete().eq("id", recordId);
      return Response.json(
        { error: "音频上传失败: " + uploadError.message },
        { status: 500 }
      );
    }

    // 3. Get signed URL (valid for 7 days)
    const { data: signedUrlData } = await supabase.storage
      .from(BUCKET_NAME)
      .createSignedUrl(storagePath, 60 * 60 * 24 * 7);

    const audioUrl = signedUrlData?.signedUrl || storagePath;

    // 4. Update row with audio URL and set status to 'transcribing'
    const { error: updateError } = await supabase
      .from("meeting_recordings")
      .update({
        audio_url: audioUrl,
        status: "transcribing",
        updated_at: new Date().toISOString(),
      })
      .eq("id", recordId);

    if (updateError) {
      console.error("[meeting-recording] Update error:", updateError);
    }

    return Response.json({
      id: recordId,
      audioUrl,
      status: "transcribing",
    });
  } catch (err) {
    return guardResponse(err);
  }
}

// GET: List recordings, optional ?accountId filter
export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();

    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get("accountId");
    const recordingId = searchParams.get("recordingId");

    const supabase = requireAdmin();

    if (recordingId) {
      const { data, error } = await supabase
        .from("meeting_recordings")
        .select("*")
        .eq("id", recordingId)
        .eq("org_id", ctx.orgId)
        .maybeSingle();

      if (error) {
        if (isMissingTable(error, 'meeting_recordings')) {
          return Response.json({ recording: null, integrationAvailable: false }, { status: 200 });
        }
        console.error("[meeting-recording] Detail error:", error);
        return Response.json({ recording: null, integrationAvailable: false }, { status: 200 });
      }

      return Response.json({ recording: data ?? null, integrationAvailable: true });
    }

    let query = supabase
      .from("meeting_recordings")
      .select("*")
      .eq("org_id", ctx.orgId)
      .order("created_at", { ascending: false });

    if (accountId) {
      await requireAccountAccess(ctx, accountId);
      if (!isUuid(accountId)) {
        return Response.json({ recordings: [], integrationAvailable: true });
      }
      query = query.eq("account_id", accountId);
    }

    const { data, error } = await query;

    if (error) {
      if (isMissingTable(error, 'meeting_recordings')) {
        return Response.json({ recordings: [], integrationAvailable: false }, { status: 200 });
      }
      console.error("[meeting-recording] List error:", error);
      return Response.json({ recordings: [], integrationAvailable: false }, { status: 200 });
    }

    return Response.json({ recordings: data ?? [], integrationAvailable: true });
  } catch (err) {
    console.error('[meeting-recording] GET fallback:', err);
    return Response.json({ recordings: [], integrationAvailable: false }, { status: 200 });
  }
}
