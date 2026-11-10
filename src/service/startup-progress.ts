/** Phase budgets include synchronous SQLite/filesystem work, not just HTTP listen. */
export const startupPhases = {
  'module-loading': {label:'加载服务依赖',timeoutMs:30_000},
  'database-open': {label:'打开现有数据库',timeoutMs:30_000},
  'database-validation': {label:'数据库完整性校验',timeoutMs:300_000},
  'database-migration': {label:'数据库兼容检查',timeoutMs:300_000},
  'daily-backup': {label:'每日备份',timeoutMs:300_000},
  'service-initialization': {label:'初始化业务服务',timeoutMs:60_000},
  'http-listen': {label:'监听本地端口',timeoutMs:30_000},
  'outbound-maintenance': {label:'检查外发临时文件',timeoutMs:60_000},
  'health-check': {label:'验证服务健康状态',timeoutMs:15_000},
} as const;

export type StartupPhase = keyof typeof startupPhases;
export function isStartupPhase(value: unknown): value is StartupPhase {
  return typeof value==='string' && Object.hasOwn(startupPhases,value);
}
