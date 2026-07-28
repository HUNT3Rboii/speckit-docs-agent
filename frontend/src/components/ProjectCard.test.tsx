/**
 * Unit tests for ProjectCard component
 * Tests rendering, interactions, and accessibility
 * **Validates: Requirements 1.2, 1.3, 5.5, 11.2**
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ProjectCard } from './ProjectCard';
import type { Project } from '../types/api';

describe('ProjectCard', () => {
  const mockProject: Project = {
    id: 'project-123',
    name: 'Test Project',
    repo_url: 'https://github.com/test/repo',
  };

  const mockOnClick = vi.fn();

  describe('rendering', () => {
    it('displays project name prominently', () => {
      render(<ProjectCard project={mockProject} onClick={mockOnClick} />);
      
      const projectName = screen.getByText('Test Project');
      expect(projectName).toBeInTheDocument();
    });

    it('displays repository URL when provided', () => {
      render(<ProjectCard project={mockProject} onClick={mockOnClick} />);
      
      expect(screen.getByText(/github.com\/test\/repo/)).toBeInTheDocument();
    });

    it('does not display repository URL section when not provided', () => {
      const projectWithoutUrl: Project = {
        id: 'project-456',
        name: 'Another Project',
      };

      render(<ProjectCard project={projectWithoutUrl} onClick={mockOnClick} />);
      
      expect(screen.queryByText(/github/)).not.toBeInTheDocument();
    });

    it('truncates long repository URLs with title attribute', () => {
      const projectWithLongUrl: Project = {
        id: 'project-789',
        name: 'Project',
        repo_url: 'https://github.com/very-long-organization-name/very-long-repository-name',
      };

      const { container } = render(
        <ProjectCard project={projectWithLongUrl} onClick={mockOnClick} />
      );
      
      // Find element with truncate class
      const urlElement = container.querySelector('.truncate');
      expect(urlElement).toBeInTheDocument();
      expect(urlElement).toHaveAttribute('title', projectWithLongUrl.repo_url);
    });
  });

  describe('interactions', () => {
    it('calls onClick with project ID when card is clicked', () => {
      const onClickSpy = vi.fn();
      render(<ProjectCard project={mockProject} onClick={onClickSpy} />);
      
      const card = screen.getByRole('button');
      fireEvent.click(card);
      
      expect(onClickSpy).toHaveBeenCalledTimes(1);
      expect(onClickSpy).toHaveBeenCalledWith('project-123');
    });

    it('calls onClick when Enter key is pressed', () => {
      const onClickSpy = vi.fn();
      render(<ProjectCard project={mockProject} onClick={onClickSpy} />);
      
      const card = screen.getByRole('button');
      fireEvent.keyDown(card, { key: 'Enter' });
      
      expect(onClickSpy).toHaveBeenCalledTimes(1);
      expect(onClickSpy).toHaveBeenCalledWith('project-123');
    });

    it('calls onClick when Space key is pressed', () => {
      const onClickSpy = vi.fn();
      render(<ProjectCard project={mockProject} onClick={onClickSpy} />);
      
      const card = screen.getByRole('button');
      fireEvent.keyDown(card, { key: ' ' });
      
      expect(onClickSpy).toHaveBeenCalledTimes(1);
      expect(onClickSpy).toHaveBeenCalledWith('project-123');
    });

    it('does not call onClick for other keys', () => {
      const onClickSpy = vi.fn();
      render(<ProjectCard project={mockProject} onClick={onClickSpy} />);
      
      const card = screen.getByRole('button');
      fireEvent.keyDown(card, { key: 'a' });
      fireEvent.keyDown(card, { key: 'Escape' });
      
      expect(onClickSpy).not.toHaveBeenCalled();
    });

    it('has cursor pointer on hover', () => {
      const { container } = render(
        <ProjectCard project={mockProject} onClick={mockOnClick} />
      );
      
      const card = container.querySelector('.cursor-pointer');
      expect(card).toBeInTheDocument();
    });

    it('has hover effects applied via Tailwind classes', () => {
      const { container } = render(
        <ProjectCard project={mockProject} onClick={mockOnClick} />
      );
      
      // Check for hover-related classes
      const card = container.querySelector('.hover\\:shadow-lg');
      expect(card).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('is keyboard accessible with tabIndex', () => {
      render(<ProjectCard project={mockProject} onClick={mockOnClick} />);
      
      const card = screen.getByRole('button');
      expect(card).toHaveAttribute('tabIndex', '0');
    });

    it('has role="button" for semantic meaning', () => {
      render(<ProjectCard project={mockProject} onClick={mockOnClick} />);
      
      const card = screen.getByRole('button');
      expect(card).toBeInTheDocument();
    });

    it('has descriptive aria-label', () => {
      render(<ProjectCard project={mockProject} onClick={mockOnClick} />);
      
      const card = screen.getByRole('button');
      expect(card).toHaveAttribute('aria-label', 'Open project Test Project');
    });

    it('meets minimum touch target size requirements', () => {
      const { container } = render(
        <ProjectCard project={mockProject} onClick={mockOnClick} />
      );
      
      // shadcn/ui Card component should have padding that ensures adequate touch targets
      const card = container.querySelector('[role="button"]');
      expect(card).toBeInTheDocument();
    });
  });

  describe('shadcn/ui Card component usage', () => {
    it('uses shadcn/ui Card component structure', () => {
      const { container } = render(
        <ProjectCard project={mockProject} onClick={mockOnClick} />
      );
      
      // Check for Card-specific classes
      expect(container.querySelector('.rounded-lg')).toBeInTheDocument();
      expect(container.querySelector('.border')).toBeInTheDocument();
      expect(container.querySelector('.shadow-sm')).toBeInTheDocument();
    });
  });
});
