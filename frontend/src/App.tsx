import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AppLayout } from './components/AppLayout'
import { Schreibwerkstatt } from './views/Schreibwerkstatt'
import { Bibliothek } from './views/Bibliothek'
import { Forschungsfragen } from './views/Forschungsfragen'
import { Suche } from './views/Suche'
import { Verwendet } from './views/Verwendet'
import { Protokolle } from './views/Protokolle'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<Schreibwerkstatt />} />
          <Route path="bibliothek" element={<Bibliothek />} />
          <Route path="forschungsfragen" element={<Forschungsfragen />} />
          <Route path="suche" element={<Suche />} />
          <Route path="verwendet" element={<Verwendet />} />
          <Route path="protokolle" element={<Protokolle />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
