export function isSafeWindowsNameComponent(value: string): boolean {
  if (!value || /[<>:"/\\|?*\u0000-\u001f]/u.test(value) || /[. ]$/u.test(value)) return false;
  return !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/iu.test(value);
}
