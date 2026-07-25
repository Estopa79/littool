import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './lib/AuthProvider'
import { RequireAuth } from './components/RequireAuth'
import { AppLayout } from './components/AppLayout'
import { Login } from './views/Login'
import { Schreibwerkstatt } from './views/Schreibwerkstatt'
import { Bibliothek } from './views/Bibliothek'
import { Forschungsfragen } from './views/Forschungsfragen'
import { Suche } from './views/Suche'
import { Verwendet } from './views/Verwendet'
import { Protokolle } from './views/Protokolle'

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="login" element={<Login />} />
          <Route
            element={
              <RequireAuth>
                <AppLayout />
              </RequireAuth>
            }
          >
            <Route index element={<Schreibwerkstatt />} />
            <Route path="bibliothek" element={<Bibliothek />} />
            <Route path="forschungsfragen" element={<Forschungsfragen />} />
            <Route path="suche" element={<Suche />} />
            <Route path="verwendet" element={<Verwendet />} />
            <Route path="protokolle" element={<Protokolle />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
