import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import qiniu from "qiniu";

const BLOCK_SIZE = 4 * 1024 * 1024;

function normalizePrefix(raw) {
  const value = String(raw ?? "").trim();
  if (!value || value === "/") return "";
  const withoutLeading = value.startsWith("/") ? value.slice(1) : value;
  return withoutLeading.replace(/\/+$/, "");
}

function toPosixPath(p) {
  return p.split(path.sep).join("/");
}

function mustGetEnv(name) {
  const value = process.env[name];
  if (!value || !String(value).trim()) throw new Error(`Missing env: ${name}`);
  return String(value).trim();
}

function envFlag(name, defaultValue = false) {
  const raw = process.env[name];
  if (raw == null) return defaultValue;
  return String(raw).trim() === "1";
}

function guessMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "application/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".xml":
      return "application/xml; charset=utf-8";
    case ".txt":
      return "text/plain; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".avif":
      return "image/avif";
    case ".ico":
      return "image/x-icon";
    case ".webmanifest":
      return "application/manifest+json; charset=utf-8";
    case ".map":
      return "application/json; charset=utf-8";
    case ".woff2":
      return "font/woff2";
    case ".woff":
      return "font/woff";
    case ".ttf":
      return "font/ttf";
    case ".otf":
      return "font/otf";
    case ".eot":
      return "application/vnd.ms-fontobject";
    case ".wasm":
      return "application/wasm";
    case ".pdf":
      return "application/pdf";
    case ".mp3":
      return "audio/mpeg";
    case ".wav":
      return "audio/wav";
    case ".m4a":
      return "audio/mp4";
    case ".mp4":
      return "video/mp4";
    case ".webm":
      return "video/webm";
    default:
      return "application/octet-stream";
  }
}

function urlsafeBase64(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(String(input), "utf8");
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function computeQetag(filePath) {
  const fh = await fsp.open(filePath, "r");
  try {
    const stat = await fh.stat();
    const size = stat.size;

    if (size <= BLOCK_SIZE) {
      const sha1 = crypto.createHash("sha1");
      const buffer = Buffer.allocUnsafe(Math.max(1, Math.min(size, BLOCK_SIZE)));
      let offset = 0;
      while (offset < size) {
        const toRead = Math.min(buffer.length, size - offset);
        const { bytesRead } = await fh.read(buffer, 0, toRead, offset);
        if (bytesRead <= 0) break;
        sha1.update(buffer.subarray(0, bytesRead));
        offset += bytesRead;
      }
      const digest = sha1.digest();
      return urlsafeBase64(Buffer.concat([Buffer.from([0x16]), digest]));
    }

    const sha1OfSha1s = crypto.createHash("sha1");
    let offset = 0;
    while (offset < size) {
      const len = Math.min(BLOCK_SIZE, size - offset);
      const buf = Buffer.allocUnsafe(len);
      const { bytesRead } = await fh.read(buf, 0, len, offset);
      if (bytesRead <= 0) break;
      sha1OfSha1s.update(
        crypto.createHash("sha1").update(buf.subarray(0, bytesRead)).digest(),
      );
      offset += bytesRead;
    }
    const digest = sha1OfSha1s.digest();
    return urlsafeBase64(Buffer.concat([Buffer.from([0x96]), digest]));
  } finally {
    await fh.close();
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function withRetries(fn, { retries, baseDelayMs }) {
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn(attempt);
    } catch (e) {
      lastError = e;
      if (attempt >= retries) break;
      const delay = baseDelayMs * Math.pow(2, attempt) + Math.floor(Math.random() * 200);
      await sleep(delay);
    }
  }
  throw lastError;
}

function createLimit(concurrency) {
  /** @type {(() => void)[]} */
  const queue = [];
  let active = 0;

  const next = () => {
    active -= 1;
    const job = queue.shift();
    if (job) job();
  };

  return (fn) =>
    new Promise((resolve, reject) => {
      const run = () => {
        active += 1;
        Promise.resolve()
          .then(fn)
          .then(resolve, reject)
          .finally(next);
      };
      if (active < concurrency) run();
      else queue.push(run);
    });
}

async function listFilesRecursively(rootDir) {
  /** @type {string[]} */
  const results = [];
  /** @type {string[]} */
  const stack = [rootDir];

  while (stack.length > 0) {
    const dir = stack.pop();
    if (!dir) break;
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile()) results.push(full);
    }
  }

  results.sort((a, b) => a.localeCompare(b, "en"));
  return results;
}

