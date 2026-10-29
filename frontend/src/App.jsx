import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import MasterApp from './pages/MasterApp'
import ClientChat from './pages/ClientChat'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/app" element={<MasterApp />} />
        <Route path="/c/:slug" element={<ClientChat />} />
        <Route path="/" element={<Navigate to="/app" replace />} />
        <Route path="*" element={<Navigate to="/app" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

