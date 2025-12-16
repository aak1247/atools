"use client";

import { useState } from "react";

interface ToolDescriptionProps {
  seoDescription?: string;
  shortDescription: string;
}

export default function ToolDescription({ seoDescription, shortDescription }: ToolDescriptionProps) {
  const [showFullDescription, setShowFullDescription] = useState(false);

  if (!seoDescription) {
    return (
      <p className="mt-3 text-sm text-slate-600">
        {shortDescription}
      </p>
    );
  }

  return (
    <div className="mt-3">
      <p className="text-sm text-slate-600">
        {showFullDescription ? seoDescription : shortDescription}
      </p>
      {seoDescription && seoDescription !== shortDescription && (
        <button
          onClick={() => setShowFullDescription(!showFullDescription)}
          className="mt-2 text-xs text-blue-600 hover:text-blue-800 underline"
        >
          {showFullDescription ? "收起详细介绍" : "查看详细介绍"}
        </button>
      )}
      {/* 隐藏的SEO文本，仅供搜索引擎索引 */}
      {!showFullDescription && seoDescription && (
        <div className="sr-only" aria-hidden="true">
          {seoDescription}
        </div>
      )}
    </div>
  );
}