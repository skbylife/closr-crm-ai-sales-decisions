/**
 * 邮件解读自动化 pipeline
 * 解读完成后自动：AI 提取联系人完整信息 → 创建/关联联系人 → 生成心理画像 → LinkedIn调研
 */

import type { DecodeOutput } from "@/lib/babel-engine/types";
import { useStore } from "@/lib/store";

export type StepStatus = "pending" | "running" | "done" | "error";

export interface PipelineStep {
  key: string;
  label: string;
  status: StepStatus;
  detail?: string;
  error?: string;
}

export interface ExtractedContact {
  name: string;
  email?: string;
  phone?: string;
  title?: string;
  company?: string;
  address?: string;
  linkedin?: string;
  role?: string;
}

export interface PipelineProgress {
  steps: PipelineStep[];
  contactId?: string;
  extractedContacts?: ExtractedContact[];
}

interface PipelineParams {
  decodeResult: DecodeOutput;
  emailText: string;
  senderEmail?: string;
  senderName?: string;
  accountId: string;
  onProgress: (progress: PipelineProgress) => void;
}

/**
 * 用 AI 从邮件内容中提取所有联系人的完整信息
 * 包括：姓名、邮箱、电话、职位、公司、地址、LinkedIn
 */
async function aiExtractContacts(
  emailText: string,
  senderEmail?: string,
  senderName?: string
): Promise<ExtractedContact[]> {
  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [
          {
            role: "system",
            content: `你是一个联系人信息提取专家。从邮件内容中提取所有提到的**人**的完整信息。

重要规则：
- 只提取人物（自然人），不要提取公司名、组织名、部门名
- 每个联系人必须是一个具体的人，有姓名
- **name 必须使用邮件中出现的真实姓名**（如中文名"刘总辉"、英文名"John Smith"、日文名"田中太郎"），不要用邮箱用户名（如"liminghui"）。优先从邮件签名区或正文中提取真实姓名
- 如果邮件中提到公司名（如 Kohl's, Walmart, Google），不要把它当成联系人
- 如果邮件有签名区（如"此致\n刘总辉\n平台云基础设施..."），从签名中提取发件人的中文名

返回 JSON 数组格式，每个联系人包含以下字段（有则填，无则省略）：
- name: 人物真实姓名（优先使用邮件中出现的全名，如中文名"刘总辉"、英文名"John Smith"，不要用拼音或邮箱用户名）
- email: 邮箱
- phone: 电话号码
- title: 职位/头衔
- company: 所在公司名称
- address: 地址
- linkedin: LinkedIn URL
- role: 在交易中的角色（如 decision_maker, champion, blocker, influencer, user, technical）

角色规则：
- **只有邮件里有明确证据**（职位、措辞、审批权、决策动作）时才填写 role
- 如果无法确定，**不要猜，不要默认填 decision_maker**
- 不确定时直接省略 role 字段

只返回 JSON 数组，不要其他文字。如果没有联系人信息，返回 []。`,
          },
          {
            role: "user",
            content: `发件人: ${senderName || "未知"} <${senderEmail || "未知"}>

邮件内容:
${emailText}

请提取所有联系人信息（包括发件人和邮件中提到的其他人）。`,
          },
        ],
        context: {},
      }),
    });

    if (!res.ok) return fallbackExtract(emailText, senderEmail, senderName);

    const data = await res.json();
    const content = data.response || data.message || "";
    
    // 从响应中提取 JSON 数组
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return fallbackExtract(emailText, senderEmail, senderName);

    const contacts: ExtractedContact[] = JSON.parse(jsonMatch[0]);
    // 过滤掉公司名（没有邮箱且名字看起来像公司的）
    return contacts.filter((c: ExtractedContact) => {
      if (!c.name && !c.email) return false;
      // 如果没有邮箱且没有姓名特征（如包含空格的西方名），可能是公司名
      if (!c.email && c.name && !c.name.includes(' ') && !c.name.includes('.') && c.name.length > 10) return false;
      return true;
    });
  } catch {
    return fallbackExtract(emailText, senderEmail, senderName);
  }
}

