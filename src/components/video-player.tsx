"use client";

import { useEffect, useRef } from "react";
import Hls from "hls.js";

interface VideoPlayerProps {
  src: string;
  type: string;
  poster?: string;
}

export function VideoPlayer({ src, type, poster }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // 鉴于我们已经在主进程修复了 CORS 和 Referer，理论上可以直接播放
    // 但为了保险起见，对于 m3u8，我们使用 hls.js 并配置 xhrSetup 来处理潜在的请求头问题（如果需要）
    // 或者，如果主进程的 onBeforeSendHeaders 工作正常，直接请求即可

    if (type === "m3u8") {
      if (Hls.isSupported()) {
        const hls = new Hls({
          // 启用 debug 可以帮助排查问题
          debug: false,
          xhrSetup: (xhr, url) => {
            // 确保请求携带正确的 Referer (虽然浏览器通常不允许手动设置 Referer，但 Electron 的 onBeforeSendHeaders 会覆盖它)
            // 这里主要依赖 Electron 主进程的拦截
          }
        });
        hls.loadSource(src);
        hls.attachMedia(video);
        hls.on(Hls.Events.ERROR, function (event, data) {
            console.error('HLS error:', data);
            if (data.fatal) {
                switch (data.type) {
                case Hls.ErrorTypes.NETWORK_ERROR:
                    console.log('fatal network error encountered, try to recover');
                    hls.startLoad();
                    break;
                case Hls.ErrorTypes.MEDIA_ERROR:
                    console.log('fatal media error encountered, try to recover');
                    hls.recoverMediaError();
                    break;
                default:
                    hls.destroy();
                    break;
                }
            }
        });
        return () => {
          hls.destroy();
        };
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = src;
      }
    } else {
      video.src = src;
    }
  }, [src, type]);

  return (
    <video
      ref={videoRef}
      controls
      className="w-full h-full object-contain"
      poster={poster}
      crossOrigin="anonymous"
    />
  );
}