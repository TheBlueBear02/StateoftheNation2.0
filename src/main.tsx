import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { GovernmentPage } from './pages/GovernmentPage.tsx'
import { KnessetPage } from './pages/KnessetPage.tsx'
import { PiplinesPage } from './pages/PiplinesPage.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/government" element={<GovernmentPage />} />
        <Route path="/knesset" element={<KnessetPage />} />
        <Route path="/piplines/*" element={<PiplinesPage />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