/** 正则 fallback：从邮件中提取基本信息 */
function fallbackExtract(
  emailText: string,
  senderEmail?: string,
  senderName?: string
): ExtractedContact[] {
  const contacts: ExtractedContact[] = [];

  // 发件人
  if (senderName || senderEmail) {
    contacts.push({
      name: senderName || (senderEmail?.split("@")[0].replace(/[._-]/g, " ").split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")) || "",
      email: senderEmail,
    });
  }

  // 提取邮件中的其他邮箱，并尝试从上下文中找到中文名
  const emailRegex = /[\w.+-]+@[\w.-]+\.\w{2,}/g;
  const emails = new Set(emailText.match(emailRegex) || []);

  // 从邮件签名/正文中提取中文名与邮箱的对应关系
  const chineseNameMap = new Map<string, string>();
  // 匹配 "姓名 <email>" 或 "姓名 email" 格式
  const nameEmailPairs = emailText.matchAll(/(?:(?:发件人|From|抄送|Cc|收件人|To)[：:]?\s*)?([^\s<,;@]{2,4})\s*[<（(]?([\w.+-]+@[\w.-]+\.\w{2,})[>）)]?/g);
  for (const m of nameEmailPairs) {
    const possibleName = m[1].trim();
    const email = m[2];
    // 只接受包含中文字符的名字
    if (/[\u4e00-\u9fff]/.test(possibleName) && possibleName.length >= 2 && possibleName.length <= 4) {
      chineseNameMap.set(email, possibleName);
    }
  }
  // 也匹配邮件签名中常见的格式："刘总辉\n平台云基础设施..."
  const signatureNames = emailText.matchAll(/\n([\u4e00-\u9fff]{2,4})\n(?:[\u4e00-\u9fff]|华为|软通|阿里|腾讯|百度|字节|中移动|招行|某头部新能源汽车集团|某国家级能源集团|平安|某大型智能制造集团|某城市服务集团|中国|电信)/g);
  for (const m of signatureNames) {
    // 尝试和附近的邮箱关联
    if (!chineseNameMap.has(senderEmail || '') && senderEmail) {
      chineseNameMap.set(senderEmail, m[1]);
    }
  }

  // 更新发件人名字（如果从邮件中找到了中文名）
  if (contacts.length > 0 && senderEmail && chineseNameMap.has(senderEmail) && !senderName) {
    contacts[0].name = chineseNameMap.get(senderEmail)!;
  }

  emails.forEach((email) => {
    if (email !== senderEmail && !contacts.find((c) => c.email === email)) {
      const chineseName = chineseNameMap.get(email);
      // Format fallback: john.smith → John Smith, liminghui → Liminghui
      const fallbackName = email.split("@")[0].replace(/[._-]/g, " ").split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
      contacts.push({ name: chineseName || fallbackName, email });
    }
  });

  // 提取电话号码
  const phoneRegex = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3,4}[-.\s]?\d{4}/g;
  const phones = emailText.match(phoneRegex) || [];
  if (phones.length > 0 && contacts.length > 0) {
    contacts[0].phone = phones[0];
  }

  return contacts;
}

