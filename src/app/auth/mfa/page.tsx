"use client";
import {useMemo,useState} from "react";
import {createClient} from "@/lib/supabase/client";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
export default function MfaPage(){
 const supabase=useMemo(()=>createClient(),[]);
 const [code,setCode]=useState(""),[error,setError]=useState(""),[busy,setBusy]=useState(false);
 async function submit(e:React.FormEvent){e.preventDefault();setBusy(true);try{
 const {data,error:factorError}=await supabase.auth.mfa.listFactors();
 const factor=data?.totp.find(f=>f.status==="verified");if(factorError||!factor)throw new Error();
 const {error}=await supabase.auth.mfa.challengeAndVerify({factorId:factor.id,code});if(error)throw error;
 window.location.assign("/");
 }catch{setError("האימות נכשל. בדקו את הקוד ונסו שוב.");}finally{setBusy(false);}}
 return <main dir="rtl" className="mx-auto max-w-sm p-6"><h1>אימות דו־שלבי</h1><form className="space-y-4" onSubmit={submit}><label>קוד מאפליקציית האימות<Input inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={e=>setCode(e.target.value)}/></label><p role="alert">{error}</p><Button type="submit" disabled={busy}>אימות</Button></form><button onClick={async()=>{await supabase.auth.signOut();window.location.assign("/login");}}>התנתקות</button></main>;
}
