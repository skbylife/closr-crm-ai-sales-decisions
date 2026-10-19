'use client';
import { useState } from 'react';
import { BASIC_TEMPLATES } from '@/lib/community/basic-templates';
// Compatible entry point for the existing account tab; no private types or engine helpers.
export function NewPlayForm(props: {
  contacts: {id:string;name:string}[]; accountId:string; accountName:string;
  opportunities:{id:string;name:string}[]; initialGoalType?:string;
  initialGoalDescription?:string; initialSuccessCriteria?:string;
  initialOpportunityId?:string; initialAdditionalContext?:string;
  onCreated:(id?:string)=>void; onCancel:()=>void;
}) {
  const [goal,setGoal]=useState(props.initialGoalDescription ?? '');
  const [criteria,setCriteria]=useState(props.initialSuccessCriteria ?? '');
  const [opportunity,setOpportunity]=useState(props.initialOpportunityId ?? '');
  const [title,setTitle]=useState(''); const [description,setDescription]=useState(props.initialAdditionalContext ?? '');
  const [saving,setSaving]=useState(false); const [error,setError]=useState('');
  const inputClass='w-full rounded border border-border bg-card p-2';
  async function save(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setError('');
    try {
      const response=await fetch('/api/strategic-play/manual',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({accountId:props.accountId,...(opportunity?{opportunityId:opportunity}:{}),goalDescription:goal,successCriteria:criteria,steps:[{title,description}]})});
      if(!response.ok) throw new Error('save_failed');
      const saved=await response.json(); props.onCreated(saved.id);
    } catch { setError('保存失败，请检查登录状态和客户访问权限后重试。'); }
    finally {setSaving(false);}
  }
  return <form onSubmit={save} className="space-y-3">
    <h3>新建手动计划 · {props.accountName}</h3>
    <label>基础模板<select className={inputClass} defaultValue="" onChange={event=>{const template=BASIC_TEMPLATES.find(item=>item.id===event.target.value);if(template){setGoal(template.goalDescription);setCriteria(template.successCriteria);setTitle(template.title);setDescription(template.description);}}}><option value="">自行填写</option>{BASIC_TEMPLATES.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    <label>目标<input required maxLength={4096} className={inputClass} value={goal} onChange={event=>setGoal(event.target.value)}/></label>
    <label>完成标准<input required maxLength={4096} className={inputClass} value={criteria} onChange={event=>setCriteria(event.target.value)}/></label>
    <label>关联商机<select className={inputClass} value={opportunity} onChange={event=>setOpportunity(event.target.value)}><option value="">客户级计划</option>{props.opportunities.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    <label>第一步<input required maxLength={256} className={inputClass} value={title} onChange={event=>setTitle(event.target.value)}/></label>
    <label>执行内容<textarea required maxLength={4096} className={inputClass} value={description} onChange={event=>setDescription(event.target.value)}/></label>
    {error && <p role="alert">{error}</p>}
    <button type="submit" disabled={saving}>{saving?'保存中…':'保存手动计划'}</button>
    <button type="button" disabled={saving} onClick={props.onCancel}>取消</button>
  </form>;
}
