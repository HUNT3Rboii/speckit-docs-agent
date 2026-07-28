# Implementation Plan: PDF Visualization Frontend

## Overview

This implementation plan breaks down the PDF Visualization Frontend into discrete coding tasks. The frontend is a React 18 + TypeScript single-page application using Vite, React Router, React Query, and shadcn/ui components. It integrates with the existing FastAPI backend to display PDF artifacts with rich metadata in a responsive, searchable dashboard.

**Key Technologies**: React 18, TypeScript, Vite, React Query (TanStack Query), React Router v6, shadcn/ui, Tailwind CSS, Axios, react-pdf/PDF.js

## Tasks

- [x] 1. Initialize project structure and core dependencies
  - Create Vite project with React and TypeScript template
  - Install core dependencies: react-router-dom, @tanstack/react-query, axios, date-fns
  - Initialize shadcn/ui with Tailwind CSS configuration
  - Set up directory structure: `src/{components, hooks, api, types, utils, pages}`
  - Create `.env.development` and `.env.example` files with API base URL and key placeholders
  - Configure TypeScript with strict mode enabled
  - _Requirements: 13.1, 13.2, 13.4_

- [x] 1.1 Set up testing framework and configuration
  - Install Vitest, React Testing Library, and jsdom
  - Create `src/test/setup.ts` with testing utilities and global mocks
  - Configure Vitest in `vite.config.ts` with jsdom environment and coverage reporting
  - Install eslint-plugin-jsx-a11y for accessibility linting
  - _Requirements: 13.5_

- [x] 2. Implement API client layer with TypeScript interfaces
  - Define TypeScript interfaces for all API responses in `src/types/api.ts` (Project, Artifact, Version, ErrorResponse)
  - Create `src/api/client.ts` with APIClient class using Axios
  - Implement constructor with base URL and API key configuration
  - Add request interceptor to inject Authorization header with API key
  - Add response interceptor with error handling (map HTTP status codes to user messages)
  - Configure 30-second timeout for all requests
  - Implement methods: `getProjects()`, `getArtifacts(projectId)`, `getVersions(artifactId)`, `downloadPDF(versionId)`
  - Create custom APIError class with statusCode, message, and details properties
  - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 7.1, 7.2, 7.3, 7.4_

- [x] 2.1 Write unit tests for API client
  - Test Authorization header injection with API key
  - Test request timeout configuration
  - Test error handling for network unavailable (status 0), 401, 404, 500
  - Test successful response parsing for each endpoint
  - Mock Axios with jest.spyOn or MSW (Mock Service Worker)
  - _Requirements: 12.2, 12.3, 12.4, 7.1, 7.2, 7.3, 7.4_

- [x] 3. Create custom hooks for data fetching with React Query
  - Create `src/hooks/useProjects.ts` hook using React Query's useQuery
  - Create `src/hooks/useArtifacts.ts` hook with projectId parameter
  - Create `src/hooks/useVersions.ts` hook with artifactId parameter
  - Create `src/hooks/usePDFDownload.ts` hook with versionId parameter and download function
  - Configure stale times: projects (5 minutes), artifacts (2 minutes), versions (5 minutes)
  - Return objects with data, isLoading, error, and refetch properties
  - _Requirements: 1.1, 2.1, 3.1, 10.1_

- [x] 3.1 Write unit tests for custom data fetching hooks
  - Test useProjects with mocked successful API response
  - Test useArtifacts with mocked response for specific project
  - Test error handling in hooks (ensure error state is set)
  - Test loading state transitions (isLoading: true → false)
  - Use @testing-library/react-hooks or React Testing Library with renderHook
  - _Requirements: 1.1, 2.1, 3.1_

- [x] 4. Create utility hooks and helper functions
  - Create `src/hooks/useDebounce.ts` hook with 300ms delay for search input
  - Create `src/utils/dateFormat.ts` with functions for human-readable timestamps using date-fns
  - Create `src/utils/categoryColors.ts` with color mapping for artifact types (spec: blue, plan: green, task: orange, constitution: purple, other: gray)
  - Create `src/utils/pathTruncate.ts` for truncating long file paths with ellipsis
  - _Requirements: 4.3, 4.4, 9.2_

- [x] 4.1 Write unit tests for utility functions
  - Test useDebounce hook timing behavior (value updates after delay)
  - Test date formatting functions with different timestamps (recent, days ago, specific dates)
  - Test category color mapping returns correct colors for all artifact types
  - Test path truncation with short and long paths
  - _Requirements: 4.3, 4.4_

