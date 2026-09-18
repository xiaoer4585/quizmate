import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { shouldTriggerTransparentCapture } from '../../shared/transparent-capture-gesture';

type Corner = 'nw' | 'ne' | 'sw' | 'se';
type Gesture = { kind: 'move' | 'resize'; corner?: Corner; startX: number; startY: number; lastX: number; lastY: number; distance: number };
type PendingDelta = { kind: 'move' | 'resize'; corner?: Corner; dx: number; dy: number };

export default function TransparentCaptureOverlay() {
  const [configuring, setConfiguring] = useState(false);
  const gesture = useRef<Gesture | null>(null);
  const pendingDelta = useRef<PendingDelta | null>(null);
  const animationFrame = useRef<number | null>(null);
  const companionApi = (window as any).api?.companion;
  const eventApi = (window as any).electronAPI;

  useEffect(() => {
    const off = eventApi?.on?.('transparent-capture:visual', (value: { configuring?: boolean }) => setConfiguring(value?.configuring === true));
    return () => off?.();
  }, [eventApi]);

  useEffect(() => () => {
    if (animationFrame.current !== null) cancelAnimationFrame(animationFrame.current);
  }, []);

  const flushDelta = () => {
    if (animationFrame.current !== null) cancelAnimationFrame(animationFrame.current);
    animationFrame.current = null;
    const pending = pendingDelta.current;
    pendingDelta.current = null;
    if (!pending) return;
    if (pending.kind === 'resize' && pending.corner) void companionApi?.transparentCapture?.resizeBy(pending.corner, pending.dx, pending.dy);
    else void companionApi?.transparentCapture?.moveBy(pending.dx, pending.dy);
  };

  const queueDelta = (kind: 'move' | 'resize', corner: Corner | undefined, dx: number, dy: number) => {
    const pending = pendingDelta.current;
    if (pending && pending.kind === kind && pending.corner === corner) {
      pending.dx += dx;
      pending.dy += dy;
    } else {
      flushDelta();
      pendingDelta.current = { kind, corner, dx, dy };
    }
    if (animationFrame.current === null) animationFrame.current = requestAnimationFrame(flushDelta);
  };

  const begin = (event: ReactPointerEvent<HTMLElement>, kind: 'move' | 'resize', corner?: Corner) => {
    event.preventDefault(); event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    gesture.current = { kind, corner, startX: event.screenX, startY: event.screenY, lastX: event.screenX, lastY: event.screenY, distance: 0 };
  };
  const move = (event: ReactPointerEvent<HTMLElement>) => {
    const current = gesture.current;
    if (!current) return;
    event.preventDefault();
    const dx = event.screenX - current.lastX;
    const dy = event.screenY - current.lastY;
    if (!dx && !dy) return;
    current.lastX = event.screenX; current.lastY = event.screenY;
    current.distance = Math.max(current.distance, Math.hypot(event.screenX - current.startX, event.screenY - current.startY));
    queueDelta(current.kind, current.corner, dx, dy);
  };
  const end = (event: ReactPointerEvent<HTMLElement>) => {
    const current = gesture.current;
    if (!current) return;
    event.preventDefault(); event.stopPropagation();
    try { event.currentTarget.releasePointerCapture?.(event.pointerId); } catch {}
    flushDelta();
    gesture.current = null;
    if (!configuring && current.kind === 'move' && shouldTriggerTransparentCapture(event.screenX - current.startX, event.screenY - current.startY)) void companionApi?.transparentClick?.();
  };
  const style = { width: '100vw', height: '100vh', background: 'transparent', border: configuring ? '2px solid rgba(45, 212, 191, 0.95)' : '2px solid transparent', boxSizing: 'border-box' as const, cursor: configuring ? 'move' : 'crosshair', userSelect: 'none', touchAction: 'none' } as CSSProperties;
  const handleStyle = (corner: Corner): CSSProperties => ({ position: 'absolute', width: 14, height: 14, borderRadius: 3, background: '#5eead4', border: '2px solid #042f2e', cursor: `${corner}-resize`, ...(corner.includes('n') ? { top: -7 } : { bottom: -7 }), ...(corner.includes('w') ? { left: -7 } : { right: -7 }) });
  return <div aria-label="屏幕透明区截图" style={style} onPointerDown={(event) => begin(event, 'move')} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
    {configuring && (['nw', 'ne', 'sw', 'se'] as Corner[]).map((corner) => <span key={corner} aria-label={`${corner} 调整柄`} style={handleStyle(corner)} onPointerDown={(event) => begin(event, 'resize', corner)} onPointerMove={move} onPointerUp={end} onPointerCancel={end} />)}
  </div>;
}
