export function createVerifyReportTracker() {
  const checks = [];
  const allowedSurfaces = new Set(["canonical", "legacy", "mixed"]);

  function validateSurface(contractSurface) {
    const normalized = String(contractSurface ?? "mixed").trim().toLowerCase();
    if (!allowedSurfaces.has(normalized)) {
      throw new Error(`Invalid contractSurface: ${contractSurface}`);
    }
    return normalized;
  }

  function pass(name, contractSurface = "mixed", details) {
    const surface = validateSurface(contractSurface);
    checks.push({ name, ok: true, contractSurface: surface, ...(details !== undefined ? { details } : {}) });
  }

  function fail(name, reason, contractSurface = "mixed") {
    const surface = validateSurface(contractSurface);
    checks.push({ name, ok: false, reason, contractSurface: surface });
  }

  async function check(name, contractSurface = "mixed", fn) {
    const surface = validateSurface(contractSurface);
    try {
      const details = await fn();
      pass(name, surface, details);
      return { ok: true, details };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      fail(name, message, surface);
      throw error;
    }
  }

  function summarizeSurfaces() {
    return checks.reduce((acc, item) => {
      const surface = item.contractSurface ?? "mixed";
      if (!acc[surface]) acc[surface] = { total: 0, failed: 0 };
      acc[surface].total += 1;
      if (!item.ok) acc[surface].failed += 1;
      return acc;
    }, {});
  }

  function summarizeCounts() {
    return {
      total: checks.length,
      failed: checks.filter((item) => !item.ok).length,
    };
  }

  return {
    checks,
    pass,
    fail,
    check,
    summarizeSurfaces,
    summarizeCounts,
  };
}
