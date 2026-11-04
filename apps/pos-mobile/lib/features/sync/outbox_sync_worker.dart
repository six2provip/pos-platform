// Outbox Push & Cursor Pull Synchronization Coordinator for Android POS Mobile
// Reference: docs/06-pos-offline-sync.md (Sections 9, 10, 11)

import 'dart:math';

class OutboxSyncRetryPolicy {
  static const List<int> baseDelaysSeconds = [5, 15, 45, 120, 300, 600];
  static const int maxAutomaticAttempts = 20;

  /// Compute exponential backoff with +/- 20% jitter (Section 9.6 of doc 06).
  static Duration computeNextBackoff(int attemptCount, {Random? random}) {
    final idx = min(attemptCount, baseDelaysSeconds.length - 1);
    final baseSec = baseDelaysSeconds[max(0, idx)];
    final rng = random ?? Random();
    final jitterFactor = 0.8 + (rng.nextDouble() * 0.4);
    return Duration(milliseconds: (baseSec * 1000 * jitterFactor).round());
  }
}

