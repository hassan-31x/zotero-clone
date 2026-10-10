import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import http from "node:http";
import https from "node:https";
import { AppError } from "./security";
export function isPublicAddress(ip: string) {
  const v = ip.toLowerCase();
  if (isIP(v) === 4) {
    const [a, b, c] = v.split(".").map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || b === 0)) ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113) ||
      (a === 192 && b === 88 && c === 99)
    );
  }
  if (isIP(v) === 6) {
    if (v.startsWith("::ffff:")) {
      const tail = v.slice(7);
      if (isIP(tail) === 4) return isPublicAddress(tail);
      return false;
    }
    if (
      v.startsWith("2002:") ||
      v.startsWith("2001:db8:") ||
      v.startsWith("2001:0:") ||
      v.startsWith("2001::") ||
      v.startsWith("2001:2:") ||
      v.startsWith("2001:10:") ||
      v.startsWith("2001:20:")
    )
      return false;
    return v.startsWith("2") || v.startsWith("3");
  }
  return false;
}
export function validateUrl(input: string) {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new AppError(400, "INVALID_URL", "Enter a valid HTTP or HTTPS URL.");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.port && !["80", "443"].includes(url.port))
  )
    throw new AppError(
      400,
      "UNSAFE_URL",
      "Only public HTTP and HTTPS URLs on standard ports are supported.",
    );
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host.endsWith(".local") ||
    (isIP(host) && !isPublicAddress(host))
  )
    throw new AppError(
      400,
      "UNSAFE_URL",
      "Private network addresses cannot be imported.",
    );
  return url;
}
export async function guardedFetch(
  input: string,
  maxBytes = 50 * 1024 * 1024,
  redirects = 0,
): Promise<{ bytes: Buffer; type: string; url: string }> {
  if (redirects > 4)
    throw new AppError(
      400,
      "REDIRECT_LIMIT",
      "This source redirected too many times.",
    );
  const url = validateUrl(input);
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = await lookup(host, { all: true });
  if (!addresses.length || addresses.some((a) => !isPublicAddress(a.address)))
    throw new AppError(
      400,
      "UNSAFE_URL",
      "This URL resolves to a private or reserved network.",
    );
  const address = addresses[0];
  return new Promise((resolve, reject) => {
    const transport = url.protocol === "https:" ? https : http;
    const req = transport.request(
      url,
      {
        method: "GET",
        headers: {
          "User-Agent": "MarginResearch/1.0",
          Accept: "application/pdf,application/json,application/xml,text/html",
        },
        lookup: ((_h: string, _o: any, cb: any) =>
          _o.all
            ? cb(null, [address])
            : cb(null, address.address, address.family)) as any,
      },
      (res) => {
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          res.resume();
          guardedFetch(
            new URL(res.headers.location, url).href,
            maxBytes,
            redirects + 1,
          ).then(resolve, reject);
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(
            new AppError(
              422,
              "SOURCE_BLOCKED",
              `The source returned HTTP ${res.statusCode}. Upload the PDF instead.`,
            ),
          );
          return;
        }
        if (Number(res.headers["content-length"]) > maxBytes) {
          res.destroy();
          reject(
            new AppError(
              413,
              "FILE_TOO_LARGE",
              "The file exceeds the configured size limit.",
            ),
          );
          return;
        }
        const parts: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > maxBytes) {
            req.destroy(
              new AppError(
                413,
                "FILE_TOO_LARGE",
                "The download exceeds the size limit.",
              ),
            );
          } else parts.push(chunk);
        });
        res.on("end", () =>
          resolve({
            bytes: Buffer.concat(parts),
            type: res.headers["content-type"] || "",
            url: url.href,
          }),
        );
        res.on("error", reject);
      },
    );
    req.setTimeout(30000, () =>
      req.destroy(
        new AppError(
          408,
          "DOWNLOAD_TIMEOUT",
          "The source took too long. Try again or upload a PDF.",
        ),
      ),
    );
    const timeout = setTimeout(
      () =>
        req.destroy(
          new AppError(
            408,
            "DOWNLOAD_TIMEOUT",
            "The download exceeded 60 seconds.",
          ),
        ),
      60000,
    );
    req.on("close", () => clearTimeout(timeout));
    req.on("error", reject);
    req.end();
  });
}
export function parseReference(input: string) {
  const value = input.trim();
  const arxiv = value.match(
    /(?:arxiv\.org\/(?:abs|pdf)\/|^)(\d{4}\.\d{4,5}(?:v\d+)?)(?:\.pdf)?(?:[?#].*)?$/i,
  );
  const old = value.match(
    /arxiv\.org\/(?:abs|pdf)\/([a-z.-]+\/\d{7}(?:v\d+)?)/i,
  );
  if (arxiv || old) {
    const arxivId = (arxiv || old)![1];
    return { kind: "arxiv", arxivId, url: `https://arxiv.org/pdf/${arxivId}` };
  }
  const doi = value.match(/(?:doi\.org\/|^)(10\.\d{4,9}\/\S+)$/i);
  if (doi)
    return { kind: "doi", doi: doi[1], url: `https://doi.org/${doi[1]}` };
  return { kind: "url", url: validateUrl(value).href };
}
