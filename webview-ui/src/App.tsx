import { useEffect } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom'
import { initialRoute } from './api/host'
import { loadState, on, saveState } from './bridge'
import { SettingsView } from './pages/SettingsView'
import { ProjectDashboard } from './pages/ProjectDashboard'
import { ArtifactListView } from './pages/ArtifactListView'
import { KanbanBoardView } from './pages/KanbanBoardView'
import { ContextFilesView } from './pages/ContextFilesView'
import { PDFViewer } from './pages/PDFViewer'
import Layout from './components/Layout/Layout'
import ErrorBoundary from './components/ErrorBoundary'
import './App.css'

/**
 * MemoryRouter, not BrowserRouter: a webview has no history API to push to and
 * no URL bar to reflect it in. Routing is otherwise exactly as it was, so every
 * page, link and useParams below this point is unchanged.
 *
 * Layout is a parent route (rendering its matched child via <Outlet />)
 * rather than a plain wrapper taking `children`, so components it renders
 * internally (the header's Breadcrumb, in particular) sit INSIDE the
 * matched route's params context and useParams() actually resolves
 * :projectId/:artifactId - a wrapper-around-<Routes> composition doesn't
 * give inner-rendered components access to the child route's params at all.
 */

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: 2,
    },
  },
})

interface PanelState {
  path?: string
}

/**
 * The page this panel was last showing.
 *
 * Read once, at module scope, because it decides where the router starts and
 * that decision happens before anything renders. VS Code destroys a hidden
 * tab's DOM rather than pausing it - the whole app is remounted on reveal - so
 * without this every trip to another tab lands the reader back on the project
 * list, having lost the document they were reading.
 */
const restored = loadState<PanelState>()

/**
 * Records the current page so the panel can come back to it.
 *
 * `setState` is the editor's own store for a webview: it survives the tab being
 * hidden, the panel being serialized, and the window being restarted, which is
 * three things `retainContextWhenHidden` would buy by keeping the entire DOM in
 * memory instead.
 */
function RouteMemory() {
  const location = useLocation()

  useEffect(() => {
    saveState<PanelState>({ path: location.pathname })
  }, [location.pathname])

  return null
}

/**
 * Lets the extension host choose the page.
 *
 * The Activity Bar's "Settings" row opens this panel already pointed at
 * /settings. Two paths, because there are two cases: a panel that is being
 * created has nobody listening yet, so it asks for the parked route on mount;
 * one that is already open is told by event.
 *
 * A route from the host outranks the restored one: it is a fresh instruction,
 * and the restored page is only a default.
 */
function HostRouting() {
  const navigate = useNavigate()

  useEffect(() => {
    let cancelled = false

    void initialRoute()
      .then((route) => {
        if (!cancelled && route.path) {
          navigate(route.path)
        }
      })
      .catch(() => {
        // An older host has no such method. The dashboard still opens on its
        // own front page, which is the right default anyway.
      })

    const off = on('navigate', (payload) => {
      if (typeof payload.path === 'string') {
        navigate(payload.path)
      }
    })

    return () => {
      cancelled = true
      off()
    }
  }, [navigate])

  return null
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[restored?.path || '/']}>
          <HostRouting />
          <RouteMemory />
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<ProjectDashboard />} />
              <Route path="/settings" element={<SettingsView />} />
              <Route path="/projects/:projectId" element={<ArtifactListView />} />
              <Route path="/projects/:projectId/board" element={<KanbanBoardView />} />
              <Route path="/projects/:projectId/files" element={<ContextFilesView />} />
              <Route path="/projects/:projectId/artifacts/:artifactId" element={<PDFViewer />} />
              <Route path="/projects/:projectId/artifacts/:artifactId/versions/:versionId" element={<PDFViewer />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  )
}

export default App
