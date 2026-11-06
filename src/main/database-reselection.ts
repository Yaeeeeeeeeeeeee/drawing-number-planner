interface SelectionDependencies {
  prepare(beforeSwitch: () => Promise<void>): Promise<string | null>;
  quiesce(): Promise<void>;
  restore(): Promise<void>;
}
export async function performDatabaseReselection(dependencies: SelectionDependencies): Promise<{ok:true;cancelled:boolean}> {
  let paused = false;
  try {
    const selected = await dependencies.prepare(async () => {
      await dependencies.quiesce();
      paused = true;
    });
    return {ok:true,cancelled:!selected};
  } catch (error) {
    if (paused) {
      try { await dependencies.restore(); }
      catch (restoreError) { throw new Error(`${error instanceof Error ? error.message : error}；原配置已保留，但原服务恢复失败：${restoreError instanceof Error ? restoreError.message : restoreError}。请使用安全恢复重试或重新选择数据库。`); }
    }
    throw error;
  }
}
export function createTrustedRecoveryHandler(isTrusted: (event: unknown) => boolean, action: () => unknown) {
  return async (event: unknown) => {
    if (!isTrusted(event)) return {ok:false,error:{code:'UNTRUSTED_DESKTOP_SENDER',message:'此页面无权使用桌面安全恢复'}};
    return action();
  };
}
