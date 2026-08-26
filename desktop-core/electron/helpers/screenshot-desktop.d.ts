declare module 'screenshot-desktop' {
  interface ScreenshotOptions {
    format?: 'jpg' | 'png';
    quality?: number;
    width?: number;
    height?: number;
    screen?: number | string;
    crop?: { x: number; y: number; width: number; height: number };
    filename?: string;
    lname?: string;
  }
  const screenshot: ((opts?: ScreenshotOptions) => Promise<Buffer>) & {
    all: () => Promise<Array<{ name: string; id: string }>>;
    listScreens: () => Promise<Array<{ name: string; id: string }>>;
  };
  export default screenshot;
}
