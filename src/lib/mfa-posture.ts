export type MfaPostureStatus = 'pass' | 'fail' | 'exception' | 'unknown';

export interface PrivilegedMfaSubject {
  userId: string;
  email: string;
  role: 'owner' | 'admin';
  mfaEnabled: boolean;
  verifiedFactors: number;
  status: MfaPostureStatus;
}

interface AuthFactorLike {
  factor_type?: string | null;
  status?: string | null;
}

interface AuthUserLike {
  email?: string | null;
  factors?: AuthFactorLike[] | null;
}

export function countVerifiedMfaFactors(user: AuthUserLike | null | undefined): number {
  const factors = user?.factors ?? [];
  return factors.filter((factor) => {
    const status = factor.status?.toLowerCase();
    const type = factor.factor_type?.toLowerCase();
    return status === 'verified' && (!type || type === 'totp' || type === 'webauthn');
  }).length;
}

export function buildPrivilegedMfaStatus(params: {
  userId: string;
  email?: string | null;
  role: 'owner' | 'admin';
  user: AuthUserLike | null | undefined;
  hasException?: boolean;
}): PrivilegedMfaSubject {
  const verifiedFactors = countVerifiedMfaFactors(params.user);
  const mfaEnabled = verifiedFactors > 0;
  const status: MfaPostureStatus = mfaEnabled ? 'pass' : params.hasException ? 'exception' : 'fail';

  return {
    userId: params.userId,
    email: params.email ?? params.user?.email ?? '',
    role: params.role,
    mfaEnabled,
    verifiedFactors,
    status,
  };
}

export function summarizePrivilegedMfaPosture(subjects: PrivilegedMfaSubject[]) {
  const total = subjects.length;
  const enabled = subjects.filter((subject) => subject.status === 'pass').length;
  const exceptions = subjects.filter((subject) => subject.status === 'exception').length;
  const missing = subjects.filter((subject) => subject.status === 'fail').length;

  return {
    status: missing === 0 ? 'pass' : 'fail',
    total,
    enabled,
    exceptions,
    missing,
  } as const;
}
