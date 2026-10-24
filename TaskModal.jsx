import React, { useEffect, useRef, useState } from 'react';
import { api, asset, openLink } from '../api.js';
import { useApp } from '../ctx.jsx';
import { Header, Modal, Spinner } from './ui.jsx';
import { copyLink, shareVideo } from '../share.js';

export default function TaskModal({ video, onClose }) {
  const { toast, setUser } = useApp();
  const [info, setInfo] = useState(null); // { steps, done, unlocked, skipTokens }
  const [done, setDone] = useState(0);
  const [phase, setPhase] = useState('idle'); // idle | running | ready
  const [left, setLeft] = useState(0);
  const [busy, setBusy] = useState(false);
  const [final, setFinal] = useState(null); // unlock payload
  const tick = useRef();

  const unlock = async () => {
    try { setFinal(await api(`/videos/${video.id}/unlock`, { method: 'POST' })); }
    catch (e) { toast(e.message, 'err'); }
  };

  useEffect(() => {
    api(`/videos/${video.id}/tasks`).then((d) => {
      setInfo(d); setDone(d.done);
      if (d.unlocked) unlock();
    }).catch((e) => { toast(e.message, 'err'); onClose(); });
    return () => clearInterval(tick.current);
  }, []); // eslint-disable-line

  const total = info?.steps.length || video.taskCount;
  const step = info?.steps[done];

  const start = async () => {
    setBusy(true);
    try {
      await api(`/videos/${video.id}/tasks/start`, { method: 'POST', body: { step: done } });
      openLink(step.link);
      setPhase('running'); setLeft(step.countdown);
      clearInterval(tick.current);
      tick.current = setInterval(() => setLeft((x) => {
        if (x <= 1) { clearInterval(tick.current); setPhase('ready'); return 0; }
        return x - 1;
      }), 1000);
    } catch (e) { toast(e.message, 'err'); }
    setBusy(false);
  };

  const after = async (d) => {
    setDone(d.done); setPhase('idle'); setUser(d.user);
    if (d.complete) { toast('All tasks complete — unlocked!'); await unlock(); }
  };

  const verify = async () => {
    setBusy(true);
    try { await after(await api(`/videos/${video.id}/tasks/verify`, { method: 'POST', body: { step: done } })); }
    catch (e) { toast(e.message, 'err'); if (/Join the channel/.test(e.message)) setPhase('idle'); }
    setBusy(false);
  };

  const skip = async () => {
    setBusy(true);
    try {
      clearInterval(tick.current);
      const d = await api(`/videos/${video.id}/tasks/skip`, { method: 'POST' });
      setInfo((i) => ({ ...i, skipTokens: d.user.skipTokens }));
      await after(d);
    } catch (e) { toast(e.message, 'err'); }
    setBusy(false);
  };

  const btn = video.buttons || {};
  const isMp4 = final && (final.sourceType === 'file' || /\.mp4(\?|$)/i.test(final.sourceUrl || ''));

  return (
    <Modal onClose={onClose}>
      <Header title={final ? 'Unlocked 🎉' : 'Unlock this file'} onClose={onClose} />
      <div className="space-y-4 p-4">
        <div className="card flex items-center gap-3 p-2.5">
          <div className="h-14 w-24 shrink-0 overflow-hidden rounded-lg bg-card2">
            {video.thumbnail && <img src={asset(video.thumbnail)} alt="" className="h-full w-full object-cover" />}
          </div>
          <div className="min-w-0">
            <div className="line-clamp-2 text-sm font-bold">{video.title}</div>
            {video.duration && <div className="text-xs text-mute">{video.duration}</div>}
          </div>
        </div>

        {!info && <div className="grid place-items-center py-8"><Spinner /></div>}

        {info && !final && (
          <>
            <div>
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="font-semibold">Progress</span>
                <span className="badge bg-warn/15 text-warn">{done}/{total} completed</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-card2">
                <div className="h-full rounded-full transition-all duration-500"
                     style={{ width: `${(done / total) * 100}%`, background: 'linear-gradient(90deg,var(--accent),var(--accent2))' }} />
              </div>
            </div>

            <ol className="space-y-2">
              {info.steps.map((s, i) => (
                <li key={i} className={`flex items-center gap-3 rounded-xl border p-3 text-sm transition ${
                  i < done ? 'border-good/40 bg-good/10' : i === done ? 'border-accent bg-accent/10' : 'border-line bg-card opacity-60'}`}>
                  <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ${
                    i < done ? 'bg-good text-white' : 'bg-card2 text-mute'}`}>{i < done ? '✓' : i + 1}</span>
                  <span className="min-w-0 flex-1 truncate font-medium">{s.label}</span>
                  {i === done && phase === 'running' && <span className="badge bg-accent/20 text-accent">{left}s</span>}
                </li>
              ))}
            </ol>

            {step && (
              <div className="space-y-2">
                {phase === 'idle' && (
                  <button className="btn-primary w-full" disabled={busy} onClick={start}>
                    {video.taskType === 'telegram' ? 'Join channel' : 'Start task'} {done + 1}
                  </button>
                )}
                {phase === 'running' && (
                  <button className="btn-ghost w-full" disabled>Verifying in {left}s…</button>
                )}
                {phase === 'ready' && (
                  <button className="btn-primary w-full" disabled={busy} onClick={verify}>✓ Verify task {done + 1}</button>
                )}
                {phase === 'ready' && <button className="w-full text-xs text-mute" onClick={() => openLink(step.link)}>Open link again</button>}
                {info.skipTokens > 0 && (
                  <button className="btn-ghost w-full" disabled={busy} onClick={skip}>⏭ Use a skip token ({info.skipTokens} left)</button>
                )}
              </div>
            )}
          </>
        )}

        {final && (
          <div className="space-y-3">
            {isMp4 && <video src={asset(final.sourceUrl)} controls playsInline className="w-full rounded-xl bg-black" />}
            {btn.download?.enabled !== false && (
              <button className="btn-primary w-full" onClick={() => openLink(final.destinationUrl)}>⬇ {btn.download?.label || 'Download'}</button>
            )}
            {btn.telegram?.enabled && btn.telegram.url && (
              <button className="btn-ghost w-full" onClick={() => openLink(btn.telegram.url)}>✈ {btn.telegram.label || 'Join Telegram'}</button>
            )}
            {btn.share?.enabled !== false && (
              <div className="grid grid-cols-2 gap-2">
                <button className="btn-ghost" onClick={() => shareVideo(video, toast)}>⤴ {btn.share?.label || 'Share'}</button>
                <button className="btn-ghost" onClick={() => copyLink(video, toast)}>⧉ Copy link</button>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
