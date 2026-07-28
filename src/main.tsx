import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { ElectionCandidatesEditPage } from './pages/ElectionCandidatesEditPage.tsx'
import { ElectionListsGamePage } from './pages/ElectionListsGamePage.tsx'
import { ElectionsPage } from './pages/ElectionsPage.tsx'
import { ElectionsPollsEditPage } from './pages/ElectionsPollsEditPage.tsx'
import { ElectionsPollsPage } from './pages/ElectionsPollsPage.tsx'
import { ElectionPartyPage } from './pages/ElectionPartyPage.tsx'
import { GovernmentPage } from './pages/GovernmentPage.tsx'
import { KnessetPage } from './pages/KnessetPage.tsx'
import { KnessetPipelineEditPage } from './pages/KnessetPipelineEditPage.tsx'
import { PiplinesPage } from './pages/PiplinesPage.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/elections" element={<ElectionsPage />} />
        <Route path="/elections/polls/edit" element={<ElectionsPollsEditPage />} />
        <Route path="/elections/polls" element={<ElectionsPollsPage />} />
        <Route path="/elections/edit" element={<ElectionCandidatesEditPage />} />
        <Route path="/elections/lists" element={<ElectionListsGamePage />} />
        <Route path="/elections/:partyId" element={<ElectionPartyPage />} />
        <Route path="/government" element={<GovernmentPage />} />
        <Route path="/knesset/edit" element={<KnessetPipelineEditPage />} />
        <Route path="/knesset" element={<KnessetPage />} />
        <Route path="/piplines/*" element={<PiplinesPage />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