- [-] 5. Checkpoint - Ensure core infrastructure is complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Build shadcn/ui base components and layout primitives
  - Install and configure shadcn/ui Button, Card, Badge, Skeleton, Dialog components
  - Create `src/components/ui/` directory for shadcn/ui components
  - Create `src/components/Layout/Layout.tsx` with navigation and breadcrumb areas
  - Create `src/components/Layout/Breadcrumb.tsx` component for navigation breadcrumbs
  - Create `src/components/ErrorBoundary.tsx` class component for React error catching
  - Add error boundary fallback UI with retry button
  - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 6.2, 6.3, 7.5_

- [x] 6.1 Write unit tests for layout components
  - Test ErrorBoundary catches and displays errors from child components
  - Test Breadcrumb renders navigation items with correct links
  - Test Breadcrumb click navigation (mock useNavigate from react-router)
  - Test Layout component renders children correctly
  - _Requirements: 6.2, 6.3, 7.5_

- [x] 7. Implement ProjectCard and ProjectDashboard components
  - Create `src/components/ProjectCard.tsx` with Project props and onClick handler
  - Use shadcn/ui Card component for consistent styling
  - Add hover effects and cursor pointer on interactive areas
  - Create `src/pages/ProjectDashboard.tsx` using useProjects hook
  - Implement responsive grid layout (1/2/3 columns based on viewport width)
  - Add loading state with shadcn/ui Skeleton components
  - Add error state with error message and retry button
  - Add empty state when no projects exist ("No projects found")
  - Implement click handler to navigate to `/projects/:projectId`
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 5.1, 5.2, 5.3, 5.4, 8.1, 8.2, 8.3, 8.4_

- [x] 7.1 Write unit tests for project components
  - Test ProjectCard renders project name correctly
  - Test ProjectCard calls onClick with project ID when clicked
  - Test ProjectDashboard displays loading skeleton while fetching
  - Test ProjectDashboard renders project cards after successful fetch
  - Test ProjectDashboard displays error message when API fails
  - Test ProjectDashboard shows empty state when projects array is empty
  - Mock useProjects hook with different states (loading, success, error, empty)
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 8.1, 8.2, 8.3_

- [ ] 8. Implement SearchBar and CategoryFilter components
  - Create `src/components/SearchBar.tsx` with value and onChange props
  - Use useDebounce hook internally to debounce input changes
  - Add clear button (X icon) that appears when text is present
  - Add search icon visual indicator
  - Create `src/components/CategoryFilter.tsx` with selectedCategories Set and onCategoryToggle handler
  - Implement toggle buttons for each category (spec, plan, task, constitution, other) plus "All"
  - Apply color coding to category buttons matching artifact badge colors
  - Show artifact count per category (pass as prop from parent)
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 4.2_

- [ ] 8.1 Write unit tests for search and filter components
  - Test SearchBar renders input with placeholder
  - Test SearchBar calls onChange with debounced value (use fake timers)
  - Test SearchBar clear button appears and clears input when clicked
  - Test CategoryFilter renders buttons for all categories
  - Test CategoryFilter calls onCategoryToggle when button is clicked
  - Test CategoryFilter applies active styling to selected categories
  - _Requirements: 9.1, 9.2, 9.3, 9.4_

- [ ] 9. Implement ArtifactCard component with rich metadata display
  - Create `src/components/ArtifactCard.tsx` with Artifact props and onClick handler
  - Use shadcn/ui Card component for container
  - Display artifact title with prominent typography (text-xl font-semibold)
  - Display category with shadcn/ui Badge component using color mapping from utils
  - Display creation timestamp in human-readable format using date-fns (e.g., "2 hours ago")
  - Display source path with truncation and tooltip for full path on hover
  - Add click handler to navigate to artifact PDF viewer
  - Ensure touch-friendly size (minimum 44x44px click area)
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 2.2, 5.5_

- [~] 9.1 Write unit tests for ArtifactCard component
  - Test ArtifactCard renders artifact title
  - Test ArtifactCard displays category badge with correct color
  - Test ArtifactCard formats timestamp correctly
  - Test ArtifactCard truncates long source paths
  - Test ArtifactCard calls onClick with artifact ID when clicked
  - Mock artifact data with different artifact_type values
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 2.2_

