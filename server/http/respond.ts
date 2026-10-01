export interface Ok<T> {
  ok: true;
  data: T;
}
export interface Fail {
  ok: false;
  error: { code: string; message: string; requestId: string; fields?: Record<string, string> };
}
export const ok = <T>(data: T): Ok<T> => ({ ok: true, data });
