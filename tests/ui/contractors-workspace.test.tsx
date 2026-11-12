import React from 'react';
import { test, expect, vi } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { ContractorsWorkspace } from '../../src/ui/ContractorsWorkspace';
const phone = { id: 'type-phone', type: 'phone', label: 'Contact Phone', instructions: 'Preferred number', maxLength: 32, revision: 'one', status: 'active' };
const sin = { ...phone, id: 'type-sin', type: 'sin', label: 'Social Insurance Number', maxLength: 24 };
const pdf = { ...phone, id: 'type-pdf', type: 'file', label: 'Signed Agreement', maxLength: 1000 };
const rows: any[] = Array.from({ length: 49 }, (_, i) => ({ name: 'Contractor ' + String(i).padStart(2, '0'), email: `person${i}@example.org`, invitationId: 'inv-' + i, reference: 'REF-' + i, invitationStatus: ['revoked', 'expired', 'active', 'removed'][i % 4], expiresAt: '2026-12-01T12:00:00Z' }));
const catalog = { templates: [phone, sin, pdf], filesEnabled: false, assignments: [
  { id: 'a1', invitationId: 'inv-0', templateId: sin.id, template: { ...sin, label: 'Original SIN label' }, status: 'pending' },
  { id: 'a2', invitationId: 'inv-0', templateId: pdf.id, template: pdf, status: 'submitted' },
  { id: 'a3', invitationId: 'inv-2', templateId: phone.id, template: phone, status: 'viewed' },
] };
const context: any = { permissions: { invitationManagement: true, statusViewing: true, metadataCopy: true, metadataExport: true, auditViewing: true } };
function setup(custom?: any, data = rows) {
  const api = custom ?? vi.fn(async (op) => op === 'portalActivity' ? { events: [], cursor: null } : catalog);
  const props = { context, api, rows: data, refreshRows: vi.fn(async () => {}), authorizationPending: false, openLegacy: vi.fn(), copyMetadata: vi.fn(), exportMetadata: vi.fn() };
  const view = render(<ContractorsWorkspace {...props} />); return { ...props, ...view, user: userEvent.setup() };
}
test('all access states, saved labels and independent request statuses are visible with gated files', async () => {
  const { api, user } = setup();
  await screen.findByText('Original SIN label');
  expect(screen.getByText('Signed Agreement')).toBeVisible();
  expect(screen.getAllByText('Revoked').length).toBeGreaterThan(0);
  expect(screen.getAllByText('Expired').length).toBeGreaterThan(0);
  expect(screen.getAllByText('Removed').length).toBeGreaterThan(0);
  expect(screen.getByText(/PDF uploads and file access remain disabled/)).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Contractor 00' }));
  expect(screen.getByText(/Access was explicitly revoked/)).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Preview PDF' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Load recorded activity' }));
  expect(api).toHaveBeenCalledWith('portalActivity', { invitationId: 'inv-0' });
  expect((await axe.run(document.body, { rules: { 'color-contrast': { enabled: false } } })).violations.map((v) => v.id)).toEqual([]);
});
test('49 contractor pagination, filtering, sorting, refresh and metadata scopes remain synchronized', async () => {
  const p = setup(); await screen.findByText('Original SIN label');
  const table = screen.getByRole('table');
  expect(within(table).getAllByRole('row')).toHaveLength(11);
  await p.user.selectOptions(screen.getByLabelText('Rows'), '20'); expect(within(table).getAllByRole('row')).toHaveLength(21);
  await p.user.click(screen.getByRole('button', { name: 'Next' })); expect(screen.getByText('Page 2 of 3')).toBeVisible();
  await p.user.selectOptions(screen.getByLabelText('Rows'), '50'); expect(within(table).getAllByRole('row')).toHaveLength(50);
  expect(screen.getByText('Page 1 of 1')).toBeVisible();
  await p.user.click(screen.getByRole('button', { name: 'Contractor' }));
  p.rerender(<ContractorsWorkspace {...p} rows={[...rows]} />);
  expect(screen.getByLabelText('Rows')).toHaveValue('50');
  await p.user.selectOptions(screen.getByLabelText('Access status'), 'revoked');
  expect(within(table).getAllByRole('row')).toHaveLength(14);
  await p.user.click(screen.getByRole('button', { name: 'Copy all filtered (13)' }));
  expect(p.copyMetadata).toHaveBeenCalledWith(rows.filter((r) => r.invitationStatus === 'revoked').map((r) => r.invitationId).reverse());
  await p.user.click(screen.getByRole('button', { name: 'Reset filters' }));
  await p.user.selectOptions(screen.getByLabelText('Rows'), '10'); expect(within(table).getAllByRole('row')).toHaveLength(11);
});
test('guided add is atomic, falls back to local-part and saves only after review', async () => {
  const p = setup(); await screen.findByText('Original SIN label');
  await p.user.click(screen.getByRole('button', { name: 'Add contractor' }));
  const modal = screen.getByRole('dialog');
  await p.user.type(within(modal).getByLabelText('Email'), 'fictional@example.org');
  await p.user.click(within(modal).getAllByLabelText(/Contact Phone/)[0]);
  await p.user.click(within(modal).getByRole('button', { name: 'Review contractor' }));
  expect(p.api.mock.calls.some(([op]: any) => op === 'portalContractorCreate')).toBe(false);
  await p.user.click(within(modal).getByRole('button', { name: 'Save contractor & requests' }));
  await waitFor(() => expect(p.api).toHaveBeenCalledWith('portalContractorCreate', expect.objectContaining({ name: 'fictional', email: 'fictional@example.org', templateIds: [phone.id] })));
});
test('bulk preview excludes revoked, expired and duplicate rows; assignments are reviewed and existing records preserved', async () => {
  const api = vi.fn(async (op) => op === 'portalContractorCreate' ? { contractors: [{}], created: 1 } : op === 'portalRequestAssign' ? { created: 0, unchanged: 1 } : catalog);
  const p = setup(api); await screen.findByText('Original SIN label');
  await p.user.click(screen.getByRole('button', { name: 'Bulk add / assign' }));
  const modal = screen.getByRole('dialog');
  await p.user.type(within(modal).getByLabelText('Or paste CSV'), 'name,email,status\n,fictional@example.org,active\n,person0@example.org,active\n,person1@example.org,active\n,person2@example.org,active\n,fictional@example.org,active');
  await p.user.click(within(modal).getByRole('button', { name: 'Preview CSV' }));
  expect(within(modal).getByLabelText('Include person0@example.org row 3')).toBeDisabled();
  expect(within(modal).getByLabelText('Include person1@example.org row 4')).toBeDisabled();
  expect(within(modal).getByLabelText('Include fictional@example.org row 6')).toBeDisabled();
  await p.user.click(within(modal).getAllByLabelText(/Contact Phone/)[0]);
  await p.user.click(within(modal).getByRole('button', { name: 'Review bulk changes' }));
  expect(api.mock.calls.some(([op]) => op === 'portalContractorCreate')).toBe(false);
  await p.user.click(within(modal).getByRole('button', { name: 'Apply reviewed changes' }));
  await within(modal).findByText(/Existing contractor batch 1: 0 requests added; 1 already assigned/);
  expect(api).toHaveBeenCalledWith('portalRequestAssign', { invitationIds: ['inv-2'], templateIds: [phone.id] });
  expect(api.mock.calls.some(([op]) => op === 'portalContractorApply')).toBe(false);
});
test('restoration needs server preview and exact confirmation; renewal is a separate operation', async () => {
  const api = vi.fn(async (op) => op === 'portalContractorReview' ? { reviewId: 'review', action: 'restore', requiredConfirmation: 'RESTORE ACCESS', rows: [{ invitationId: 'inv-0', email: rows[0].email, accessStatus: 'revoked', expiresAt: null, eligible: true, reason: 'Expiry unchanged.' }] } : op === 'portalContractorApply' ? { applied: ['inv-0'], skipped: [] } : catalog);
  const p = setup(api); await screen.findByText('Original SIN label');
  await p.user.click(screen.getByLabelText('Select person0@example.org'));
  await p.user.click(screen.getByRole('button', { name: 'Review and restore access' }));
  const modal = screen.getByRole('dialog');
  await p.user.click(within(modal).getByRole('button', { name: 'Preview access change' }));
  const confirm = await within(modal).findByRole('button', { name: 'Confirm reviewed access change' });
  expect(confirm).toBeDisabled();
  await p.user.type(within(modal).getByLabelText('Type RESTORE ACCESS to confirm'), 'RESTORE ACCESS');
  await p.user.click(confirm);
  await within(modal).findByText(/Access batch 1: 1 confirmed/);
  expect(api).toHaveBeenCalledWith('portalContractorApply', { reviewId: 'review', confirmation: 'RESTORE ACCESS' });
  expect(api.mock.calls.filter(([op]) => op === 'portalContractorReview')).toHaveLength(1);
  expect(api).toHaveBeenCalledWith('portalContractorReview', { action: 'restore', invitationIds: ['inv-0'] });
});
test('template edits preserve snapshot labels and pending authorization disables management', async () => {
  const p = setup(); await screen.findByText('Original SIN label');
  await p.user.click(screen.getByRole('button', { name: 'Manage templates' }));
  const modal = screen.getByRole('dialog');
  await p.user.click(within(modal).getByRole('button', { name: /Social Insurance Number/ }));
  const label = within(modal).getByLabelText('Template label');
  await p.user.clear(label); await p.user.type(label, 'Updated future label');
  await p.user.click(within(modal).getByRole('button', { name: 'Save template' }));
  await waitFor(() => expect(p.api).toHaveBeenCalledWith('portalRequestTemplate', expect.objectContaining({ id: sin.id, label: 'Updated future label' })));
  expect(screen.getByText('Original SIN label')).toBeInTheDocument();
  p.rerender(<ContractorsWorkspace {...p} authorizationPending />);
  expect(screen.getByRole('button', { name: 'Save template' })).toBeDisabled();
});
test('existing requests are excluded from individual assignment and actions fail closed while requests are unavailable', async () => {
  const p = setup(); await screen.findByText('Original SIN label');
  const contractor = screen.getByRole('button', { name: 'Contractor 02' }).closest('tr')!;
  await p.user.click(within(contractor).getByRole('button', { name: 'Add request' }));
  const modal = screen.getByRole('dialog');
  expect(within(modal).getByLabelText(/Contact Phone/)).toBeDisabled();
  await p.user.click(within(modal).getByLabelText(/Social Insurance Number/));
  await p.user.click(within(modal).getByRole('button', { name: 'Review assignments' }));
  await p.user.click(within(modal).getByRole('button', { name: 'Confirm assignments' }));
  await waitFor(() => expect(p.api).toHaveBeenCalledWith('portalRequestAssign', { invitationIds: ['inv-2'], templateIds: [sin.id] }));
});
test('failed batch reports the failure and does not claim success or send later batches', async () => {
  const api = vi.fn(async (op) => { if (op === 'portalContractorCreate') throw new Error('Temporary connection failure'); if (op === 'portalRequestAssign') return { created: 1, unchanged: 0 }; return catalog; });
  const p = setup(api); await screen.findByText('Original SIN label');
  await p.user.click(screen.getByRole('button', { name: 'Bulk add / assign' }));
  const modal = screen.getByRole('dialog');
  await p.user.type(within(modal).getByLabelText('Or paste CSV'), 'email\nnew@example.org\nperson2@example.org');
  await p.user.click(within(modal).getByRole('button', { name: 'Preview CSV' }));
  await p.user.click(within(modal).getAllByLabelText(/Contact Phone/)[0]);
  await p.user.click(within(modal).getByRole('button', { name: 'Review bulk changes' }));
  await p.user.click(within(modal).getByRole('button', { name: 'Apply reviewed changes' }));
  expect(await within(modal).findByText(/Batch 1 failed; later batches were not sent/)).toBeVisible();
  expect(api.mock.calls.some(([op]) => op === 'portalRequestAssign')).toBe(false);
  expect(screen.queryByText(/Bulk operation complete/)).not.toBeInTheDocument();
});
