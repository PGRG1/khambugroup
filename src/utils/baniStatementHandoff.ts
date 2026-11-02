let staged:{identity:string;files:File[]}|null=null;
export const stageBaniStatements=(identity:string,files:File[])=>{staged={identity,files};};
export function consumeBaniStatements(identity:string){const value=staged;staged=null;return value?.identity===identity?value.files:[];}