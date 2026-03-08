import { useEffect, useRef, useState, useCallback } from 'react';
import { socket } from '../lib/socket.js';

const CAPTURE_INTERVAL_MS = 45_000;
const JPEG_QUALITY = 0.6;

/**
 * Requests screen sharing via getDisplayMedia, captures a JPEG frame
 * every 45 seconds, and emits it to the server as "screen-capture".
 *
 * Returns:
 *  - screenEnabled: boolean — whether screen sharing is active
 *  - screenDenied: boolean — user denied the permission
 *  - startScreenCapture(roomCode): call after calibration to request permission
 *  - stopScreenCapture(): cleanup
 */
export function useScreenCapture() {
  const streamRef = useRef(null);
  const intervalRef = useRef(null);
  const canvasRef = useRef(null);
  const videoRef = useRef(null);
  const [screenEnabled, setScreenEnabled] = useState(false);
  const [screenDenied, setScreenDenied] = useState(false);
  const roomCodeRef = useRef(null);

  const captureFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);

    // Convert to base64 JPEG (strip data:image/jpeg;base64, prefix)
    const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
    const base64 = dataUrl.split(',')[1];
    if (!base64) return;

    socket.emit('screen-capture', {
      roomCode: roomCodeRef.current,
      image: base64,
      mimeType: 'image/jpeg',
    });
  }, []);

  const startScreenCapture = useCallback(async (roomCode) => {
    roomCodeRef.current = roomCode;

    // Create hidden elements if they don't exist
    if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas');
    }
    if (!videoRef.current) {
      videoRef.current = document.createElement('video');
      videoRef.current.playsInline = true;
      videoRef.current.muted = true;
    }

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 1 },
        audio: false,
      });
      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();

      setScreenEnabled(true);
      setScreenDenied(false);

      // Handle user stopping share via browser UI
      stream.getVideoTracks()[0].addEventListener('ended', () => {
        stopScreenCapture();
      });

      // Start periodic capture
      intervalRef.current = setInterval(captureFrame, CAPTURE_INTERVAL_MS);
      // Also capture immediately
      setTimeout(captureFrame, 2000);
    } catch (err) {
      console.warn('[screen] Screen sharing denied or failed:', err.message);
      setScreenDenied(true);
      setScreenEnabled(false);
    }
  }, [captureFrame]);

  const stopScreenCapture = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setScreenEnabled(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => stopScreenCapture();
  }, [stopScreenCapture]);

  return { screenEnabled, screenDenied, startScreenCapture, stopScreenCapture };
}
