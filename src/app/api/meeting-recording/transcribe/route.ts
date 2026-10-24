import { requireAuth, requireAdmin, guardResponse } from '@/lib/api-guard';
import { applyAIRateLimit } from '@/lib/rate-limit';
import {
  DEFAULT_DEEPSEEK_FLASH_MODEL,
  getAiChatCompletionsUrl,
  getAiProviderConfig,
} from '@/lib/ai-provider-config';
import { runCILIngest } from '@/lib/compiled-intelligence/ingest';

export const maxDuration = 300;

async function callMeetingDecodeLLM(systemPrompt: string, userPrompt: string): Promise<Record<string, unknown> | null> {
  const config = getAiProviderConfig('flash');
  if (!config.apiKey || !config.baseUrl) return null;
  const model = config.model || DEFAULT_DEEPSEEK_FLASH_MODEL;
  const isDeepSeek = model.toLowerCase().startsWith('deepseek-') || /api\.deepseek\.com/i.test(config.baseUrl);
  const res = await fetch(getAiChatCompletionsUrl(config), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.apiKey}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      ...(isDeepSeek ? { thinking: { type: 'disabled' } } : {}),
    }),
  });
  if (!res.ok) {
    console.error('[meeting-transcribe] AI API error:', res.status, await res.text().catch(() => ''));
    return null;
  }
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) return null;
  try { return JSON.parse(content); } catch { return null; }
}

