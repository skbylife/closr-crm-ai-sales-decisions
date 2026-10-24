import type { Account, DealHealth } from '@/lib/babel-engine/types';

export type AccountBasicsFormState = {
  name: string;
  industry: string;
  website: string;
  notes: string;
  dealStage: string;
  dealValue: string;
  dealHealth: DealHealth | '';
};

export function buildAccountBasicsUpdate(account: Account, form: AccountBasicsFormState): Partial<Account> {
  return {
    name: form.name.trim() || account.name,
    industry: form.industry.trim() || undefined,
    website: form.website.trim() || undefined,
    notes: form.notes.trim() || undefined,
    dealStage: form.dealStage || undefined,
    dealValue: form.dealValue ? Number(form.dealValue) : undefined,
    dealHealth: (form.dealHealth || undefined) as DealHealth | undefined,
  };
}
