export type EncryptedPayloadV1 = {
  v: 1;
  alg: "AES-256-GCM";
  kdf: "PBKDF2-SHA256";
  iter: number;
  salt: string;
  iv: string;
  ct: string;
  meta?: {
    name?: string;
    type?: string;
    size?: number;
    createdAt?: string;
  };
};

const bytesToBase64 = (bytes: Uint8Array): string => {
  const btoaFn = globalThis.btoa;
  if (!btoaFn) throw new Error("btoa unavailable");
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoaFn(binary);
};

const base64ToBytes = (base64: string): Uint8Array => {
  const atobFn = globalThis.atob;
  if (!atobFn) throw new Error("atob unavailable");
  const normalized = base64.replace(/\s+/g, "");
  const binary = atobFn(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer => {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
};

const deriveAesKey = async (password: string, salt: Uint8Array, iterations: number) => {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: toArrayBuffer(salt),
      iterations,
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
};

export const encryptBytes = async (params: {
  bytes: Uint8Array;
  password: string;
  iterations?: number;
  meta?: EncryptedPayloadV1["meta"];
}): Promise<EncryptedPayloadV1> => {
  const iterations = params.iterations ?? 200_000;
  if (!params.password) throw new Error("Password required");
  if (!Number.isFinite(iterations) || iterations <= 0) throw new Error("Invalid iterations");

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAesKey(params.password, salt, iterations);
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: toArrayBuffer(iv) },
    key,
    toArrayBuffer(params.bytes),
  );

  return {
    v: 1,
    alg: "AES-256-GCM",
    kdf: "PBKDF2-SHA256",
    iter: iterations,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ct: bytesToBase64(new Uint8Array(ct)),
    meta: params.meta ? { ...params.meta } : undefined,
  };
};

export const decryptBytes = async (params: {
  payload: EncryptedPayloadV1;
  password: string;
}): Promise<{ bytes: Uint8Array; meta?: EncryptedPayloadV1["meta"] }> => {
  const { payload, password } = params;
  if (!password) throw new Error("Password required");
  if (payload.v !== 1 || payload.alg !== "AES-256-GCM" || payload.kdf !== "PBKDF2-SHA256") {
    throw new Error("Unsupported payload");
  }

  const salt = base64ToBytes(payload.salt);
  const iv = base64ToBytes(payload.iv);
  const ct = base64ToBytes(payload.ct);
  const key = await deriveAesKey(password, salt, payload.iter);
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: toArrayBuffer(iv) },
    key,
    toArrayBuffer(ct),
  );
  return { bytes: new Uint8Array(pt), meta: payload.meta };
};

export const parseEncryptedPayload = (text: string): EncryptedPayloadV1 => {
  const parsed = JSON.parse(text) as Partial<EncryptedPayloadV1>;
  if (parsed.v !== 1) throw new Error("Invalid payload version");
  if (parsed.alg !== "AES-256-GCM" || parsed.kdf !== "PBKDF2-SHA256") throw new Error("Invalid payload");
  if (typeof parsed.iter !== "number" || !Number.isFinite(parsed.iter) || parsed.iter <= 0) throw new Error("Invalid iter");
  if (typeof parsed.salt !== "string" || typeof parsed.iv !== "string" || typeof parsed.ct !== "string") {
    throw new Error("Missing fields");
  }
  return parsed as EncryptedPayloadV1;
};

