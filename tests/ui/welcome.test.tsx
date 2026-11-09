import React from 'react';
import { test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
vi.mock('../../src/app/client', () => ({
  isLocal: false,
  warmClient: async () => ({}),
  api: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  devLogin: vi.fn(),
  message: () => 'Sign-in could not be completed.',
}));
import App from '../../src/ui/App';
test('welcome is accessible, describes approved access and offers Microsoft/Google without a password system', async () => {
  render(<App />);
  expect(
    screen.getByText(
      /Approved contractors can sign in to submit their information securely/,
    ),
  ).toBeInTheDocument();
  expect(
    (
      await axe.run(document.body, {
        rules: { 'color-contrast': { enabled: false } },
      })
    ).violations.map((v) => v.id),
  ).toEqual([]);
  await userEvent.click(
    screen.getByRole('button', {
      name: 'Continue to secure sign-in',
      exact: true,
    }),
  );
  expect(
    await screen.findByRole('button', { name: /Continue with Microsoft/ }),
  ).toBeEnabled();
  expect(
    screen.getByRole('button', { name: /Continue with Google/ }),
  ).toBeEnabled();
  expect(document.querySelector('input[type="password"]')).toBeNull();
  expect(screen.queryByText('Local synthetic review')).not.toBeInTheDocument();
});
test('staff entry offers only Microsoft organizational authentication', async () => {
  render(<App />);
  await userEvent.click(
    screen.getByRole('button', { name: 'MI staff access', exact: true }),
  );
  expect(
    await screen.findByRole('button', { name: /Continue with Microsoft/ }),
  ).toBeEnabled();
  expect(
    screen.queryByRole('button', { name: /Continue with Google/ }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByText(/Company email alone does not grant a role/),
  ).toBeInTheDocument();
});
