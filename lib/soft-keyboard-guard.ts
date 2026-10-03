/** Desktop no-op compatibility guard. Windows has no mobile IME to suppress. */
let suppressed = false;
export function isRemoteKeyboardSuppressed(): boolean { return suppressed; }
export function setRemoteKeyboardSuppressed(on: boolean): void { suppressed = Boolean(on); }
