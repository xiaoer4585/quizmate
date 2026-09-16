import { useEffect, useState, type CSSProperties } from 'react';

export default function TransparentCaptureOverlay() {
  const [configuring, setConfiguring] = useState(false);
  const api = (window as any).electronAPI;

  useEffect(() => {
    const off = api?.on?.('transparent-capture:visual', (value: { configuring?: boolean }) => {
      setConfiguring(value?.configuring === true);
    });
    return () => off?.();
  }, [api]);

  const style = {
    width: '100vw',
    height: '100vh',
    background: 'transparent',
    border: configuring ? '2px solid rgba(45, 212, 191, 0.95)' : '2px solid transparent',
    boxSizing: 'border-box' as const,
    cursor: configuring ? 'move' : 'crosshair',
    WebkitAppRegion: configuring ? 'drag' : 'no-drag',
  } as CSSProperties & { WebkitAppRegion?: 'drag' | 'no-drag' };

  return (
    <div
      aria-label="透明点击截图区域"
      style={style}
      onClick={() => { if (!configuring) void api?.companion?.transparentClick?.(); }}
    />
  );
}
