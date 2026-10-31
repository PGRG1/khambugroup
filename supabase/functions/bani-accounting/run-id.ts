export function createLovableAiGatewayRunIdFetch(){
  let runId:string|undefined;
  return {getRunId:()=>runId,fetch:async(input:RequestInfo|URL,init?:RequestInit)=>{
    const headers=new Headers(init?.headers);
    if(runId)headers.set('X-Lovable-AIG-Run-ID',runId);
    const response=await fetch(input,{...init,headers});
    runId??=response.headers.get('X-Lovable-AIG-Run-ID')??undefined;
    return response;
  }};
}