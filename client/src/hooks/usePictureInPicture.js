import { useEffect, useRef, useCallback, useState } from 'react';

/**
 * Document Picture-in-Picture hook.
 *
 * Opens a real browser PiP window with:
 *   - A <video> background streaming the 3D Canvas
 *   - A portal target div where React can render QuizOverlay, HUD, etc.
 *
 * Falls back to classic video-only PiP if Document PiP is unavailable.
 *
 * Usage:
 *   const { setContainerRef, pipReady, pipActive, enterPiP, exitPiP, pipOverlayRoot } = usePictureInPicture({ enabled });
 *   <div ref={setContainerRef}><Canvas ... /></div>
 *   {pipOverlayRoot && createPortal(<QuizOverlay />, pipOverlayRoot)}
 */
export function usePictureInPicture({ enabled = true } = {}) {
  const containerRef = useRef(null);
  const streamRef = useRef(null);
  const [pipActive, setPipActive] = useState(false);
  const [pipReady, setPipReady] = useState(false);
  const [pipWindow, setPipWindow] = useState(null);
  const [pipOverlayRoot, setPipOverlayRoot] = useState(null);

  const setContainerRef = useCallback((node) => { containerRef.current = node; }, []);

  // Capture the canvas stream once it's ready
  useEffect(() => {
    if (!enabled) { setPipReady(false); return; }

    let cancelled = false;

    const poll = setInterval(() => {
      if (cancelled) { clearInterval(poll); return; }

      const canvas = containerRef.current?.querySelector?.('canvas');
      if (!canvas || canvas.width === 0) return;

      try {
        streamRef.current = canvas.captureStream(30);
        if (!cancelled) setPipReady(true);
        clearInterval(poll);
      } catch (err) {
        console.warn('[PiP] captureStream error:', err.message);
      }
    }, 500);

    return () => {
      cancelled = true;
      clearInterval(poll);
      streamRef.current = null;
      setPipReady(false);
    };
  }, [enabled]);

  const enterPiP = useCallback(async () => {
    const stream = streamRef.current;
    if (!stream) return;

    // ── Document PiP (Chrome 116+) — supports real DOM & interaction ──
    if ('documentPictureInPicture' in window) {
      try {
        const pipWin = await window.documentPictureInPicture.requestWindow({
          width: 440,
          height: 340,
        });

        // Copy all stylesheets from the parent window (Vite injects <style> tags in dev)
        [...document.styleSheets].forEach((sheet) => {
          try {
            if (sheet.href) {
              const link = pipWin.document.createElement('link');
              link.rel = 'stylesheet';
              link.href = sheet.href;
              pipWin.document.head.appendChild(link);
            } else if (sheet.ownerNode?.tagName === 'STYLE') {
              const style = pipWin.document.createElement('style');
              style.textContent = sheet.ownerNode.textContent;
              pipWin.document.head.appendChild(style);
            }
          } catch {}
        });

        // Make html + body fill the full PiP window
        pipWin.document.documentElement.style.cssText =
          'margin:0;padding:0;width:100%;height:100%;overflow:hidden;';
        pipWin.document.body.style.cssText =
          'margin:0;padding:0;overflow:hidden;background:#0a0a18;' +
          'position:relative;width:100%;height:100%;font-family:system-ui,sans-serif;color:#e8e8f0';

        // Video background showing the 3D canvas stream
        const video = pipWin.document.createElement('video');
        video.srcObject = stream;
        video.playsInline = true;
        video.muted = true;
        video.style.cssText =
          'width:100%;height:100%;object-fit:contain;position:absolute;top:0;left:0;z-index:0';
        pipWin.document.body.appendChild(video);
        video.play().catch(() => {});

        // Portal target for React overlays (quiz, HUD, etc.)
        const portalRoot = pipWin.document.createElement('div');
        portalRoot.style.cssText =
          'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:auto;z-index:10';
        pipWin.document.body.appendChild(portalRoot);

        pipWin.addEventListener('pagehide', () => {
          setPipWindow(null);
          setPipOverlayRoot(null);
          setPipActive(false);
        });

        setPipWindow(pipWin);
        setPipOverlayRoot(portalRoot);
        setPipActive(true);
        return;
      } catch (err) {
        console.warn('[PiP] Document PiP failed, trying classic:', err.message);
      }
    }

    // ── Fallback: classic video PiP (no DOM, just the canvas stream) ──
    if (document.pictureInPictureEnabled) {
      const video = document.createElement('video');
      video.srcObject = stream;
      video.playsInline = true;
      video.muted = true;
      video.style.cssText =
        'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none';
      document.body.appendChild(video);

      video.addEventListener('leavepictureinpicture', () => {
        setPipActive(false);
        video.pause();
        video.srcObject = null;
        video.remove();
      });

      try {
        await video.play();
        await video.requestPictureInPicture();
        setPipActive(true);
      } catch (err) {
        console.warn('[PiP] Classic PiP failed:', err.message);
        video.remove();
      }
    }
  }, []);

  const exitPiP = useCallback(() => {
    if (pipWindow) {
      pipWindow.close();
      return;
    }
    if (document.pictureInPictureElement) {
      document.exitPictureInPicture().catch(() => {});
    }
    setPipActive(false);
  }, [pipWindow]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pipWindow) pipWindow.close();
    };
  }, [pipWindow]);

  return { setContainerRef, pipActive, pipReady, enterPiP, exitPiP, pipWindow, pipOverlayRoot };
}
