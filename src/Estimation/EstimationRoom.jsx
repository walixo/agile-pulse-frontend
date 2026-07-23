// Agile Pulse — Anonymous Story Point Estimation (Planning Poker)
// Scale: 1 (simple) · 2 (moderate) · 3 (most complex)
//
// Flow: the scrum master starts a session, shares the link. Everyone who joins
// gets an anonymous alias. The host hits "Estimate" -> a server-authoritative
// 30s countdown runs on every screen, votes lock at zero, then results reveal.

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { io } from 'socket.io-client';
import './estimation.css';

const SOCKET_SERVER_URL = import.meta.env.VITE_APP_SOCKET_URL || 'http://localhost:4000';

const POINT_TAGS = { 1: 'Simple', 2: 'Moderate', 3: 'Complex' };

// Stable, per-session anonymous identity so a reload keeps your alias / host role.
function getAnonId(sessionId) {
  const key = `ap-anon-${sessionId}`;
  let id = sessionStorage.getItem(key);
  if (!id) {
    id = uuidv4();
    sessionStorage.setItem(key, id);
  }
  return id;
}

function initials(alias) {
  if (!alias) return '?';
  return alias.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

// ---------------------------------------------------------------------------

function Confetti() {
  const pieces = useMemo(() => {
    const colors = ['#1a2cce', '#1fb57a', '#f5a623', '#eb5757', '#4f5bff'];
    return Array.from({ length: 90 }, (_, i) => ({
      left: Math.random() * 100,
      delay: Math.random() * 0.6,
      dur: 2.4 + Math.random() * 1.8,
      bg: colors[i % colors.length],
      rot: Math.random() * 360,
    }));
  }, []);
  return (
    <div className="est-confetti" aria-hidden="true">
      {pieces.map((p, i) => (
        <i
          key={i}
          style={{
            left: `${p.left}%`,
            background: p.bg,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.dur}s`,
            transform: `rotate(${p.rot}deg)`,
          }}
        />
      ))}
    </div>
  );
}

// Circular countdown ring with a big, bold number.
function TimerRing({ secondsLeft, total }) {
  const R = 76;
  const C = 2 * Math.PI * R;
  const frac = Math.max(0, Math.min(1, secondsLeft / total));
  const offset = C * (1 - frac);
  const urgent = secondsLeft <= 5;
  return (
    <div className={`est-ring ${urgent ? 'urgent' : ''}`}>
      <svg width="168" height="168" viewBox="0 0 168 168">
        <circle className="est-ring-track" cx="84" cy="84" r={R} fill="none" strokeWidth="12" />
        <circle
          className="est-ring-fill"
          cx="84" cy="84" r={R} fill="none" strokeWidth="12"
          strokeDasharray={C} strokeDashoffset={offset}
        />
      </svg>
      <div className={`est-ring-num ${urgent ? 'est-pulse' : ''}`}>{secondsLeft}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------

export default function EstimationRoom({ sessionId }) {
  const socketRef = useRef(null);
  const anonId = useMemo(() => getAnonId(sessionId), [sessionId]);

  const [state, setState] = useState(null);     // server session view
  const [connected, setConnected] = useState(false);
  const [storyDraft, setStoryDraft] = useState('');
  const [now, setNow] = useState(Date.now());
  const [copied, setCopied] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const prevStatus = useRef('idle');

  // socket lifecycle
  useEffect(() => {
    const socket = io(SOCKET_SERVER_URL, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      socket.emit('join_estimation', { sessionId, anonId });
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('estimation_state', (view) => setState(view));

    return () => {
      socket.emit('leave_estimation', { sessionId, anonId });
      socket.disconnect();
    };
  }, [sessionId, anonId]);

  // local clock — drives the countdown smoothly between server updates
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  // celebrate when a round reveals with full consensus
  useEffect(() => {
    const status = state?.round?.status;
    if (status === 'revealed' && prevStatus.current !== 'revealed') {
      if (state?.round?.stats?.consensus) {
        setShowConfetti(true);
        const t = setTimeout(() => setShowConfetti(false), 4200);
        return () => clearTimeout(t);
      }
    }
    if (status) prevStatus.current = status;
  }, [state]);

  const emit = (event, extra = {}) =>
    socketRef.current && socketRef.current.emit(event, { sessionId, anonId, ...extra });

  if (!state) {
    return (
      <div className="est-app">
        <div className="est-wrap"><div className="est-card">Connecting to the estimation room…</div></div>
      </div>
    );
  }

  const { round, participants, story, you, scale } = state;
  const isHost = you.isHost;
  const status = round.status;
  const voting = status === 'voting';
  const revealed = status === 'revealed';

  const total = round.durationMs / 1000;
  const secondsLeft = voting && round.endsAt
    ? Math.max(0, Math.round((round.endsAt - now) / 1000))
    : total;

  const votedCount = participants.filter((p) => p.hasVoted).length;
  const shareUrl = `${window.location.origin}${window.location.pathname}?s=${sessionId}`;

  const copyLink = () => {
    navigator.clipboard?.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };

  const stats = round.stats;

  return (
    <div className="est-app">
      {showConfetti && <Confetti />}
      <div className="est-wrap">

        {/* Top bar */}
        <div className="est-topbar">
          <div className="est-brand">
            <div className="est-logo">AP</div>
            <div>
              <h1>Agile Pulse · Estimation</h1>
              <p>Anonymous story point poker — scale 1 to 3</p>
            </div>
          </div>
          <div className="est-presence">
            <span className="est-dot" style={{ background: connected ? '#1fb57a' : '#eb5757' }} />
            {participants.length} in room · you are <strong style={{ marginLeft: 4 }}>{you.alias}</strong>
          </div>
        </div>

        {/* Story */}
        <div className="est-card est-story">
          <div className="est-label">Story being estimated</div>
          {isHost && !voting ? (
            <textarea
              className="est-story-input"
              placeholder="Paste or type the user story / ticket here…"
              value={storyDraft || story.title}
              onChange={(e) => setStoryDraft(e.target.value)}
              onBlur={() => emit('set_story', { title: storyDraft || story.title })}
            />
          ) : story.title ? (
            <h2>{story.title}</h2>
          ) : (
            <h2 className="est-empty">Waiting for the scrum master to set a story…</h2>
          )}
        </div>

        {/* Timer + control */}
        {(voting || (isHost && !revealed)) && (
          <div className="est-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            {voting ? (
              <div className="est-timer-zone">
                <TimerRing secondsLeft={secondsLeft} total={total} />
                <div className="est-timer-caption">
                  {secondsLeft > 0 ? 'Voting closes in…' : 'Locking results…'}
                </div>
              </div>
            ) : (
              isHost && (
                <button
                  className="est-btn est-btn-primary est-btn-block"
                  style={{ fontSize: 18, padding: '16px' }}
                  disabled={!story.title}
                  onClick={() => emit('start_round')}
                >
                  ▶  Estimate — start 30s timer
                </button>
              )
            )}
            {isHost && voting && (
              <button className="est-btn est-btn-ghost" onClick={() => emit('reveal_now')}>
                Reveal now
              </button>
            )}
          </div>
        )}

        {/* Vote cards */}
        {voting && (
          <div className="est-card">
            <div className="est-label">Cast your estimate {you.myVote ? '· you can change it until the timer ends' : ''}</div>
            <div className="est-votes">
              {scale.map((pt) => (
                <button
                  key={pt}
                  className={`est-vote ${you.myVote === pt ? 'selected' : ''}`}
                  data-pt={pt}
                  disabled={secondsLeft <= 0}
                  onClick={() => emit('submit_vote', { value: pt })}
                >
                  {you.myVote === pt && <span className="est-check">✓</span>}
                  <span className="est-vote-num">{pt}</span>
                  <span className="est-vote-tag">{POINT_TAGS[pt]}</span>
                </button>
              ))}
            </div>
            <p className="est-hint">
              {votedCount} of {participants.length} have voted. Estimates stay hidden until the timer hits zero.
            </p>
          </div>
        )}

        {/* Results */}
        {revealed && stats && (
          <div className="est-card">
            {stats.consensus ? (
              <div className="est-banner consensus">
                <span className="est-banner-emoji">🎉</span>
                Consensus! Everyone estimated this story as <strong style={{ marginLeft: 4 }}>{stats.min} point{stats.min > 1 ? 's' : ''}</strong>.
              </div>
            ) : (
              <div className="est-banner discuss">
                <span className="est-banner-emoji">💬</span>
                Split estimate ({stats.min}–{stats.max}). Worth a quick discussion before you commit.
              </div>
            )}

            <div className="est-label">Distribution</div>
            <div className="est-dist">
              {scale.map((pt) => {
                const c = stats.distribution[pt] || 0;
                const pct = stats.count ? (c / stats.count) * 100 : 0;
                return (
                  <div className="est-dist-row" key={pt}>
                    <div className="est-dist-key">{pt} · {POINT_TAGS[pt]}</div>
                    <div className="est-dist-track">
                      <div className="est-dist-bar" data-pt={pt} style={{ width: `${pct}%` }} />
                    </div>
                    <div className="est-dist-count">{c}</div>
                  </div>
                );
              })}
            </div>

            <div className="est-stats">
              <div className="est-stat"><div className="est-stat-v">{stats.median}</div><div className="est-stat-l">Median</div></div>
              <div className="est-stat"><div className="est-stat-v">{stats.average}</div><div className="est-stat-l">Average</div></div>
              <div className="est-stat"><div className="est-stat-v">{stats.count}</div><div className="est-stat-l">Votes cast</div></div>
            </div>

            {isHost && (
              <div className="est-btn-row" style={{ marginTop: 22 }}>
                <button className="est-btn est-btn-primary" onClick={() => { setStoryDraft(''); emit('reset_round'); }}>
                  Next story →
                </button>
                <button className="est-btn est-btn-ghost" onClick={() => emit('start_round')}>
                  Re-estimate this story
                </button>
              </div>
            )}
          </div>
        )}

        {/* Participants */}
        <div className="est-card">
          <div className="est-label">Room · {participants.length} {participants.length === 1 ? 'member' : 'members'}</div>
          <div className="est-people">
            {participants.map((p) => (
              <div key={p.anonId} className={`est-person ${p.hasVoted ? 'voted' : 'pending'}`}>
                <span className="est-avatar">{initials(p.alias)}</span>
                <span>{p.alias}{p.anonId === you.anonId ? ' (you)' : ''}</span>
                {p.isHost && <span className="est-host-badge">Host</span>}
                {revealed && p.value != null ? (
                  <span className="est-result-vote" data-pt={p.value}>{p.value}</span>
                ) : voting ? (
                  <span className="est-vstatus">{p.hasVoted ? '✓ voted' : '… thinking'}</span>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        {/* Share */}
        <div className="est-card">
          <div className="est-label">Invite the team (anonymous)</div>
          <div className="est-share">
            <input readOnly value={shareUrl} onFocus={(e) => e.target.select()} />
            <button className="est-btn est-btn-primary" onClick={copyLink}>{copied ? 'Copied ✓' : 'Copy link'}</button>
          </div>
          <p className="est-hint">Anyone with this link joins anonymously with a random alias. No names, no sign-in.</p>
        </div>

      </div>
    </div>
  );
}
