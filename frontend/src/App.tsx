import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ProjectDashboard } from './pages/ProjectDashboard'
import { ArtifactListView } from './pages/ArtifactListView'
import { PDFViewer } from './pages/PDFViewer'
import Layout from './components/Layout/Layout'
import ErrorBoundary from './components/ErrorBoundary'
import './App.css'

/**
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

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<ProjectDashboard />} />
              <Route path="/projects/:projectId" element={<ArtifactListView />} />
              <Route path="/projects/:projectId/artifacts/:artifactId" element={<PDFViewer />} />
              <Route path="/projects/:projectId/artifacts/:artifactId/versions/:versionId" element={<PDFViewer />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  )
}

export default App
