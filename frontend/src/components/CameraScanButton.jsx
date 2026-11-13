import { useEffect, useRef, useState } from 'react';
import { Modal, Btn } from './ui';
import { createPortal } from 'react-dom';
import { isMobileOrTablet } from '../lib/mobileDevice';

export function CameraIcon() {
  return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 6h3l2-3h6l2 3h3a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z"/><circle cx="12" cy="13" r="4"/></svg>;
}
const cameraError = (e) => {
  if (e?.name === 'NotAllowedError' || e?.name === 'SecurityError') return 'Camera access is blocked. Allow Camera in your browser or device settings, then try again. You can still type the code.';
  if (e?.name === 'NotFoundError') return 'No camera was found on this device. You can still type the code.';
  if (e?.name === 'NotReadableError') return 'The camera is busy. Close other apps using it and try again.';
  return e?.message || 'Could not open the camera. You can still type the code.';
};

function Scanner({ onScan, onClose, title }) {
  const video = useRef(null), callbacks = useRef({onScan,onClose});
  callbacks.current = {onScan,onClose};
  const [error, setError] = useState(''), [ready, setReady] = useState(false), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false, accepted = false, stream, controls;
    const stop = () => { controls?.stop(); stream?.getTracks().forEach(t => t.stop()); };
    const escape = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); callbacks.current.onClose(); } };
    const hideOffline = () => { stop(); callbacks.current.onClose(); };
    const hide = () => { if (document.hidden) { stop(); callbacks.current.onClose(); } };
    const start = async () => {
      setError(''); setReady(false);
      try {
        if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error('Camera scanning needs HTTPS and a browser with camera access. You can still type the code.');
        // Decode locally; no camera frames or photos leave this device.
        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        if (cancelled) return;
        stream = await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}}});
        if (cancelled) { stop(); return; }
        const reader = new BrowserMultiFormatReader(undefined, {delayBetweenScanAttempts:120,delayBetweenScanSuccess:500});
        controls = await reader.decodeFromStream(stream, video.current, (result, _err, scanner) => {
          if (cancelled || accepted || !result) return;
          const code = result.getText().trim();
          if (!code) return;
          accepted = true; scanner.stop(); stop();
          callbacks.current.onClose();
          callbacks.current.onScan(code);
        });
        if (cancelled || accepted) stop(); else setReady(true);
      } catch (e) { stop(); if (!cancelled && !accepted) setError(cameraError(e)); }
    };
    start();
    document.addEventListener('visibilitychange',hide);
    document.addEventListener('keydown',escape,true);
    window.addEventListener('offline',hideOffline);
    return () => { cancelled = true; stop(); document.removeEventListener('visibilitychange',hide); document.removeEventListener('keydown',escape,true); window.removeEventListener('offline',hideOffline); };
  }, [attempt]);
  return <Modal open title={title} onClose={onClose} size="md" footer={<><Btn onClick={onClose}>Close camera</Btn>{error && <Btn kind="primary" onClick={()=>setAttempt(n=>n+1)}>Try again</Btn>}</>}>
    <p className="camera-intro">Point the back camera at one barcode or serial label.</p>
    <div className="camera-view"><video ref={video} playsInline muted autoPlay aria-label="Barcode camera preview"/><div className="camera-guide" aria-hidden="true"><span/></div><span className="camera-live">{ready ? 'Camera ready' : error ? 'Camera unavailable' : 'Opening camera…'}</span></div>
    {error ? <p className="camera-error" role="alert">{error}</p> : <p className="camera-help" role="status">Keep the code inside the frame and hold steady. The camera closes after one scan.</p>}
    <p className="camera-private">Scanning stays on this device. No photo is saved or uploaded.</p>
  </Modal>;
}

/** Camera is opt-in, and only shown for a phone/tablet device family. */
export default function CameraScanButton({onScan,label='Scan barcode with camera',title='Scan barcode',disabled=false}) {
  const [open,setOpen] = useState(false);
  if (!isMobileOrTablet()) return null;
  return <><button type="button" className="camera-trigger" aria-label={label} title={label} disabled={disabled} onClick={()=>setOpen(true)}><CameraIcon/></button>{open && createPortal(<div className="camera-overlay"><Scanner title={title} onScan={onScan} onClose={()=>setOpen(false)}/></div>,document.body)}</>;
}