- [ ] 10. Implement ArtifactListView with search, filter, and grouping
  - Create `src/pages/ArtifactListView.tsx` with projectId from route params
  - Use useArtifacts hook to fetch artifacts for the project
  - Implement local state for search term and selected categories (FilterState)
  - Add SearchBar and CategoryFilter components to the page
  - Filter artifacts based on search term (match title or source_path) and selected categories
  - Sort artifacts by created_at in descending order (newest first)
  - Group artifacts by category with section headers
  - Implement responsive grid layout (1/2/3 columns)
  - Display filtered result count (e.g., "Showing 5 of 23 artifacts")
  - Add loading state with skeleton cards
  - Add error state with retry button
  - Add empty state for no artifacts or no matches
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 9.1, 9.2, 9.3, 9.4, 9.5, 5.1, 5.2, 5.3, 5.4, 8.1, 8.4_

- [~] 10.1 Write unit tests for ArtifactListView
  - Test ArtifactListView fetches artifacts for correct project ID
  - Test search functionality filters artifacts by title
  - Test search functionality filters artifacts by source path
  - Test category filter shows only selected categories
  - Test artifact sorting (newest first)
  - Test filtered result count display
  - Test empty state when no artifacts exist
  - Test empty state when search returns no results
  - Mock useArtifacts hook and useParams (react-router)
  - _Requirements: 2.1, 2.2, 2.3, 9.1, 9.2, 9.3, 9.4, 9.5_

- [~] 11. Checkpoint - Ensure browsing and filtering UI is complete
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 12. Implement VersionList component for version history
  - Create `src/components/VersionList.tsx` with artifactId, currentVersionId, and onVersionSelect props
  - Use useVersions hook to fetch version history
  - Display each version with version number and generated_at timestamp
  - Highlight the currently displayed version (different background color or indicator)
  - Sort versions in descending order (newest first)
  - Add click handler to call onVersionSelect with selected version ID
  - Add loading state while fetching versions
  - Add error state if version fetch fails
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

- [~] 12.1 Write unit tests for VersionList component
  - Test VersionList renders all versions from API
  - Test VersionList highlights current version
  - Test VersionList sorts versions by generated_at descending
  - Test VersionList calls onVersionSelect when version is clicked
  - Test VersionList displays loading state
  - Test VersionList displays error state
  - Mock useVersions hook with different states
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

- [ ] 13. Implement PDFViewer component with PDF rendering
  - Create `src/pages/PDFViewer.tsx` component with artifactId and versionId from route params
  - Use usePDFDownload hook to fetch PDF blob for the version
  - Integrate react-pdf or PDF.js for PDF rendering in browser
  - Create responsive layout: PDF content area + metadata sidebar
  - Display artifact title and metadata in sidebar
  - Add VersionList component to sidebar
  - Implement version switching: update versionId when user selects different version from VersionList
  - Add download button that triggers PDF download to user's device
  - Add loading state with spinner while PDF is fetching
  - Add error state with retry button if PDF fetch fails
  - Ensure responsive layout: single column on mobile, sidebar on tablet/desktop
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 10.3, 5.1, 5.2, 5.3, 5.4_

- [~] 13.1 Write unit tests for PDFViewer component
  - Test PDFViewer fetches PDF for correct version ID
  - Test PDFViewer displays artifact title
  - Test PDFViewer renders VersionList with correct props
  - Test PDFViewer updates displayed version when new version is selected
  - Test download button triggers PDF download
  - Test loading state displays spinner
  - Test error state displays error message and retry button
  - Mock usePDFDownload hook and route params
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 10.3_

- [ ] 14. Set up React Router with route configuration
  - Create `src/App.tsx` with React Router BrowserRouter
  - Define routes: `/` (ProjectDashboard), `/projects/:projectId` (ArtifactListView), `/projects/:projectId/artifacts/:artifactId` (PDFViewer latest), `/projects/:projectId/artifacts/:artifactId/versions/:versionId` (PDFViewer specific version)
  - Wrap routes with Layout component for consistent navigation and breadcrumbs
  - Add ErrorBoundary wrapper around routes
  - Implement breadcrumb logic to show current location (Projects > Project Name > Artifact)
  - Update breadcrumbs dynamically based on route params
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [~] 14.1 Write integration tests for routing and navigation
  - Test navigation from ProjectDashboard to ArtifactListView when project is clicked
  - Test navigation from ArtifactListView to PDFViewer when artifact is clicked
  - Test breadcrumb displays correct path for each route
  - Test breadcrumb navigation (clicking breadcrumb item navigates to that route)
  - Test browser back button navigation
  - Test URL updates correctly when navigating
  - Use MemoryRouter for testing with initial route entries
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [~] 15. Configure React Query provider and global error handling
  - Create `src/main.tsx` entry point
  - Wrap App with QueryClientProvider from React Query
  - Configure QueryClient with default stale times and retry logic
  - Add global error handling for React Query errors
  - Configure React Query DevTools for development mode
  - Mount app to DOM root element
  - _Requirements: 1.1, 7.1, 7.2, 7.3, 7.4, 8.5_

