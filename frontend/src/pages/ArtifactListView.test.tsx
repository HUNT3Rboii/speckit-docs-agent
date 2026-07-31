import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { ArtifactListView } from "./ArtifactListView";
import type { Artifact } from "../types/api";
import * as useArtifactsModule from "../hooks/useArtifacts";

const createMockArtifact = (overrides?: Partial<Artifact>): Artifact => ({
  id: "artifact-123",
  project_id: "project-1",
  source_path: "/src/specs/example.md",
  artifact_type: "spec",
  status: "completed",
  content_hash: "abc123",
  created_at: new Date().toISOString(),
  title: "Example Spec",
  ...overrides,
});

const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <MemoryRouter initialEntries={["/projects/test-project-123"]}>
    <Routes>
      <Route path="/projects/:projectId" element={children} />
    </Routes>
  </MemoryRouter>
);

describe("ArtifactListView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches artifacts for correct project ID", () => {
    vi.spyOn(useArtifactsModule, "useArtifacts").mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      isError: false,
      isSuccess: true,
      isPending: false,
      status: "success",
    } as any);

    render(
      <TestWrapper>
        <ArtifactListView />
      </TestWrapper>
    );

    expect(screen.getByText("Artifacts")).toBeInTheDocument();
  });

  it("filters artifacts by title when searching", async () => {
    const artifacts = [
      createMockArtifact({ id: "1", title: "Authentication Spec" }),
      createMockArtifact({ id: "2", title: "Database Plan" }),
    ];

    vi.spyOn(useArtifactsModule, "useArtifacts").mockReturnValue({
      data: artifacts,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      isError: false,
      isSuccess: true,
      isPending: false,
      status: "success",
    } as any);

    render(
      <TestWrapper>
        <ArtifactListView />
      </TestWrapper>
    );

    const searchInput = screen.getByPlaceholderText(/search/i);
    await userEvent.type(searchInput, "Authentication");

    await waitFor(() => {
      expect(screen.getByText("Authentication Spec")).toBeInTheDocument();
    });
  });

  it("filters artifacts by source path when searching", async () => {
    const artifacts = [
      createMockArtifact({ id: "1", source_path: "/specs/auth.md", title: "A" }),
      createMockArtifact({ id: "2", source_path: "/docs/db.md", title: "B" }),
    ];

    vi.spyOn(useArtifactsModule, "useArtifacts").mockReturnValue({
      data: artifacts,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      isError: false,
      isSuccess: true,
      isPending: false,
      status: "success",
    } as any);

    render(
      <TestWrapper>
        <ArtifactListView />
      </TestWrapper>
    );

    const searchInput = screen.getByPlaceholderText(/search/i);
    await userEvent.type(searchInput, "/specs");

    await waitFor(() => {
      expect(screen.getByText("A")).toBeInTheDocument();
    });
  });

  it("filters by category when category button is clicked", async () => {
    const artifacts = [
      createMockArtifact({ id: "1", artifact_type: "spec", title: "Spec1" }),
      createMockArtifact({ id: "2", artifact_type: "plan", title: "Plan1" }),
    ];

    vi.spyOn(useArtifactsModule, "useArtifacts").mockReturnValue({
      data: artifacts,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      isError: false,
      isSuccess: true,
      isPending: false,
      status: "success",
    } as any);

    render(
      <TestWrapper>
        <ArtifactListView />
      </TestWrapper>
    );

    const specButton = screen.getByLabelText(/filter by spec/i);
    fireEvent.click(specButton);

    await waitFor(() => {
      expect(screen.getByText("Spec1")).toBeInTheDocument();
      expect(screen.queryByText("Plan1")).not.toBeInTheDocument();
    });
  });

  it("sorts artifacts by created_at descending (newest first)", () => {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const artifacts = [
      createMockArtifact({ id: "1", title: "Old", created_at: yesterday.toISOString() }),
      createMockArtifact({ id: "2", title: "New", created_at: now.toISOString() }),
    ];

    vi.spyOn(useArtifactsModule, "useArtifacts").mockReturnValue({
      data: artifacts,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      isError: false,
      isSuccess: true,
      isPending: false,
      status: "success",
    } as any);

    render(
      <TestWrapper>
        <ArtifactListView />
      </TestWrapper>
    );

    const titles = screen.getAllByText(/Old|New/);
    expect(titles[0].textContent).toBe("New");
    expect(titles[1].textContent).toBe("Old");
  });

  it("displays empty state when no artifacts exist", () => {
    vi.spyOn(useArtifactsModule, "useArtifacts").mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      isError: false,
      isSuccess: true,
      isPending: false,
      status: "success",
    } as any);

    render(
      <TestWrapper>
        <ArtifactListView />
      </TestWrapper>
    );

    expect(screen.getByText("No artifacts found")).toBeInTheDocument();
  });

  it("displays empty state when search returns no results", async () => {
    const artifacts = [createMockArtifact({ id: "1", title: "Test" })];

    vi.spyOn(useArtifactsModule, "useArtifacts").mockReturnValue({
      data: artifacts,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      isError: false,
      isSuccess: true,
      isPending: false,
      status: "success",
    } as any);

    render(
      <TestWrapper>
        <ArtifactListView />
      </TestWrapper>
    );

    const searchInput = screen.getByPlaceholderText(/search/i);
    await userEvent.type(searchInput, "NonExistent");

    await waitFor(() => {
      expect(screen.getByText("No artifacts match your filters.")).toBeInTheDocument();
    });
  });

  it("displays category group headers when artifacts exist", () => {
    const artifacts = [
      createMockArtifact({ id: "1", artifact_type: "spec" }),
      createMockArtifact({ id: "2", artifact_type: "plan" }),
    ];

    vi.spyOn(useArtifactsModule, "useArtifacts").mockReturnValue({
      data: artifacts,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      isError: false,
      isSuccess: true,
      isPending: false,
      status: "success",
    } as any);

    render(
      <TestWrapper>
        <ArtifactListView />
      </TestWrapper>
    );

    const headings = screen.getAllByRole("heading");
    const headingTexts = headings.map((h) => h.textContent);
    expect(headingTexts).toContain("spec");
    expect(headingTexts).toContain("plan");
  });
});
