'use client';

// MFA/2FA 两步验证管理组件
// 使用 Supabase Auth 内置 TOTP MFA 支持

import { useState, useEffect } from 'react';
import { Shield, ShieldCheck, ShieldOff, Loader2, Copy, Check } from 'lucide-react';
import { appConfirm } from '@/lib/confirm-store';
import { recordAuthAuditEvent } from '@/lib/auth-audit-client';
import { createClient } from '@/lib/supabase/client';

type MfaStatus = 'loading' | 'disabled' | 'enrolling' | 'verifying' | 'enabled';

export default function MfaSection() {
  const [status, setStatus] = useState<MfaStatus>('loading');
  const [qrCode, setQrCode] = useState(''); // SVG data URI
  const [secret, setSecret] = useState(''); // TOTP 密钥（手动输入用）
  const [factorId, setFactorId] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  async function checkMfaStatus() {
    try {
      const supabase = createClient();
      const { data, error: mfaError } = await supabase.auth.mfa.listFactors();
      if (mfaError) {
        console.error('[mfa] listFactors failed:', mfaError);
        setStatus('disabled');
        return;
      }
      // 查找已验证的 TOTP factor
      const verified = data?.totp?.find(f => f.status === 'verified');
      if (verified) {
        setFactorId(verified.id);
        setStatus('enabled');
      } else {
        setStatus('disabled');
      }
    } catch {
      setStatus('disabled');
    }
  }

  // 检查当前 MFA 状态
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      void checkMfaStatus();
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  // 开始注册 MFA
  async function handleEnroll() {
    setError('');
    setStatus('enrolling');
    try {
      const supabase = createClient();
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'Closr CRM',
      });
      if (enrollError) {
        setError(enrollError.message);
        setStatus('disabled');
        return;
      }
      setFactorId(data.id);
      // QR code URI 和密钥
      setQrCode(data.totp.qr_code);
      setSecret(data.totp.secret);
      setStatus('verifying');
    } catch {
      setError('注册失败，请稍后重试');
      setStatus('disabled');
    }
  }

  // 验证 TOTP 码完成注册
  async function handleVerify() {
    if (verifyCode.length !== 6) {
      setError('请输入 6 位验证码');
      return;
    }
    setError('');
    try {
      const supabase = createClient();
      const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId,
      });
      if (challengeError) {
        setError(challengeError.message);
        return;
      }
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challengeData.id,
        code: verifyCode,
      });
      if (verifyError) {
        setError('验证码错误，请重试');
        return;
      }
      await recordAuthAuditEvent('mfa_enabled', { metadata: { factorType: 'totp' } });
      setStatus('enabled');
      setVerifyCode('');
      setQrCode('');
      setSecret('');
    } catch {
      setError('验证失败，请稍后重试');
    }
  }

  // 禁用 MFA
  async function handleDisable() {
    if (!await appConfirm({ message: '确定要禁用两步验证吗？这会降低账户安全性。', variant: 'warning' })) return;
    setError('');
    try {
      const supabase = createClient();
      const { error: unenrollError } = await supabase.auth.mfa.unenroll({
        factorId,
      });
      if (unenrollError) {
        setError(unenrollError.message);
        return;
      }
      await recordAuthAuditEvent('mfa_disabled', { metadata: { factorType: 'totp' } });
      setStatus('disabled');
      setFactorId('');
    } catch {
      setError('禁用失败，请稍后重试');
    }
  }

  // 复制密钥到剪贴板
  async function handleCopySecret() {
    await navigator.clipboard.writeText(secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // 取消注册流程
  function handleCancel() {
    // 如果已经 enroll 了但没验证，需要 unenroll
    if (factorId) {
      const supabase = createClient();
      supabase.auth.mfa.unenroll({ factorId }).catch((err) => console.error('[mfa] 取消注册清理失败:', err));
    }
    setStatus('disabled');
    setQrCode('');
    setSecret('');
    setVerifyCode('');
    setError('');
    setFactorId('');
  }

  if (status === 'loading') {
    return (
      <div className="rounded-xl border border-border bg-card card-elevated p-5">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
          <Shield className="h-4 w-4 text-muted" />
          两步验证 (2FA)
        </h2>
        <div className="flex items-center gap-2 text-sm text-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          检查 MFA 状态...
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card card-elevated p-5">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
        <Shield className="h-4 w-4 text-muted" />
        两步验证 (2FA)
      </h2>

      {/* 错误提示 */}
      {error && (
        <div className="mb-3 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-xs text-danger">
          {error}
        </div>
      )}

      {/* 已启用状态 */}
      {status === 'enabled' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-lg border border-positive/20 bg-positive/5 px-3 py-2.5">
            <ShieldCheck className="h-4 w-4 text-positive" />
            <span className="text-sm font-medium text-positive">已启用两步验证</span>
          </div>
          <p className="text-xs text-muted">
            每次登录时需要输入 Authenticator App 中的验证码。
          </p>
          <button
            onClick={handleDisable}
            className="flex items-center gap-1.5 rounded-lg border border-danger/20 bg-danger/5 px-4 py-2 text-xs font-medium text-danger transition-colors hover:bg-danger/10"
          >
            <ShieldOff className="h-3.5 w-3.5" />
            禁用两步验证
          </button>
        </div>
      )}

      {/* 未启用状态 */}
      {status === 'disabled' && (
        <div className="space-y-3">
          <p className="text-xs text-muted">
            启用两步验证后，每次登录需要输入 Authenticator App 生成的动态验证码，大幅提升账户安全性。
          </p>
          <div className="rounded-lg border border-accent/20 bg-accent/5 px-3 py-2 text-xs text-secondary">
            Owner/Admin 账号在创建或接受邀请后，需要在这里完成两步验证启用。企业上线 gate 会检查高权限账号是否已完成 MFA。
          </div>
          <button
            onClick={handleEnroll}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-accent-hover"
          >
            <Shield className="h-3.5 w-3.5" />
            启用两步验证
          </button>
        </div>
      )}

      {/* 注册/验证流程 */}
      {status === 'verifying' && (
        <div className="space-y-4">
          <p className="text-xs text-muted">
            在验证器应用中添加账号：扫描二维码（如有），或手动输入下方密钥。
          </p>

          {/* QR Code */}
          {qrCode && (
            <div className="flex justify-center">
              <div className="rounded-lg border border-border bg-card p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrCode} alt="MFA QR Code" className="h-48 w-48" />
              </div>
            </div>
          )}

          {/* 手动输入密钥 */}
          {secret && (
            <div>
              <p className="mb-1 text-xs text-muted">无法扫码？手动输入密钥：</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-xs font-mono text-foreground select-all">
                  {secret}
                </code>
                <button
                  onClick={handleCopySecret}
                  className={`flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                    copied
                      ? 'bg-positive/10 text-positive border border-positive/20'
                      : 'bg-accent/10 text-accent border border-accent/20 hover:bg-accent/20'
                  }`}
                >
                  {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  {copied ? '已复制' : '复制'}
                </button>
              </div>
            </div>
          )}

          {/* 验证码输入 */}
          <div>
            <label className="form-label">输入 Authenticator App 中的 6 位验证码</label>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={verifyCode}
              onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              className="form-input text-center text-lg font-mono tracking-widest"
              autoFocus
            />
          </div>

          {/* 操作按钮 */}
          <div className="flex gap-2">
            <button
              onClick={handleVerify}
              disabled={verifyCode.length !== 6}
              className="flex items-center gap-1.5 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-accent-hover disabled:opacity-40"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              验证并启用
            </button>
            <button
              onClick={handleCancel}
              className="rounded-lg border border-border px-4 py-2.5 text-sm text-muted hover:bg-background"
            >
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
