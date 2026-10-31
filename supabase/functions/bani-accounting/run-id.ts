export function createLovableAiGatewayRunIdFetch(){
  let runId:string|undefined;
  return {getRunId:()=>runId,fetch:async(input:RequestInfo|URL,init?:RequestInit)=>{
    const headers=new Headers(init?.headers);
    if(runId)headers.set('X-Lovable-AIG-Run-ID',runId);
    const response=await fetch(input,{...init,headers});
    runId??=response.headers.get('X-Lovable-AIG-Run-ID')??undefined;
    if(!response.ok){let safe:any={};try{safe=await response.clone().json();}catch{safe={};}const failure=new Error(safe.message??safe.error?.message??response.statusText);Object.assign(failure,{statusCode:response.status,type:safe.type});throw failure;}
    return response;
  }};
}