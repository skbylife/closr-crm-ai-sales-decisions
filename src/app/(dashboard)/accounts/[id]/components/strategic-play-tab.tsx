'use client';
import { useState, useEffect } from 'react';
import { NewPlayForm } from './strategic-play/new-play-form';
import type { manualPlayDisplay } from '@/lib/community/manual-display';
type Prefill={goalType?:string;goalDescription?:string;successCriteria?:string;opportunityId?:string;additionalContext?:string};
export function StrategicPlayTab({account,opportunities=[],prefill,onPrefillConsumed,filterOpportunityId,initialPlayId}:{
  account:{id:string;name:string;contacts:{id:string;name:string}[]};
  opportunities?:{id:string;name:string}[];prefill?:Prefill|null;
  onPrefillConsumed?:()=>void;filterOpportunityId?:string;initialPlayId?:string;
}) {
  const [plays,setPlays]=useState<ReturnType<typeof manualPlayDisplay>[]>([]);
  const [showForm,setShowForm]=useState(false);const [error,setError]=useState('');
  const [draft,setDraft]=useState<Prefill|null>(null);const [revision,setRevision]=useState(0);
  useEffect(()=>{if(prefill){setDraft(prefill);setShowForm(true);onPrefillConsumed?.();}},[prefill,onPrefillConsumed]);
  useEffect(()=>{
    const controller=new AbortController();setPlays([]);setError('');
    void fetch(`/api/strategic-play/manual?accountId=${encodeURIComponent(account.id)}`,{cache:'no-store',signal:controller.signal})
      .then(async response=>{if(!response.ok)throw new Error('read_failed');return response.json();})
      .then(data=>{if(!controller.signal.aborted)setPlays(data.plays);})
      .catch(()=>{if(!controller.signal.aborted)setError('读取计划失败，请检查访问权限后重试。');});
    return ()=>controller.abort();
  },[account.id,revision]);
  async function changeStatus(playId:string,status:string) {
    setError('');
    try {
      const response=await fetch('/api/strategic-play/manual',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({playId,status})});
      if(!response.ok)throw new Error('save_failed');setRevision(value=>value+1);
    }catch{setError('更新失败；只有计划创建者能更改状态。');}
  }
  async function deletePlay(playId:string) {
    if(!window.confirm('删除这条手动计划？'))return;
    setError('');
    try {
      const response=await fetch('/api/strategic-play/manual',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({playId})});
      if(!response.ok)throw new Error('delete_failed');
      setRevision(value=>value+1);
    }catch{setError('删除失败；只有计划创建者能删除自己的计划。');}
  }
  return <section className="space-y-4">
    <div className="flex justify-between"><h2>客户计划</h2><button onClick={()=>{setDraft(null);setShowForm(true);}}>新建手动计划</button></div>
    {showForm && <NewPlayForm contacts={account.contacts} accountId={account.id} accountName={account.name} opportunities={opportunities} initialGoalDescription={draft?.goalDescription} initialSuccessCriteria={draft?.successCriteria} initialOpportunityId={draft?.opportunityId ?? filterOpportunityId} initialAdditionalContext={draft?.additionalContext} onCreated={()=>{setShowForm(false);setRevision(value=>value+1);}} onCancel={()=>setShowForm(false)}/>}
    {error && <p role="alert">{error}</p>}
    {plays.filter(play=>!filterOpportunityId || play.opportunityId===filterOpportunityId).map(play=><article key={play.id} id={`play-${play.id}`} className={`rounded border p-4 ${play.id===initialPlayId?'border-accent':'border-border'}`}>
      <h3>{play.goalDescription}</h3><p>完成标准：{play.successCriteria || '未填写'}</p><p>状态：{play.status}</p>
      <div><button onClick={()=>void changeStatus(play.id,play.status==='completed'?'active':'completed')}>{play.status==='completed'?'重新打开':'标记完成'}</button><button onClick={()=>void changeStatus(play.id,'abandoned')}>终止计划</button><button onClick={()=>void deletePlay(play.id)}>删除计划</button></div>
      <ol>{play.steps.map((step,index)=><li key={index}><strong>{step.title}</strong><p>{step.description}</p><span>{step.status}</span></li>)}</ol>
    </article>)}
  </section>;
}
