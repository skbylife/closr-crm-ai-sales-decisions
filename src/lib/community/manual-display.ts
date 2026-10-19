// Projection of persisted user input only: no confidence, gaps, thesis or ranking inference.
export function manualPlayDisplay(row: Record<string, unknown>) {
  const text=(value:unknown)=>typeof value==='string'?value:'';
  return { id:text(row.id), accountId:text(row.account_id), opportunityId:text(row.opportunity_id), goalDescription:text(row.goal_description), successCriteria:text(row.success_criteria), status:text(row.status), createdAt:text(row.created_at), steps:Array.isArray(row.steps)?row.steps.map((value:unknown)=>{
    const step=value && typeof value==='object'?value as Record<string,unknown>:{};
    return {title:text(step.title),description:text(step.description),status:text(step.status)};
  }):[] };
}
