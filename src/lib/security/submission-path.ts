import type {Quiz,LeadAnswer,QuizNode} from "@/lib/types";
import {getStartNode,resolveRenderable} from "@/lib/quiz-runtime";
import {HttpError} from "./http";

// Reconstruct the configured path using normalized answers and the signed AB seed.
// Unconnected contact blocks must not impose requirements on a different path.
export function submissionPath(quiz:Quiz,answers:LeadAnswer[],sessionId:string,utmSource?:string):QuizNode[]{
 const start=getStartNode(quiz);
 if(!start) throw new HttpError(400,"Quiz has no start");
 const context={answers:{} as Record<string,LeadAnswer>,score:0,sessionId,utmSource};
 let node=resolveRenderable(quiz,start.id,null,context);
 const path:QuizNode[]=[],seen=new Set<string>();
 while(node && !seen.has(node.id) && path.length<=500){
  path.push(node);seen.add(node.id);
  if(node.data.kind==="end"){
   if(answers.some(a=>!seen.has(a.nodeId)))throw new HttpError(400,"Answer outside submitted path");
   return path;
  }
  const answer=answers.find(a=>a.nodeId===node!.id);
  if((node.data.kind==="question" || node.data.kind==="name") && node.data.required && !answer)throw new HttpError(400,"Required answer missing");
  if(answer){context.answers[node.id]=answer;context.score+=answer.score;}
  const handle=node.data.kind==="question" && !node.data.combineAnswers ? answer?.optionIds?.[0]??null : null;
  node=resolveRenderable(quiz,node.id,handle,context);
 }
 throw new HttpError(400,"Incomplete quiz path");
}
