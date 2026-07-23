// Landing screen — start a new anonymous estimation session.
import React from 'react';
import './estimation.css';

// short, link-friendly session id
function newSessionId() {
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export default function Home({ onStart }) {
  return (
    <div className="est-app">
      <div className="est-home">
        <div className="est-logo">AP</div>
        <h1>Story Point Estimation</h1>
        <p className="lead">
          Anonymous, timed planning poker for the Carbon team. Everyone votes on a
          1–3 scale, a 30-second timer keeps it honest, and results reveal all at once.
        </p>

        <div className="est-card">
          <button
            className="est-btn est-btn-primary est-btn-block"
            style={{ fontSize: 17, padding: '15px' }}
            onClick={() => onStart(newSessionId())}
          >
            Start a planning session
          </button>
          <p className="est-hint">
            You'll be the host (scrum master). Share the link that appears and your
            teammates join anonymously — each gets a random alias like “Quiet Falcon”.
            No sign-in, no names recorded.
          </p>
        </div>
      </div>
    </div>
  );
}
