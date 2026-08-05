# 🎉 PDF Visualization Frontend Prototype Ready!

Your frontend prototype is complete and ready to use!

## ✅ What's Implemented

### Core Features
- ✅ **Project Dashboard** - Browse all projects with card-based layout
- ✅ **Artifact List View** - Search, filter, and browse PDF artifacts
- ✅ **Search Bar** - Debounced search with clear button
- ✅ **Category Filters** - Filter by spec, plan, task, constitution, other
- ✅ **Artifact Cards** - Beautiful cards with metadata and timestamps
- ✅ **PDF Viewer** - View PDFs in browser with iframe
- ✅ **Version History** - Switch between document versions
- ✅ **Responsive Layout** - Works on mobile, tablet, and desktop
- ✅ **Error Handling** - Graceful error states with retry buttons
- ✅ **Loading States** - Skeleton components during data fetch
- ✅ **Breadcrumb Navigation** - Easy navigation through the app
- ✅ **Accessibility** - Keyboard navigation and ARIA labels

### Technical Stack
- ✅ React 18 with TypeScript
- ✅ Vite for fast development
- ✅ React Query for server state
- ✅ React Router for routing
- ✅ shadcn/ui components
- ✅ Tailwind CSS for styling
- ✅ Axios for HTTP requests
- ✅ date-fns for date formatting

### Architecture
- ✅ API client layer with error handling
- ✅ Custom hooks for data fetching
- ✅ Utility functions for formatting
- ✅ Type-safe with TypeScript
- ✅ Environment configuration
- ✅ Error boundaries for crash recovery

## 🚀 Quick Start

### 1. Install Dependencies (if not already done)

```powershell
cd frontend
npm install
```

### 2. Configure Environment

Create `frontend/.env.development`:

```env
VITE_API_BASE_URL=http://localhost:8000
VITE_API_KEY=dev-key
```

### 3. Start Development Server

```powershell
# From project root (also starts the backend)
.\START-EVERYTHING.ps1

# OR frontend only
cd frontend
npm run dev
```

The app will be available at **http://localhost:5173**

### 4. Make Sure Backend is Running

The frontend needs the backend API running on `http://localhost:8000`.

```powershell
# From project root
.\START-EVERYTHING.ps1
```

## 📱 Using the Prototype

### Navigation Flow

1. **Home (/)** → Project Dashboard
   - View all projects as cards
   - Click any project to see its artifacts

2. **Project View (/projects/:id)** → Artifact List
   - Search artifacts by title or path
   - Filter by category (spec, plan, task, etc.)
   - View count of artifacts per category
   - Artifacts grouped by category
   - Click any artifact to view its PDF

3. **PDF Viewer (/projects/:id/artifacts/:id)** → PDF Display
   - View PDF in browser
   - See version history sidebar
   - Switch between versions
   - Download PDF to your computer

### Features to Try

✨ **Search** - Type in the search bar to filter artifacts by title or path

✨ **Category Filters** - Click category buttons to filter by type

✨ **Responsive** - Resize your browser to see mobile, tablet, and desktop layouts

✨ **Keyboard Navigation** - Use Tab to navigate, Enter/Space to select

✨ **Error Recovery** - Turn off backend and see error handling with retry

## 📂 Project Structure

```
frontend/
├── src/
│   ├── api/              # API client and HTTP logic
│   │   └── client.ts     # Axios client with interceptors
│   ├── components/       # React components
│   │   ├── ui/           # shadcn/ui components
│   │   ├── Layout/       # Layout and Breadcrumb
│   │   ├── ArtifactCard.tsx
│   │   ├── CategoryFilter.tsx
│   │   ├── ProjectCard.tsx
│   │   ├── SearchBar.tsx
│   │   ├── VersionList.tsx
│   │   └── ErrorBoundary.tsx
│   ├── config/           # Environment config
│   │   └── env.ts
│   ├── hooks/            # Custom React hooks
│   │   ├── useProjects.ts
│   │   ├── useArtifacts.ts
│   │   ├── useVersions.ts
│   │   ├── usePDFDownload.ts
│   │   └── useDebounce.ts
│   ├── pages/            # Page components
│   │   ├── ProjectDashboard.tsx
│   │   ├── ArtifactListView.tsx
│   │   └── PDFViewer.tsx
│   ├── types/            # TypeScript types
│   │   └── api.ts
│   ├── utils/            # Utility functions
│   │   ├── categoryColors.ts
│   │   ├── dateFormat.ts
│   │   └── pathTruncate.ts
│   ├── App.tsx           # Root component with routing
│   └── main.tsx          # Entry point
```

