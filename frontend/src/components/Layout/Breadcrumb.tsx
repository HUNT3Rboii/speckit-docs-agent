import React from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';

const Breadcrumb: React.FC = () => {
  const location = useLocation();
  const params = useParams<{ projectId?: string; artifactId?: string; versionId?: string }>();

  // Build breadcrumb items based on current route
  const breadcrumbItems: { label: string; path: string; current: boolean }[] = [
    { label: 'Home', path: '/', current: false },
  ];

  // Parse the current path to build breadcrumbs
  if (params.projectId) {
    breadcrumbItems.push({
      label: `Project ${params.projectId.substring(0, 8)}...`,
      path: `/projects/${params.projectId}`,
      current: !params.artifactId,
    });
  }

  if (params.artifactId) {
    breadcrumbItems.push({
      label: `Artifact ${params.artifactId.substring(0, 8)}...`,
      path: `/projects/${params.projectId}/artifacts/${params.artifactId}`,
      current: !params.versionId,
    });
  }

  if (params.versionId) {
    breadcrumbItems.push({
      label: `Version ${params.versionId.substring(0, 8)}...`,
      path: `/projects/${params.projectId}/artifacts/${params.artifactId}/versions/${params.versionId}`,
      current: true,
    });
  }

  // Mark the last item as current if no params indicate otherwise
  if (breadcrumbItems.length > 0 && location.pathname === '/') {
    breadcrumbItems[0].current = true;
  }

  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex items-center space-x-2 text-sm">
        {breadcrumbItems.map((item, index) => (
          <li key={item.path} className="flex items-center">
            {index > 0 && (
              <ChevronRight className="h-4 w-4 mx-2 text-muted-foreground" aria-hidden="true" />
            )}
            {item.current ? (
              <span
                className="text-foreground font-medium"
                aria-current="page"
              >
                {index === 0 && <Home className="h-4 w-4 inline mr-1" aria-hidden="true" />}
                {item.label}
              </span>
            ) : (
              <Link
                to={item.path}
                className="text-muted-foreground hover:text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded px-1"
              >
                {index === 0 && <Home className="h-4 w-4 inline mr-1" aria-hidden="true" />}
                {item.label}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
};

export default Breadcrumb;
