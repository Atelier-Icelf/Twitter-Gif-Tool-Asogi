"use client";

import { useState, useEffect } from "react";
import { ModeToggle } from "@/components/mode-toggle";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Search, Download, FileVideo, Image as ImageIcon, Settings, FolderOpen } from "lucide-react";
import { VideoPlayer } from "@/components/video-player";
import { useFFmpeg } from "@/hooks/use-ffmpeg";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function Home() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [downloadPath, setDownloadPath] = useState("");
  const [error, setError] = useState("");
  const [videos, setVideos] = useState<{ type: string; url: string }[]>([]);
  const [converting, setConverting] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);
  const [gifUrl, setGifUrl] = useState<string | null>(null);
  const [gifBlobData, setGifBlobData] = useState<Blob | null>(null);

  const { convertToGif, load: loadFFmpeg, loaded: ffmpegLoaded } = useFFmpeg();

  useEffect(() => {
    // 加载下载路径配置
    if (window.electron) {
        window.electron.getConfig().then(config => {
            setDownloadPath(config.downloadPath);
        });
    }
  }, []);

  const handleSelectPath = async () => {
      if (window.electron) {
          const path = await window.electron.selectDownloadPath();
          if (path) {
              setDownloadPath(path);
          }
      }
  };

  const handleOpenFolder = () => {
      if (window.electron) {
          window.electron.openDownloadsFolder();
      }
  };

  const handleAnalyze = async () => {
    if (!url) return;
    setLoading(true);
    setError("");
    setVideos([]);
    setGifUrl(null);

    try {
      let data;
      
      if (window.electron) {
        // Electron 环境：使用 IPC
        data = await window.electron.analyze(url);
      } else {
        // Web 环境：使用 API
        const response = await fetch("/api/analyze", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ url }),
        });

        data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "解析失败");
        }
      }

      setVideos(data.videos);
      
      // 预加载 ffmpeg
      if (!ffmpegLoaded) {
          loadFFmpeg();
      }

    } catch (err: any) {
      setError(err.message || "解析失败，请检查链接或网络");
    } finally {
      setLoading(false);
    }
  };

  const handleConvert = async (videoUrl: string, index: number) => {
    setConverting(index);
    setProgress(0);
    setGifUrl(null);
    setGifBlobData(null);
    try {
        const gifBlob = await convertToGif(videoUrl, (p) => setProgress(Math.round(p)));
        const gifObjectUrl = URL.createObjectURL(gifBlob);
        setGifUrl(gifObjectUrl);
        setGifBlobData(gifBlob);
    } catch (e) {
        console.error(e);
        setError("转换 GIF 失败，请重试");
    } finally {
        setConverting(null);
    }
  };

  const handleDownloadVideo = async (url: string, filename: string) => {
      if (window.electron) {
          try {
              const result = await window.electron.downloadFile(url, filename);
              if (!result.success) {
                  throw new Error(result.error);
              }
          } catch (e) {
              console.error(e);
              setError("下载失败");
          }
      } else {
          // Web fallback
          try {
            const response = await fetch(`/api/proxy?url=${encodeURIComponent(url)}`);
            const blob = await response.blob();
            const objectUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = objectUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(objectUrl);
        } catch (e) {
            console.error(e);
            setError("下载失败");
        }
      }
  }

  const handleSaveGif = async () => {
      if (!gifBlobData) return;
      const filename = `twitter-gif-${Date.now()}.gif`;
      
      if (window.electron) {
          try {
              const buffer = await gifBlobData.arrayBuffer();
              const result = await window.electron.saveGif(buffer, filename);
              if (!result.success) {
                   throw new Error(result.error);
              }
          } catch (e) {
              console.error(e);
              setError("保存 GIF 失败");
          }
      } else {
          const a = document.createElement('a');
          a.href = gifUrl!;
          a.download = filename;
          a.click();
      }
  };

  return (
    <main className="flex min-h-screen flex-col items-center p-4 sm:p-8 md:p-24 relative overflow-hidden">
      {/* 背景装饰 */}
      <div className="absolute inset-0 -z-10 h-full w-full bg-white dark:bg-black bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:14px_24px]">
        <div className="absolute left-0 right-0 top-0 -z-10 m-auto h-[310px] w-[310px] rounded-full bg-blue-400 opacity-20 blur-[100px]"></div>
      </div>

      <div className="z-10 w-full max-w-5xl items-center justify-between font-mono text-sm flex mb-8 md:mb-12">
        <div className="flex items-center gap-2 font-bold text-xl">
          <span className="text-blue-500">Twitter</span> GIF Tool
        </div>
        <div className="flex items-center gap-4">
            <a
                href="https://space.bilibili.com/315312"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-primary transition-colors font-medium"
            >
                @朝禊ASOGI
            </a>
            
            {typeof window !== 'undefined' && window.electron && (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                            <Settings className="h-[1.2rem] w-[1.2rem]" />
                            <span className="sr-only">设置</span>
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuLabel>下载设置</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="flex flex-col items-start gap-1 cursor-default focus:bg-transparent">
                            <span className="text-xs text-muted-foreground">当前保存路径:</span>
                            <span className="text-xs font-mono break-all max-w-[200px]">{downloadPath || '加载中...'}</span>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={handleSelectPath}>
                            <FolderOpen className="mr-2 h-4 w-4" />
                            更改保存路径...
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={handleOpenFolder}>
                            <FolderOpen className="mr-2 h-4 w-4" />
                            打开保存文件夹
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            )}

            <ModeToggle />
        </div>
      </div>

      <div className="w-full max-w-2xl flex flex-col items-center gap-8">
        <div className="text-center space-y-4">
          <h1 className="text-4xl md:text-6xl font-bold tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-cyan-500 dark:from-blue-400 dark:to-cyan-300">
            推特视频转 GIF
          </h1>
          <p className="text-muted-foreground text-lg md:text-xl max-w-[600px]">
            简单、快速、高质量。输入推文链接，一键提取视频并转换为 GIF 表情包。
          </p>
        </div>

        <div className="w-full flex flex-col sm:flex-row gap-2 p-2 bg-background/50 backdrop-blur-sm border rounded-xl shadow-lg">
          <Input
            placeholder="粘贴推文链接 (例如: https://x.com/...)"
            className="h-12 text-base border-0 focus-visible:ring-0 bg-transparent"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAnalyze()}
          />
          <Button
            size="lg"
            className="h-12 w-full sm:w-auto px-8 text-base font-semibold transition-all hover:scale-105 active:scale-95"
            onClick={handleAnalyze}
            disabled={loading || !url}
          >
            {loading ? (
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            ) : (
              <Search className="mr-2 h-5 w-5" />
            )}
            解析
          </Button>
        </div>

        {error && (
          <div className="w-full p-4 text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800 text-center">
            {error}
          </div>
        )}

        {videos.length > 0 && (
          <div className="w-full grid gap-6">
              {videos.map((video, index) => (
                <div
                  key={index}
                  className="group relative overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm"
                >
                  <div className="p-6">
                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                      <FileVideo className="h-5 w-5 text-blue-500" />
                      检测到视频资源 {index + 1}
                    </h3>
                    <div className="aspect-video w-full bg-black rounded-lg overflow-hidden relative mb-4">
                      {/* Electron 环境下直接使用 URL (主进程已处理 Referer)，Web 环境下使用代理 */}
                      <VideoPlayer
                        src={typeof window !== 'undefined' && window.electron ? video.url : `/api/proxy?url=${encodeURIComponent(video.url)}`}
                        type={video.type}
                      />
                    </div>
                    
                    {gifUrl && (
                        <div className="mb-4 p-4 bg-muted/50 rounded-lg border border-dashed">
                            <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                                <ImageIcon className="h-4 w-4 text-green-500" />
                                GIF 预览
                            </h4>
                            <img src={gifUrl} alt="Generated GIF" className="w-full rounded-md" />
                            <Button
                                className="w-full mt-2"
                                variant="secondary"
                                onClick={handleSaveGif}
                            >
                                <Download className="mr-2 h-4 w-4" />
                                保存 GIF
                            </Button>
                        </div>
                    )}

                    <div className="flex flex-wrap gap-3">
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={() => handleDownloadVideo(video.url, `twitter-video-${index + 1}.mp4`)}
                      >
                        <Download className="mr-2 h-4 w-4" />
                        下载原视频
                      </Button>
                      <Button 
                        className="flex-1 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white border-0"
                        onClick={() => handleConvert(video.url, index)}
                        disabled={converting === index}
                      >
                        {converting === index ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                转换中 {progress}%
                            </>
                        ) : (
                            <>
                                <FileVideo className="mr-2 h-4 w-4" />
                                转换为 GIF
                            </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>
    </main>
  );
}