function printHelp() {
  console.log(`Deploy static out/ to Qiniu Kodo via Qiniu Node.js SDK.

Required env:
  QINIU_ACCESS_KEY
  QINIU_SECRET_KEY
  QINIU_BUCKET

Optional env:
  QINIU_KEY_PREFIX        (default: derived from NEXT_PUBLIC_BASE_PATH)
  QINIU_THREAD_COUNT      (default: 8)   # concurrency
  QINIU_ZONE              (default: auto) # z0/z1/z2/na0/as0
  QINIU_USE_HTTPS_DOMAIN  (default: 0)
  QINIU_FORCE_UPLOAD      (default: 0)   # upload even if hash matches
  QINIU_DRY_RUN           (default: 0)   # do not upload, only print plan

Example:
  NEXT_PUBLIC_BASE_PATH=/demo npm run build
  QINIU_ACCESS_KEY=... QINIU_SECRET_KEY=... QINIU_BUCKET=... \\
  node scripts/deploy-qiniu.mjs
`);
}

function getZoneFromEnv() {
  const raw = String(process.env.QINIU_ZONE || "").trim().toLowerCase();
  if (!raw || raw === "auto") return null;
  switch (raw) {
    case "z0":
      return qiniu.zone.Zone_z0;
    case "z1":
      return qiniu.zone.Zone_z1;
    case "z2":
      return qiniu.zone.Zone_z2;
    case "na0":
      return qiniu.zone.Zone_na0;
    case "as0":
      return qiniu.zone.Zone_as0;
    default:
      throw new Error(`Unknown QINIU_ZONE: ${raw}`);
  }
}

async function warmupRegionsProvider(config, accessKey, bucket) {
  const provider = await config.getRegionsProvider({ bucketName: bucket, accessKey });
  await withRetries(async () => provider.getRegions(), { retries: 2, baseDelayMs: 400 });
  config.regionsProvider = provider;
}

function qiniuStat(bucketManager, bucket, key) {
  return new Promise((resolve, reject) => {
    bucketManager.stat(bucket, key, (err, respBody, respInfo) => {
      const statusCode = respInfo?.statusCode ?? 0;
      if (err) {
        if (statusCode === 612) return resolve({ exists: false, data: null });
        const message = respBody?.error || err.message || String(err);
        return reject(new Error(`stat failed (${statusCode || "unknown"}): ${message}`));
      }
      resolve({ exists: true, data: respBody });
    });
  });
}

function qiniuUploadFile(formUploader, mac, bucket, key, filePath, mimeType) {
  return new Promise((resolve, reject) => {
    const putPolicy = new qiniu.rs.PutPolicy({ scope: `${bucket}:${key}` });
    const uploadToken = putPolicy.uploadToken(mac);
    const putExtra = new qiniu.form_up.PutExtra();
    putExtra.mimeType = mimeType;
    formUploader.putFile(uploadToken, key, filePath, putExtra, (err, respBody, respInfo) => {
      const statusCode = respInfo?.statusCode ?? 0;
      if (err) {
        const message = respBody?.error || err.message || String(err);
        return reject(new Error(`upload failed (${statusCode || "unknown"}): ${message}`));
      }
      if (statusCode < 200 || statusCode >= 300) {
        const message = respBody?.error || JSON.stringify(respBody ?? {});
        return reject(new Error(`upload failed (${statusCode}): ${message}`));
      }
      resolve(respBody);
    });
  });
}

function qiniuListPrefix(bucketManager, bucket, options) {
  return new Promise((resolve, reject) => {
    bucketManager.listPrefix(bucket, options, (err, respBody, respInfo) => {
      const statusCode = respInfo?.statusCode ?? 0;
      if (err) {
        const message = respBody?.error || err.message || String(err);
        return reject(new Error(`listPrefix failed (${statusCode || "unknown"}): ${message}`));
      }
      resolve(respBody);
    });
  });
}

async function buildRemoteIndex(bucketManager, bucket, prefix) {
  /** @type {Map<string, {hash: string, fsize: number}>} */
  const index = new Map();
  let marker = null;

  while (true) {
    const resp = await withRetries(
      async () =>
        qiniuListPrefix(bucketManager, bucket, {
          prefix,
          marker: marker || undefined,
          limit: 1000,
        }),
      { retries: 2, baseDelayMs: 400 },
    );

    const items = Array.isArray(resp?.items) ? resp.items : [];
    for (const item of items) {
      const key = typeof item?.key === "string" ? item.key : "";
      if (!key) continue;
      index.set(key, {
        hash: String(item?.hash ?? ""),
        fsize: Number(item?.fsize ?? NaN),
      });
    }

    marker = typeof resp?.marker === "string" ? resp.marker : null;
    if (!marker) break;
  }

  return index;
}

