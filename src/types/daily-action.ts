export interface DailyAction {
  type: 'follow_up' | 'verify_assumption' | 'risk_alert' | 'relationship_alert' | 'intel_review' | 'task' | 'play_stalled';
  priority: number;
  title: string;
  description: string;
  relatedOpportunityId?: string;
  relatedContactId?: string;
  relatedAccountId?: string;
  dueDate?: string;
  suggestedAction: string;
  entityHref: string;
}
