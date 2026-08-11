import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { useProjects } from '../../hooks/useProjects';
import { useArtifacts } from '../../hooks/useArtifacts';
import { truncatePath } from '../../utils/pathTruncate';
import {
  Breadcrumb as BreadcrumbRoot,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '../ui/breadcrumb';

const Breadcrumb: React.FC = () => {
  const params = useParams<{ projectId?: string; artifactId?: string; versionId?: string }>();

  const { data: projects } = useProjects();
  const { data: artifacts } = useArtifacts(params.projectId || '');

  const project = projects?.find((p) => p.id === params.projectId);
  const artifact = artifacts?.find((a) => a.id === params.artifactId);

  const items: { label: string; path: string }[] = [];

  if (params.projectId) {
    items.push({
      label: project?.name || `Project ${params.projectId.substring(0, 8)}...`,
      path: `/projects/${params.projectId}`,
    });
  }

  if (params.artifactId) {
    items.push({
      label: artifact?.title || (artifact ? truncatePath(artifact.source_path, 40) : `Artifact ${params.artifactId.substring(0, 8)}...`),
      path: `/projects/${params.projectId}/artifacts/${params.artifactId}`,
    });
  }

  if (params.versionId) {
    items.push({
      label: `Version ${params.versionId}`,
      path: `/projects/${params.projectId}/artifacts/${params.artifactId}/versions/${params.versionId}`,
    });
  }

  return (
    <BreadcrumbRoot>
      <BreadcrumbList>
        <BreadcrumbItem>
          {items.length === 0 ? (
            <BreadcrumbPage>Projects</BreadcrumbPage>
          ) : (
            <BreadcrumbLink asChild>
              <Link to="/">Projects</Link>
            </BreadcrumbLink>
          )}
        </BreadcrumbItem>
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <React.Fragment key={item.path}>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                {isLast ? (
                  <BreadcrumbPage>{item.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link to={item.path}>{item.label}</Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </React.Fragment>
          );
        })}
      </BreadcrumbList>
    </BreadcrumbRoot>
  );
};

export default Breadcrumb;
