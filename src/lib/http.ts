import { HttpError } from './retry.js';

export type FetchLike = typeof fetch;

/** fetch + разбор JSON + HttpError с Retry-After. Тело ответа в ошибку не кладём (может содержать ПДн). */
export async function requestJson<T>(
  fetchImpl: FetchLike,
  service: string,
  url: string,
  init: RequestInit,
): Promise<T> {
  const res = await fetchImpl(url, { ...init, signal: init.signal ?? AbortSignal.timeout(15_000) });
  if (!res.ok) {
    const ra = Number(res.headers.get('retry-after') ?? '') || undefined;
    throw new HttpError(res.status, service, `${service} ${init.method ?? 'GET'} ${new URL(url).pathname} → ${res.status}`, ra);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}
