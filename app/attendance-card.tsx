"use client";
import { useEffect, useState } from 'react';
export default function AttendanceCard({ initialSeconds, clockedIn, ready, busy, onToggle, timeZone }: { initialSeconds: number; clockedIn: boolean; ready: boolean; busy: boolean; onToggle: () => void; timeZone?: string }) {
  const [seconds, setSeconds] = useState(initialSeconds);
  useEffect(() => {
    setSeconds(initialSeconds);
    if (!clockedIn) return;
    const started = Date.now();
    const timer = setInterval(() => setSeconds(initialSeconds + Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [initialSeconds, clockedIn]);
  const total = Math.max(0, Math.floor(seconds));
  const formatted = [Math.floor(total / 3600), Math.floor(total % 3600 / 60), total % 60].map(part => String(part).padStart(2, '0')).join(':');
  return <section className="card attendance-card"><div className="row"><h2>Time & attendance</h2><span className={clockedIn ? 'tag' : 'tag warn'}>{!ready ? 'Loading session…' : clockedIn ? 'Currently working' : 'Not clocked in'}</span></div><p className="muted">{clockedIn ? 'Your active work session is being recorded.' : 'Start your work session when you are ready.'}</p><div className="attendance-time"><small>RECORDED TODAY{timeZone ? ` · ${timeZone}` : ''}</small><b aria-label={`${Math.floor(total / 3600)} hours, ${Math.floor(total % 3600 / 60)} minutes recorded`}>{ready ? formatted : '—'}</b><small>{clockedIn ? 'Includes your current session and completed sessions today.' : 'Total of your completed sessions today.'}</small></div><button className="primary attendance-toggle" disabled={busy || !ready} onClick={onToggle}>{busy ? 'Saving…' : clockedIn ? '■ Clock out' : '▶ Clock in'}</button><p className="attendance-help">Clock in starts recording. Clock out ends the session. Refreshing the page restores your saved session. You can view past entries in Time & attendance.</p></section>;
}

