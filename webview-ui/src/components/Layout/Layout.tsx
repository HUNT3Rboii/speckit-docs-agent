import { Outlet } from 'react-router-dom';
import { SidebarProvider, SidebarInset } from '../ui/sidebar';
import { AppSidebar } from './AppSidebar';
import { AppHeader } from './AppHeader';

/**
 * Rendered as a parent route (see App.tsx), not a plain children-taking
 * wrapper: components rendered inside it (notably AppHeader's Breadcrumb)
 * need useParams() to resolve :projectId/:artifactId, which only works if
 * Layout is genuinely part of the matched route tree - a wrapper placed
 * around <Routes> from the outside does not give its own children access to
 * the matched child route's params.
 */
const Layout = () => {
  return (
    <SidebarProvider>
      {/* Skip to main content link for accessibility */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md"
      >
        Skip to main content
      </a>

      <AppSidebar />
      {/* SidebarInset renders its own <main>, so the id="main-content" skip
          target lives on a plain div to avoid a nested/duplicate <main> landmark. */}
      <SidebarInset>
        <AppHeader />
        <div id="main-content" className="flex-1 px-4 py-8 md:px-8">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
};

export default Layout;