- [x] 16. Implement environment variable configuration and API client initialization
  - Create `src/config/env.ts` to read VITE_API_BASE_URL and VITE_API_KEY from import.meta.env
  - Provide default fallback values for development (http://localhost:8000, dev-api-key)
  - Initialize APIClient singleton in `src/api/client.ts` with environment config
  - Export configured apiClient instance for use in custom hooks
  - _Requirements: 12.1, 12.2_

- [ ] 17. Add accessibility features and ARIA labels
  - Add semantic HTML elements (nav, main, article, aside) in Layout component
  - Add ARIA labels to icon-only buttons (search clear button, download button)
  - Add skip-to-main-content link at top of page for keyboard navigation
  - Ensure all interactive elements are keyboard accessible (Tab navigation)
  - Add visible focus indicators to all focusable elements (outline or box-shadow)
  - Test color contrast ratios meet WCAG AA standards (4.5:1 for normal text)
  - Add alt text for any images or icons used decoratively (empty alt="" for decorative)
  - _Requirements: 5.5, 11.1, 11.2, 11.3, 11.4, 11.5_

- [~] 17.1 Run accessibility audit and fix issues
  - Run axe-core or Lighthouse accessibility audit on all pages
  - Fix any WCAG AA violations identified by automated tools
  - Test keyboard navigation through all interactive elements
  - Verify focus order is logical and intuitive
  - Test with screen reader (NVDA on Windows or VoiceOver on macOS) - optional manual check
  - _Requirements: 5.5, 11.1, 11.2, 11.3, 11.4, 11.5_

- [~] 18. Checkpoint - Ensure PDF viewing and accessibility are complete
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 19. Implement responsive design breakpoints and grid layouts
  - Configure Tailwind CSS breakpoints in `tailwind.config.js` (mobile: default, tablet: 768px, desktop: 1024px)
  - Apply responsive grid classes to ProjectDashboard (grid-cols-1 md:grid-cols-2 lg:grid-cols-3)
  - Apply responsive grid classes to ArtifactListView (grid-cols-1 md:grid-cols-2 lg:grid-cols-3)
  - Adjust PDFViewer layout for mobile (flex-col) vs tablet/desktop (flex-row with sidebar)
  - Ensure minimum touch target size of 44x44px for all interactive elements on mobile
  - Test responsive behavior at different viewport widths (375px, 768px, 1024px, 1440px)
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [~] 19.1 Write visual regression tests for responsive layouts
  - Take screenshots of ProjectDashboard at mobile, tablet, desktop widths
  - Take screenshots of ArtifactListView at mobile, tablet, desktop widths
  - Take screenshots of PDFViewer at mobile, tablet, desktop widths
  - Verify grid layouts adapt correctly (1/2/3 columns)
  - Use Playwright or Cypress for viewport testing (optional)
  - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [ ] 20. Add loading states with skeleton components and timeout handling
  - Ensure all pages use shadcn/ui Skeleton components during data fetching
  - Implement timeout detection (if loading > 10 seconds, show timeout message)
  - Add timeout message: "Request is taking longer than expected. Please check your connection and try again."
  - Provide retry button in timeout message
  - Disable interactive elements (buttons, cards) during loading to prevent duplicate requests
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [~] 20.1 Write tests for loading and timeout behavior
  - Test loading skeleton displays during data fetch
  - Test interactive elements are disabled during loading
  - Test timeout message appears after 10 seconds (use fake timers)
  - Test retry button works after timeout
  - Mock slow API responses to trigger timeout
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [ ] 21. Implement comprehensive error handling with user-friendly messages
  - Ensure all error states display appropriate messages based on error type (network, 401, 404, 500)
  - Add retry buttons to all error states
  - Create toast notification component for non-blocking errors (optional enhancement)
  - Test error recovery: retry after failed request should clear error and fetch again
  - Ensure ErrorBoundary catches and displays unhandled React errors
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [~] 21.1 Write integration tests for error scenarios
  - Test network unavailable error (status 0) displays correct message
  - Test 401 error displays authentication message
  - Test 404 error displays not found message
  - Test 500 error displays server error message
  - Test retry button clears error and refetches data
  - Test ErrorBoundary catches component errors and displays fallback UI
  - Mock API errors for each status code
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [~] 22. Final checkpoint - Run full test suite and fix any failures
  - Ensure all tests pass, ask the user if questions arise.

- [~] 23. Configure Vite for production build optimization
  - Update `vite.config.ts` with production build settings
  - Enable source maps for production debugging
  - Configure code splitting: separate vendor chunk (React, React Router), UI chunk (Radix UI components)
  - Configure rollup options for manual chunk splitting
  - Set output directory to `dist/`
  - Test production build locally with `npm run build` and `npm run preview`
  - Verify bundle size is reasonable (< 500KB for main chunk)
  - _Requirements: 13.3_

- [~] 24. Set up development scripts and configuration
  - Add npm scripts to `package.json`: `dev`, `build`, `preview`, `test`, `test:watch`, `lint`, `type-check`
  - Configure Vite dev server on port 3000 with HMR enabled
  - Configure Vite dev server proxy for `/api` → `http://localhost:8000` (optional, for CORS-free development)
  - Test `npm run dev` starts development server successfully
  - Test `npm run build` creates production bundle
  - Test `npm run preview` serves production build locally
  - _Requirements: 13.1, 13.2, 13.3_

- [x] 25. Create documentation and deployment instructions
  - Create `README.md` with project overview, prerequisites, installation, and usage instructions
  - Document environment variables (VITE_API_BASE_URL, VITE_API_KEY) in README
  - Document development workflow: install, dev server, testing, building
  - Add deployment section with options: static hosting (Netlify/Vercel), Docker, backend integration
  - Create `.env.example` file with placeholder values
  - Document how to configure shadcn/ui components
  - Add troubleshooting section for common issues (CORS, API key, backend connection)
  - _Requirements: 13.1, 13.2, 13.3_

- [~] 26. Optional: Create Dockerfile for containerized deployment
  - Create `Dockerfile` with multi-stage build (node:20 for build, nginx:alpine for serve)
  - Copy built assets from `dist/` to nginx html directory
  - Create `nginx.conf` with SPA routing configuration (all routes → index.html)
  - Expose port 80
  - Test Docker build and run locally
  - _Requirements: 13.3_

- [~] 27. Optional: Set up CI/CD pipeline configuration
  - Create `.github/workflows/frontend-ci.yml` for GitHub Actions
  - Add CI steps: checkout, setup node, install dependencies, type-check, lint, test with coverage, build
  - Configure to run on push and pull request events
  - Add test coverage reporting (optional)
  - _Requirements: 13.4, 13.5_

## Notes

- **Tasks marked with `*` are optional** and can be skipped for faster MVP delivery. These include all testing tasks and optional deployment configurations.
- **All implementation tasks reference specific requirements** for traceability and verification.
- **Checkpoints are included** at natural breaks (after infrastructure, after browsing UI, after PDF viewing, before final delivery) to ensure incremental validation and give opportunities to address issues.
- **Testing strategy**: This frontend application uses unit tests (components, hooks, utilities) and integration tests (workflows, navigation, error handling). Property-based testing is not applicable for UI/React applications.
- **Responsive design** is built in throughout with mobile-first approach using Tailwind CSS breakpoints.
- **Accessibility** is addressed as a dedicated task (task 17) to ensure WCAG AA compliance.
- **Each task is self-contained** and can be implemented by a code-generation agent with clear objectives.


## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1", "1.1"] },
    { "id": 1, "tasks": ["2", "16"] },
    { "id": 2, "tasks": ["2.1", "3", "4"] },
    { "id": 3, "tasks": ["3.1", "4.1"] },
    { "id": 4, "tasks": ["6"] },
    { "id": 5, "tasks": ["6.1", "7"] },
    { "id": 6, "tasks": ["7.1", "8"] },
    { "id": 7, "tasks": ["8.1", "9"] },
    { "id": 8, "tasks": ["9.1", "10"] },
    { "id": 9, "tasks": ["10.1"] },
    { "id": 10, "tasks": ["12"] },
    { "id": 11, "tasks": ["12.1", "13"] },
    { "id": 12, "tasks": ["13.1", "14"] },
    { "id": 13, "tasks": ["14.1", "15", "17"] },
    { "id": 14, "tasks": ["17.1", "19", "20", "21"] },
    { "id": 15, "tasks": ["19.1", "20.1", "21.1"] },
    { "id": 16, "tasks": ["23", "24"] },
    { "id": 17, "tasks": ["25", "26", "27"] }
  ]
}
```
