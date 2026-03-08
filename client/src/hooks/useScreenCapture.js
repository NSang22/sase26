import { useEffect, useRef, useState, useCallback } from 'react';
import { socket } from '../lib/socket.js';
import { useGameStore } from '../store/gameStore.js';

const CAPTURE_INTERVAL_MS = 15_000; // capture every 15s
const PLAYER_STAGGER_MS = 3_000;
const JPEG_QUALITY = 0.6;

/**
 * Manages screen sharing and periodic JPEG capture.
 *
 * Modal state lives in the Zustand store (screenShareResolved) so it
 * survives component remounts caused by React StrictMode or parent
 * re-renders. The modal shows until sharing succeeds, is denied, or skipped.
 */
export function useScreenCapture(roomCode, playerIndex = 0) {
  const streamRef    = useRef(null);
  const intervalRef  = useRef(null);
  const canvasRef    = useRef(null);
  const videoRef     = useRef(null);
  const roomCodeRef  = useRef(roomCode);
  const playerIdxRef = useRef(playerIndex);

  roomCodeRef.current  = roomCode;
  playerIdxRef.current = playerIndex;

  // screenShareResolved lives in the Zustand store — survives remounts
  const screenShareResolved = useGameStore((s) => s.screenShareResolved);
  const setScreenShareResolved = useGameStore((s) => s.setScreenShareResolved);

  const [screenEnabled,   setScreenEnabled]   = useState(false);
  const [screenDenied,    setScreenDenied]    = useState(false);
  const [awaitingBrowser, setAwaitingBrowser] = useState(false);

  // Modal shows only when the store says we haven't resolved yet
  const showModal = !screenShareResolved;

  const captureFrame = useCallback(() => {
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) return;

    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);

    const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
    const base64  = dataUrl.split(',')[1];
    if (!base64) return;

    socket.emit('screen-capture', {
      roomCode: roomCodeRef.current,
      image:    base64,
      mimeType: 'image/jpeg',
    });
  }, []);

  /** User clicked "Got it" — open the real browser share dialog. */
  const confirmScreenShare = useCallback(async () => {
    setAwaitingBrowser(true);

    if (!canvasRef.current) canvasRef.current = document.createElement('canvas');
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
      setAwaitingBrowser(false);
      setScreenShareResolved(); // dismiss modal via store

      stream.getVideoTracks()[0].addEventListener('ended', () => stopScreenCapture());

      intervalRef.current = setInterval(captureFrame, CAPTURE_INTERVAL_MS);
      const initialDelay = playerIdxRef.current * PLAYER_STAGGER_MS + 2000;
      setTimeout(captureFrame, initialDelay);
    } catch (err) {
      console.warn('[screen] Screen sharing denied or failed:', err.message);
      setScreenDenied(true);
      setScreenEnabled(false);
      setAwaitingBrowser(false);
      setScreenShareResolved(); // dismiss modal via store
    }
  }, [captureFrame, setScreenShareResolved]); // eslint-disable-line react-hooks/exhaustive-deps

  const stopScreenCapture = useCallback(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    if (streamRef.current)   { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
    if (videoRef.current)    { videoRef.current.srcObject = null; }
    setScreenEnabled(false);
  }, []);

  useEffect(() => () => stopScreenCapture(), [stopScreenCapture]);

  /** User clicked Skip — dismiss modal permanently. */
  const dismissScreenCapture = useCallback(() => {
    setScreenDenied(true);
    setScreenShareResolved(); // dismiss modal via store
  }, [setScreenShareResolved]);

  return {
    screenEnabled,
    screenDenied,
    showModal,
    awaitingBrowser,
    confirmScreenShare,
    dismissScreenCapture,
    stopScreenCapture,
  };
}
