// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { AssigneeStack } from "./assignee-stack";
import type { TaskAssignee } from "@dragons/shared";

function a(userId: string, name: string): TaskAssignee {
  return { userId, name, assignedAt: "2026-01-01T00:00:00Z" };
}

describe("AssigneeStack", () => {
  it("renders nothing when empty", () => {
    const { container } = render(<AssigneeStack assignees={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("shows initials for all when <=3 assignees", () => {
    render(
      <AssigneeStack
        assignees={[a("1", "Alice Apple"), a("2", "Bob Blue"), a("3", "Carol")]}
      />,
    );
    expect(screen.getByText("AA")).toBeInTheDocument();
    expect(screen.getByText("BB")).toBeInTheDocument();
    expect(screen.getByText("C")).toBeInTheDocument();
  });

  it("shows +N badge when >3 assignees", () => {
    render(
      <AssigneeStack
        assignees={[
          a("1", "Alice Apple"),
          a("2", "Bob Blue"),
          a("3", "Carol"),
          a("4", "Dan Deer"),
          a("5", "Eve Eagle"),
        ]}
      />,
    );
    expect(screen.getByText("+2")).toBeInTheDocument();
  });
});
