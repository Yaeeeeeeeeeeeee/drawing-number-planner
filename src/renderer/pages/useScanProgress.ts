import type { ScanExecution, ScanStatusView } from '../../core/files/file-service.js';
import {useCallback,useEffect,useState} from 'react';
import type {LocalTaskView} from '../data/client';

const scanKinds=new Set(['workspace_scan','product_scan','category_scan']);
export function useScanProgress(list:(()=>Promise<LocalTaskView[]>)|undefined,active:boolean,starting:boolean|number){
 const [task,setTask]=useState<LocalTaskView|null>(null);
 const [error,setError]=useState('');const [retry,setRetry]=useState(0);
 const refresh=useCallback(()=>setRetry(value=>value+1),[]);
 useEffect(()=>{
  if(!active||!list)return;
  let live=true;let timer:ReturnType<typeof setTimeout>|undefined;
  const load=async()=>{
   try{
    const tasks=await list();if(!live)return;
    const latest=tasks.find(item=>scanKinds.has(item.kind))??null;
    setTask(latest);setError('');
    if((latest&&['queued','running','finalizing'].includes(latest.status))||starting)
     timer=setTimeout(load,500);
   }catch(reason){if(live)setError(reason instanceof Error?reason.message:'扫描状态获取失败');}
  };
  void load();return()=>{live=false;if(timer)clearTimeout(timer);};
 },[list,active,starting,retry]);
 return {task,error,refresh};
}

export function useOwnedScanProgress(read: (() => Promise<ScanStatusView>) | undefined, active: boolean, starting = false) {
  const [status, setStatus] = useState<ScanStatusView | null>(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => {
    setStatus(null);
    setRevision(value => value + 1);
  }, []);

  useEffect(() => {
    if (!active || !read) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      let delay = 1500;
      try {
        const snapshot = await read();
        if (!live) return;
        setStatus(snapshot);
        setError('');
        if (snapshot.active || starting) delay = 500;
      } catch (reason) {
        if (!live) return;
        setStatus(null);
        setError(reason instanceof Error ? reason.message : '扫描状态获取失败');
      }
      timer = setTimeout(load, delay);
    };
    void load();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [active, read, revision, starting]);

  return { status: active && read ? status : null, error: active && read ? error : '', refresh };
}

const scanSources: Record<ScanExecution['source'], string> = {
  workspace: '资料库扫描', product: '当前型号扫描', category: '当前类别扫描',
  watcher: '后台监听扫描', archive: '制图归档索引',
};
const executionStates: Record<ScanExecution['status'], string> = {
  running: '进行中', stopping: '停止中', finalizing: '写入结果', completed: '已完成', failed: '失败', cancelled: '已取消',
};
const scanPhases: Record<string, string> = {
  preparing: '准备扫描', 'checking-directories': '正在检查目录', traversing: '遍历文件', reading: '读取信息',
  comparing: '准备比对索引', writing: '比对并写入结果', finalizing: '比对并写入结果',
};

export function scanExecutionLabel(scan: ScanExecution): string {
  const status = scan.status === 'running' && scan.progress.phase === 'checking-directories'
    ? '准备扫描' : executionStates[scan.status];
  return `${scanSources[scan.source]}：${status}`;
}

export function scanExecutionProgress(scan: ScanExecution): string {
  const { phase, processed, total, message } = scan.progress;
  const label = scanPhases[phase] ?? message;
  const bytes = scan.bytesRead === undefined ? '' : ` · 已读取 ${(scan.bytesRead / (1024 * 1024)).toFixed(1)} MiB`;
  return `${label} · 已处理 ${processed}${total === null ? '' : ` / ${total}`}${bytes}`;
}
