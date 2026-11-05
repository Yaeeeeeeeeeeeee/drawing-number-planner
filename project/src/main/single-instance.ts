export interface DesktopInstanceApp {
  requestSingleInstanceLock(): boolean;
  quit(): void;
  on(event: 'second-instance', listener: () => void): unknown;
}
/** Called after choosing the persistent userData path, before starting any DB service. */
export function acquireDesktopInstance(app: DesktopInstanceApp, focusExistingWindow: () => void): boolean {
  if (!app.requestSingleInstanceLock()) { app.quit(); return false; }
  app.on('second-instance', focusExistingWindow);
  return true;
}
