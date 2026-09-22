"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
export default function ResetPasswordPage(){
 const supabase=useMemo(()=>createClient(),[]);
 const [ready,setReady]=useState(false),[password,setPassword]=useState(""),[confirm,setConfirm]=useState(""),[message,setMessage]=useState("בודקים את קישור השחזור..."),[busy,setBusy]=useState(false);
 useEffect(()=>{
   let active=true;
   const verify=async()=>{
     const url=new URL(window.location.href);
     if(url.searchParams.get("code")){
       const {error}=await supabase.auth.exchangeCodeForSession(url.searchParams.get("code")!);
       if(error){if(active)setMessage("הקישור אינו תקין או שפג תוקפו.");return;}
       window.history.replaceState({}, "", url.pathname);
     }
     const {data:{user}}=await supabase.auth.getUser();
     if(active){setReady(!!user);setMessage(user?"בחרו סיסמה חדשה":"הקישור אינו תקין או שפג תוקפו.");}
   };
   void verify().catch(()=>{if(active)setMessage("לא ניתן לאמת את הקישור כרגע.");});
   return()=>{active=false;};
 },[supabase]);
 async function submit(e:React.FormEvent){
   e.preventDefault();if(password!==confirm){setMessage("הסיסמאות אינן תואמות");return;}
   setBusy(true);
   try{const {error}=await supabase.auth.updateUser({password});if(error)throw error;setMessage("הסיסמה עודכנה. ניתן להתחבר עם הסיסמה החדשה.");setReady(false);await supabase.auth.signOut();}
   catch{setMessage("עדכון הסיסמה נכשל. נסו קישור חדש.");}finally{setBusy(false);}
 }
 return <main dir="rtl" className="mx-auto max-w-sm p-6 space-y-4"><h1>עדכון סיסמה</h1><p role="status">{message}</p>{ready&&<form onSubmit={submit} className="space-y-4"><label>סיסמה חדשה<Input type="password" minLength={12} maxLength={128} required autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)}/></label><label>אימות סיסמה<Input type="password" required value={confirm} onChange={e=>setConfirm(e.target.value)}/></label><Button disabled={busy}>עדכון סיסמה</Button></form>}<a href="/login">חזרה להתחברות</a></main>;
}
