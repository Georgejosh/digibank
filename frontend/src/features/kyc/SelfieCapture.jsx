import { useEffect, useRef, useState } from 'react';
import { Camera, RefreshCw, Upload } from 'lucide-react';
import { Button } from '@/components/ui/Button';

/**
 * Live selfie for KYC. Uses the front camera through getUserMedia and turns
 * one frame into a JPEG. If the camera is blocked or missing, the user can
 * upload a photo instead (on phones this opens the camera app).
 */
export function SelfieCapture({ value, onChange }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [state, setState] = useState('idle'); // idle | starting | live | error
  const [error, setError] = useState(null);
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    if (!value) {
      setPreview(null);
      return undefined;
    }
    const url = URL.createObjectURL(value);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [value]);

  const stop = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };
  useEffect(() => stop, []);

  const start = async () => {
    setError(null);
    setState('starting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      setState('live');
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      });
    } catch (e) {
      setState('error');
      setError(
        e?.name === 'NotAllowedError'
          ? 'Camera permission was blocked. Allow it in the address bar, or upload a photo instead.'
          : 'No camera found. Upload a photo instead.'
      );
    }
  };

  const capture = () => {
    const video = videoRef.current;
    if (!video?.videoWidth) return;
    const size = Math.min(video.videoWidth, video.videoHeight);
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    // Mirror back to a true (non-selfie-flipped) image, centred square crop.
    ctx.translate(size, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, (video.videoWidth - size) / 2, (video.videoHeight - size) / 2, size, size, 0, 0, size, size);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        onChange(new File([blob], 'selfie.jpg', { type: 'image/jpeg' }));
        stop();
        setState('idle');
      },
      'image/jpeg',
      0.9
    );
  };

  return (
    <div className="flex flex-col items-center">
      <div className="relative h-60 w-60 overflow-hidden rounded-full bg-ink-900 ring-4 ring-brand-100">
        {state === 'live' ? (
          <video ref={videoRef} playsInline muted className="h-full w-full -scale-x-100 object-cover" />
        ) : preview ? (
          <img src={preview} alt="Your selfie" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-ink-400">
            <Camera aria-hidden="true" className="h-10 w-10" />
            <span className="text-xs">No photo yet</span>
          </div>
        )}
        {state === 'live' && (
          <div aria-hidden="true" className="pointer-events-none absolute inset-6 rounded-full border-2 border-dashed border-white/60" />
        )}
      </div>

      <p className="mt-3 max-w-xs text-center text-xs text-ink-500">
        Face the camera in good light. No cap, mask or sunglasses. Fit your face inside the circle.
      </p>

      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {state === 'live' ? (
          <Button onClick={capture} leftIcon={Camera}>
            Capture
          </Button>
        ) : (
          <Button onClick={start} isLoading={state === 'starting'} leftIcon={value ? RefreshCw : Camera}>
            {value ? 'Retake' : 'Open camera'}
          </Button>
        )}
        <label className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-field bg-white px-5 text-sm font-semibold text-brand-800 shadow-field ring-1 ring-inset ring-ink-200 hover:bg-ink-50">
          <Upload aria-hidden="true" className="h-4 w-4" />
          Upload photo
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="user"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                stop();
                setState('idle');
                onChange(file);
              }
            }}
          />
        </label>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-center text-xs font-medium text-danger-600">
          {error}
        </p>
      )}
    </div>
  );
}

export default SelfieCapture;
