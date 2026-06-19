import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Badge from "./Badge";

describe("Badge", () => {
  it("renders its children", () => {
    render(<Badge variant="new">New</Badge>);
    expect(screen.getByText("New")).toBeInTheDocument();
  });

  it("applies the badge--new class for the 'new' variant", () => {
    render(<Badge variant="new">New</Badge>);
    const el = screen.getByText("New");
    expect(el).toHaveClass("badge--new");
  });

  it("applies the badge--logged class for the 'logged' variant", () => {
    render(<Badge variant="logged">Logged</Badge>);
    expect(screen.getByText("Logged")).toHaveClass("badge--logged");
  });

  it("applies the badge--warning class for the 'warning' variant", () => {
    render(<Badge variant="warning">Overlap</Badge>);
    expect(screen.getByText("Overlap")).toHaveClass("badge--warning");
  });

  it("applies the badge--active class for the 'active' variant", () => {
    render(<Badge variant="active">Active</Badge>);
    expect(screen.getByText("Active")).toHaveClass("badge--active");
  });

  it("applies the badge--inactive class for the 'inactive' variant", () => {
    render(<Badge variant="inactive">Inactive</Badge>);
    expect(screen.getByText("Inactive")).toHaveClass("badge--inactive");
  });

  it("also carries the base 'badge' class", () => {
    render(<Badge variant="new">X</Badge>);
    expect(screen.getByText("X")).toHaveClass("badge");
  });

  it("renders complex children (nodes)", () => {
    render(
      <Badge variant="active">
        <span>Hello</span> World
      </Badge>
    );
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });
});
