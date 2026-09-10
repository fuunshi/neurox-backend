import { registerAs } from "@nestjs/config";

export default registerAs("observability", () => ({
  /**
   * Whether `/metrics` answers at all.
   *
   * On by default: a deployment that has to remember to switch metrics on is
   * one that discovers the gap while looking at an incident rather than
   * before it. The flag exists for the opposite case — a host where the
   * endpoint would be exposed to something it should not be.
   */
  metricsEnabled: (process.env.METRICS_ENABLED ?? "true") !== "false",

  /**
   * How long any one dependency probe may take before it counts as down.
   *
   * Short on purpose. A health endpoint that waits on a hung dependency is a
   * health endpoint that hangs, which is the classic way a readiness check
   * takes a service out of rotation at the exact moment it was needed. Two
   * seconds is well above a local query and well below a container's own
   * timeout.
   */
  probeTimeoutMs: parseInt(process.env.HEALTH_PROBE_TIMEOUT_MS || "2000", 10),
}));
