import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { OwnerSetup } from '../../src/ui/OwnerSetup';
import { AdministratorAccess } from '../../src/ui/AdministratorAccess';
import type { Api } from '../../src/ui/types';

test('activation requires the code, then separately confirms the synthetic window', async () => {
  const user = userEvent.setup();
  const api = vi.fn(async () => ({}));
  const enter = vi.fn(async () => {});
  render(<OwnerSetup mode="activate" api={api as Api} signOut={() => {}} continueToPortal={enter} />);
  const activate = screen.getByRole('button', { name: 'Activate owner access' });
  expect(activate).toBeDisabled();
  await user.type(screen.getByLabelText('Owner activation code'), 'a'.repeat(64));
  await user.click(activate);
  const open = await screen.findByRole('button', { name: 'Open test window' });
  expect(open).toBeDisabled();
  expect(enter).not.toHaveBeenCalled();
  await user.click(screen.getByRole('checkbox'));
  await user.click(open);
  expect(api.mock.calls.map(([operation]) => operation)).toEqual(['portalActivateOwner', 'portalOwnerWindow']);
  expect(enter).toHaveBeenCalledOnce();
});

test('revoking staff requires confirmation and updates the displayed state', async () => {
  const user = userEvent.setup();
  const api = vi.fn(async (_operation, input) => ({ administrators: [{
    key: 'test-staff-key', label: 'Staff tester', owner: false, connected: true, active: input?.active !== false,
  }] }));
  render(<AdministratorAccess api={api as Api} signOut={() => {}} />);
  await user.click(await screen.findByRole('button', { name: 'Revoke access' }));
  expect(api).toHaveBeenCalledTimes(1);
  const prompt = screen.getByText('Revoke portal access for Staff tester?').parentElement!;
  await user.click(within(prompt).getByRole('button', { name: 'Confirm' }));
  expect(await screen.findByRole('button', { name: 'Restore access' })).toBeInTheDocument();
  expect(api).toHaveBeenLastCalledWith('portalAdministrators', { key: 'test-staff-key', active: false });
});
