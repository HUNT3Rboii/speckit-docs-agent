import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ProjectDashboard } from './pages/ProjectDashboard'
import { ArtifactListView } from './pages/ArtifactListView'
import { PDFViewer } from './pages/PDFViewer'
import Layout from './components/Layout/Layout'
import ErrorBoundary from './components/ErrorBoundary'
import './App.css'

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
          <Layout>
            <Routes>
              <Route path="/" element={<ProjectDashboard />} />
              <Route path="/projects/:projectId" element={<ArtifactListView />} />
              <Route path="/projects/:projectId/artifacts/:artifactId" element={<PDFViewer />} />
              <Route path="/projects/:projectId/artifacts/:artifactId/versions/:versionId" element={<PDFViewer />} />
            </Routes>
          </Layout>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  )
}

export default App
