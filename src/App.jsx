import { useState } from 'react'
import Home from './Estimation/Home.jsx'
import EstimationRoom from './Estimation/EstimationRoom.jsx'
import './App.css'

function getSessionFromUrl() {
  return new URLSearchParams(window.location.search).get('s')
}

function App() {
  const [sessionId, setSessionId] = useState(getSessionFromUrl())

  const startSession = (id) => {
    const url = `${window.location.pathname}?s=${id}`
    window.history.pushState({}, '', url)
    setSessionId(id)
  }

  if (!sessionId) return <Home onStart={startSession} />
  return <EstimationRoom sessionId={sessionId} />
}

export default App
