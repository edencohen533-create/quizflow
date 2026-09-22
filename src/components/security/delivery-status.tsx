"use client";
import {useEffect,useMemo,useState} from "react";
import {createClient} from "@/lib/supabase/client";
type Job={id:string;kind:string;status:string;attempts:number;last_error:string|null;created_at:string};
export function DeliveryStatus(){
 const supabase=useMemo(()=>createClient(),[]);
 const [jobs,setJobs]=useState<Job[]>([]),[error,setError]=useState("");
 useEffect(()=>{let active=true;async function refresh(){const {data,error}=await supabase.from("delivery_jobs").select("id,kind,status,attempts,last_error,created_at").order("created_at",{ascending:false}).limit(50);if(active){if(error)setError("לא ניתן לטעון את מצב המשלוחים");else{setJobs(data??[]);setError("");}}}void refresh();const timer=setInterval(()=>void refresh(),30000);return()=>{active=false;clearInterval(timer);};},[supabase]);
 const failed=jobs.filter(j=>j.status==="dead");
 return <section className="rounded-xl border p-5 space-y-3"><h2 className="font-semibold">מצב משלוחים לאינטגרציות</h2>{error&&<p role="alert">{error}</p>}{failed.length>0&&<p role="alert" className="text-red-700">{failed.length} משלוחים נכשלו ודורשים בדיקה של הגדרות האינטגרציה.</p>}{jobs.length===0&&!error&&<p>אין משלוחים להצגה</p>}<ul className="space-y-2">{jobs.map(j=><li key={j.id} className="text-sm">{j.kind} · {({sent:"נשלח",pending:"ממתין לניסיון",running:"בשליחה",dead:"נכשל"})[j.status as "sent"]??j.status} · ניסיונות: {j.attempts}{j.last_error&&" · "+j.last_error}</li>)}</ul></section>;
}