## 🎨 Customization

### Colors

Edit `frontend/src/index.css` to change the color scheme:

```css
:root {
  --primary: 277 100% 61%;      /* Purple */
  --secondary: 240 4.8% 95.9%;  /* Gray */
  --destructive: 0 84.2% 60.2%; /* Red */
  /* ... more colors */
}
```

### Category Colors

Edit `frontend/src/utils/categoryColors.ts` to change artifact type colors.

### Layout

Edit `frontend/src/components/Layout/Layout.tsx` to customize the navigation bar.

## 🧪 Testing

```bash
# Run tests
npm run test

# Watch mode for TDD
npm run test:watch

# Coverage report
npm run test:coverage
```

Tests are located next to components: `Component.test.tsx`

## 📦 Building for Production

```bash
# Create optimized build
npm run build

# Preview production build
npm run preview
```

Build output will be in `frontend/dist/`

## 🐛 Troubleshooting

### Backend Connection Failed

**Error**: "Backend server is not available"

**Fix**:
1. Check backend is running: `http://localhost:8000`
2. Verify `VITE_API_BASE_URL` in `.env.development`
3. Check CORS settings in backend

### API Key Issues

**Error**: "Authentication failed" or 401 Unauthorized

**Fix**:
1. ⚠️ **IMPORTANT**: The backend expects API key `dev-key` by default
2. Update `frontend/.env.development` to use `VITE_API_KEY=dev-key`
3. Restart the frontend dev server (Ctrl+C, then `npm run dev`)
4. Hard refresh browser (Ctrl+Shift+R) to clear cached code
5. Verify in browser Network tab that Authorization header shows `Bearer dev-key`

**Common Issue**: If `.env.development` has the wrong API key (like `dev-api-key-12345`), the frontend will fail authentication even though everything else is correct.

### Port Already in Use

**Error**: "Port 3000 is already in use"

**Fix**:
```bash
# Kill process using port 3000
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# Or use different port
npm run dev -- --port 3001
```

## 🎯 Next Steps

### Optional Enhancements

- [ ] Add user authentication
- [ ] Implement real-time updates with WebSocket
- [ ] Add PDF annotations
- [ ] Implement dark mode toggle
- [ ] Add export to different formats
- [ ] Implement advanced search with filters
- [ ] Add document comparison view
- [ ] Implement collaborative features

### Production Deployment

1. **Environment Variables**
   - Set `VITE_API_BASE_URL` to production API URL
   - Update `VITE_API_KEY` with production key

2. **Build and Deploy**
   ```bash
   npm run build
   # Deploy dist/ folder to hosting service
   ```

3. **Hosting Options**
   - Netlify (recommended for SPA)
   - Vercel
   - Cloudflare Pages
   - AWS S3 + CloudFront
   - Docker + Nginx

## 📚 Additional Resources

- [React Documentation](https://react.dev/)
- [Vite Documentation](https://vitejs.dev/)
- [React Query Documentation](https://tanstack.com/query/)
- [React Router Documentation](https://reactrouter.com/)
- [shadcn/ui Documentation](https://ui.shadcn.com/)
- [Tailwind CSS Documentation](https://tailwindcss.com/)

## 💡 Tips

- Use React DevTools browser extension for debugging
- Enable React Query DevTools in development
- Check Network tab in browser DevTools for API calls
- Use VS Code with TypeScript language support
- Install Tailwind CSS IntelliSense extension

---

**🎉 Enjoy your prototype! If you have questions, check the README.md or backend documentation.**
