// utils/timetableProgress.js
// Progress tracking for timetable generation

// In-memory store for progress (in production, use Redis)
const progressStore = new Map();

/**
 * Initialize progress tracking for a generation job
 * @param {string} jobId - Unique job identifier
 * @param {Object} metadata - Job metadata
 */
export function initProgress(jobId, metadata = {}) {
  progressStore.set(jobId, {
    status: "pending",
    progress: 0,
    currentStep: "Initializing...",
    totalSteps: metadata.totalClasses || 0,
    completedSteps: 0,
    errors: [],
    warnings: [],
    result: null,
    startedAt: new Date(),
    metadata
  });
  return jobId;
}

/**
 * Update progress for a generation job
 * @param {string} jobId - Job identifier
 * @param {Object} update - Progress update
 */
export function updateProgress(jobId, update) {
  const current = progressStore.get(jobId);
  if (!current) return;

  const updated = {
    ...current,
    ...update,
    updatedAt: new Date()
  };

  // Calculate progress percentage
  if (updated.totalSteps > 0) {
    updated.progress = Math.round((updated.completedSteps / updated.totalSteps) * 100);
  }

  progressStore.set(jobId, updated);
  return updated;
}

/**
 * Get progress for a generation job
 * @param {string} jobId - Job identifier
 * @returns {Object|null} Progress object or null if not found
 */
export function getProgress(jobId) {
  return progressStore.get(jobId) || null;
}

/**
 * Mark job as complete
 * @param {string} jobId - Job identifier
 * @param {Object} result - Generation result
 */
export function completeProgress(jobId, result) {
  const current = progressStore.get(jobId);
  if (!current) return;

  progressStore.set(jobId, {
    ...current,
    status: "completed",
    progress: 100,
    result,
    completedAt: new Date()
  });
}

/**
 * Mark job as failed
 * @param {string} jobId - Job identifier
 * @param {string} error - Error message
 */
export function failProgress(jobId, error) {
  const current = progressStore.get(jobId);
  if (!current) return;

  progressStore.set(jobId, {
    ...current,
    status: "failed",
    error,
    failedAt: new Date()
  });
}

/**
 * Clean up old progress entries (older than 1 hour)
 */
export function cleanupProgress() {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  for (const [jobId, progress] of progressStore.entries()) {
    const lastUpdate = progress.updatedAt || progress.startedAt;
    if (lastUpdate < oneHourAgo) {
      progressStore.delete(jobId);
    }
  }
}

// Run cleanup every 30 minutes
setInterval(cleanupProgress, 30 * 60 * 1000);

