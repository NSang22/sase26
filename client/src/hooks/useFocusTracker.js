import { useEffect, useRef, useCallback, useState } from 'react';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

const YAW_THRESHOLD = 25;   // degrees from calibrated center
const PITCH_THRESHOLD = 25;
const DETECT_INTERVAL_MS = 250; // 4 Hz — works in background tabs (setInterval)
const MEDIAPIPE_WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm';
const FACE_LANDMARKER_MODEL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

/**
 * Runs MediaPipe Face Landmarker in the browser via webcam.
 * Emits `onFocusChange(focused: boolean)` on state transitions.
 *
 * Uses setInterval (not requestAnimationFrame) so detection continues
 * when the app tab is backgrounded and the user is on their study tab.
 *
 * @param {{ onFocusChange: (focused: boolean) => void, enabled?: boolean }} options
 * @returns {{ videoRef: React.RefObject, calibrating: boolean, ready: boolean }}
 */
export function useFocusTracker({ onFocusChange, enabled = true }) {
  const videoRef = useRef(null);
  const landmarkerRef = useRef(null);
  const intervalRef = useRef(null);
  const focusedRef = useRef(true);
  const calibrationRef = useRef(null);
  const calibrationFramesRef = useRef([]);

  const [calibrating, setCalibrating] = useState(false);
  const [ready, setReady] = useState(false);

  const initLandmarker = useCallback(async () => {
    const filesetResolver = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM);
    landmarkerRef.current = await FaceLandmarker.createFromOptions(filesetResolver, {
      baseOptions: { modelAssetPath: FACE_LANDMARKER_MODEL, delegate: 'GPU' },
      runningMode: 'VIDEO',
      numFaces: 1,
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: true,
    });
  }, []);

  const startTracking = useCallback(async () => {
    try {
      await initLandmarker();

      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();

      setCalibrating(true);
      let isCalibrating = true;
      setTimeout(() => {
        isCalibrating = false;
        if (calibrationFramesRef.current.length > 0) {
          const frames = calibrationFramesRef.current;
          calibrationRef.current = {
            pitch: frames.reduce((s, f) => s + f.pitch, 0) / frames.length,
            yaw: frames.reduce((s, f) => s + f.yaw, 0) / frames.length,
          };
        }
        setCalibrating(false);
        setReady(true);
      }, 3000);

      // Use setInterval instead of requestAnimationFrame so detection
      // continues when the app tab is in the background (user on study tab).
      // Browsers throttle setInterval to ~1 Hz in background tabs, which
      // is still enough for focus tracking.
      intervalRef.current = setInterval(() => {
        if (!landmarkerRef.current || !video || video.readyState < 2) return;

        const results = landmarkerRef.current.detectForVideo(video, performance.now());

        if (results.facialTransformationMatrixes?.length > 0) {
          const m = results.facialTransformationMatrixes[0].data;
          // Column-major 4x4 rotation matrix → extract Euler angles
          const pitch = Math.asin(-m[6]) * (180 / Math.PI);
          const yaw = Math.atan2(m[2], m[10]) * (180 / Math.PI);

          if (isCalibrating) {
            calibrationFramesRef.current.push({ pitch, yaw });
          } else if (calibrationRef.current) {
            const center = calibrationRef.current;
            const focused =
              Math.abs(pitch - center.pitch) < PITCH_THRESHOLD &&
              Math.abs(yaw - center.yaw) < YAW_THRESHOLD;

            if (focused !== focusedRef.current) {
              focusedRef.current = focused;
              onFocusChange?.(focused);
            }
          }
        } else if (!isCalibrating && calibrationRef.current) {
          // No face detected → not focused
          if (focusedRef.current) {
            focusedRef.current = false;
            onFocusChange?.(false);
          }
        }
      }, DETECT_INTERVAL_MS);
    } catch (err) {
      console.error('[focusTracker] Failed to start:', err.message);
    }
  }, [initLandmarker, onFocusChange]);

  useEffect(() => {
    if (!enabled) return;
    startTracking();
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      const stream = videoRef.current?.srcObject;
      if (stream) stream.getTracks().forEach((t) => t.stop());
      landmarkerRef.current?.close();
    };
  }, [enabled, startTracking]);

  return { videoRef, calibrating, ready };
}
