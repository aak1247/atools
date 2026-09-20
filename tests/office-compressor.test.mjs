import test from "node:test";
import assert from "node:assert/strict";
import * as fflate from "fflate";
import {
  optimizePngLossless,
  stripJpegMetadata,
  inspectOfficeMedia,
  compressOfficeDocument,
} from "../src/lib/office-compressor.ts";

test("PNG 无损优化测试 - 过滤元数据并极限压缩", () => {
  // 构建一个包含 tEXt 注释元数据的标准 PNG
  const ihdr = Buffer.from([
    0x00, 0x00, 0x00, 0x01, // width: 1
    0x00, 0x00, 0x00, 0x01, // height: 1
    0x08, 0x02, 0x00, 0x00, 0x00, // 8-bit RGB
  ]);
  // 原始 scanline: filter 0 + R 255, G 0, B 0
  const rawScanline = new Uint8Array([0x00, 0xff, 0x00, 0x00]);
  const compressedIdat = fflate.zlibSync(rawScanline, { level: 1 });

  // CRC32 helper
  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    crcTable[n] = c;
  }
  function calcCrc(typeStr, dataBuf) {
    const combined = Buffer.concat([Buffer.from(typeStr, "ascii"), dataBuf]);
    let c = 0xffffffff;
    for (let i = 0; i < combined.length; i++) {
      c = crcTable[(c ^ combined[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
  }

  function makeChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, "ascii");
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(calcCrc(type, data), 0);
    return Buffer.concat([len, typeBuf, data, crc]);
  }

  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdrChunk = makeChunk("IHDR", ihdr);
  const textChunk = makeChunk("tEXt", Buffer.from("Author\0ATools Test Suite", "latin1"));
  const idatChunk = makeChunk("IDAT", Buffer.from(compressedIdat));
  const iendChunk = makeChunk("IEND", Buffer.alloc(0));

  const testPng = Buffer.concat([sig, ihdrChunk, textChunk, idatChunk, iendChunk]);

  const optimized = optimizePngLossless(new Uint8Array(testPng));
  assert.ok(optimized !== null, "优化后的 PNG 不应为 null");
  assert.ok(optimized.byteLength < testPng.byteLength, "优化后的 PNG 体积应显著小于原始带元数据的 PNG");

  // 验证重新优化后的 PNG 解压数据与原始像素 100% 一致
  let offset = 8;
  let recompressedIdat = null;
  while (offset < optimized.byteLength) {
    const len =
      (optimized[offset] << 24) |
      (optimized[offset + 1] << 16) |
      (optimized[offset + 2] << 8) |
      optimized[offset + 3];
    const type = String.fromCharCode(
      optimized[offset + 4],
      optimized[offset + 5],
      optimized[offset + 6],
      optimized[offset + 7]
    );
    if (type === "IDAT") {
      recompressedIdat = optimized.subarray(offset + 8, offset + 8 + len);
      break;
    }
    offset += 12 + len;
  }

  assert.ok(recompressedIdat !== null, "必须包含 IDAT");
  const uncompressed = fflate.unzlibSync(recompressedIdat);
  assert.deepEqual(Array.from(uncompressed), [0, 255, 0, 0], "无损优化后的像素数据必须 100% 保持一致");
});

test("JPEG 无损剥离元数据测试", () => {
  // 构建带有 APP1 (EXIF) 和 APP2 的测试 JPEG
  const soi = Buffer.from([0xff, 0xd8]);
  const app1 = Buffer.concat([
    Buffer.from([0xff, 0xe1, 0x00, 0x08]), // len = 8 (including 2 len bytes)
    Buffer.from("Exif\0\0", "latin1"),
  ]);
  const app0 = Buffer.concat([
    Buffer.from([0xff, 0xe0, 0x00, 0x10]),
    Buffer.from("JFIF\0\x01\x01\x00\x00\x01\x00\x01\x00\x00", "latin1"),
  ]);
  const sos = Buffer.from([0xff, 0xda, 0x00, 0x04, 0x01, 0x02, 0x03, 0xff, 0xd9]); // SOS + fake entropy + EOI

  const mockJpeg = Buffer.concat([soi, app1, app0, sos]);
  const stripped = stripJpegMetadata(new Uint8Array(mockJpeg));

  assert.ok(stripped !== null, "剥离后的 JPEG 不应为 null");
  assert.ok(stripped.byteLength < mockJpeg.byteLength, "剥离元数据后体积应减小");
  // 确认 APP1 被移除，但保留 APP0
  const strippedBuf = Buffer.from(stripped);
  assert.ok(!strippedBuf.includes(Buffer.from("Exif", "latin1")), "EXIF 元数据应已被成功剥离");
  assert.ok(strippedBuf.includes(Buffer.from("JFIF", "latin1")), "标准 JFIF APP0 应被完整保留");
});

test("PPTX 媒体成分扫描 inspectOfficeMedia 测试", () => {
  const mockFiles = {
    "ppt/media/photo1.jpg": Buffer.alloc(500),
    "ppt/media/icon.png": Buffer.alloc(300),
    "ppt/media/banner.webp": Buffer.alloc(200),
    "ppt/media/demo.mp4": Buffer.alloc(5000),
    "docProps/thumbnail.jpeg": Buffer.alloc(150),
    "[Content_Types].xml": Buffer.from("<Types/>"),
  };
  const pptxBytes = fflate.zipSync(mockFiles);
  const mediaInfo = inspectOfficeMedia(pptxBytes);

  assert.equal(mediaInfo.totalImageCount, 3, "图片总数应为 3");
  assert.equal(mediaInfo.totalImageBytes, 1000, "图片总字节数应为 1000");
  assert.equal(mediaInfo.imageBreakdown.jpeg, 1);
  assert.equal(mediaInfo.imageBreakdown.png, 1);
  assert.equal(mediaInfo.imageBreakdown.webp, 1);
  assert.equal(mediaInfo.videoAudioCount, 1, "视频计数应为 1");
  assert.equal(mediaInfo.videoAudioBytes, 5000, "视频字节应为 5000");
  assert.equal(mediaInfo.hasThumbnail, true, "存在缩略图");
  assert.equal(mediaInfo.thumbnailBytes, 150);
});

test("PPTX 无损压缩与缩略图清理功能端到端测试", async () => {
  const mockFiles = {
    "[Content_Types].xml": Buffer.from(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="png" ContentType="image/png"/></Types>'
    ),
    "ppt/slides/_rels/slide1.xml.rels": Buffer.from(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/></Relationships>'
    ),
    "ppt/media/image1.png": Buffer.from(
      "89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de0000000c49444154789c63f8cfc000000301010018dd8d100000000049454e44ae426082",
      "hex"
    ),
    "docProps/thumbnail.jpeg": Buffer.alloc(1024),
    "_rels/.rels": Buffer.from(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/thumbnail" Target="docProps/thumbnail.jpeg"/></Relationships>'
    ),
  };

  const originalZip = fflate.zipSync(mockFiles);
  const result = await compressOfficeDocument(originalZip, {
    mode: "lossless",
    stripThumbnail: true,
  });

  assert.equal(result.imageCount, 1);
  assert.equal(result.savedThumbnailBytes, 1024, "应成功节省 1024 字节缩略图");

  const unzipped = fflate.unzipSync(result.outputBytes);
  assert.equal("docProps/thumbnail.jpeg" in unzipped, false, "输出文件应已移除缩略图");
  const relsText = Buffer.from(unzipped["_rels/.rels"]).toString("utf-8");
  assert.equal(relsText.includes("docProps/thumbnail.jpeg"), false, "输出关系中应移除缩略图引用");
});
