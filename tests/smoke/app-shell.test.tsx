import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { App } from '../../src/renderer/App';

describe('application shell', () => {
  it('shows the product name and primary navigation', () => {
    render(<App />);

    expect(screen.getByText('图号规划器')).toBeVisible();
    expect(screen.getByRole('navigation')).toBeVisible();
  });
});
