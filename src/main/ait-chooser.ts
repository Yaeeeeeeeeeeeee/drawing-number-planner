/** Only a trusted main-frame event can register the native dialog's path. */
export function createAitChooser(deps:{isTrustedEvent(event:unknown):boolean;choose():Promise<string|null>;select(path:string):Promise<unknown>}) {
 return async (event:unknown):Promise<unknown>=>{
  if(!deps.isTrustedEvent(event))throw new Error('UNTRUSTED_AIT_SENDER');
  const path=await deps.choose();return path?deps.select(path):null;
 };
}
