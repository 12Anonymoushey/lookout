import { useEffect, useRef, useState } from 'react';
import { Mic, Play, Square } from 'lucide-react';
import { socket } from '../services/socket.js';
import { ExpandableListCard } from './KebabMenu.jsx';

export default function EmergencyRadio({ logs = [], playingId, dockOnly = false }) {
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState('');

  const stopRecording = () => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;
    recorder.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    setRecording(false);
  };

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Audio recording is not supported by this browser.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        chunksRef.current = [];
        if (blob.size > 0) socket.emit('emergency_radio', await blob.arrayBuffer());
      };
      recorder.start(250);
      setRecording(true);
      setError('');
    } catch (err) {
      setError(err?.message || 'Microphone permission was denied.');
    }
  };

  useEffect(() => () => {
    if (recorderRef.current?.state !== 'inactive') recorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  useEffect(() => {
    if (!dockOnly) return undefined;
    const start = () => startRecording();
    const stop = () => stopRecording();
    window.addEventListener('lookout-radio-start', start);
    window.addEventListener('lookout-radio-stop', stop);
    return () => {
      window.removeEventListener('lookout-radio-start', start);
      window.removeEventListener('lookout-radio-stop', stop);
    };
  });

  if (dockOnly) return null;

  return (
    <div className="space-y-3">
      <button
        type="button"
        onTouchStart={(event) => { event.preventDefault(); startRecording(); }}
        onTouchEnd={stopRecording}
        onTouchCancel={stopRecording}
        onPointerDown={(event) => { if (event.pointerType !== 'touch') startRecording(); }}
        onPointerUp={(event) => { if (event.pointerType !== 'touch') stopRecording(); }}
        className={`flex min-h-24 w-full items-center justify-center gap-3 rounded-2xl text-sm font-bold shadow-lg ${recording ? 'bg-red-500 text-white' : 'bg-emerald-500 text-slate-900'}`}
      >
        {recording ? <Square size={20} fill="currentColor" /> : <Mic size={20} />}
        {recording ? 'Release to transmit' : 'Hold to talk'}
      </button>
      {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">{error}</p>}

      <div className="space-y-2">
        {logs.length === 0 ? (
          <p className="py-8 text-center text-xs text-slate-500">No radio transmissions in this session.</p>
        ) : logs.map((clip) => (
          <ExpandableListCard
            key={clip.id}
            leading={<span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${playingId === clip.id ? 'bg-emerald-500' : 'bg-slate-200'}`} />}
            summary={<><p className="text-[10px] font-semibold text-slate-500">{clip.time}</p><p className="text-xs font-bold text-slate-900">Emergency radio</p></>}
            details={<p className="text-[10px] text-slate-700">{playingId === clip.id ? 'Currently playing' : 'Recorded transmission'}</p>}
            actions={[{ icon: Play, label: 'Play transmission', onClick: () => clip.audio?.play() }]}
          />
        ))}
      </div>
    </div>
  );
}
