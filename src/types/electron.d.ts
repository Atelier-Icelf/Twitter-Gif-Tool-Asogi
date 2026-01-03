export interface ElectronAPI {
  analyze: (url: string) => Promise<{ success: boolean; videos: { type: string; url: string }[] }>;
  minimize: () => void;
  close: () => void;
  proxyRequest: (url: string) => Promise<{ contentType: string; data: ArrayBuffer }>;
  getConfig: () => Promise<{ downloadPath: string }>;
  selectDownloadPath: () => Promise<string | null>;
  openDownloadsFolder: () => Promise<void>;
  downloadFile: (url: string, filename: string) => Promise<{ success: boolean; path?: string; error?: string }>;
  saveGif: (buffer: ArrayBuffer, filename: string) => Promise<{ success: boolean; path?: string; error?: string }>;
}

declare global {
  interface Window {
    electron?: ElectronAPI;
  }
}