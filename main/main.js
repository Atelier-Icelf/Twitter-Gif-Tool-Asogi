const { app, BrowserWindow, ipcMain, session, net, dialog, shell, protocol } = require('electron');
const path = require('path');
const fs = require('fs');

// 注册自定义协议方案为特权方案
protocol.registerSchemesAsPrivileged([
    { scheme: 'app', privileges: { secure: true, standard: true, supportFetchAPI: true, corsEnabled: true } }
]);

// 配置管理
const getConfigPath = () => path.join(app.getPath('userData'), 'config.json');
const getDefaultDownloadPath = () => {
    // 尝试在可执行文件同级创建 Downloads，如果失败（无权限）则回退到系统下载目录
    try {
        const exeDir = path.dirname(app.getPath('exe'));
        const localDownloads = path.join(exeDir, 'Downloads');
        if (!fs.existsSync(localDownloads)) {
            fs.mkdirSync(localDownloads);
        }
        // 测试写入权限
        const testFile = path.join(localDownloads, '.test');
        fs.writeFileSync(testFile, 'test');
        fs.unlinkSync(testFile);
        return localDownloads;
    } catch (e) {
        console.warn('无法在软件目录创建下载文件夹，回退到系统下载目录', e);
        return path.join(app.getPath('downloads'), 'TwitterGifTool');
    }
};

let appConfig = {
    downloadPath: ''
};

function loadConfig() {
    try {
        if (fs.existsSync(getConfigPath())) {
            const data = fs.readFileSync(getConfigPath(), 'utf8');
            appConfig = JSON.parse(data);
        }
    } catch (e) {
        console.error('Failed to load config', e);
    }

    if (!appConfig.downloadPath) {
        appConfig.downloadPath = getDefaultDownloadPath();
        saveConfig();
    }
}

function saveConfig() {
    try {
        fs.writeFileSync(getConfigPath(), JSON.stringify(appConfig, null, 2));
    } catch (e) {
        console.error('Failed to save config', e);
    }
}

let mainWindow;

function createWindow() {
  loadConfig();
  
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 800,
    minHeight: 600,
    frame: false, // 无边框窗口
    titleBarStyle: 'hidden',
    webPreferences: {
      // 使用 __dirname 确保在开发和打包环境中都能正确找到 preload.js
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webSecurity: false,
    },
    backgroundColor: '#ffffff',
    show: false, // 先隐藏，加载完再显示
  });

  // 开发环境加载 localhost，生产环境加载打包后的文件
  const isDev = process.env.NODE_ENV === 'development' || process.env.ELECTRON_START_URL;

  if (isDev) {
      mainWindow.loadURL('http://localhost:3000');
      mainWindow.webContents.openDevTools();
  } else {
      // 生产环境使用自定义协议加载
      mainWindow.loadURL('app://./index.html');
  }

  // 监听渲染进程崩溃
  mainWindow.webContents.on('render-process-gone', (event, details) => {
    console.error('Render process gone:', details);
  });

  // 监听页面加载失败
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Failed to load:', errorCode, errorDescription);
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // 窗口控制 IPC
  ipcMain.on('window-minimize', () => mainWindow.minimize());
  ipcMain.on('window-close', () => mainWindow.close());
}

// 配置相关 IPC
ipcMain.handle('get-config', () => appConfig);

ipcMain.handle('select-download-path', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory'],
        defaultPath: appConfig.downloadPath
    });
    
    if (!result.canceled && result.filePaths.length > 0) {
        appConfig.downloadPath = result.filePaths[0];
        saveConfig();
        return appConfig.downloadPath;
    }
    return null;
});

ipcMain.handle('open-downloads-folder', () => {
    shell.openPath(appConfig.downloadPath);
});

// 下载文件 IPC
ipcMain.handle('download-file', async (event, url, filename) => {
    try {
        const response = await net.fetch(url);
        if (!response.ok) throw new Error(`Download failed: ${response.statusText}`);
        
        const buffer = await response.arrayBuffer();
        // 确保目录存在
        if (!fs.existsSync(appConfig.downloadPath)) {
            fs.mkdirSync(appConfig.downloadPath, { recursive: true });
        }
        
        const filePath = path.join(appConfig.downloadPath, filename);
        fs.writeFileSync(filePath, Buffer.from(buffer));
        
        // 打开文件夹并选中文件
        shell.showItemInFolder(filePath);
        
        return { success: true, path: filePath };
    } catch (e) {
        console.error('Download error:', e);
        return { success: false, error: e.message };
    }
});

// 保存 GIF IPC (因为 GIF 是在渲染进程生成的 Blob，需要传递 Buffer 或 base64)
ipcMain.handle('save-gif', async (event, buffer, filename) => {
    try {
        if (!fs.existsSync(appConfig.downloadPath)) {
            fs.mkdirSync(appConfig.downloadPath, { recursive: true });
        }
        const filePath = path.join(appConfig.downloadPath, filename);
        fs.writeFileSync(filePath, Buffer.from(buffer));
        shell.showItemInFolder(filePath);
        return { success: true, path: filePath };
    } catch (e) {
        console.error('Save GIF error:', e);
        return { success: false, error: e.message };
    }
});

