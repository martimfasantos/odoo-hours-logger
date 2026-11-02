import "@testing-library/jest-dom";

// jsdom has no ResizeObserver; charts keep their default width in tests.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;
