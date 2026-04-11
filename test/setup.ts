import { beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';

// Reset storage between tests
beforeEach(() => {
  try {
    sessionStorage?.removeItem('gitnexus-llm-settings');
  } catch {
    // sessionStorage may not be available in all test environments
  }
  try {
    localStorage?.removeItem('gitnexus-llm-settings'); // legacy key (migration)
  } catch {
    // localStorage may not be available in all test environments
  }
});