// POST: Trigger transcription + AI decode for a meeting recording
export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();
    applyAIRateLimit(ctx.userId);
    const body = (await request.json()) as { recordingId?: string };
    const { recordingId } = body;

    if (!recordingId) {
      return Response.json(
        { error: "缺少 recordingId" },
        { status: 400 }
      );
    }

    const supabase = requireAdmin();

    // 1. Fetch the recording row
    const { data: recording, error: fetchError } = await supabase
      .from("meeting_recordings")
      .select("*")
      .eq("id", recordingId)
      .eq("org_id", ctx.orgId)
      .single();

    if (fetchError || !recording) {
      return Response.json(
        { error: "录音记录不存在" },
        { status: 404 }
      );
    }

    // 2. Update status to 'transcribing'
    await supabase
      .from("meeting_recordings")
      .update({ status: "transcribing", updated_at: new Date().toISOString() })
      .eq("id", recordingId);

    // 3. Attempt Paraformer transcription
    let transcript: TranscriptData | null = null;
    try {
      transcript = await callParaformer(recording.audio_url);
    } catch (err) {
      console.error("[transcribe] Paraformer failed, using placeholder:", err);
      // Fallback: placeholder transcript
      transcript = {
        segments: [],
        fullText: "音频转录处理中...（Paraformer API 暂不可用，已基于会议信息进行解读）",
        speakerCount: 0,
        totalDuration: recording.duration_seconds ?? 0,
      };
    }

    // 4. Update with transcript
    await supabase
      .from("meeting_recordings")
      .update({
        transcript,
        status: "decoding",
        updated_at: new Date().toISOString(),
      })
      .eq("id", recordingId);

    // 5. Build context for AI decode
    const contextParts: string[] = [];
    contextParts.push(`会议标题: ${recording.title}`);
    if (recording.context) contextParts.push(`会议背景: ${recording.context}`);
    if (recording.duration_seconds) {
      contextParts.push(`会议时长: ${Math.round(recording.duration_seconds / 60)} 分钟`);
    }

    // Fetch attendee names if available
    const attendeeIds = recording.attendee_contact_ids as string[] | null;
    if (attendeeIds && attendeeIds.length > 0) {
      const { data: contacts } = await supabase
        .from("contacts")
        .select("name, title")
        .in("id", attendeeIds);
      if (contacts && contacts.length > 0) {
        const names = contacts.map(
          (c: { name: string; title?: string }) =>
            c.title ? `${c.name} (${c.title})` : c.name
        );
        contextParts.push(`参会人: ${names.join(", ")}`);
      }
    }

    // Fetch account name if available
    if (recording.account_id) {
      const { data: account } = await supabase
        .from("accounts")
        .select("name")
        .eq("id", recording.account_id)
        .single();
      if (account) {
        contextParts.push(`客户: ${account.name}`);
      }
    }

    const hasRealTranscript = transcript.segments.length > 0 && transcript.fullText.length > 50;
    const transcriptContent = hasRealTranscript
      ? `转录内容:\n${transcript.fullText}`
      : "（音频转录暂不可用，请基于会议信息进行分析）";

    // 6. Call AI for sales decode
    const decodeRaw = await callMeetingDecodeLLM(`你是一个专业的 B2B 销售顾问，擅长分析会议内容并提取销售信号。

## 任务
分析会议录音的转录内容（或会议信息），输出结构化的销售解读。

## 输出格式（JSON）
{
  "meetingSummary": "50-100字会议摘要",
  "keyDecisions": ["决策1", "决策2"],
  "actionItems": [
    { "title": "具体行动", "owner": "负责人", "deadline": "建议截止日期" }
  ],
  "salesSignals": {
    "sentimentTrend": "warming|cooling|stable|volatile",
    "riskLevel": "low|medium|high|critical",
    "buyerState": "engaged|evaluating|stalling|ghosting",
    "keySignal": "最关键的销售信号（一句话）"
  },
  "nextSteps": ["下一步1", "下一步2"],
  "concerns": ["顾虑1", "顾虑2"],
  "opportunities": ["机会1", "机会2"]
}

## 风格
- 简洁有力，不写废话
- 用中文输出
- 关注销售推进和风险信号`,
      `${contextParts.join("\n")}\n\n${transcriptContent}`
    );
    const decodeResult = decodeRaw as MeetingDecodeResult | null;

    // 7. Update recording with decode result — only mark 'done' if decode succeeded
    const decodeStatus = decodeResult ? "done" : "error";
    const decodeError = decodeResult ? undefined : "AI 解读失败，请重试";
    await supabase
      .from("meeting_recordings")
      .update({
        decode_result: decodeResult,
        status: decodeStatus,
        ...(decodeError ? { error_message: decodeError } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", recordingId);

    // 8. Fire-and-forget: CIL ingest pipeline (only if decode succeeded)
    if (decodeResult && recording.account_id && hasRealTranscript) {
      const accountName = contextParts.find(p => p.startsWith('客户:'))?.replace('客户: ', '') ?? recording.account_id;
      runCILIngest({
        orgId: ctx.orgId,
        accountId: recording.account_id,
        accountName,
        sourceId: recordingId,
        sourceType: 'call_transcript',
        rawText: transcript.fullText,
        context: contextParts.join('\n'),
        occurredAt: recording.created_at ?? new Date().toISOString(),
      }).catch((err) => console.error('[transcribe] CIL ingest failed (non-blocking):', err));
    }

    return Response.json({
      id: recordingId,
      status: decodeStatus,
      transcript,
      decodeResult,
    });
  } catch (err) {
    console.error("[transcribe] Unexpected error:", err);

    // Try to update status to error
    try {
      const supabase = requireAdmin();
      const body = await request.clone().json().catch(() => ({})) as { recordingId?: string };
      if (body.recordingId) {
        await supabase
          .from("meeting_recordings")
          .update({
            status: "error",
            error_message: err instanceof Error ? err.message : "未知错误",
            updated_at: new Date().toISOString(),
          })
          .eq("id", body.recordingId);
      }
    } catch {
      // ignore cleanup errors
    }

    return guardResponse(err);
  }
}

// ─── Types ─────────────────────────────────────────────────────────────

interface TranscriptSegment {
  speaker: string;
  speakerLabel?: string;
  startTime: number;
  endTime: number;
  text: string;
}

interface TranscriptData {
  segments: TranscriptSegment[];
  fullText: string;
  speakerCount: number;
  totalDuration: number;
}

interface MeetingDecodeResult {
  meetingSummary: string;
  keyDecisions: string[];
  actionItems: { title: string; owner: string; deadline: string }[];
  salesSignals: {
    sentimentTrend: string;
    riskLevel: string;
    buyerState: string;
    keySignal: string;
  };
  nextSteps: string[];
  concerns: string[];
  opportunities: string[];
}

// ─── Paraformer Integration ─────────────────────────────────────────

async function callParaformer(audioUrl: string): Promise<TranscriptData> {
  const apiKey = process.env.DASHSCOPE_API_KEY || process.env.AI_API_KEY;
  const endpoint = "https://dashscope-intl.aliyuncs.com/api/v1/services/audio/asr/transcription";

  // Step 1: Submit transcription job
  const submitRes = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "paraformer-v2",
      input: {
        file_urls: [audioUrl],
      },
      parameters: {
        diarization_enabled: true,
        speaker_count: 0,
        language_hints: ["zh"],
      },
    }),
  });

  if (!submitRes.ok) {
    const errText = await submitRes.text();
    throw new Error(`Paraformer submit failed (${submitRes.status}): ${errText}`);
  }

  const submitData = (await submitRes.json()) as ParaformerSubmitResponse;
  const taskId = submitData.output?.task_id;

  if (!taskId) {
    throw new Error("Paraformer did not return task_id");
  }

  // Step 2: Poll for results (max 5 minutes)
  const pollUrl = `${endpoint}/${taskId}`;
  const maxAttempts = 60; // 60 * 5s = 5 min
  const pollInterval = 5000;

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, pollInterval));

    const pollRes = await fetch(pollUrl, {
      headers: {
        "Authorization": `Bearer ${apiKey}`,
      },
    });

    if (!pollRes.ok) continue;

    const pollData = (await pollRes.json()) as ParaformerPollResponse;
    const status = pollData.output?.task_status;

    if (status === "SUCCEEDED") {
      return parseParaformerResult(pollData);
    }

    if (status === "FAILED") {
      throw new Error(
        `Paraformer task failed: ${pollData.output?.message || "unknown error"}`
      );
    }

    // RUNNING or PENDING — continue polling
  }

  throw new Error("Paraformer transcription timed out");
}

