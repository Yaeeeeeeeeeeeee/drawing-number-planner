/** Register a native chooser path or a local File extracted by Electron preload. */
export function createAitChooser(deps:{isTrustedEvent(event:unknown):boolean;choose():Promise<string|null>;select(path:string):Promise<unknown>}) {
  const checkSender=(event:unknown)=>{
    if(!deps.isTrustedEvent(event))throw new Error('UNTRUSTED_AIT_SENDER');
  };
  const choose=async(event:unknown):Promise<unknown>=>{
    checkSender(event);
    const path=await deps.choose();
    return path?deps.select(path):null;
  };
  const drop=async(event:unknown,path:unknown):Promise<unknown>=>{
    checkSender(event);
    if(typeof path!=='string'||!path||!/\.ait$/iu.test(path))throw new Error('请选择本机 AIT 原始文件');
    return deps.select(path);
  };
  return Object.assign(choose,{drop});
}
