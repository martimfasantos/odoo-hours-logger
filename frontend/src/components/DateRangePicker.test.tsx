import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DateRangePicker from "./DateRangePicker";

function renderPicker(from = "2026-10-12", to = "2026-10-14") {
  const onChange = vi.fn();
  render(<DateRangePicker from={from} to={to} onChange={onChange} />);
  const trigger = screen.getByRole("button", { name: /From – To/ });
  return { onChange, trigger };
}

const day = (label: string) => screen.getByRole("button", { name: label });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 30, 12));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("DateRangePicker", () => {
  it("opens on the month containing `from` and pages months", async () => {
    const { trigger } = renderPicker("2026-08-10", "2026-08-12");
    await userEvent.click(trigger);
    expect(screen.getByRole("dialog", { name: "Choose date range" })).toHaveTextContent(
      "August 2026",
    );
    await userEvent.click(screen.getByRole("button", { name: "Next month" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("September 2026");
  });

  it("marks the committed range as pressed", async () => {
    const { trigger } = renderPicker();
    await userEvent.click(trigger);
    expect(day("Tuesday, October 13, 2026")).toHaveAttribute("aria-pressed", "true");
    expect(day("Thursday, October 15, 2026")).toHaveAttribute("aria-pressed", "false");
  });

  it("commits the second click as an ordered pair and closes", async () => {
    const { onChange, trigger } = renderPicker();
    await userEvent.click(trigger);
    await userEvent.click(day("Monday, October 26, 2026"));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await userEvent.click(day("Wednesday, October 28, 2026"));
    expect(onChange.mock.calls).toEqual([["2026-10-26", "2026-10-28"]]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("swaps a backwards pick", async () => {
    const { onChange, trigger } = renderPicker();
    await userEvent.click(trigger);
    await userEvent.click(day("Wednesday, October 28, 2026"));
    await userEvent.click(day("Monday, October 26, 2026"));
    expect(onChange.mock.calls).toEqual([["2026-10-26", "2026-10-28"]]);
  });

  it("commits a one-day range when the same day is clicked twice", async () => {
    const { onChange, trigger } = renderPicker();
    await userEvent.click(trigger);
    await userEvent.click(day("Monday, October 26, 2026"));
    await userEvent.click(day("Monday, October 26, 2026"));
    expect(onChange.mock.calls).toEqual([["2026-10-26", "2026-10-26"]]);
  });

  it("commits a preset relative to today and closes", async () => {
    const { onChange, trigger } = renderPicker();
    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole("button", { name: "This week" }));
    expect(onChange.mock.calls).toEqual([["2026-10-26", "2026-11-01"]]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes on Escape mid-pick without committing and refocuses the trigger", async () => {
    const { onChange, trigger } = renderPicker();
    await userEvent.click(trigger);
    await userEvent.click(day("Monday, October 26, 2026"));
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("closes on an outside click without committing", async () => {
    const { onChange, trigger } = renderPicker();
    await userEvent.click(trigger);
    await userEvent.click(day("Monday, October 26, 2026"));
    await userEvent.click(document.body);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });
});
