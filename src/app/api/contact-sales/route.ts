import { NextResponse } from 'next/server';
import { checkRateLimit, rateLimitHeaders } from '@/lib/rate-limit';

const SALES_EMAIL = 'example-60500184b7@example.invalid';
const MAX_FIELD_LENGTH = 2_000;

function normalizeText(value: unknown, maxLength = MAX_FIELD_LENGTH) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function normalizeEmail(value: unknown) {
  return normalizeText(value, 320).toLowerCase();
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function clientKey(request: Request, email: string) {
  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const realIp = request.headers.get('x-real-ip')?.trim();
  return `contact-sales:${forwardedFor || realIp || 'unknown'}:${email || 'anonymous'}`;
}

async function sendWithResend(params: {
  key: string;
  to: string;
  replyTo: string;
  subject: string;
  html: string;
}) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${params.key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Closr <example-d4b1c9e1e2@example.invalid>',
      to: [params.to],
      reply_to: params.replyTo,
      subject: params.subject,
      html: params.html,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`Resend ${res.status}: ${errBody}`);
  }
}

async function sendWithAgentMail(params: {
  key: string;
  inboxId: string;
  to: string;
  subject: string;
  text: string;
  html: string;
}) {
  const res = await fetch(
    `https://api.agentmail.to/v0/inboxes/${encodeURIComponent(params.inboxId)}/messages/send`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${params.key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: [params.to],
        subject: params.subject,
        text: params.text,
        html: params.html,
      }),
    },
  );

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`AgentMail ${res.status}: ${errBody}`);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({})) as {
      fullName?: unknown;
      email?: unknown;
      company?: unknown;
      phone?: unknown;
      message?: unknown;
      locale?: unknown;
    };

    const fullName = normalizeText(body.fullName, 160);
    const email = normalizeEmail(body.email);
    const company = normalizeText(body.company, 200);
    const phone = normalizeText(body.phone, 80);
    const message = normalizeText(body.message);
    const locale = normalizeText(body.locale, 16);

    const rateLimit = checkRateLimit(clientKey(request, email), 'default');
    if (rateLimit.limited) {
      return NextResponse.json(
        { error: locale === 'en' ? 'Too many requests. Please try again later.' : '请求过于频繁，请稍后重试' },
        { status: 429, headers: rateLimitHeaders(rateLimit) },
      );
    }

    if (!fullName) {
      return NextResponse.json({ error: locale === 'en' ? 'Name is required' : '请输入姓名' }, { status: 400 });
    }
    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: locale === 'en' ? 'Valid email is required' : '请输入有效邮箱' }, { status: 400 });
    }
    if (!company) {
      return NextResponse.json({ error: locale === 'en' ? 'Company is required' : '请输入公司' }, { status: 400 });
    }

    const submittedAt = new Date().toISOString();
    const subject = `Closr 销售联系请求 - ${fullName} / ${company}`;
    const text = [
      'Closr 销售联系请求',
      `姓名: ${fullName}`,
      `邮箱: ${email}`,
      `公司: ${company}`,
      `电话: ${phone || '-'}`,
      `语言: ${locale || 'zh'}`,
      `提交时间: ${submittedAt}`,
      '',
      message || '无补充说明',
    ].join('\n');
    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 20px;">
        <h2 style="color: #111827; font-size: 20px; margin: 0 0 16px;">Closr 销售联系请求</h2>
        <table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #374151;">
          <tr><td style="padding: 8px 0; color: #6b7280;">姓名</td><td style="padding: 8px 0; font-weight: 600;">${escapeHtml(fullName)}</td></tr>
          <tr><td style="padding: 8px 0; color: #6b7280;">邮箱</td><td style="padding: 8px 0;"><a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></td></tr>
          <tr><td style="padding: 8px 0; color: #6b7280;">公司</td><td style="padding: 8px 0;">${escapeHtml(company)}</td></tr>
          <tr><td style="padding: 8px 0; color: #6b7280;">电话</td><td style="padding: 8px 0;">${escapeHtml(phone || '-')}</td></tr>
          <tr><td style="padding: 8px 0; color: #6b7280;">语言</td><td style="padding: 8px 0;">${escapeHtml(locale || 'zh')}</td></tr>
          <tr><td style="padding: 8px 0; color: #6b7280;">提交时间</td><td style="padding: 8px 0;">${escapeHtml(submittedAt)}</td></tr>
        </table>
        <div style="margin-top: 18px; padding: 14px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; color: #374151; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">${escapeHtml(message || '无补充说明')}</div>
      </div>
    `;

    try {
      if (process.env.AGENTMAIL_API_KEY && process.env.AGENTMAIL_INBOX) {
        await sendWithAgentMail({
          key: process.env.AGENTMAIL_API_KEY,
          inboxId: process.env.AGENTMAIL_INBOX,
          to: SALES_EMAIL,
          subject,
          text,
          html,
        });
      } else if (process.env.RESEND_API_KEY) {
        await sendWithResend({
          key: process.env.RESEND_API_KEY,
          to: SALES_EMAIL,
          replyTo: email,
          subject,
          html,
        });
      } else {
        console.error('[api/contact-sales] no outbound email provider configured');
        return NextResponse.json({ error: locale === 'en' ? 'Email service is not configured' : '邮件服务未配置' }, { status: 503 });
      }
    } catch (emailErr) {
      console.error('[api/contact-sales] email delivery failed:', emailErr instanceof Error ? emailErr.message : emailErr);
      return NextResponse.json({ error: locale === 'en' ? 'Email delivery failed' : '邮件发送失败' }, { status: 502 });
    }

    return NextResponse.json({ ok: true }, { headers: rateLimitHeaders(rateLimit) });
  } catch (e) {
    console.error('[api/contact-sales] POST failed:', e);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
