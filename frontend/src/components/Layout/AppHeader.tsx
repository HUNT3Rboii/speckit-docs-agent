import { SidebarTrigger } from '../ui/sidebar';
import { Separator } from '../ui/separator';
import { ThemeToggle } from '../theme/ThemeToggle';
import Breadcrumb from './Breadcrumb';

export function AppHeader() {
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-card px-4">
      <SidebarTrigger />
      <Separator orientation="vertical" className="h-4" />
      <Breadcrumb />
      <div className="ml-auto flex items-center gap-2">
        <ThemeToggle />
      </div>
    </header>
  );
}
