import React from 'react';
import { test, expect, vi } from 'vitest';
import {
  render,
  screen,
  waitFor,
  within,
  fireEvent,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import Dashboard from '../../src/ui/Dashboard';
import Contractor from '../../src/ui/Contractor';
import { Help, Modal } from '../../src/ui/components';
const id = '11111111-1111-1111-1111-111111111111';
const row = {
  name: 'Alex Example',
  email: 'alex@example.org',
  invitationId: id,
  reference: id,
  invitationAt: '2026-11-01T12:00:00Z',
  expiresAt: '2027-01-01T00:00:00Z',
  provider: 'google.com',
  signedInAt: null,
  invitationStatus: 'active',
  submissionStatus: 'submitted',
  submittedAt: '2026-11-02T12:00:00Z',
  retrievalStatus: 'not_started',
  transferStatus: 'not_started',
  disposalStatus: 'not_started',
  responsibleAdminUid: 'fixture-admin',
  lastAction: 'submission_accepted',
  lastActionAt: '2026-11-02T12:00:00Z',
  attention: false,
};
const context: any = {
  kind: 'admin',
  permissions: {
    statusViewing: true,
    invitationManagement: true,
    metadataCopy: true,
    metadataExport: true,
    auditViewing: true,
    workflowManagement: true,
    correctionManagement: true,
  },
};
function fixture() {
  const api = vi.fn(async (name: string) => {
    if (name === 'portalOverview')
      return {
        rows: [row],
        metrics: {
          total: 1,
          pending: 0,
          signedIn: 0,
          submitted: 1,
          awaitingRetrieval: 1,
          retrieved: 0,
          transferred: 0,
          disposed: 0,
          revoked: 0,
          attention: 0,
        },
        adminDirectory: [
          { uid: 'fixture-admin', label: 'Test administrator', active: true },
        ],
        generatedAt: '2026-11-05T12:00:00Z',
      };
    if (name === 'portalActivity') return { events: [], cursor: null };
    if (name === 'portalMetadataOutput')
      return {
        text: 'Name\nAlex Example',
        count: 1,
        outputId: id,
        base64: 'UEs=',
        fileName: 'test.xlsx',
      };
    return { updated: 1 };
  });
  return { api, notify: vi.fn(), signOut: vi.fn() };
}
const open = async (props = fixture(), c = context) => {
  render(<Dashboard {...props} api={props.api as any} context={c} />);
  await screen.findByRole('button', { name: 'Alex Example', exact: true });
  return props;
};
test('search, empty state, reset and visible-page selection communicate exact counts', async () => {
  await open();
  const user = userEvent.setup();
  const search = screen.getByPlaceholderText(/Search/);
  await user.type(search, 'absent');
  expect(screen.getByText('No matching contractors')).toBeInTheDocument();
  await user.clear(search);
  await user.click(
    screen.getByRole('checkbox', { name: 'Select visible page of 1 records' }),
  );
  expect(
    screen.getByRole('button', { name: 'Copy selected (1)', exact: true }),
  ).toBeEnabled();
  expect(
    screen.getByRole('button', { name: 'Copy visible page (1)', exact: true }),
  ).toBeEnabled();
});
test('copy uses approved visible fields, confirms after clipboard success and handles rejection', async () => {
  const props = await open();
  const user = userEvent.setup();
  const copy = vi
    .spyOn(navigator.clipboard, 'writeText')
    .mockRejectedValueOnce(new Error('permission'));
  await user.click(
    screen.getByRole('button', { name: 'Copy visible page (1)', exact: true }),
  );
  await waitFor(() =>
    expect(props.notify).toHaveBeenCalledWith(
      expect.stringContaining('Clipboard access failed'),
      true,
    ),
  );
  expect(props.api).toHaveBeenCalledWith('portalOutputAck', {
    outputId: id,
    outcome: 'client_failed',
  });
  copy.mockResolvedValueOnce();
  await user.click(
    screen.getByRole('button', { name: 'Copy visible page (1)', exact: true }),
  );
  await waitFor(() =>
    expect(props.notify).toHaveBeenCalledWith(
      expect.stringContaining('Copied 1 record'),
    ),
  );
  const request = props.api.mock.calls.find(
    ([name]) => name === 'portalMetadataOutput',
  ) as any;
  expect(request[1].scope).toBe('visible');
  expect(request[1].fields).not.toContain('sin');
  expect(request[1].ids).toEqual([id]);
});
test('missing copy permission disables action and explains the restriction', async () => {
  await open(fixture(), {
    ...context,
    permissions: { ...context.permissions, metadataCopy: false },
  });
  expect(
    screen.getByRole('button', { name: 'Copy visible page (1)', exact: true }),
  ).toBeDisabled();
  expect(
    screen.getAllByRole('button', {
      name: 'Help: Metadata copy permission is not assigned',
    }).length,
  ).toBeGreaterThan(0);
});
test('export discloses scope/count and requires server generation before download', async () => {
  const props = await open();
  const user = userEvent.setup();
  await user.click(
    screen.getByRole('button', { name: 'Export Excel', exact: true }),
  );
  const dialog = screen.getByRole('dialog', {
    name: 'Export authorized metadata',
  });
  expect(within(dialog).getByLabelText('Export scope')).toHaveValue('filtered');
  expect(
    within(dialog).getByText(/1 records · 9 explicit fields/),
  ).toBeInTheDocument();
  const make = vi.fn(() => 'blob:test');
  Object.defineProperty(URL, 'createObjectURL', {
    value: make,
    configurable: true,
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    value: vi.fn(),
    configurable: true,
  });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  await user.click(
    within(dialog).getByRole('button', {
      name: 'Export 1 records',
      exact: true,
    }),
  );
  await waitFor(() =>
    expect(props.notify).toHaveBeenCalledWith(
      expect.stringContaining('Download started'),
    ),
  );
  expect(props.api).toHaveBeenCalledWith(
    'portalMetadataOutput',
    expect.objectContaining({ kind: 'xlsx', scope: 'filtered' }),
  );
  expect(make).toHaveBeenCalled();
});
test('revoke requires deliberate confirmation; backend failure does not claim success', async () => {
  const props = await open();
  const user = userEvent.setup();
  await user.click(
    screen.getByRole('checkbox', { name: 'Select Alex Example' }),
  );
  await user.click(screen.getByRole('button', { name: 'Revoke', exact: true }));
  const confirm = screen.getByRole('button', {
    name: 'Confirm revocation',
    exact: true,
  });
  expect(confirm).toBeDisabled();
  await user.click(
    screen.getByRole('checkbox', { name: /I reviewed the selected/ }),
  );
  props.api.mockImplementationOnce(async () => {
    throw Error('denied');
  });
  await user.click(confirm);
  await waitFor(() =>
    expect(props.notify).toHaveBeenCalledWith(
      expect.stringContaining('not completed'),
      true,
    ),
  );
  expect(screen.getByRole('dialog')).toBeInTheDocument();
});
test('record drawer supports Escape and Burn remains unavailable', async () => {
  await open();
  const user = userEvent.setup();
  await user.click(
    screen.getByRole('button', { name: 'Alex Example', exact: true }),
  );
  expect(
    screen.getByRole('dialog', { name: 'Alex Example' }),
  ).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Burn', exact: true }));
  expect(
    screen.getByRole('button', { name: 'Burn unavailable', exact: true }),
  ).toBeDisabled();
  expect(screen.getByText(/No cryptographic destruction/)).toBeInTheDocument();
});
test('tooltip supports keyboard, Escape and touch disclosure', async () => {
  render(
    <Help text="Only approved metadata">
      <button>Copy field</button>
    </Help>,
  );
  const user = userEvent.setup();
  await user.tab();
  expect(screen.getByRole('tooltip')).toHaveTextContent(
    'Only approved metadata',
  );
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  await user.click(
    screen.getByRole('button', { name: 'Help: Only approved metadata' }),
  );
  expect(screen.getByRole('tooltip')).toBeInTheDocument();
});
test('contractor cannot submit before review and cannot see fixture on confirmed completion', async () => {
  let resolve: any;
  const api = vi.fn(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    ),
    notify = vi.fn();
  render(
    <Contractor
      context={{
        ...context,
        kind: 'contractor',
        email: 'fixture@example.org',
        invitationId: id,
        reference: id,
      }}
      api={api as any}
      local={false}
      onContext={vi.fn()}
      notify={notify}
      signOut={vi.fn()}
    />,
  );
  const user = userEvent.setup();
  await user.click(
    screen.getByRole('button', {
      name: 'Continue to synthetic submission',
      exact: true,
    }),
  );
  await user.selectOptions(
    screen.getByRole('combobox', { name: /Permitted test fixture/ }),
    '000000018',
  );
  await user.click(
    screen.getByRole('button', { name: 'Review information', exact: true }),
  );
  expect(
    screen.getByRole('button', { name: 'Submit securely', exact: true }),
  ).toBeDisabled();
  await user.click(screen.getByRole('checkbox'));
  await user.click(
    screen.getByRole('button', { name: 'Submit securely', exact: true }),
  );
  expect(
    screen.queryByText(
      'Thank you. Your information has been submitted securely.',
    ),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Submit securely', exact: true }),
  ).toBeDisabled();
  resolve({ reference: id });
  await screen.findByText(
    'Thank you. Your information has been submitted securely.',
  );
  expect(screen.queryByText('000000018')).not.toBeInTheDocument();
  expect(api).toHaveBeenCalledWith('portalSubmit', {
    invitationId: id,
    revision: undefined,
    fixtureId: 'fixture-a',
  });
});
test('dashboard has no detectable semantic accessibility violations', async () => {
  await open();
  const result = await axe.run(document.body, {
    rules: { 'color-contrast': { enabled: false } },
  });
  expect(
    result.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => n.html),
    })),
  ).toEqual([]);
});
test('contractor has no detectable semantic accessibility violations', async () => {
  render(
    <Contractor
      context={{
        ...context,
        kind: 'contractor',
        email: 'fixture@example.org',
        invitationId: id,
        reference: id,
      }}
      api={vi.fn() as any}
      local={false}
      onContext={vi.fn()}
      notify={vi.fn()}
      signOut={vi.fn()}
    />,
  );
  const result = await axe.run(document.body, {
    rules: { 'color-contrast': { enabled: false } },
  });
  expect(result.violations.map((v) => v.id)).toEqual([]);
});
test('CSV import previews explicit records before sending them to the backend', async () => {
  const props = await open();
  const user = userEvent.setup();
  await user.click(
    screen.getByRole('button', { name: 'Add contractor', exact: true }),
  );
  const file = new File(
    ['name,email,status\n,fixture@example.org,active'],
    'approved-test.csv',
    { type: 'text/csv' },
  );
  Object.defineProperty(file, 'text', {
    value: async () =>
      'name,email,status\n,fixture@example.org,active',
  });
  await user.upload(screen.getByLabelText('Import approved email CSV'), file);
  const preview = await screen.findByRole('dialog', { name: 'Review CSV import' });
  expect(within(preview).getByText('fixture', { exact: true })).toBeInTheDocument();
  expect(
    props.api.mock.calls.some(([name]) => name === 'portalImportAllowlist'),
  ).toBe(false);
  await user.click(
    screen.getByRole('button', {
      name: 'Confirm 1 approved rows',
      exact: true,
    }),
  );
  await waitFor(() =>
    expect(props.api).toHaveBeenCalledWith('portalImportAllowlist', {
      csv: 'name,email,status\n,fixture@example.org,active',
    }),
  );
});
test('Escape closes details and returns keyboard focus to the record trigger', async () => {
  await open();
  const user = userEvent.setup();
  const trigger = screen.getByRole('button', {
    name: 'Alex Example',
    exact: true,
  });
  await user.click(trigger);
  expect(
    screen.getByRole('button', { name: 'Close record details', exact: true }),
  ).toHaveFocus();
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
});
test('backend submission failure leaves the review available and never shows success', async () => {
  render(
    <Contractor
      context={{
        ...context,
        kind: 'contractor',
        email: 'fixture@example.org',
        invitationId: id,
        reference: id,
      }}
      api={vi.fn().mockRejectedValue(new Error('already-exists')) as any}
      local={false}
      onContext={vi.fn()}
      notify={vi.fn()}
      signOut={vi.fn()}
    />,
  );
  const user = userEvent.setup();
  await user.click(
    screen.getByRole('button', {
      name: 'Continue to synthetic submission',
      exact: true,
    }),
  );
  await user.selectOptions(
    screen.getByRole('combobox', { name: /Permitted test fixture/ }),
    '000000018',
  );
  await user.click(
    screen.getByRole('button', { name: 'Review information', exact: true }),
  );
  await user.click(screen.getByRole('checkbox'));
  await user.click(
    screen.getByRole('button', { name: 'Submit securely', exact: true }),
  );
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'No success has been assumed',
  );
  expect(
    screen.queryByText(
      'Thank you. Your information has been submitted securely.',
    ),
  ).not.toBeInTheDocument();
});

