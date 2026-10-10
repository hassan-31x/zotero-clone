export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T = any>(
  path: string,
  method = "GET",
  data?: unknown,
): Promise<T> {
  const response = await fetch(`/api/${path}`, {
    method,
    headers:
      data instanceof FormData
        ? undefined
        : data
          ? { "Content-Type": "application/json" }
          : undefined,
    body:
      data instanceof FormData ? data : data ? JSON.stringify(data) : undefined,
  });
  const result = await response.json();
  if (!response.ok)
    throw new ApiError(
      result.error?.message || "Request failed.",
      response.status,
    );
  if (Array.isArray(result.data) && result.pagination?.nextOffset != null) {
    const nextUrl = new URL(`/api/${path}`, window.location.origin);
    nextUrl.searchParams.set("offset", String(result.pagination.nextOffset));
    const next = await api<any[]>(nextUrl.pathname.slice(5) + nextUrl.search);
    return [...result.data, ...next] as T;
  }
  return result.data;
}
export function downloadText(name: string, text: string, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
