"use client";

import { useState } from "react";
import { X, Loader2, Zap } from "lucide-react";
import type { LinkedInResearchResult } from "@/types/linkedin-research";
import { useStore } from "@/lib/store";
import { useLocale } from "@/lib/i18n";
import type { Contact, ContactRole, DecisionStyle, RiskAppetite } from "@/lib/babel-engine/types";
import {
  CONTACT_ROLES,
  DECISION_STYLES,
  RISK_APPETITES,
  inputFieldClass,
  selectFieldClass,
} from "./shared";

// 邮箱格式验证
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ContactForm({
  accountId,
  onClose,
  contacts,
}: {
  accountId: string;
  onClose: () => void;
  contacts: Contact[];
}) {
 const { addContact, updateContact, accounts } = useStore();
 const { locale } = useLocale();
  const en = locale === 'en';
  const t = (zh: string, english: string) => (en ? english : zh);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [phone, setPhone] = useState("");
  const [title, setTitle] = useState("");
  const [role, setRole] = useState<ContactRole>("contact");
  const [reportsTo, setReportsTo] = useState("");
  const [department, setDepartment] = useState("");
  const [decisionStyle, setDecisionStyle] = useState<DecisionStyle | "">("");
  const [riskAppetite, setRiskAppetite] = useState<RiskAppetite | "">("");
  const [communicationNotes, setCommunicationNotes] = useState("");
  const [landmines, setLandmines] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [wechat, setWechat] = useState("");
  const [autoFilling, setAutoFilling] = useState(false);
  const [autoFillError, setAutoFillError] = useState<string | null>(null);

  async function handleAutoFill() {
    if (!linkedin.trim()) return;
    setAutoFilling(true);
    setAutoFillError(null);
    try {
      const url = linkedin.startsWith("http")
        ? linkedin
        : `https://linkedin.com/in/${linkedin}`;
      const res = await fetch("/api/linkedin-research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkedinUrl: url, outputLocale: locale }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? t('自动填充失败', 'Auto-fill failed'));
      }
      const result: LinkedInResearchResult = await res.json();
      if (result.person.name && !name) setName(result.person.name);
      if (result.person.headline && !title) setTitle(result.person.headline);
    } catch (err) {
      setAutoFillError(err instanceof Error ? err.message : t('自动填充失败', 'Auto-fill failed'));
    } finally {
      setAutoFilling(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    // 邮箱格式校验
    if (email.trim() && !EMAIL_REGEX.test(email.trim())) {
      setEmailError(t('请输入有效的邮箱地址', 'Enter a valid email address'));
      return;
    }

    const contactId = addContact(accountId, {
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim() || undefined,
      title: title.trim() || undefined,
      role,
      reportsTo: reportsTo || undefined,
      department: department.trim() || undefined,
      decisionStyle: decisionStyle || undefined,
      riskAppetite: riskAppetite || undefined,
      communicationNotes: communicationNotes.trim() || undefined,
      landmines: landmines.trim() || undefined,
      linkedin: linkedin.trim() || undefined,
      wechat: wechat.trim() || undefined,
    });

    // 异步生成初始画像（不阻塞关闭）
    const account = accounts.find((a) => a.id === accountId);
    fetch('/api/contact-profile/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contactId,
        name: name.trim(),
        title: title.trim() || undefined,
        role: role || undefined,
        department: department.trim() || undefined,
        email: email.trim() || undefined,
        linkedin: linkedin.trim() || undefined,
        accountName: account?.name,
        accountIndustry: account?.industry,
        outputLocale: locale,
      }),
    })
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (data?.profile) {
          updateContact(accountId, contactId, { contactProfile: data.profile });
        }
      })
      .catch(() => { /* 静默失败，不影响用户体验 */ });

    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop" onClick={onClose}>
      <div className="mx-3 sm:mx-0 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-card p-6" style={{ boxShadow: 'var(--shadow-floating)' }} onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">{t('添加联系人', 'Add contact')}</h2>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-secondary hover:bg-background hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="form-label">{t('姓名 *', 'Name *')}</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('例如：王明', 'Example: Sarah Johnson')} className={inputFieldClass} autoFocus />
            </div>
            <div>
              <label className="form-label">{t('职位', 'Title')}</label>
              <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例如：VP of Engineering" className={inputFieldClass} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="form-label">{t('邮箱', 'Email')}</label>
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setEmailError(""); }}
                placeholder="example-4d17eef43c@example.invalid"
                className={`${inputFieldClass} ${emailError ? "border-danger" : ""}`}
              />
              {emailError && <p className="text-xs text-danger mt-1">{emailError}</p>}
            </div>
            <div>
              <label className="form-label">{t('电话', 'Phone')}</label>
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t('+86 138...', '+1 415...')} className={inputFieldClass} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="form-label">🔗 LinkedIn</label>
              <div className="flex gap-1.5">
                <input type="text" value={linkedin} onChange={(e) => { setLinkedin(e.target.value); setAutoFillError(null); }} placeholder={t('LinkedIn 链接或用户名', 'LinkedIn URL or username')} className={`${inputFieldClass} flex-1`} />
                <button
                  type="button"
                  onClick={handleAutoFill}
                  disabled={!linkedin.trim() || autoFilling}
                  className="flex-shrink-0 flex items-center gap-1 rounded-lg bg-[#0A66C2] px-2 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#004182] disabled:opacity-40 disabled:pointer-events-none"
                  title={t('从 LinkedIn 自动填充姓名和职位', 'Auto-fill name and title from LinkedIn')}
                >
                  {autoFilling ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
                </button>
              </div>
              {autoFillError && <p className="text-xs text-danger mt-1">{autoFillError}</p>}
            </div>
            <div>
              <label className="form-label">{t('微信', 'WeChat')}</label>
              <input type="text" value={wechat} onChange={(e) => setWechat(e.target.value)} placeholder={t('微信号', 'WeChat ID')} className={inputFieldClass} />
            </div>
          </div>

          <div>
            <label className="form-label">{t('角色', 'Role')}</label>
            <select value={role} onChange={(e) => setRole(e.target.value as ContactRole)} className={selectFieldClass}>
              {CONTACT_ROLES.map((r) => (
                <option key={r.value} value={r.value}>{en ? r.value.split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ') : r.label}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="form-label">{t('汇报给', 'Reports to')}</label>
              <select value={reportsTo} onChange={(e) => setReportsTo(e.target.value)} className={selectFieldClass}>
                <option value="">{t('无', 'None')}</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}{c.title ? ` (${c.title})` : ""}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="form-label">{t('部门', 'Department')}</label>
              <input type="text" value={department} onChange={(e) => setDepartment(e.target.value)} placeholder={t('例如：工程部', 'Example: Security Operations')} className={inputFieldClass} />
            </div>
          </div>

          {/* Psychological Profile */}
          <div className="border-t border-border pt-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">{t('心理画像（可选）', 'Stakeholder Profile (optional)')}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="form-label">{t('决策风格', 'Decision style')}</label>
                <select value={decisionStyle} onChange={(e) => setDecisionStyle(e.target.value as DecisionStyle | "")} className={selectFieldClass}>
                  <option value="">{t('未知', 'Unknown')}</option>
                  {DECISION_STYLES.map((s) => (
                    <option key={s.value} value={s.value}>{en ? s.value.charAt(0).toUpperCase() + s.value.slice(1) : s.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="form-label">{t('风险偏好', 'Risk appetite')}</label>
                <select value={riskAppetite} onChange={(e) => setRiskAppetite(e.target.value as RiskAppetite | "")} className={selectFieldClass}>
                  <option value="">{t('未知', 'Unknown')}</option>
                  {RISK_APPETITES.map((r) => (
                    <option key={r.value} value={r.value}>{en ? r.value.charAt(0).toUpperCase() + r.value.slice(1) : r.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-3">
              <label className="form-label">{t('沟通偏好', 'Communication preferences')}</label>
              <input type="text" value={communicationNotes} onChange={(e) => setCommunicationNotes(e.target.value)} placeholder={t('例如：偏好邮件沟通，不喜欢电话', 'Example: prefers email and dislikes cold calls')} className={inputFieldClass} />
            </div>
            <div className="mt-3">
              <label className="form-label">{t('注意事项 / 地雷', 'Cautions / landmines')}</label>
              <input type="text" value={landmines} onChange={(e) => setLandmines(e.target.value)} placeholder={t('例如：不要提竞品A的名字', 'Example: avoid mentioning a specific competitor')} className={inputFieldClass} />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-border bg-card px-4 py-3 text-sm font-medium text-muted transition-colors hover:bg-card hover:text-foreground">
              {t('取消', 'Cancel')}
            </button>
            <button type="submit" disabled={!name.trim()} className="rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-accent-hover disabled:opacity-40">
              {t('添加', 'Add')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
