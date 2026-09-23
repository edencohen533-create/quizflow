import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendWebhook } from "./webhook";

export async function processDeliveryJobs() {
  const admin = createAdminClient();
  const { data: jobs, error } = await admin.rpc("claim_delivery_jobs", { p_limit:5 });
  if (error) throw new Error("Delivery queue unavailable");
  await Promise.all((jobs ?? []).map(async (job: {id:string; quiz_id:string; integration_id:string|null; kind:string; payload:Record<string,unknown>; lease_token:string}) => {
    let success = false, permanent = false, errorMessage: string | null = null;
    try {
      if (job.kind === "webhook") {
        const { data: integration, error } = await admin.from("integrations").select("url,secret,enabled,quiz_id").eq("id",job.integration_id).eq("quiz_id",job.quiz_id).maybeSingle();
        if (error) throw new Error("lookup failed");
        if (!integration?.enabled || !integration.url) { permanent=true; throw new Error("disabled"); }
        // Stable deliveryId lets receivers deduplicate a retry after a lost response.
        const response = await sendWebhook(integration.url, {...job.payload,deliveryId:job.id},integration.secret);
        success=response.ok;
        permanent=!response.ok && response.status>=400 && response.status<500 && ![408,425,429].includes(response.status);
        errorMessage=success ? null : "HTTP "+response.status;
        await admin.from("integrations").update({last_triggered_at:new Date().toISOString(),last_status:success?"success":"error",last_error:errorMessage}).eq("id",job.integration_id);
      } else if(job.kind === "capi") {
        const [{data:settings,error:settingsError},{data:secret,error:secretError}] = await Promise.all([
          admin.from("quiz_tracking_settings").select("meta_pixel_id").eq("quiz_id",job.quiz_id).maybeSingle(),
          admin.from("quiz_tracking_secrets").select("meta_access_token").eq("quiz_id",job.quiz_id).maybeSingle(),
        ]);
        if(settingsError || secretError) throw new Error("lookup failed");
        if(!settings?.meta_pixel_id || !/^\d{5,30}$/.test(settings.meta_pixel_id) || !secret?.meta_access_token) {permanent=true;throw new Error("not configured");}
        const response=await fetch("https://graph.facebook.com/"+(process.env.META_GRAPH_VERSION || "v24.0")+"/"+settings.meta_pixel_id+"/events",{
          method:"POST",redirect:"error",signal:AbortSignal.timeout(8000),headers:{"Content-Type":"application/json"},
          body:JSON.stringify({access_token:secret.meta_access_token,data:[job.payload]}),
        });
        const result = await response.json();
        success=response.ok && !result.error && Number(result.events_received)>0;
        permanent=!response.ok && response.status>=400 && response.status<500 && ![408,425,429].includes(response.status);
        errorMessage=success?null:"Meta HTTP "+response.status;
      } else {permanent=true;errorMessage="Unknown delivery kind";}
    } catch { errorMessage=permanent?"Integration unavailable":"Delivery network error"; }
    const { error: finishError } = await admin.rpc("finish_delivery_job",{
      p_id:job.id,p_lease:job.lease_token,p_success:success,p_error:errorMessage,p_permanent:permanent,
    });
    if(finishError) throw new Error("Delivery acknowledgement failed");
  }));
  return {processed:jobs?.length ?? 0};
}
