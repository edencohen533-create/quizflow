import { after, NextResponse } from "next/server";
import { requirePublicQuiz } from "@/lib/security/public-quiz";
import { securePost, HttpError } from "@/lib/security/http";
import { processDeliveryJobs } from "@/lib/security/delivery";

export const POST = securePost(async(req,body)=>{
 const {session,admin,quiz}=await requirePublicQuiz(req);
 if(body.leadId!==session.leadId) throw new HttpError(403,"Not authorized");
 const {data:submission,error}=await admin.from("quiz_submissions").select("id").eq("id",session.submissionId).eq("lead_id",session.leadId).eq("quiz_id",quiz.id).maybeSingle();
 if(error) throw new HttpError(503,"Lookup failed");
 if(!submission) throw new HttpError(409,"Submission not ready");
 const {data:integrations,error:integrationError}=await admin.from("integrations").select("kind,pixel_id").eq("quiz_id",quiz.id).eq("workspace_id",quiz.workspaceId).eq("enabled",true);
 if(integrationError) throw new HttpError(503,"Lookup failed");
 after(()=>processDeliveryJobs());
 return NextResponse.json({ok:true,pixels:(integrations??[]).filter(i=>["meta_pixel","tiktok_pixel"].includes(i.kind)&&i.pixel_id).map(i=>({kind:i.kind,pixelId:i.pixel_id}))});
});
