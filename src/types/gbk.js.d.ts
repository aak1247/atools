declare module "gbk.js" {
  export function encode(text: string): number[];
  export function decode(bytes: number[] | Uint8Array): string;
}
