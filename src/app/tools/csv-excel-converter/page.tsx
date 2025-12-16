import type { Metadata } from "next";
import CsvExcelConverterClient from "./CsvExcelConverterClient";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "CSV-Excel 转换器 | 纯粹工具站",
  description: "纯前端 CSV 与 Excel（.xlsx）互转工具，支持分隔符与工作表选择，一键下载。",
  alternates: {
    canonical: "/tools/csv-excel-converter",
  },
  openGraph: {
    title: "CSV-Excel 转换器 - 纯粹工具站",
    description: "在线 CSV 与 XLSX 互转，支持工作表选择，纯本地运行。",
    type: "website",
  },
  manifest: "/tools/csv-excel-converter/manifest.webmanifest",
};

export default function CsvExcelConverterPage() {
  return <CsvExcelConverterClient />;
}

