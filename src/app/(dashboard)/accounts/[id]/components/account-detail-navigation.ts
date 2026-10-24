export const ACCOUNT_DETAIL_TAB_ITEMS = [
  { key: 'overview', label: '客户全景', labelEn: 'Overview' },
  { key: 'plays', label: '谋局', labelEn: 'Plays' },
  { key: 'contacts', label: '联系人', labelEn: 'Contacts' },
  { key: 'relationship', label: '关系智能', labelEn: 'Relationship Intel' },
  { key: 'team', label: '团队', labelEn: 'Team' },
  { key: 'activity', label: '动态', labelEn: 'Activity' },
  { key: 'tasks', label: '任务', labelEn: 'Tasks' },
  { key: 'collab', label: '协作', labelEn: 'Collaboration' },
  { key: 'knowledge', label: '知识库', labelEn: 'Knowledge' },
] as const;

export type AccountDetailTabKey = (typeof ACCOUNT_DETAIL_TAB_ITEMS)[number]['key'];

export function isAccountDetailTabKey(value: string | null | undefined): value is AccountDetailTabKey {
  return ACCOUNT_DETAIL_TAB_ITEMS.some((tab) => tab.key === value);
}

export function getAccountTeamDetailHref(accountId: string): string {
  return `/accounts/${encodeURIComponent(accountId)}?tab=team`;
}

export function getNextAccountEditIntent(currentTab: AccountDetailTabKey, isEditing: boolean): {
  nextTab: AccountDetailTabKey;
  nextEditing: boolean;
} {
  if (isEditing) {
    return { nextTab: currentTab, nextEditing: false };
  }

  return { nextTab: 'overview', nextEditing: true };
}
