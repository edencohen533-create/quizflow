import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { processDeliveryJobs } from "@/lib/security/delivery";
export const maxDuration = 30;
export async function POST(req: Request) {
  const expected=process.env.DELIVERY_CRON_SECRET;
  const actual=req.headers.get("authorization")?.replace(/^Bearer /,"");
  if(!expected || !actual || Buffer.byteLength(expected)!==Buffer.byteLength(actual) || !timingSafeEqual(Buffer.from(expected),Buffer.from(actual))) {
    return NextResponse.json({ok:false},{status:401});
  }
  try { return NextResponse.json({ok:true,...await processDeliveryJobs()},{headers:{"Cache-Control":"no-store"}}); }
  catch { console.error("delivery_worker_failed");return NextResponse.json({ok:false},{status:503}); }
}
