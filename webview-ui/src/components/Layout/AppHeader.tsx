import { Link, useLocation } from 'react-router-dom';
import { Settings } from 'lucide-react';
import { SidebarTrigger } from '../ui/sidebar';
import { Separator } from '../ui/separator';
import { Button } from '../ui/button';
import { ThemeToggle } from '../theme/ThemeToggle';
import Breadcrumb from './Breadcrumb';

export function AppHeader() {
  const location = useLocation();
  const onSettings = location.pathname === '/settings';

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-card px-4">
      <SidebarTrigger />
      <Separator orientation="vertical" className="h-4" />
      <Breadcrumb />
      <div className="ml-auto flex items-center gap-2">
        {/* The way into the AI providers panel, the conversion settings and the
            diagnostics - none of which have a page of their own anywhere else. */}
        <Button
          asChild
          variant={onSettings ? 'secondary' : 'ghost'}
          size="icon"
          aria-label="Settings"
          title="Settings"
        >
          <Link to="/settings">
            <Settings />
          </Link>
        </Button>
        <ThemeToggle />
      </div>
    </header>
  );
}