test('live contractor enters a fictional SIN and sees confirmation only after submission', async () => {
  const api = vi.fn().mockResolvedValue({ accepted: true });
  render(<Contractor context={{ kind: 'contractor', liveSin: true } as any} api={api}
    local={false} onContext={vi.fn()} notify={vi.fn()} signOut={vi.fn()} />);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Social Insurance Number'), '000000018');
  await user.click(screen.getByRole('button', { name: 'Submit' }));
  await screen.findByRole('status');
  expect(api).toHaveBeenCalledWith('portalSubmitSin', { value: '000000018', revision: 'initial' });
  expect(screen.queryByDisplayValue('000000018')).not.toBeInTheDocument();
});

test('live staff Reveal & Copy calls the backend once, copies, and disables another reveal', async () => {
  const user = userEvent.setup();
  const copy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
  const props = fixture();
  const original = props.api.getMockImplementation()!;
  let removed = false;
  props.api.mockImplementation(async (name) => {
    if (name === 'portalBucketReveal') {
      removed = true;
      return { value: '000000018' } as any;
    }
    const result = await original(name);
    if (removed && name === 'portalOverview')
      return { ...result, rows: [{ ...row, retrievalStatus: 'retrieved', disposalStatus: 'disposed' }] } as any;
    return result;
  });
  try {
    await open(props, { ...context, workspace: 'staff', liveSin: true });
    await user.click(screen.getByRole('button', { name: 'Alex Example', exact: true }));
    await user.click(screen.getByRole('button', { name: 'Reveal & Copy', exact: true }));
    await user.click(screen.getByRole('button', { name: 'Reveal & Copy once', exact: true }));
    await waitFor(() => expect(copy).toHaveBeenCalledWith('000000018'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Reveal & Copy', exact: true })).toBeDisabled());
    expect(props.api.mock.calls.filter(([name]) => name === 'portalBucketReveal')).toHaveLength(1);
    expect(screen.queryByDisplayValue('000000018')).not.toBeInTheDocument();
  } finally {
    copy.mockRestore();
  }
});

test('staff can add a contractor without entering a name and tracker omits the administrator column', async () => {
  const props = await open(fixture(), { ...context, workspace: 'staff' });
  const user = userEvent.setup();
  expect(screen.queryByText('Responsible administrator', { exact: true })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Columns', exact: true }));
  const columns = screen.getByRole('dialog');
  expect(within(columns).queryByText('Responsible administrator', { exact: true })).not.toBeInTheDocument();
  await user.click(within(columns).getByRole('button', { name: 'Done' }));
  await user.click(screen.getByRole('button', { name: 'Add contractor', exact: true }));
  expect(screen.getByLabelText('Contractor name (optional)')).not.toBeRequired();
  await user.type(screen.getByLabelText('Approved email'), 'lester@example.org');
  await user.click(screen.getByRole('button', { name: 'Add approved identity' }));
  await waitFor(() => expect(props.api).toHaveBeenCalledWith('portalImportAllowlist', {
    csv: 'name,email,status\n"","lester@example.org",active',
  }));
});

test('47 tracker rows paginate at 10, 20 and 50 while preserving the choice through sort, filter and reload', async () => {
  const props = fixture();
  const original = props.api.getMockImplementation()!;
  const rows = Array.from({ length: 47 }, (_, i) => ({
    ...row, invitationId: String(i), name: 'Contractor ' + String(i + 1).padStart(2, '0'),
    submissionStatus: i < 21 ? 'submitted' : 'pending',
  }));
  props.api.mockImplementation(async (name) => {
    const result = await original(name);
    return name === 'portalOverview' ? { ...result, rows } as any : result;
  });
  render(<Dashboard {...props} api={props.api as any} context={context} />);
  const user = userEvent.setup();
  const selector = await screen.findByRole('combobox', { name: 'Rows per page' });
  const table = () => screen.getByRole('table');
  const count = () => within(table()).getAllByRole('row').length - 1;
  expect(count()).toBe(10);
  expect(screen.getByText('1 / 5')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Next page' }));
  expect(screen.getByText('2 / 5')).toBeInTheDocument();
  await user.selectOptions(selector, '20');
  expect(count()).toBe(20);
  expect(screen.getByText('1 / 3')).toBeInTheDocument();
  const sort = within(table()).getByRole('button', { name: 'Name', exact: true });
  const header = sort.closest('th')!;
  const help = within(header).getByRole('button', { name: /Help: Sort by Name/ });
  await user.click(help);
  const tooltip = screen.getByRole('tooltip');
  expect(table().contains(tooltip)).toBe(false);
  expect(header).toHaveAttribute('aria-sort', 'ascending');
  await user.click(sort);
  expect(header).toHaveAttribute('aria-sort', 'descending');
  expect(count()).toBe(20);
  await user.selectOptions(screen.getByRole('combobox', { name: 'Submission status filter' }), 'submitted');
  expect(count()).toBe(20);
  expect(screen.getByText('1 / 2')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Next page' }));
  expect(count()).toBe(1);
  await user.click(screen.getByRole('button', { name: 'Refresh', exact: true }));
  await waitFor(() => expect(props.api.mock.calls.filter(([name]) => name === 'portalOverview')).toHaveLength(2));
  expect(selector).toHaveValue('20');
  expect(count()).toBe(1);
  await user.selectOptions(screen.getByRole('combobox', { name: 'Submission status filter' }), 'all');
  await user.selectOptions(selector, '50');
  expect(count()).toBe(47);
  expect(screen.getByText('1 / 1')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
});
