// Neutral form presets authored for Community. Never import proprietary play-templates.ts.
export const BASIC_TEMPLATES = [
  {id:'follow-up',name:'客户跟进',goalDescription:'完成本次客户跟进',successCriteria:'记录客户反馈与下一步安排',title:'联系客户',description:'填写本次跟进事项'},
  {id:'meeting',name:'会议安排',goalDescription:'完成一次客户会议',successCriteria:'确认参会人员和时间并记录会议纪要',title:'安排会议',description:'填写议题和时间'},
] as const;