async function main() {
  const arg = process.argv[2];
  if (arg === "-h" || arg === "--help") {
    printHelp();
    return;
  }

  const outDir = path.join(process.cwd(), "out");
  if (!fs.existsSync(outDir)) {
    console.error("out/ not found. Run `npm run build` first.");
    process.exit(1);
  }

  const accessKey = mustGetEnv("QINIU_ACCESS_KEY");
  const secretKey = mustGetEnv("QINIU_SECRET_KEY");
  const bucket = mustGetEnv("QINIU_BUCKET");

  const basePathPrefix = normalizePrefix(process.env.NEXT_PUBLIC_BASE_PATH);
  const keyPrefixRaw = normalizePrefix(process.env.QINIU_KEY_PREFIX || basePathPrefix);
  const keyPrefix = keyPrefixRaw ? `${keyPrefixRaw}/` : "";

  const concurrency = Math.max(
    1,
    Number.parseInt(String(process.env.QINIU_THREAD_COUNT || "8"), 10) || 8,
  );
  const forceUpload = envFlag("QINIU_FORCE_UPLOAD");
  const dryRun = envFlag("QINIU_DRY_RUN");

  const config = new qiniu.conf.Config();
  config.useHttpsDomain = envFlag("QINIU_USE_HTTPS_DOMAIN");
  config.zone = getZoneFromEnv();
  await warmupRegionsProvider(config, accessKey, bucket);

  const mac = new qiniu.auth.digest.Mac(accessKey, secretKey);
  const bucketManager = new qiniu.rs.BucketManager(mac, config);
  const formUploader = new qiniu.form_up.FormUploader(config);

  const files = await listFilesRecursively(outDir);
  const total = files.length;
  if (total === 0) {
    console.log("No files found in out/. Nothing to upload.");
    return;
  }

  console.log(
    `[qiniu] bucket=${bucket} prefix=${keyPrefix || "(none)"} files=${total} concurrency=${concurrency}`,
  );
  if (dryRun) console.log("[qiniu] DRY RUN enabled: no uploads will be performed.");

  const limit = createLimit(concurrency);
  let uploaded = 0;
  let skipped = 0;
  let failed = 0;
  const startedAt = Date.now();

  const remoteIndex =
    !forceUpload && keyPrefix
      ? await buildRemoteIndex(bucketManager, bucket, keyPrefix)
      : null;
  if (remoteIndex) console.log(`[qiniu] remote index loaded: ${remoteIndex.size} objects`);

  const tasks = files.map((filePath, index) =>
    limit(async () => {
      const rel = toPosixPath(path.relative(outDir, filePath));
      const key = `${keyPrefix}${rel}`;
      const stat = await fsp.stat(filePath);
      const size = stat.size;
      const mimeType = guessMimeType(filePath);

      const shouldUpload = await withRetries(
        async () => {
          if (forceUpload) return true;
          const remote =
            remoteIndex != null
              ? remoteIndex.get(key) ?? null
              : await (async () => {
                  const statRes = await qiniuStat(bucketManager, bucket, key);
                  if (!statRes.exists) return null;
                  return {
                    hash: String(statRes.data?.hash ?? ""),
                    fsize: Number(statRes.data?.fsize ?? NaN),
                  };
                })();

          if (!remote) return true;

          const remoteHash = remote.hash;
          const remoteSize = remote.fsize;
          if (!Number.isFinite(remoteSize) || remoteSize !== size) return true;
          const localHash = await computeQetag(filePath);
          return remoteHash !== localHash;
        },
        { retries: 2, baseDelayMs: 300 },
      );

      if (!shouldUpload) {
        skipped += 1;
        if ((index + 1) % 200 === 0)
          console.log(
            `[qiniu] progress ${index + 1}/${total} uploaded=${uploaded} skipped=${skipped} failed=${failed}`,
          );
        return;
      }

      if (dryRun) {
        uploaded += 1;
        console.log(`[qiniu] (dry) upload ${key}`);
        return;
      }

      await withRetries(
        async () => qiniuUploadFile(formUploader, mac, bucket, key, filePath, mimeType),
        { retries: 2, baseDelayMs: 500 },
      );

      uploaded += 1;
      if ((index + 1) % 50 === 0)
        console.log(
          `[qiniu] progress ${index + 1}/${total} uploaded=${uploaded} skipped=${skipped} failed=${failed}`,
        );
    }).catch((e) => {
      failed += 1;
      const rel = toPosixPath(path.relative(outDir, filePath));
      const key = `${keyPrefix}${rel}`;
      console.error(`[qiniu] failed ${key}:`, e instanceof Error ? e.message : e);
    }),
  );

  await Promise.all(tasks);

  const elapsed = Math.round((Date.now() - startedAt) / 1000);
  console.log(
    `[qiniu] done uploaded=${uploaded} skipped=${skipped} failed=${failed} elapsed=${elapsed}s`,
  );

  if (!dryRun && failed > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
