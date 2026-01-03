import { useState, useRef } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL, fetchFile } from '@ffmpeg/util';

export function useFFmpeg() {
  const [loaded, setLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const ffmpegRef = useRef<FFmpeg | null>(null);
  const messageRef = useRef<HTMLParagraphElement | null>(null);

  const load = async () => {
    if (!ffmpegRef.current) {
        ffmpegRef.current = new FFmpeg();
    }
    setIsLoading(true);
    // 使用本地文件，确保在离线或打包环境下也能工作
    const baseURL = window.location.origin + '/ffmpeg';
    const ffmpeg = ffmpegRef.current!;
    
    ffmpeg.on('log', ({ message }) => {
      if (messageRef.current) messageRef.current.innerHTML = message;
      console.log(message);
    });

    try {
        await ffmpeg.load({
            coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
            wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
        });
        setLoaded(true);
    } catch (error) {
        console.error('Failed to load ffmpeg', error);
    } finally {
        setIsLoading(false);
    }
  };

  const convertToGif = async (videoUrl: string, onProgress?: (progress: number) => void) => {
    if (!loaded) await load();
    const ffmpeg = ffmpegRef.current!;

    try {
        // 由于跨域问题，我们可能需要通过后端代理获取视频文件
        // 这里假设我们有一个代理 API 或者视频 URL 支持 CORS
        // 如果是 m3u8，ffmpeg.wasm 处理比较麻烦，最好是 mp4
        // 我们先尝试直接 fetch，如果失败则提示用户
        
        let videoData: Uint8Array;

        // 鉴于我们已经在主进程修复了 CORS 和 Referer，我们可以尝试直接 fetch
        // 如果失败，再回退到代理
        try {
            const response = await fetch(videoUrl);
            if (!response.ok) throw new Error('Direct fetch failed');
            const videoBlob = await response.blob();
            videoData = new Uint8Array(await videoBlob.arrayBuffer());
        } catch (directError) {
            console.warn('Direct fetch failed, trying proxy...', directError);
            if (window.electron) {
                // Electron 环境：使用 IPC 代理
                const { data } = await window.electron.proxyRequest(videoUrl);
                videoData = new Uint8Array(data);
            } else {
                // Web 环境：使用 API 代理
                const response = await fetch(`/api/proxy?url=${encodeURIComponent(videoUrl)}`);
                if (!response.ok) throw new Error('无法下载视频文件');
                const videoBlob = await response.blob();
                videoData = new Uint8Array(await videoBlob.arrayBuffer());
            }
        }
        
        await ffmpeg.writeFile('input.mp4', videoData);

        ffmpeg.on('progress', ({ progress }) => {
            if (onProgress) onProgress(progress * 100);
        });

        // 转换为 GIF，优化参数
        // fps=15, scale=480:-1 (宽度480，高度自适应)
        await ffmpeg.exec([
            '-i', 'input.mp4',
            '-vf', 'fps=15,scale=480:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse',
            'output.gif'
        ]);

        const data = await ffmpeg.readFile('output.gif');
        return new Blob([data as any], { type: 'image/gif' });
    } catch (error) {
        console.error('Conversion error:', error);
        throw error;
    }
  };

  return { loaded, isLoading, load, convertToGif };
}