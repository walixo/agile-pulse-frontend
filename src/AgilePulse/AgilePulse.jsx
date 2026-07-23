// AgilePulse Retrospective Page with Real-Time Anonymous Sticky Notes
// Real-time sync implemented with Socket.IO (socket.io-client)
// Anonymous simultaneous editing using a per-session anonId (UUID)
// Conflict resolution: last-write-wins using timestamps (server should also authoritative-merge)

import React, { useState, useEffect, useRef } from "react";
import { v4 as uuidv4 } from 'uuid';
import { io } from 'socket.io-client';

// NOTE: replace SOCKET_SERVER_URL with your backend Socket.IO endpoint, e.g. process.env.REACT_APP_SOCKET_URL
const SOCKET_SERVER_URL = import.meta.env.VITE_APP_SOCKET_URL || 'http://localhost:4000';

function StickyNote({ type, content, onChange, onDelete }) {
    // map logical type to safe Tailwind-friendly classes
    const bgClass = type === 'good' ? 'bg-green-100' : type === 'bad' ? 'bg-red-100' : 'bg-blue-100';
    return (
        <div className={`p-3 rounded-lg shadow-md ${bgClass}`}>
            <textarea
                value={content}
                onChange={(e) => onChange(e.target.value)}
                placeholder={type === 'good' ? 'What went well...' : type === 'bad' ? "What didn't go well..." : 'Action item...'}
                className="w-full bg-transparent resize-none outline-none min-h-[3rem]"
            />
            <div className="flex justify-end">
                <button onClick={onDelete} className="text-xs text-gray-600 mt-2">Delete</button>
            </div>
        </div>
    );
}

export default function RetroBoard({ retrospectiveId = 'default-room' }) {
    // notes: { good: [{id,content,updatedAt}], bad: [...], action: [...] }
    const [notes, setNotes] = useState({ good: [], bad: [], action: [] });
    const socketRef = useRef(null);
    const anonIdRef = useRef(uuidv4());

    // debounce timers for typing per-note
    const typingTimers = useRef({});

    useEffect(() => {
        // connect to socket server and join room for this retrospective
        const socket = io(SOCKET_SERVER_URL, {
            transports: ['websocket'],
            // you can pass auth here if your server requires it
            // auth: { token: '...' }
        });
        socketRef.current = socket;

        socket.on('connect', () => {
            console.log('connected to retro socket', socket.id);
            socket.emit('join_retro', { retrospectiveId, anonId: anonIdRef.current });
        });

        // initial state from server
        socket.on('retro_state', (serverState) => {
            // serverState expected shape: { good: [...], bad: [...], action: [...] }
            setNotes(serverState);
        });

        // add/update/delete events from other participants
        socket.on('note_added', ({ type, note }) => {
            setNotes(prev => ({ ...prev, [type]: [...prev[type], note] }));
        });

        socket.on('note_updated', ({ type, note }) => {
            setNotes(prev => ({
                ...prev,
                [type]: prev[type].map(n => (n.id === note.id ? (n.updatedAt && n.updatedAt > (n.updatedAt || 0) ? n : note) : n))
            }));
        });

        socket.on('note_deleted', ({ type, id }) => {
            setNotes(prev => ({ ...prev, [type]: prev[type].filter(n => n.id !== id) }));
        });

        return () => {
            socket.emit('leave_retro', { retrospectiveId, anonId: anonIdRef.current });
            socket.disconnect();
        };
    }, [retrospectiveId]);

    const addNote = (type) => {
        const newNote = { id: uuidv4(), content: '', updatedAt: Date.now(), author: anonIdRef.current };
        // local optimistic update
        setNotes(prev => ({ ...prev, [type]: [...prev[type], newNote] }));
        // notify server
        socketRef.current && socketRef.current.emit('add_note', { retrospectiveId, type, note: newNote });
    };

    const updateNote = (type, id, newContent) => {
        const updatedAt = Date.now();
        // optimistic update locally
        setNotes(prev => ({
            ...prev,
            [type]: prev[type].map(n => n.id === id ? { ...n, content: newContent, updatedAt, author: anonIdRef.current } : n)
        }));

        // debounce rapid typing to reduce network chatter
        if (typingTimers.current[id]) clearTimeout(typingTimers.current[id]);
        typingTimers.current[id] = setTimeout(() => {
            socketRef.current && socketRef.current.emit('update_note', { retrospectiveId, type, note: { id, content: newContent, updatedAt, author: anonIdRef.current } });
            delete typingTimers.current[id];
        }, 600);
    };

    const deleteNote = (type, id) => {
        // optimistic local delete
        setNotes(prev => ({ ...prev, [type]: prev[type].filter(n => n.id !== id) }));
        socketRef.current && socketRef.current.emit('delete_note', { retrospectiveId, type, id, author: anonIdRef.current });
    };

    // UI column component
    const Column = ({ title, type }) => (
        <div className="flex-1 p-4 bg-white rounded-lg shadow-md flex flex-col">
            <div className="flex justify-between items-center mb-2">
                <h3 className="font-bold">{title}</h3>
                <button onClick={() => addNote(type)} className="px-2 py-1 bg-gray-200 rounded text-xs">+ Add</button>
            </div>
            <div className="flex-1 grid grid-rows-[auto] gap-2 overflow-auto">
                {notes[type].map((note, index) => (
                    <StickyNote
                        key={index}
                        type={type === 'good' ? 'good' : type === 'bad' ? 'bad' : 'action'}
                        content={note.content}
                        onChange={(val) => updateNote(type, note.id, val)}
                        onDelete={() => deleteNote(type, note.id)}
                    />
                ))}
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-slate-50 p-6">
            <div className="mb-4 flex justify-between items-center">
                <h1 className="text-2xl font-bold">Sprint Retrospective</h1>
                <div className="text-sm text-gray-500">You are anonymous (id: {anonIdRef.current.slice(0, 8)})</div>
            </div>

            <div className="grid grid-cols-3 gap-4">
                <Column title="What went well" type="good" />
                <Column title="What didn't go well" type="bad" />
                <Column title="Action Items" type="action" />
            </div>

            <div className="mt-4 text-xs text-gray-500">Tip: open this page in multiple browsers to test real-time collaboration.</div>
        </div>
    );
}

/*
Server contract (Socket.IO events expected):
- Client -> Server:
  - join_retro { retrospectiveId, anonId }
  - leave_retro { retrospectiveId, anonId }
  - add_note { retrospectiveId, type, note }
  - update_note { retrospectiveId, type, note }
  - delete_note { retrospectiveId, type, id }

- Server -> Client:
  - retro_state { good: [...], bad: [...], action: [...] } (sent on join)
  - note_added { type, note }
  - note_updated { type, note }
  - note_deleted { type, id }

Server should persist notes and use timestamps to merge changes and broadcast authoritative updates.
*/
