import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { areYouSure, DecisionEverywhere, decisionModalEmitter, ModalManagerInner } from './new-modal';

jest.mock('@gitroom/nestjs-libraries/services/make.is', () => {
  let id = 0;
  return { makeId: () => String(++id) };
}, { virtual: true });
jest.mock('@gitroom/react/form/button', () => ({ Button: (props: any) => <button {...props} /> }), { virtual: true });
jest.mock('react-hotkeys-hook', () => ({ useHotkeys: jest.fn() }));

test('keeps one confirmation listener and dialog after A to B to A remounts', () => {
  const view = render(<DecisionEverywhere key="a" />);
  expect(decisionModalEmitter.listenerCount('open')).toBe(1);
  view.rerender(<DecisionEverywhere key="b" />);
  expect(decisionModalEmitter.listenerCount('open')).toBe(1);
  view.rerender(<DecisionEverywhere key="a" />);
  expect(decisionModalEmitter.listenerCount('open')).toBe(1);
  act(() => { void areYouSure({ title: 'Confirm once' }); });
  const dialogs = render(<ModalManagerInner />);
  expect(screen.getAllByText('Confirm once')).toHaveLength(1);
  view.unmount();
  expect(decisionModalEmitter.listenerCount('open')).toBe(0);
  dialogs.unmount();
});
