"use client";
import {useEffect,useMemo,useState} from "react";
import {createClient} from "@/lib/supabase/client";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
export function AccountSecurity(){
 const supabase=useMemo(()=>createClient(),[]);
 const [factor,setFactor]=useState<{id:string;qr:string}|null>(null),[enabled,setEnabled]=useState(false),[code,setCode]=useState(""),[message,setMessage]=useState(""),[busy,setBusy]=useState(false);
 useEffect(()=>{void supabase.auth.mfa.listFactors().then(({data,error})=>{if(error)setMessage("לא ניתן לטעון את מצב האימות");else setEnabled(!!data?.totp.some(f=>f.status==="verified"));});},[supabase]);
 async function enroll(){setBusy(true);try{
  const {data:existing}=await supabase.auth.mfa.listFactors();
  for(const f of existing?.all??[])if(f.status==="unverified")await supabase.auth.mfa.unenroll({factorId:f.id});
  const {data,error}=await supabase.auth.mfa.enroll({factorType:"totp",friendlyName:"QuizFlow authenticator"});
  if(error||!data)throw error;setFactor({id:data.id,qr:data.totp.qr_code});setMessage("סרקו באפליקציית אימות והזינו את הקוד.");
 }catch{setMessage("הגדרת האימות נכשלה");}finally{setBusy(false);}}
 async function verify(e:React.FormEvent){e.preventDefault();if(!factor)return;setBusy(true);try{
 const {error}=await supabase.auth.mfa.challengeAndVerify({factorId:factor.id,code});if(error)throw error;
 setEnabled(true);setFactor(null);setCode("");setMessage("אימות דו־שלבי הופעל");
 }catch{setMessage("קוד לא תקין. נסו שוב.");}finally{setBusy(false);}}
 return <section className="rounded-xl border p-5 space-y-3"><h2 className="font-semibold">אימות דו־שלבי</h2><p>{enabled?"אימות באפליקציית אימות פעיל בחשבון":"הוסיפו קוד מאפליקציית אימות להגנה על החשבון."}</p>{!enabled&&!factor&&<Button disabled={busy} onClick={enroll}>הפעלת אימות דו־שלבי</Button>}{factor&&<form onSubmit={verify} className="space-y-3">
{/* Supabase returns an inline QR data URI; do not send it to an image optimizer. */}
{/* eslint-disable-next-line @next/next/no-img-element */}
<img src={factor.qr} alt="קוד לסריקה באפליקציית אימות" width={200} height={200}/>
<Input aria-label="קוד אימות" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={e=>setCode(e.target.value)}/><Button type="submit" disabled={busy}>אימות והפעלה</Button></form>}<p role="status">{message}</p></section>;
}
