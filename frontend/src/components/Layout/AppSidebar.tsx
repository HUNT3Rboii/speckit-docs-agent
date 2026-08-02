import { Link, useParams } from 'react-router-dom';
import { FileText, Folder, FolderOpen } from 'lucide-react';
import { useProjects } from '../../hooks/useProjects';
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
  SidebarRail,
} from '../ui/sidebar';

export function AppSidebar() {
  const { projectId } = useParams<{ projectId?: string }>();
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
                return (
                  <SidebarMenuItem key={project.id}>
                    <SidebarMenuButton asChild isActive={isActive} tooltip={project.name}>
                      <Link to={`/projects/${project.id}`}>
                        {isActive ? (
                          <FolderOpen className="h-4 w-4 shrink-0" />
                        ) : (
                          <Folder className="h-4 w-4 shrink-0" />
                        )}
                        <span>{project.name}</span>
                      </Link>
                    </SidebarMenuButton>
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
