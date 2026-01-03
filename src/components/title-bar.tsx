"use client";

import { Minus, X } from "lucide-react";
import { useEffect, useState } from "react";

export function TitleBar() {
  // 默认显示，因为这是 Electron 专用应用
  return (
    <div className="fixed top-0 left-0 right-0 h-8 bg-background/80 backdrop-blur-md z-50 flex items-center justify-between select-none border-b border-border/50" style={{ WebkitAppRegion: "drag" } as any}>
      <div className="px-4 text-xs font-medium text-muted-foreground flex items-center gap-2">
        <span className="text-blue-500 font-bold">Twitter</span> GIF Tool
      </div>
      <div className="flex h-full" style={{ WebkitAppRegion: "no-drag" } as any}>
        <button
          onClick={() => window.electron?.minimize()}
          className="h-full px-4 hover:bg-accent hover:text-accent-foreground transition-colors flex items-center justify-center"
        >
          <Minus className="h-4 w-4" />
        </button>
        <button
          onClick={() => window.electron?.close()}
          className="h-full px-4 hover:bg-red-500 hover:text-white transition-colors flex items-center justify-center"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}