import { Loader } from "@mantine/core";

// Minimal splash shown while auth resolves, so route gates do not flash the wrong page before redirecting.
export default function RouteSplash() {
  return (
    <main className="route-splash">
      <Loader color="green" />
    </main>
  );
}
