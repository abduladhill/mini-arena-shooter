import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { io } from 'socket.io-client';
import { ARENAS, getArena } from '../shared/arenas';
import { COLORS, EMPTY_INPUT, type Snapshot, type Reply } from '../shared/types';
import { mountGame, type GameRuntime } from './game';
import { playSound, soundSettings, unlockAudio } from './audio';
import './style.css';

const socket = io({ autoConnect: false });
const runtime: GameRuntime = { socket, state: null, enabled: true };
function readSaved<T,>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) ?? 'null') ?? fallback; } catch { return fallback; }
}
function save(key: string, value: unknown) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Gameplay also works without storage. */ } }
const formatTime = (seconds: number) => `${Math.floor(Math.ceil(seconds) / 60)}:${String(Math.ceil(seconds) % 60).padStart(2, '0')}`;

function Preview({ arenaId, compact = false }: { arenaId: string; compact?: boolean }) {
  const arena = getArena(arenaId);
  return <div className={`arena-preview ${compact ? 'compact' : ''}`} style={{ '--accent': arena.accent } as React.CSSProperties} aria-label={`${arena.name} layout`}>
    <div className="preview-grid"/>
    {arena.walls.map((wall, index) => <i key={index} className="preview-wall" style={{ left: `${wall.x / 10}%`, top: `${wall.y / 6.4}%`, width: `${wall.w / 10}%`, height: `${wall.h / 6.4}%` }}/>) }
    {arena.spawns.map((point, index) => <span key={index} className={`preview-player pp-${index}`} style={{ left: `${point.x / 10}%`, top: `${point.y / 6.4}%`, background: COLORS[index], '--player': COLORS[index] } as React.CSSProperties}><i/></span>)}
    {!compact && <><span className="laser laser-one"/><span className="laser laser-two"/><span className="preview-pack">+</span><div className="preview-caption"><span className="live-dot"/> {arena.name}<span>TOP-DOWN / FREE-FOR-ALL</span></div></>}
  </div>;
}

function GameCanvas({ matchId }: { matchId: string }) {
  const element = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const game = mountGame(element.current!, runtime);
    return () => { socket.emit('input', EMPTY_INPUT); game.destroy(true); };
  }, [matchId]);
  return <div className="game-canvas" ref={element} aria-label="Arena game. WASD to move, mouse to aim, click to shoot, Shift to sprint."/>;
}

