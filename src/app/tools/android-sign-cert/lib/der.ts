// 最小化的 DER/ASN.1 编解码实现，仅覆盖 JKS / PKCS#12 / X.509 / PKCS#7 解析所需的结构。

export const DER_TAG = {
  BOOLEAN: 0x01,
  INTEGER: 0x02,
  BIT_STRING: 0x03,
  OCTET_STRING: 0x04,
  NULL: 0x05,
  OID: 0x06,
  UTF8_STRING: 0x0c,
  PRINTABLE_STRING: 0x13,
  TELETEX_STRING: 0x14,
  IA5_STRING: 0x16,
  UTC_TIME: 0x17,
  GENERALIZED_TIME: 0x18,
  BMP_STRING: 0x1e,
  SEQUENCE: 0x30,
  SET: 0x31,
} as const;

const CLASS_CONSTRUCTED = 0x20;

export function derLength(bytes: number): number[] {
  if (bytes < 0x80) return [bytes];
  if (bytes < 0x100) return [0x81, bytes];
  if (bytes < 0x10000) return [0x82, bytes >> 8, bytes & 0xff];
  return [0x83, (bytes >> 16) & 0xff, (bytes >> 8) & 0xff, bytes & 0xff];
}

export class DerWriter {
  private readonly parts: number[] = [];

  raw(bytes: Uint8Array | number[]): this {
    for (const b of bytes) this.parts.push(b);
    return this;
  }

  node(tag: number, body: Uint8Array | number[]): this {
    this.parts.push(tag);
    this.raw(derLength(body.length));
    if (body instanceof Uint8Array) {
      for (const b of body) this.parts.push(b);
    } else {
      for (const b of body) this.parts.push(b);
    }
    return this;
  }

  sequence(body: Uint8Array | number[]): this {
    return this.node(DER_TAG.SEQUENCE, body);
  }

  set(body: Uint8Array | number[]): this {
    return this.node(DER_TAG.SET, body);
  }

  contextExplicit(tag: number, body: Uint8Array | number[]): this {
    return this.node(0xa0 | tag, body);
  }

  contextImplicit(tag: number, body: Uint8Array | number[]): this {
    return this.node(0x80 | tag, body);
  }

  /** 写入非负整数（本工具仅用于版本号、迭代次数、密钥长度等小数值）。 */
  integer(value: number): this {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error(`DER INTEGER 仅支持非负安全整数：${value}`);
    const bytes: number[] = [];
    let v = value;
    if (v === 0) bytes.push(0);
    while (v > 0) {
      bytes.unshift(v % 256);
      v = Math.floor(v / 256);
    }
    if (bytes[0] & 0x80) bytes.unshift(0);
    return this.node(DER_TAG.INTEGER, bytes);
  }

  integerBytes(bytes: Uint8Array | number[]): this {
    const arr = Array.from(bytes);
    if (arr.length === 0) arr.push(0);
    if (arr[0] & 0x80) arr.unshift(0);
    return this.node(DER_TAG.INTEGER, arr);
  }

  oid(dotted: string): this {
    const parts = dotted.split(".").map((p) => Number(p));
    const body: number[] = [parts[0] * 40 + parts[1]];
    for (let i = 2; i < parts.length; i += 1) {
      let value = parts[i];
      const stack: number[] = [value & 0x7f];
      value = Math.floor(value / 128);
      while (value > 0) {
        stack.unshift((value & 0x7f) | 0x80);
        value = Math.floor(value / 128);
      }
      body.push(...stack);
    }
    return this.node(DER_TAG.OID, body);
  }

  octetString(body: Uint8Array | number[]): this {
    return this.node(DER_TAG.OCTET_STRING, body);
  }

  bitString(body: Uint8Array | number[]): this {
    const arr = body instanceof Uint8Array ? Array.from(body) : [...body];
    return this.node(DER_TAG.BIT_STRING, [0, ...arr]);
  }

  nullValue(): this {
    return this.node(DER_TAG.NULL, []);
  }

  boolean(value: boolean): this {
    return this.node(DER_TAG.BOOLEAN, [value ? 0xff : 0x00]);
  }

