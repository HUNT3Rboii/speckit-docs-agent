import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ArtifactListView } from "./ArtifactListView";
import type { Artifact } from "../types/api";
import * as useArtifactsModule from "../hooks/useArtifacts";
import * as useExceptionsModule from "../hooks/useExceptions";

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

// ArtifactCard renders ArtifactTags, which calls the real (unmocked)
// useSetArtifactTags mutation hook - it needs a QueryClient in context even
// though useArtifacts/useExceptions above are mocked directly.
const TestWrapper = ({ children }: { children: React.ReactNode }) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/projects/test-project-123"]}>
        <Routes>
          <Route path="/projects/:projectId" element={children} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
};

describe("ArtifactListView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(useExceptionsModule, "useExceptions").mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as any);
    vi.spyOn(useExceptionsModule, "useAddException").mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isError: false,
    } as any);
    vi.spyOn(useExceptionsModule, "useRemoveException").mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isError: false,
    } as any);
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

  it("filters by category when a category tab is clicked", async () => {
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

    const specTab = screen.getByRole("tab", { name: /spec/i });
    await userEvent.click(specTab);

    await waitFor(() => {
      expect(screen.getByText("Spec1")).toBeInTheDocument();
      expect(screen.queryByText("Plan1")).not.toBeInTheDocument();
    });
  });

  it("shows all artifacts when the All tab is active", () => {
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

    expect(screen.getByText("Spec1")).toBeInTheDocument();
    expect(screen.getByText("Plan1")).toBeInTheDocument();
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

  it("displays a category tab, with count, for each category present", () => {
    const artifacts = [
      createMockArtifact({ id: "1", artifact_type: "spec" }),
      createMockArtifact({ id: "2", artifact_type: "spec" }),
      createMockArtifact({ id: "3", artifact_type: "plan" }),
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

    expect(screen.getByRole("tab", { name: /all/i })).toBeInTheDocument();
    const specTab = screen.getByRole("tab", { name: /spec/i });
    const planTab = screen.getByRole("tab", { name: /plan/i });
    expect(specTab).toHaveTextContent("2");
    expect(planTab).toHaveTextContent("1");

    // Categories with zero artifacts don't get a tab
    expect(screen.queryByRole("tab", { name: /task/i })).not.toBeInTheDocument();
  });

  it("always shows an Exceptions tab, even when the project has no artifacts yet", () => {
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

    expect(screen.getByRole("tab", { name: "Exceptions" })).toBeInTheDocument();
  });

  it("shows the exceptions manager when the Exceptions tab is selected", async () => {
    vi.spyOn(useArtifactsModule, "useArtifacts").mockReturnValue({
      data: [createMockArtifact({ id: "1" })],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      isError: false,
      isSuccess: true,
      isPending: false,
      status: "success",
    } as any);
    vi.spyOn(useExceptionsModule, "useExceptions").mockReturnValue({
      data: [{ id: 1, project_id: "test-project-123", source_path: ".specify/templates", created_at: new Date().toISOString() }],
      isLoading: false,
      error: null,
    } as any);

    render(
      <TestWrapper>
        <ArtifactListView />
      </TestWrapper>
    );

    await userEvent.click(screen.getByRole("tab", { name: "Exceptions" }));

    await waitFor(() => {
      expect(screen.getByText(".specify/templates")).toBeInTheDocument();
    });
  });

  it("leaves context files to their own sidebar page rather than a tab here", () => {
    vi.spyOn(useArtifactsModule, "useArtifacts").mockReturnValue({
      data: [createMockArtifact({ id: "1" })],
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

    expect(screen.queryByRole("tab", { name: "Context Files" })).not.toBeInTheDocument();
  });

  it("hides the artifact search box on tabs it cannot filter", async () => {
    vi.spyOn(useArtifactsModule, "useArtifacts").mockReturnValue({
      data: [createMockArtifact({ id: "1" })],
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

    expect(screen.getByLabelText("Search artifacts")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: "Exceptions" }));

    await waitFor(() => {
      expect(screen.queryByLabelText("Search artifacts")).not.toBeInTheDocument();
    });
  });
});