export async function runAutoPipeline({
  emailText,
  senderEmail,
  senderName,
  accountId,
  onProgress,
}: PipelineParams): Promise<PipelineProgress> {
  const steps: PipelineStep[] = [
    { key: "decode", label: "邮件已解读", status: "done" },
    { key: "extract", label: "联系人信息提取", status: "pending" },
    { key: "contact", label: "联系人添加/更新", status: "pending" },
    { key: "profile", label: "心理画像分析", status: "pending" },
    { key: "linkedin", label: "LinkedIn 调研", status: "pending" },
  ];

  const progress: PipelineProgress = { steps, extractedContacts: [] };
  const notify = () => onProgress({ ...progress, steps: steps.map((s) => ({ ...s })) });
  notify();

  const updateStep = (key: string, status: StepStatus, detail?: string, error?: string) => {
    const step = steps.find((s) => s.key === key)!;
    step.status = status;
    if (detail) step.detail = detail;
    if (error) step.error = error;
    notify();
  };

  // ── Step 1: AI 提取联系人完整信息 ──
  updateStep("extract", "running", "AI 正在分析邮件内容...");

  let extracted: ExtractedContact[] = [];
  try {
    extracted = await aiExtractContacts(emailText, senderEmail, senderName);
    progress.extractedContacts = extracted;

    // 过滤掉自己公司的人 + 与客户名匹配的（AI 可能把公司名当联系人）
    const store = useStore.getState();
    const accountObj = store.accounts.find((a) => a.id === accountId);
    const accountName = accountObj?.name?.toLowerCase() || "";
    
    // 获取发件人的邮箱域名（自己公司的域名）
    const senderDomain = senderEmail?.split("@")[1]?.toLowerCase() || "";
    // 获取客户的邮箱域名（从客户网站或已有联系人推断）
    const accountWebsite = accountObj?.website?.replace(/^https?:\/\/(www\.)?/, "").split("/")[0]?.toLowerCase() || "";
    const existingContactDomains = new Set(
      (accountObj?.contacts || [])
        .map((c) => c.email?.split("@")[1]?.toLowerCase())
        .filter(Boolean)
    );

    extracted = extracted.filter((c) => {
      const name = (c.name || "").toLowerCase().trim();
      const email = (c.email || "").toLowerCase();
      const domain = email.split("@")[1] || "";
      
      // 排除与客户名完全匹配或高度相似的
      if (name === accountName) return false;
      if (accountName && name.includes(accountName)) return false;
      if (accountName && accountName.includes(name) && name.length > 2) return false;
      
      // 排除自己公司域名的人（发件人同域 = 自己人）
      if (senderDomain && domain === senderDomain) return false;
      
      // 只保留客户域名的联系人（如果能识别客户域名的话）
      if (accountWebsite && domain && domain !== accountWebsite) {
        // 如果有已知的客户联系人域名，用它来判断
        if (existingContactDomains.size > 0 && !existingContactDomains.has(domain)) return false;
      }
      
      return true;
    });

    if (extracted.length === 0) {
      updateStep("extract", "done", "未识别到联系人");
      updateStep("contact", "done", "跳过");
      updateStep("profile", "done", "跳过");
      updateStep("linkedin", "done", "跳过");
      return progress;
    }

    const names = extracted.map((c) => c.name || c.email || "").join(", ");
    updateStep("extract", "done", `识别到 ${extracted.length} 位联系人: ${names}`);
  } catch (err) {
    updateStep("extract", "error", undefined, err instanceof Error ? err.message : "提取失败");
    updateStep("contact", "error", undefined, "缺少联系人信息");
    updateStep("profile", "error", undefined, "缺少联系人信息");
    updateStep("linkedin", "error", undefined, "缺少联系人信息");
    return progress;
  }

  // ── Step 2: 添加/更新联系人 ──
  updateStep("contact", "running", `正在处理 ${extracted.length} 位联系人...`);

  let primaryContactId: string | undefined;
  try {
    const store = useStore.getState();
    let account = store.accounts.find((a) => a.id === accountId);
    let addedCount = 0;
    let updatedCount = 0;
    const seenKeys = new Set<string>();

    for (const ext of extracted) {
      const normalizedEmail = ext.email?.toLowerCase().trim();
      const normalizedName = ext.name?.toLowerCase().trim();
      const dedupeKey = normalizedEmail || normalizedName || JSON.stringify(ext);
      if (seenKeys.has(dedupeKey)) continue;
      seenKeys.add(dedupeKey);

      account = useStore.getState().accounts.find((a) => a.id === accountId);
      const existing = account?.contacts.find(
        (c) =>
          (normalizedEmail && c.email?.toLowerCase() === normalizedEmail) ||
          (normalizedName && c.name?.toLowerCase() === normalizedName)
      );

      const safeRole = ext.role && ext.role !== 'decision_maker'
        ? (ext.role as import('@/lib/babel-engine/types').ContactRole)
        : undefined;

      if (existing) {
        // 更新已有联系人的缺失信息
        const updates: Record<string, string | undefined> = {};
        if (ext.phone && !existing.phone) updates.phone = ext.phone;
        if (ext.title && !existing.title) updates.title = ext.title;
        if (ext.linkedin && !existing.linkedin) updates.linkedin = ext.linkedin;
        if (safeRole && !existing.role) updates.role = safeRole;
        if (Object.keys(updates).length > 0) {
          store.updateContact(accountId, existing.id, updates);
          updatedCount++;
        }
        if (!primaryContactId) primaryContactId = existing.id;
      } else {
        // 创建新联系人
        const newId = store.addContact(accountId, {
          name: ext.name || (ext.email ? ext.email.split("@")[0] : "未知"),
          email: ext.email || "",
          phone: ext.phone,
          title: ext.title,
          linkedin: ext.linkedin,
          role: safeRole,
          createdAt: new Date().toISOString(),
        });
        if (!primaryContactId) primaryContactId = newId;
        addedCount++;
      }
    }

    progress.contactId = primaryContactId;
    const parts: string[] = [];
    if (addedCount > 0) parts.push(`新增 ${addedCount} 位`);
    if (updatedCount > 0) parts.push(`更新 ${updatedCount} 位`);
    updateStep("contact", "done", parts.join(", ") || "已处理");
  } catch (err) {
    updateStep("contact", "error", undefined, err instanceof Error ? err.message : "添加失败");
  }

  // ── Steps 3-5: 并行执行心理画像 + LinkedIn + 公司情报 ──
  const primaryContact = extracted[0];

  // Step 3: 生成心理画像
  updateStep("profile", "running", "AI 正在分析沟通风格...");
  const profileTask = (async () => {
    try {
      const store = useStore.getState();
      const account = store.accounts.find((a) => a.id === accountId);
      const existingContact = primaryContactId
        ? account?.contacts.find((c) => c.id === primaryContactId)
        : undefined;
      const previousProfile = existingContact?.contactProfile ?? undefined;

      const res = await fetch("/api/contact-profile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-company-domain": useStore.getState().userSettings.companyDomain || "",
        },
        body: JSON.stringify({
          contact: {
            name: primaryContact.name,
            email: primaryContact.email,
            title: primaryContact.title,
            role: primaryContact.role,
          },
          communicationRecords: emailText,
          ...(previousProfile ? { previousProfile } : {}),
        }),
      });

      if (res.ok && primaryContactId) {
        const profileData = await res.json();
        const store = useStore.getState();
        store.updateContact(accountId, primaryContactId, {
          contactProfile: profileData,
        });
        const style = profileData.decisionStyle?.type || "未知";
        updateStep("profile", "done", `决策风格: ${style}`);
      } else {
        updateStep("profile", "error", undefined, "画像生成失败");
      }
    } catch (err) {
      updateStep("profile", "error", undefined, err instanceof Error ? err.message : "网络错误");
    }
  })();

  // Step 4: LinkedIn 调研
  updateStep("linkedin", "running", "正在搜索 LinkedIn 信息...");
  const linkedinTask = (async () => {
    try {
      if (!primaryContact.linkedin && !primaryContact.name) {
        updateStep("linkedin", "done", "无 LinkedIn 信息可用");
      } else {
        const res = await fetch("/api/linkedin-research", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-company-domain": useStore.getState().userSettings.companyDomain || "",
          },
          body: JSON.stringify({
            linkedinUrl: primaryContact.linkedin,
            name: primaryContact.name,
            company: primaryContact.company,
            outputLocale: useStore.getState().userSettings.locale,
          }),
        });

        if (res.ok) {
          updateStep("linkedin", "done", "LinkedIn 信息已收集");
        } else {
          updateStep("linkedin", "done", "未找到 LinkedIn 信息");
        }
      }
    } catch {
      updateStep("linkedin", "done", "LinkedIn 调研跳过");
    }
  })();

  // 等 profile + linkedin 完成
  await Promise.allSettled([profileTask, linkedinTask]);

  return progress;
}
