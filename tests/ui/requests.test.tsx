import React from 'react';
import { expect, test, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { ContractorRequests, StaffRequests } from '../../src/ui/Requests';
const template = { id: 'type-phone', type: 'phone', label: 'Contact phone', instructions: 'Your preferred number.', maxLength: 32, status: 'active', revision: 'one' };
const pending = { id: 'phone-request', templateId: template.id, template, status: 'pending', invitationId: 'invitation-one', submittedAt: null, viewedAt: null };
const pdf = { ...pending, id: 'pdf-request', templateId: 'type-pdf', template: { ...template, id: 'type-pdf', type: 'file', label: 'Signed agreement', maxLength: 10000 } };
const sin = { ...pending, id: 'sin-request', templateId: 'type-sin', template: { ...template, id: 'type-sin', type: 'sin', label: 'Canadian SIN', maxLength: 24 } };
const context: any = { kind: 'admin', requestsV2: true, permissions: { statusViewing: true, invitationManagement: true } };
test('contractor completes one assigned request while the others remain independent and files are safely gated', async () => {
  let rows = [pending, pdf, sin];
  const api = vi.fn(async (operation, data) => {
    if (operation === 'portalRequestSubmit') {
      rows = rows.map((row) => row.id === data.assignmentId ? { ...row, status: 'submitted' } : row);
      return { accepted: true };
    }
    return { assignments: rows, filesEnabled: false };
  });
  const user = userEvent.setup();
  render(<ContractorRequests api={api as any} signOut={vi.fn()} />);
  const card = await screen.findByRole('region', { name: 'Contact phone' });
  expect(screen.getByText(/File upload is awaiting security approval/)).toBeInTheDocument();
  expect(screen.queryByLabelText(/Drop a PDF/)).not.toBeInTheDocument();
  await user.type(within(card).getByLabelText(/Contact phone/), '+1 306 555 0100');
  await user.click(within(card).getByRole('button', { name: 'Submit securely' }));
  await waitFor(() => expect(within(card).getByText(/Securely received/)).toBeInTheDocument());
  expect(api).toHaveBeenCalledWith('portalRequestSubmit', { assignmentId: 'phone-request', value: '+1 306 555 0100' });
  expect(within(screen.getByRole('region', { name: 'Canadian SIN' })).getByRole('button', { name: 'Submit securely' })).toBeEnabled();
  expect(api.mock.calls.some(([operation]) => operation === 'portalRequestsOverview')).toBe(false);
  expect((await axe.run(document.body, { rules: { 'color-contrast': { enabled: false } } })).violations.map((v) => v.id)).toEqual([]);
});
test('persistent reveal starts masked and clears on hide or authorization interruption', async () => {
  const assignment = { ...pending, status: 'submitted' };
  const api = vi.fn(async (operation) => operation === 'portalRequestReveal' ? { value: '3065550100' } :
    { templates: [template], assignments: [assignment], filesEnabled: false });
  const user = userEvent.setup();
  const page = render(<StaffRequests context={context} api={api as any} rows={[]} />);
  const card = await screen.findByRole('region', { name: 'Contact phone' });
  expect(api.mock.calls.filter(([op]) => op === 'portalRequestReveal')).toHaveLength(0);
  await user.click(within(card).getByRole('button', { name: 'Reveal value' }));
  expect(await within(card).findByDisplayValue('3065550100')).toBeInTheDocument();
  await user.click(within(card).getByRole('button', { name: 'Hide' }));
  expect(within(card).queryByDisplayValue('3065550100')).not.toBeInTheDocument();
  await user.click(within(card).getByRole('button', { name: 'Reveal value' }));
  expect(await within(card).findByDisplayValue('3065550100')).toBeInTheDocument();
  page.rerender(<StaffRequests context={context} api={api as any} rows={[]} authorizationPending />);
  await waitFor(() => expect(screen.queryByDisplayValue('3065550100')).not.toBeInTheDocument());
  expect(within(card).getByRole('button', { name: 'Reveal value' })).toBeDisabled();
  expect(api.mock.calls.filter(([op]) => op === 'portalRequestReveal')).toHaveLength(2);
});
test('staff request groups and assignment choices use backend counts and preserve template IDs', async () => {
  const api = vi.fn(async () => ({ templates: [template], assignments: [pending], filesEnabled: false }));
  const user = userEvent.setup();
  render(<StaffRequests context={context} api={api as any} rows={[{ invitationId: 'invitation-one', name: 'Fictional Person', invitationStatus: 'active' }] as any} />);
  await screen.findByText(/1 pending · 0 submitted · 0 completed/);
  await user.click(screen.getByText('Add requests', { selector: 'summary' }));
  await user.selectOptions(screen.getByLabelText('Contractors'), 'invitation-one');
  await user.selectOptions(screen.getByLabelText('Request types'), 'type-phone');
  await user.click(screen.getByRole('button', { name: 'Assign requests' }));
  await waitFor(() => expect(api).toHaveBeenCalledWith('portalRequestAssign', { invitationIds: ['invitation-one'], templateIds: ['type-phone'] }));
});