  utf8String(text: string): this {
    return this.node(DER_TAG.UTF8_STRING, Array.from(new TextEncoder().encode(text)));
  }

  printableString(text: string): this {
    return this.node(DER_TAG.PRINTABLE_STRING, Array.from(new TextEncoder().encode(text)));
  }

  bmpString(text: string): this {
    const bytes: number[] = [];
    for (let i = 0; i < text.length; i += 1) {
      const code = text.charCodeAt(i);
      bytes.push((code >> 8) & 0xff, code & 0xff);
    }
    return this.node(DER_TAG.BMP_STRING, bytes);
  }

  ia5String(text: string): this {
    return this.node(DER_TAG.IA5_STRING, Array.from(new TextEncoder().encode(text)));
  }

  utcTime(date: Date): this {
    const pad = (n: number) => String(n).padStart(2, "0");
    const text =
      `${pad(date.getUTCFullYear() % 100)}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
      `${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
    return this.node(DER_TAG.UTC_TIME, Array.from(new TextEncoder().encode(text)));
  }

  generalizedTime(date: Date): this {
    const pad = (n: number) => String(n).padStart(2, "0");
    const text =
      `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
      `${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
    return this.node(DER_TAG.GENERALIZED_TIME, Array.from(new TextEncoder().encode(text)));
  }

  bytes(): Uint8Array {
    return Uint8Array.from(this.parts);
  }
}

/** 把完整内容（通常是若干子 TLV 的拼接）包上一个 tag，返回独立 TLV。 */
export function derWrap(tag: number, content: Uint8Array): Uint8Array {
  return new DerWriter().node(tag, content).bytes();
}

export interface DerElement {
  tag: number;
  /** 内容（不含 tag 与 length） */
  content: Uint8Array;
  /** 完整编码（含 tag 与 length） */
  full: Uint8Array;
}

export function derRead(data: Uint8Array, start = 0, end = data.length): DerElement {
  let offset = start;
  const tag = data[offset];
  if (tag === undefined) throw new Error("ASN.1 数据已截断（tag）");
  offset += 1;
  const first = data[offset];
  if (first === undefined) throw new Error("ASN.1 数据已截断（length）");
  offset += 1;
  let length = 0;
  if (first & 0x80) {
    const count = first & 0x7f;
    if (count === 0) throw new Error("不支持 indefinite length 的 DER 数据");
    length = 0;
    for (let i = 0; i < count; i += 1) {
      const b = data[offset];
      if (b === undefined) throw new Error("ASN.1 数据已截断（long length）");
      length = length * 256 + b;
      offset += 1;
    }
  } else {
    length = first;
  }
  if (offset + length > end) throw new Error("ASN.1 数据已截断（内容超出范围）");
  return {
    tag,
    content: data.slice(offset, offset + length),
    full: data.slice(start, offset + length),
  };
}

export function derChildren(element: DerElement): DerElement[] {
  if (!(element.tag & CLASS_CONSTRUCTED)) throw new Error("ASN.1 节点不是 constructed 类型");
  const children: DerElement[] = [];
  let offset = 0;
  while (offset < element.content.length) {
    const child = derRead(element.content, offset, element.content.length);
    children.push(child);
    offset += child.full.length;
  }
  return children;
}

export function derOidToString(element: DerElement): string {
  const bytes = element.content;
  if (bytes.length < 1) throw new Error("OID 为空");
  const first = bytes[0];
  const parts = [Math.floor(first / 40), first % 40];
  let value = 0;
  for (let i = 1; i < bytes.length; i += 1) {
    value = value * 128 + (bytes[i] & 0x7f);
    if (!(bytes[i] & 0x80)) {
      parts.push(value);
      value = 0;
    }
  }
  return parts.join(".");
}

export function derIntegerToNumber(element: DerElement): number {
  let value = 0;
  for (const b of element.content) value = value * 256 + b;
  return value;
}

export function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/** PKCS#8 / SPKI 中的大整数内容（含正数前导 0x00 的处理，返回纯量值字节） */
export function derIntegerBytes(element: DerElement): Uint8Array {
  const bytes = element.content;
  let start = 0;
  while (start < bytes.length - 1 && bytes[start] === 0x00) start += 1;
  return bytes.slice(start);
}
