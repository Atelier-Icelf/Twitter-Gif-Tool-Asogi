# Electron 主进程架构重构计划

## 1. 问题诊断
目前打包后的应用存在以下严重问题：
- **交互完全失效**：按钮点击无反应，窗口无法拖动或关闭。这表明渲染进程（React）与主进程（Electron）之间的 IPC 通信链路断裂，或者 React 应用未能成功水合（Hydration Failed）。
- **静态资源加载脆弱**：手动实现的 `app://` 协议处理可能未能正确处理 Next.js 静态导出的路由逻辑，导致部分脚本无法加载或执行。
- **环境隔离问题**：WASM 环境（FFmpeg）所需的特殊安全头可能在生产环境中未正确应用。

## 2. 解决方案：引入 `electron-serve` 标准化架构

为了彻底解决上述问题，我们不再修补手写的协议代码，而是采用行业标准的 `electron-serve` 库来接管静态资源服务。

### 架构变更点

| 功能模块 | 当前实现 (旧) | 计划实现 (新) | 优势 |
| :--- | :--- | :--- | :--- |
| **静态资源服务** | 手动 `protocol.handle('app')` | `electron-serve` | 标准化处理路由、MIME 类型和 404 回退，极其稳定。 |
| **加载方式** | `loadURL('app://./index.html')` | `serveURL(mainWindow)` | 自动处理 scheme，开发/生产环境切换更平滑。 |
| **Preload 路径** | `path.join(__dirname, 'preload.js')` | 保持不变 (需验证) | 确保 IPC 脚本正确注入。 |
| **安全头 (COOP/COEP)** | 在协议响应中手动添加 | `session.webRequest.onHeadersReceived` | **全局注入**。无论资源来自哪里（包括本地文件），都强制添加安全头，确保 WASM 100% 可用。 |

## 3. 详细实施步骤

### 步骤 1: 引入 `electron-serve`
修改 `main/main.js`，初始化 `electron-serve` 指向 `out` 目录（Next.js 的导出目录）。

```javascript
const serve = require('electron-serve');
const loadURL = serve({ directory: 'out' });
```

### 步骤 2: 重构窗口创建逻辑
区分开发环境（加载 localhost）和生产环境（使用 `serveURL`）。

```javascript
// 生产环境
if (!isDev) {
    await loadURL(mainWindow);
}
```

### 步骤 3: 全局注入安全头 (关键)
不再依赖协议拦截，而是使用 Session 层的全局拦截。这是解决 WASM 问题的终极方案。

```javascript
app.whenReady().then(() => {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
        callback({
            responseHeaders: {
                ...details.responseHeaders,
                'Cross-Origin-Opener-Policy': 'same-origin',
                'Cross-Origin-Embedder-Policy': 'require-corp',
            }
        });
    });
    // ...
});
```

### 步骤 4: 清理旧代码
删除所有手写的 `protocol.handle('app', ...)` 代码，大幅简化 `main.js`。

## 4. 预期结果
1.  **UI 交互恢复**：正确的资源加载将确保 React 应用正常启动，IPC 通信恢复。
2.  **FFmpeg 功能正常**：全局安全头将确保 `SharedArrayBuffer` 可用，视频转 GIF 功能正常。
3.  **代码质量提升**：代码量减少，逻辑更清晰，维护成本降低。