app.whenReady().then(() => {
  // 注册 app 协议
  protocol.handle('app', async (request) => {
      const url = new URL(request.url);
      let pathname = url.pathname;
      
      // 处理 Windows 路径问题
      if (pathname.startsWith('//')) {
          pathname = pathname.slice(1);
      }
      
      // 默认加载 index.html
      if (pathname === '/' || pathname === '') {
          pathname = '/index.html';
      }

      const appPath = path.join(__dirname, '../out');
      let filePath = path.join(appPath, pathname);

      // 简单的文件扩展名处理 (Next.js 静态导出)
      try {
          // 尝试直接访问
          await fs.promises.access(filePath);
      } catch {
          // 如果失败，尝试添加 .html
          if (path.extname(filePath) === '') {
              filePath += '.html';
              try {
                  await fs.promises.access(filePath);
              } catch {
                  // 404
                  return new Response('Not Found', { status: 404 });
              }
          } else {
              return new Response('Not Found', { status: 404 });
          }
      }

      const data = await fs.promises.readFile(filePath);
      const ext = path.extname(filePath).toLowerCase();
      let mimeType = 'application/octet-stream';
      
      const mimeTypes = {
          '.html': 'text/html',
          '.js': 'text/javascript',
          '.css': 'text/css',
          '.json': 'application/json',
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.gif': 'image/gif',
          '.svg': 'image/svg+xml',
          '.ico': 'image/x-icon',
          '.wasm': 'application/wasm',
          '.mp4': 'video/mp4'
      };

      if (mimeTypes[ext]) {
          mimeType = mimeTypes[ext];
      }

      return new Response(data, {
          headers: {
              'content-type': mimeType,
              'Cross-Origin-Opener-Policy': 'same-origin',
              'Cross-Origin-Embedder-Policy': 'require-corp'
          }
      });
  });

  // 全局注入安全头 (COOP/COEP)，确保 FFmpeg WASM (SharedArrayBuffer) 可用
  // 同时处理 CORS 问题，允许跨域加载视频资源
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const { responseHeaders } = details;
    
    // 注入 COOP/COEP (针对非 app 协议的请求，虽然主要靠 app 协议的 headers，但双重保险)
    const newHeaders = {
        ...responseHeaders,
        'Cross-Origin-Opener-Policy': ['same-origin'],
        'Cross-Origin-Embedder-Policy': ['require-corp'],
    };

    // 针对视频资源，注入 CORS 头
    // 注意：推特视频通常来自 twimg.com 或 video.twimg.com
    if (details.url.includes('twimg.com') || details.url.includes('twitter.com') || details.url.includes('x.com')) {
        newHeaders['Access-Control-Allow-Origin'] = ['*'];
        // 移除可能存在的限制性头
        delete newHeaders['access-control-allow-origin'];
    }

    callback({
      responseHeaders: newHeaders,
    });
  });

  // 修改请求头以绕过 Referer 检查 (针对推特图片/视频资源)
  // 必须在所有请求发出前拦截，确保 Referer 正确
  const filter = {
    urls: ['*://*.twimg.com/*', '*://*.twitter.com/*', '*://*.x.com/*']
  };
  
  session.defaultSession.webRequest.onBeforeSendHeaders(filter, (details, callback) => {
    const { requestHeaders } = details;
    requestHeaders['Referer'] = 'https://twitter.com/';
    requestHeaders['Origin'] = 'https://twitter.com/';
    callback({ requestHeaders });
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// 推特解析逻辑 (IPC)
ipcMain.handle('analyze-twitter', async (event, url) => {
  return new Promise((resolve, reject) => {
    // 创建一个隐形的窗口用于抓取
    const workerWindow = new BrowserWindow({
      show: false,
      width: 1280,
      height: 800,
      webPreferences: {
        // 移除 offscreen 和 images: false 以模拟真实环境
        // 启用图片有助于触发视频加载逻辑
        webSecurity: false,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false // 防止后台窗口被挂起
      }
    });

    // 模拟真实浏览器 UA (更新到较新版本)
    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
    workerWindow.webContents.setUserAgent(userAgent);

    // 禁用音频，避免后台播放声音
    workerWindow.webContents.setAudioMuted(true);

    const videoUrls = [];
    let timeoutId;
    let found = false;

    // 监听网络请求
    const filter = { urls: ['*://*/*'] };
    workerWindow.webContents.session.webRequest.onResponseStarted(filter, (details) => {
      const { url: responseUrl, responseHeaders } = details;
      const contentType = (responseHeaders['content-type'] || [])[0] || '';

      // 更加宽松的匹配逻辑，同时排除非视频资源
      if ((responseUrl.includes('.m3u8') || contentType.includes('application/vnd.apple.mpegurl')) && !responseUrl.includes('live_video')) {
         // 优先匹配 m3u8 (HLS)
         // 排除直播流，如果是推文视频通常是 .m3u8
         videoUrls.push({ type: 'm3u8', url: responseUrl });
      } else if (contentType.includes('video/mp4') && !responseUrl.includes('.m4s') /* 排除 DASH 分片 */) {
         videoUrls.push({ type: 'mp4', url: responseUrl });
      }
    });

    // 加载页面
    workerWindow.loadURL(url);

    // 清理函数
    const cleanup = () => {
        if (!workerWindow.isDestroyed()) {
            workerWindow.destroy();
        }
        if (timeoutId) clearTimeout(timeoutId);
    };

    // 成功回调
    const finish = () => {
        if (found) return; // 避免重复调用
        found = true;
        
        if (videoUrls.length > 0) {
            // 过滤和去重
            // 优先保留 m3u8，因为分辨率通常更高
            const m3u8s = videoUrls.filter(v => v.type === 'm3u8');
            const mp4s = videoUrls.filter(v => v.type === 'mp4');
            
            // 简单去重
            const uniqueVideos = [];
            const seenUrls = new Set();
            
            [...m3u8s, ...mp4s].forEach(v => {
                if (!seenUrls.has(v.url)) {
                    seenUrls.add(v.url);
                    uniqueVideos.push(v);
                }
            });

            resolve({ success: true, videos: uniqueVideos });
        } else {
            reject(new Error('未检测到视频资源，请确认链接有效且包含视频'));
        }
        cleanup();
    };

    // 设置超时 (20秒)
    timeoutId = setTimeout(() => {
        if (!found) {
            // 超时时也尝试返回已找到的（如果有）
            if (videoUrls.length > 0) {
                finish();
            } else {
                reject(new Error('解析超时，请检查网络或重试'));
                cleanup();
            }
        }
    }, 20000);

    // 页面加载完成后，模拟交互以触发视频加载
    workerWindow.webContents.on('did-finish-load', async () => {
        console.log('Worker window loaded:', url);
        try {
             // 注入脚本模拟用户行为
             await workerWindow.webContents.executeJavaScript(`
                (async () => {
                    try {
                        // 1. 初始滚动
                        window.scrollTo(0, 100);
                        await new Promise(r => setTimeout(r, 500));

                        // 2. 尝试查找并点击播放按钮 (针对非自动播放场景)
                        const playButtons = document.querySelectorAll('[aria-label="Play video"], [data-testid="playButton"], div[role="button"][aria-label*="Play"]');
                        playButtons.forEach(btn => btn.click());

                        // 3. 尝试直接播放 video 元素
                        const videos = document.querySelectorAll('video');
                        videos.forEach(v => {
                            v.muted = true; // 确保静音以允许自动播放
                            v.play().catch(e => console.log('Auto-play failed', e));
                        });

                        // 4. 再次滚动
                        window.scrollTo(0, 500);
                        await new Promise(r => setTimeout(r, 1000));
                        window.scrollTo(0, 0);
                    } catch (err) {
                        console.error('In-page script error:', err);
                    }
                })();
             `);
             
             // 等待几秒钟让请求发出，稍微延长等待时间以确保 m3u8 加载
             setTimeout(() => {
                 finish();
             }, 8000);
        } catch (e) {
            console.error('Script execution failed:', e);
            // 即使脚本失败，也尝试完成
            setTimeout(finish, 5000);
        }
    });
  });
});

// 代理请求逻辑 (IPC) - 解决跨域
// 注意：对于大文件或流式传输，IPC 传递 Buffer 可能效率较低
// 但对于 m3u8 文本和较小的视频片段，这是可行的
// 对于大型 mp4，建议在渲染进程使用 fetch 配合 Electron 的 webRequest 修改头
ipcMain.handle('proxy-request', async (event, url) => {
    try {
        const response = await net.fetch(url);
        const contentType = response.headers.get('content-type');
        let buffer = await response.arrayBuffer();
        
        // 如果是 m3u8，需要重写内部链接
        if (url.includes('.m3u8') || (contentType && contentType.includes('mpegurl'))) {
            let text = Buffer.from(buffer).toString('utf8');
            const baseUrl = url.substring(0, url.lastIndexOf('/') + 1);
            
            // 简单的正则替换，将相对路径转换为绝对路径
            // 注意：这里我们不再次代理分片，而是让渲染进程通过修改了 Referer 的 fetch 去请求
            // 或者，如果需要完全代理，这里需要将分片链接也替换为代理协议（比较复杂）
            // 鉴于我们已经修复了 Referer 和 CORS，直接使用绝对路径应该足够
            
            text = text.replace(/^(?!http)(.*\.m3u8|.*\.ts|.*\.mp4)/gm, (match) => {
                return new URL(match, baseUrl).toString();
            });
            
            buffer = Buffer.from(text);
        }
        
        return {
            contentType,
            data: Buffer.from(buffer)
        };
    } catch (e) {
        console.error('Proxy request error:', e);
        throw e;
    }
});