function App() {
  const [state, setState] = useState<Snapshot | null>(null);
  const [connected, setConnected] = useState(false);
  const [name, setName] = useState(() => String(readSaved('arena-name', '')).slice(0, 16));
  const [code, setCode] = useState(() => new URLSearchParams(location.search).get('room')?.slice(0, 6).toUpperCase() ?? '');
  const [dialog, setDialog] = useState<'join' | 'help' | 'settings' | 'pause' | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [matches, setMatches] = useState(() => Number(readSaved('arena-matches', 0)) || 0);
  const [settings, setSettings] = useState(() => {
    const saved = readSaved('arena-audio', { volume: .35, muted: false });
    return { volume: Math.max(0, Math.min(1, Number(saved.volume) || 0)), muted: saved.muted === true };
  });
  useEffect(() => { Object.assign(soundSettings, settings); save('arena-audio', settings); }, [settings]);
  useEffect(() => {
    const onState = (value: Snapshot) => {
      runtime.state = value; setState(value);
      if (value.phase === 'results' && readSaved('arena-last-match', '') !== value.matchId) {
        save('arena-last-match', value.matchId);
        setMatches(current => { save('arena-matches', current + 1); return current + 1; });
        playSound('victory');
      }
    };
    const onConnect = () => { setConnected(true); setError(''); };
    const onDisconnect = () => {
      setConnected(false); runtime.state = null; setState(null); setDialog(null);
      setError('Connection lost. Reconnect, then join the room again when it is in the lobby.');
    };
    const onError = () => setError('Cannot reach the game server. Check that the Node.js server is running.');
    const onExpired = () => { setError('This inactive room expired. Create a new room.'); setState(null); runtime.state = null; };
    socket.on('state', onState); socket.on('connect', onConnect); socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onError); socket.on('expired', onExpired); socket.connect();
    return () => { socket.off('state', onState); socket.off('connect', onConnect); socket.off('disconnect', onDisconnect); socket.off('connect_error', onError); socket.off('expired', onExpired); socket.disconnect(); };
  }, []);
  useEffect(() => {
    runtime.enabled = !dialog;
    if (dialog) socket.emit('input', EMPTY_INPUT);
  }, [dialog]);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
    if (state?.phase === 'results') setDialog(null);
  }, [state?.phase]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setDialog(current => current ? null : state?.phase === 'playing' ? 'pause' : null);
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [state?.phase]);

  async function command(action: string, data: object = {}) {
    unlockAudio(); setError(''); setBusy(true);
    try {
      const result: Reply = await socket.timeout(4000).emitWithAck('command', { action, ...data });
      if (!result.ok) { setError(result.error ?? 'Something went wrong.'); return false; }
      return true;
    } catch { setError('The server did not respond. Check your connection.'); return false; }
    finally { setBusy(false); }
  }
  async function enter(action: 'create' | 'join' | 'quick') {
    if (!name.trim()) { setError('Choose a nickname to enter the arena.'); return; }
    save('arena-name', name.trim());
    if (await command(action, { name, code })) setDialog(null);
  }
  async function leave() {
    if (await command('leave')) { setState(null); runtime.state = null; setDialog(null); }
  }
  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(`${location.origin}${location.pathname}?room=${state!.code}`);
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    } catch { setError(`Share room code ${state!.code} with your friends.`); }
  }
  const me = state?.players.find(player => player.id === socket.id);
  const host = state?.host === socket.id;
  const arena = getArena(state?.arenaId ?? 'training');
  const rankings = state ? [...state.players].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths) : [];
  const canStart = state && state.players.length >= 2 && state.players.every(player => player.id === state.host || player.ready);

  return <div className="app-shell">
    <header className="site-header flex items-center justify-between gap-4">
      <a href="#" onClick={event => { event.preventDefault(); if (!state) setDialog(null); }} className="brand"><span className="brand-mark">✣</span><span>MINI ARENA<span className="brand-sub">SHOOTER</span></span></a>
      <nav className="flex items-center gap-3"><span className={`connection ${connected ? 'online' : ''}`}><i/>{connected ? 'SERVER CONNECTED' : 'CONNECTING'}</span><button className="icon-button" onClick={() => setDialog('settings')} aria-label="Settings">⚙</button></nav>
    </header>

    {!state && <main className="menu-main">
      <div className="hero-grid">
        <section className="hero-copy">
          <div className="eyebrow"><span/> SMALL ARENA. BIG ENERGY.</div>
          <h1>GOOD FRIENDS.<br/><span>GREAT RIVALS.</span></h1>
          <p className="hero-description">Jump in. Light it up. Run it back.<br/>A little laser chaos for you and up to three friends.</p>
          <div className="nickname"><label htmlFor="nickname">YOUR CALLSIGN</label><div><span>◈</span><input id="nickname" autoComplete="nickname" maxLength={16} placeholder="Choose a nickname" value={name} onChange={event => setName(event.target.value)}/><span className="input-count">{name.length}/16</span></div></div>
          <button className="primary play-button" disabled={!connected || busy} onClick={() => enter('quick')}>PLAY <span>Find an open lobby ↗</span></button>
          <div className="flex gap-3 mt-3"><button className="secondary flex-1" disabled={!connected || busy} onClick={() => enter('create')}>＋ Create room</button><button className="secondary flex-1" disabled={!connected} onClick={() => setDialog('join')}>⌁ Join room</button></div>
          <button className="text-button how-button" onClick={() => setDialog('help')}>ⓘ How to play <span>Easy to learn. Hard to leave.</span></button>
        </section>
        <section className="hero-art"><div className="art-top"><span><i className="live-dot"/> FREE-FOR-ALL</span><span>2–4 PLAYERS</span></div><Preview arenaId="training"/><div className="art-bottom"><span><b>03:00</b> per round</span><span><b>01</b> laser weapon</span><span><b>∞</b> rematches</span></div><div className="orbit-tag">FRIENDLY COMPETITION.<br/><strong>UNFRIENDLY LASERS.</strong></div></section>
      </div>
      <section className="arenas-section"><div className="section-heading"><div><p className="eyebrow">PICK YOUR PLAYGROUND</p><h2>Five ways to settle the score.</h2></div><span>Every arena unlocked. Always.</span></div><div className="arena-cards">{ARENAS.map((item, i) => <article key={item.id} className="arena-card"><Preview arenaId={item.id} compact/><div><span className="arena-index">0{i + 1}</span><h3>{item.name}</h3><p>{item.subtitle}</p></div></article>)}</div></section>
      <footer className="menu-footer"><span>WASD TO MOVE <i/> MOUSE TO AIM <i/> CLICK TO FIRE</span><span>{matches} MATCHES PLAYED · {matches < 5 ? 'ROOKIE' : matches < 20 ? 'REGULAR' : 'ARENA VETERAN'}</span></footer>
    </main>}

    {state?.phase === 'lobby' && <main className="lobby-main">
      <div className="flex items-start justify-between gap-4 flex-wrap"><div><p className="eyebrow">GET THE GANG TOGETHER</p><h1 className="page-title">YOUR LOBBY<span>.</span></h1><p className="muted">Share the code. Pick a playground. Settle it with lasers.</p></div><button className="secondary" onClick={leave}>Leave room ↗</button></div>
      <div className="lobby-grid"><section className="panel"><div className="room-code"><div><label>ROOM CODE</label><strong>{state.code}</strong></div><button className="secondary small" onClick={copyInvite}>{copied ? 'Copied ✓' : 'Copy invite ↗'}</button></div><div className="flex justify-between items-center mt-7 mb-4"><h2>Your squad</h2><span className="muted">{state.players.length}/4 players</span></div><div className="player-list">{Array.from({ length: 4 }, (_, i) => { const player = state.players[i]; return <div className="lobby-player" key={player?.id ?? i}>{player ? <><span className="avatar" style={{ background: COLORS[player.color] }}><i/></span><div><b>{player.name}{player.id === socket.id ? ' (you)' : ''}</b><small>{player.id === state.host ? 'ROOM HOST' : 'CHALLENGER'}</small></div><span className={`ready ${player.ready ? 'yes' : ''}`}>{player.ready ? '✓ Ready' : 'Not ready'}</span></> : <><span className="empty-avatar">＋</span><span className="muted">Waiting for a friend…</span></>}</div>; })}</div><div className="lobby-action">{host ? <button className="primary w-full" disabled={busy || !canStart} onClick={() => command('start')}>START MATCH →</button> : <button className="primary w-full" disabled={busy} onClick={() => command('ready')}>{me?.ready ? 'CANCEL READY' : 'READY UP ✓'}</button>}<p>{state.players.length < 2 ? 'At least two players are needed to start.' : host ? 'All challengers must ready up before starting.' : 'The host starts the match when everyone is ready.'}</p></div></section>
      <section className="panel arena-select"><div className="section-heading"><h2>Select arena</h2><span>{host ? 'HOST’S CHOICE' : 'SELECTED BY HOST'}</span></div><Preview arenaId={state.arenaId}/><h3>{arena.name}</h3><p className="muted">{arena.subtitle}</p><div className="arena-options">{ARENAS.map((item, i) => <button key={item.id} className={item.id === state.arenaId ? 'selected' : ''} disabled={!host || busy} onClick={() => command('arena', { arenaId: item.id })}><span style={{ color: item.accent }}>0{i + 1}</span>{item.name}{item.id === state.arenaId && <b>✓</b>}</button>)}</div></section></div>
    </main>}

    {state && state.phase !== 'lobby' && <main className="match-main">
      <div className="match-top"><div><p className="eyebrow">FREE-FOR-ALL · ROOM {state.code}</p><h2>{arena.name}</h2></div><div className={`timer ${state.remaining < 30 ? 'urgent' : ''}`}>{formatTime(state.remaining)}<small>TIME REMAINING</small></div><button className="secondary small" onClick={() => setDialog('pause')}>Esc · Menu</button></div>
      <div className="match-grid"><section className="arena-stage"><GameCanvas matchId={state.matchId}/>{me && !me.alive && state.phase === 'playing' && <div className="respawn-banner"><strong>BACK IN {Math.max(1, Math.ceil(me.respawnAt - state.time))}</strong><span>New life. Same rivals.</span></div>}<div className="under-game"><span><kbd>WASD</kbd> Move <kbd>SHIFT</kbd> Sprint <kbd>CLICK</kbd> Fire</span><span>Server-authoritative · 25 damage / hit</span></div></section><aside className="match-sidebar"><section className="panel health-panel"><p className="eyebrow">{me?.name ?? 'YOU'}</p><div className="health-number">{me?.hp ?? 0}<small>/ 100 HP</small></div><div className="health-track"><i style={{ width: `${me?.hp ?? 0}%`, background: COLORS[me?.color ?? 0] }}/></div><div className="personal-stats"><span><b>{me?.kills ?? 0}</b>ELIMINATIONS</span><span><b>{me?.deaths ?? 0}</b>DEATHS</span></div>{me && me.boostUntil > state.time && <p className="boost-label">ϟ SPEED BOOST · {Math.ceil(me.boostUntil - state.time)}s</p>}</section><section className="panel scoreboard"><h3>Live standings</h3>{rankings.map((player, i) => <div key={player.id}><small>{i + 1}</small><i style={{ background: COLORS[player.color] }}/><span>{player.name}</span><b>{player.kills}</b></div>)}</section><section className="powerup-guide"><p><b className="green">＋</b> Health pack <span>+40 HP</span></p><p><b className="blue">ϟ</b> Speed boost <span>5 seconds</span></p><small>Pickups return every 12 seconds.</small></section><div className="kill-feed" aria-live="polite">{state.events.filter(event => event.type === 'kill').slice(-3).reverse().map(event => <p key={event.id}><b>{state.players.find(player => player.id === event.player)?.name}</b> <span>›</span> {state.players.find(player => player.id === event.target)?.name}</p>)}</div></aside></div>
    </main>}

    {state?.phase === 'results' && <div className="modal-backdrop results-backdrop"><section className="modal results"><p className="eyebrow">THAT’S A WRAP</p><span className="trophy">✦</span><h2>{state.winners.length > 1 ? 'SHARED GLORY.' : 'ARENA CHAMPION.'}</h2><p className="winner-names">{state.players.filter(player => state.winners.includes(player.id)).map(player => player.name).join(' + ')}</p><div className="result-table"><div className="table-head"><span>PLAYER</span><span>ELIMS</span><span>DEATHS</span></div>{rankings.map((player, i) => <div key={player.id}><span><i style={{ background: COLORS[player.color] }}/><small>{i + 1}</small>{player.name}</span><b>{player.kills}</b><span>{player.deaths}</span></div>)}</div><div className="flex gap-3">{host && <button className="primary flex-1" disabled={busy || state.players.filter(player => Number.isFinite(player.respawnAt)).length < 2} onClick={() => command('start')}>REMATCH ↻</button>}<button className="secondary flex-1" onClick={() => command('lobby')}>Return to lobby</button></div><button className="text-button mt-5" onClick={leave}>Leave room</button></section></div>}

    {dialog && <div className="modal-backdrop" onClick={() => setDialog(null)}><section className="modal" onClick={event => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={dialog === 'join' ? 'Join room' : dialog === 'help' ? 'How to play' : dialog === 'settings' ? 'Settings' : 'Match menu'}><button className="close-button" onClick={() => setDialog(null)} aria-label="Close dialog">×</button>
      {dialog === 'join' && <><p className="eyebrow">YOUR FRIENDS ARE WAITING</p><h2>JOIN THE CHAOS.</h2><label className="field-label" htmlFor="join-name">YOUR CALLSIGN</label><input id="join-name" maxLength={16} value={name} onChange={event => setName(event.target.value)} placeholder="Nickname"/><label className="field-label" htmlFor="room-code">SIX-CHARACTER ROOM CODE</label><input className="code-input" id="room-code" maxLength={6} autoFocus value={code} onChange={event => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} onKeyDown={event => { if (event.key === 'Enter') void enter('join'); }} placeholder="ABC123"/><button className="primary w-full mt-6" disabled={busy || !connected || code.length !== 6} onClick={() => enter('join')}>JOIN ROOM →</button></>}
      {dialog === 'help' && <><p className="eyebrow">YOUR FIRST THIRTY SECONDS</p><h2>POINT. SHOOT. REPEAT.</h2><div className="instructions"><p><kbd>W A S D</kbd><span>Move around the arena.</span></p><p><kbd>MOUSE</kbd><span>Aim your laser.</span></p><p><kbd>LEFT CLICK</kbd><span>Hold to fire. Four hits eliminate.</span></p><p><kbd>SHIFT</kbd><span>Sprint to close the gap.</span></p><p><kbd>ESC</kbd><span>Open the menu. Online matches keep running.</span></p></div><p className="muted">You have 100 HP. Respawn after 3 seconds with 1 second of protection. Collect health and speed pickups, use cover, and earn the most eliminations in 3 minutes. Ties share the win.</p><button className="primary w-full mt-6" onClick={() => setDialog(null)}>GOT IT →</button></>}
      {dialog === 'settings' && <><p className="eyebrow">MAKE YOURSELF COMFORTABLE</p><h2>SETTINGS.</h2><label className="volume-label" htmlFor="volume">Effects volume <b>{Math.round(settings.volume * 100)}%</b></label><input id="volume" type="range" min="0" max="1" step=".05" value={settings.volume} onChange={event => { unlockAudio(); setSettings({ ...settings, volume: Number(event.target.value) }); }}/><label className="mute-label"><span>Mute all sound effects</span><input type="checkbox" checked={settings.muted} onChange={event => setSettings({ ...settings, muted: event.target.checked })}/></label><button className="secondary w-full mt-5" onClick={() => { unlockAudio(); playSound('pickup'); }}>Test sound ♫</button><p className="muted mt-5">Settings and matches played are saved on this browser.</p></>}
      {dialog === 'pause' && <><p className="eyebrow">TAKING A BREATHER?</p><h2>MATCH MENU.</h2><p className="muted">The online match keeps running while this menu is open.</p><button className="primary w-full mt-6" onClick={() => setDialog(null)}>BACK TO THE ARENA →</button><button className="secondary w-full mt-3" onClick={() => setDialog('settings')}>Sound settings</button><button className="text-button mt-6" onClick={leave}>Leave match</button></>}
    </section></div>}
    {error && <div className="error-toast" role="alert"><span>{error}</span><button onClick={() => setError('')} aria-label="Dismiss error">×</button></div>}
  </div>;
}

createRoot(document.getElementById('root')!).render(<App/>);
