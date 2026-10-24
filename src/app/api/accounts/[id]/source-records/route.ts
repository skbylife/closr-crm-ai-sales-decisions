import { requireAuth, requireAccountAccess, requireAdmin, guardResponse } from '@/lib/api-guard';

function sourceTableLabel(value?: string | null) {
  const labels: Record<string, string> = {
    intel_items: '情报记录',
    email_decodes: '邮件解读',
    integration_emails: '邮件往来',
    meeting_preps: '会议纪要',
    meeting_recordings: '会议录音/通话记录',
    activity_logs: '活动记录',
    strategic_plays: '谋局建议',
    source_records: '来源记录',
    public_web: '公开网页',
    knowledge_base: '知识库',
  };
  return labels[value ?? ''] ?? value ?? '来源记录';
}

function tokenize(text: string) {
  return text
    .toLowerCase()
    .split(/[\s，。、“”‘’,.!?:：；\-_/()\[\]·]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function computeKnowledgeMatchScore(params: {
  sourceTitle: string;
  sourceSummary: string;
  knowledgeTitle: string;
  knowledgeContent: string;
}) {
  const { sourceTitle, sourceSummary, knowledgeTitle, knowledgeContent } = params;
  const sourceText = `${sourceTitle} ${sourceSummary}`.toLowerCase();
  const knowledgeText = `${knowledgeTitle} ${knowledgeContent}`.toLowerCase();
  const sourceTokens = tokenize(sourceText);
  const titleTokens = tokenize(sourceTitle);

  let score = 0;
  const matchedTerms: string[] = [];

  if (knowledgeTitle && sourceTitle && (knowledgeTitle.includes(sourceTitle) || sourceTitle.includes(knowledgeTitle))) {
    score += 5;
    matchedTerms.push('标题高度接近');
  }

  for (const token of sourceTokens) {
    if (knowledgeText.includes(token)) {
      score += titleTokens.includes(token) ? 2 : 1;
      if (matchedTerms.length < 3 && !matchedTerms.includes(token)) matchedTerms.push(token);
    }
  }

  return { score, matchedTerms };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth();
    const { id } = await params;
    await requireAccountAccess(ctx, id);
    const { searchParams } = new URL(request.url);
    const targetId = searchParams.get('targetId');

    if (!targetId) {
      return Response.json({ error: 'targetId is required' }, { status: 400 });
    }

    // Validate targetId format (UUID, short ID, or namespaced source_row_id) to prevent filter injection.
    if (!/^[a-zA-Z0-9_:-]+$/.test(targetId) || targetId.length > 64) {
      return Response.json({ error: 'Invalid targetId' }, { status: 400 });
    }

    const admin = requireAdmin();
    const { data, error } = await admin
      .from('source_records')
      .select('id, source_kind, source_table, source_row_id, title, summary, occurred_at, metadata, created_at')
      .eq('org_id', ctx.orgId)
      .eq('account_id', id)
      .or(`id.eq.${targetId},source_row_id.eq.${targetId}`)
      .order('occurred_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return Response.json({ item: null, matchedKnowledgeItem: null });
    }

    const sourceTitle = data.title ?? '来源记录';
    const sourceSummary = data.summary ?? '暂无摘要';

    let knowledgeItems: Array<{
      id: string;
      title: string | null;
      content: string | null;
      category: string | null;
      created_at: string | null;
      updated_at: string | null;
    }> = [];

    try {
      const scopedKnowledgeRes = await admin
        .from('knowledge_base')
        .select('id, title, content, category, created_at, updated_at')
        .eq('org_id', ctx.orgId)
        .eq('account_id', id)
        .order('updated_at', { ascending: false })
        .limit(80);

      if (scopedKnowledgeRes.error) {
        console.warn('[source-records] scoped knowledge_base unavailable:', scopedKnowledgeRes.error.message);
      } else {
        knowledgeItems = (scopedKnowledgeRes.data ?? []) as typeof knowledgeItems;
      }
    } catch (knowledgeErr) {
      console.warn('[source-records] knowledge_base lookup threw:', knowledgeErr);
    }

    const bestMatch = (knowledgeItems ?? [])
      .map((item) => {
        const match = computeKnowledgeMatchScore({
          sourceTitle,
          sourceSummary,
          knowledgeTitle: item.title ?? '',
          knowledgeContent: item.content ?? '',
        });
        return {
          item,
          score: match.score,
          matchedTerms: match.matchedTerms,
        };
      })
      .filter((entry) => entry.score >= 3)
      .sort((a, b) => b.score - a.score)[0];

    return Response.json({
      item: {
        id: data.id,
        sourceKind: data.source_kind,
        sourceTable: data.source_table,
        sourceTableLabel: sourceTableLabel(data.source_table),
        sourceRowId: data.source_row_id,
        title: sourceTitle,
        summary: sourceSummary,
        occurredAt: data.occurred_at ?? data.created_at,
        metadata: data.metadata ?? {},
      },
      matchedKnowledgeItem: bestMatch ? {
        id: bestMatch.item.id,
        title: bestMatch.item.title,
        content: bestMatch.item.content,
        category: bestMatch.item.category,
        createdAt: bestMatch.item.created_at,
        updatedAt: bestMatch.item.updated_at,
        score: bestMatch.score,
        matchedTerms: bestMatch.matchedTerms,
      } : null,
    });
  } catch (err) {
    return guardResponse(err);
  }
}
