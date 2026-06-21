import { render, screen } from "@testing-library/react";
import App from "./App";

test("renders the dashboard", async () => {
  render(<App />);
  expect(
    await screen.findByRole("heading", { name: "Ticker Wars" }),
  ).toBeInTheDocument();
});
