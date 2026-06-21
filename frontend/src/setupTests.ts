import "@testing-library/jest-dom";

class ResizeObserverMock {
  observe() {
    return undefined;
  }

  unobserve() {
    return undefined;
  }

  disconnect() {
    return undefined;
  }
}

global.ResizeObserver = ResizeObserverMock;
