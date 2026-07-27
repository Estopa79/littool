import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './lib/AuthProvider'
import { ActiveDocumentProvider } from './lib/ActiveDocumentContext'
import { RequireAuth } from './components/RequireAuth'
import { AppLayout } from './components/AppLayout'
import { Login } from './views/Login'
import { Schreibwerkstatt } from './views/Schreibwerkstatt'
import { Bibliothek } from './views/Bibliothek'
import { QuellenDetail } from './views/QuellenDetail'
import { Forschungsfragen } from './views/Forschungsfragen'
import { DeskriptionsMatrix } from './views/DeskriptionsMatrix'
import { EvaluationsMatrix } from './views/EvaluationsMatrix'
import { Pruefung } from './views/Pruefung'
import { PruefungQuelle } from './views/PruefungQuelle'
import { Suche } from './views/Suche'
import { Verwendet } from './views/Verwendet'
import { Protokolle } from './views/Protokolle'
import { Einstellungen } from './views/Einstellungen'

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="login" element={<Login />} />
          <Route
            element={
              <RequireAuth>
                <ActiveDocumentProvider>
                  <AppLayout />
                </ActiveDocumentProvider>
              </RequireAuth>
            }
          >
            <Route index element={<Schreibwerkstatt />} />
            <Route path="bibliothek" element={<Bibliothek />} />
            <Route path="bibliothek/:id" element={<QuellenDetail />} />
            <Route path="pruefen" element={<Pruefung />} />
            <Route path="pruefen/:sourceId" element={<PruefungQuelle />} />
            <Route path="forschungsfragen" element={<Forschungsfragen />} />
            <Route path="deskriptionsmatrix" element={<DeskriptionsMatrix />} />
            <Route path="evaluationsmatrix" element={<EvaluationsMatrix />} />
            <Route path="suche" element={<Suche />} />
            <Route path="verwendet" element={<Verwendet />} />
            <Route path="protokolle" element={<Protokolle />} />
            <Route path="einstellungen" element={<Einstellungen />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