interface ParaformerSubmitResponse {
  output?: {
    task_id?: string;
    task_status?: string;
  };
}

interface ParaformerPollResponse {
  output?: {
    task_status?: string;
    message?: string;
    results?: Array<{
      transcription_url?: string;
    }>;
  };
}

interface ParaformerTranscript {
  transcripts?: Array<{
    sentences?: Array<{
      text: string;
      begin_time: number;
      end_time: number;
      speaker_id?: string;
    }>;
  }>;
}

async function parseParaformerResult(
  pollData: ParaformerPollResponse
): Promise<TranscriptData> {
  const results = pollData.output?.results;
  if (!results || results.length === 0) {
    return { segments: [], fullText: "", speakerCount: 0, totalDuration: 0 };
  }

  const transcriptionUrl = results[0].transcription_url;
  if (!transcriptionUrl) {
    return { segments: [], fullText: "", speakerCount: 0, totalDuration: 0 };
  }

  // Fetch the actual transcript JSON
  const transcriptRes = await fetch(transcriptionUrl);
  const transcriptData = (await transcriptRes.json()) as ParaformerTranscript;

  const sentences = transcriptData.transcripts?.[0]?.sentences ?? [];
  const speakers = new Set<string>();

  const segments: TranscriptSegment[] = sentences.map((s) => {
    const speaker = s.speaker_id || "Speaker_0";
    speakers.add(speaker);
    return {
      speaker,
      startTime: s.begin_time / 1000,
      endTime: s.end_time / 1000,
      text: s.text,
    };
  });

  const fullText = segments.map((s) => `[${s.speaker}]: ${s.text}`).join("\n");
  const totalDuration = segments.length > 0
    ? segments[segments.length - 1].endTime
    : 0;

  return {
    segments,
    fullText,
    speakerCount: speakers.size,
    totalDuration,
  };
}
