import React from 'react';
import Breadcrumb from './Breadcrumb';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  return (
    <div className="min-h-screen bg-background">
      {/* Skip to main content link for accessibility */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md"
      >
        Skip to main content
      </a>

      {/* Navigation header */}
      <nav className="border-b bg-card" role="navigation" aria-label="Main navigation">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-foreground">
              PDF Visualization
            </h1>
          </div>
        </div>
      </nav>

      {/* Breadcrumb navigation */}
      <div className="border-b bg-muted/30">
        <div className="container mx-auto px-4 py-2">
          <Breadcrumb />
        </div>
      </div>

      {/* Main content */}
      <main id="main-content" className="container mx-auto px-4 py-8" role="main">
        {children}
      </main>
    </div>
  );
};

export default Layout;
