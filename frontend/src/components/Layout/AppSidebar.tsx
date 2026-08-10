import { Link, useLocation, useParams } from 'react-router-dom';
import { FileCode2, FileText, Folder, FolderOpen, KanbanSquare, LayoutGrid, Zap } from 'lucide-react';
import { useProjects } from '../../hooks/useProjects';
import { useSetAutomationMode } from '../../hooks/useAutomationMode';
import { Switch } from '../ui/switch';
import type { Project } from '../../types/api';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
} from '../ui/sidebar';

/**
 * Per-project automatic/manual transformation, sitting with the project's
 * own navigation rather than as a global control - it is a property of the
 * project, and a global switch would have nothing sensible to show while
 * no project is selected.
 *
 * Its own component because the mutation hook is project-scoped and can't
 * be called from inside the projects map.
 */
function ProjectAutomationToggle({ project }: { project: Project }) {
  const setAutomationMode = useSetAutomationMode(project.id);
  const isAutomatic = project.automation_mode !== 'manual';

  return (
    <div className="flex h-7 min-w-0 -translate-x-px items-center gap-2 rounded-md px-2 text-sm text-sidebar-foreground">
      <Zap className="h-4 w-4 shrink-0 text-sidebar-accent-foreground" aria-hidden="true" />
      <span className="flex-1 truncate">Auto transform</span>
      <Switch
        checked={isAutomatic}
        onCheckedChange={(checked) => setAutomationMode.mutate(checked ? 'automatic' : 'manual')}
        disabled={setAutomationMode.isPending}
        aria-label={`Automatic transformation for ${project.name}`}
        title={
          isAutomatic
            ? 'Saving a markdown file converts it automatically'
            : 'Files are only converted from the Context Files page'
        }
      />
    </div>
  );
}

export function AppSidebar() {
  const { projectId } = useParams<{ projectId?: string }>();
  const location = useLocation();
  const { data: projects, isLoading } = useProjects();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="lg">
              <Link to="/">
                <FileText className="h-5 w-5 shrink-0" />
                <span className="font-semibold text-base truncate group-data-[collapsible=icon]:hidden">
                  PDF Docs
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Projects</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {isLoading &&
                Array.from({ length: 4 }).map((_, index) => (
                  <SidebarMenuItem key={index}>
                    <SidebarMenuSkeleton showIcon />
                  </SidebarMenuItem>
                ))}

              {!isLoading && (!projects || projects.length === 0) && (
                <SidebarMenuItem>
                  <span className="px-2 py-1.5 text-xs text-sidebar-foreground/60">
                    No projects yet
                  </span>
                </SidebarMenuItem>
              )}

              {projects?.map((project) => {
                const isActive = project.id === projectId;
                const artifactsPath = `/projects/${project.id}`;
                const boardPath = `/projects/${project.id}/board`;
                const filesPath = `/projects/${project.id}/files`;
                return (
                  <SidebarMenuItem key={project.id}>
                    <SidebarMenuButton asChild isActive={isActive} tooltip={project.name}>
                      <Link to={artifactsPath}>
                        {isActive ? (
                          <FolderOpen className="h-4 w-4 shrink-0" />
                        ) : (
                          <Folder className="h-4 w-4 shrink-0" />
                        )}
                        <span>{project.name}</span>
                      </Link>
                    </SidebarMenuButton>
                    {isActive && (
                      <SidebarMenuSub>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={location.pathname === artifactsPath}>
                            <Link to={artifactsPath}>
                              <LayoutGrid className="h-4 w-4 shrink-0" />
                              <span>Artifacts</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={location.pathname === boardPath}>
                            <Link to={boardPath}>
                              <KanbanSquare className="h-4 w-4 shrink-0" />
                              <span>Board</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton asChild isActive={location.pathname === filesPath}>
                            <Link to={filesPath}>
                              <FileCode2 className="h-4 w-4 shrink-0" />
                              <span>Context Files</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                        <SidebarMenuSubItem>
                          <ProjectAutomationToggle project={project} />
                        </SidebarMenuSubItem>
                      </SidebarMenuSub>
                    )}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}
