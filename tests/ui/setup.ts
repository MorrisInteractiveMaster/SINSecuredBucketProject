import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
afterEach(cleanup);
HTMLDialogElement.prototype.showModal = function () {
  this.setAttribute('open', '');
  this.querySelector<HTMLElement>('button')?.focus();
};
HTMLDialogElement.prototype.close = function () {
  this.removeAttribute('open');
};
window.matchMedia = () =>
  ({ matches: true, addEventListener() {}, removeEventListener() {} }) as any;
