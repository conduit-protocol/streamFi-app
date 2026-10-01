import React, { act } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { StreamNoteEditor } from '../StreamNoteEditor';

/**
 * Test coverage for StreamNoteEditor.tsx (issue #625).
 */

function renderInto(el: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(el);
  });
  return { container, root };
}

function unmount(container: HTMLDivElement, root: Root) {
  act(() => {
    root.unmount();
  });
  document.body.removeChild(container);
}

/**
 * Simulate a controlled React textarea value change. jsdom doesn't fire
 * React's synthetic onChange for a direct `.value` assignment, so this uses
 * the native property setter + an input event (matches TokenSelector.test.tsx).
 */
function fireChange(textarea: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype,
    'value',
  )!.set!;
  setter.call(textarea, value);
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

function baseProps(overrides: Partial<Parameters<typeof StreamNoteEditor>[0]> = {}) {
  return {
    note: null as string | null,
    isEditing: false,
    onStartEditing: vi.fn(),
    onStopEditing: vi.fn(),
    onSave: vi.fn(),
    onClear: vi.fn(),
    ...overrides,
  };
}

describe('StreamNoteEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows "No note yet" when there is no note and not editing', () => {
    const { container, root } = renderInto(<StreamNoteEditor {...baseProps()} />);
    expect(container.textContent).toContain('No note yet');
    unmount(container, root);
  });

  it('shows the note text when a note exists and not editing', () => {
    const { container, root } = renderInto(
      <StreamNoteEditor {...baseProps({ note: 'Payroll for October' })} />,
    );
    expect(container.textContent).toContain('Payroll for October');
    expect(container.textContent).not.toContain('No note yet');
    unmount(container, root);
  });

  it('does not render a textarea while not editing', () => {
    const { container, root } = renderInto(<StreamNoteEditor {...baseProps()} />);
    expect(container.querySelector('textarea')).toBeNull();
    unmount(container, root);
  });

  it('clicking the edit button calls onStartEditing', () => {
    const onStartEditing = vi.fn();
    const { container, root } = renderInto(
      <StreamNoteEditor {...baseProps({ note: 'existing', onStartEditing })} />,
    );

    const editButton = container.querySelector('button[aria-label="Edit note"]') as HTMLButtonElement;
    expect(editButton).not.toBeNull();
    act(() => {
      editButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onStartEditing).toHaveBeenCalledTimes(1);
    unmount(container, root);
  });

  it('renders a textarea pre-filled with the current note while editing', () => {
    const { container, root } = renderInto(
      <StreamNoteEditor {...baseProps({ note: 'Payroll for October', isEditing: true })} />,
    );

    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    expect(textarea).not.toBeNull();
    expect(textarea.value).toBe('Payroll for October');
    expect(textarea.maxLength).toBe(200);
    unmount(container, root);
  });

  it('renders an empty textarea while editing when there is no existing note', () => {
    const { container, root } = renderInto(
      <StreamNoteEditor {...baseProps({ note: null, isEditing: true })} />,
    );
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    expect(textarea.value).toBe('');
    unmount(container, root);
  });

  it('typing into the textarea and clicking Save calls onSave with the typed value', () => {
    const onSave = vi.fn();
    const { container, root } = renderInto(
      <StreamNoteEditor {...baseProps({ note: 'old note', isEditing: true, onSave })} />,
    );

    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    act(() => {
      fireChange(textarea, 'new note contents');
    });

    const saveButton = Array.from(container.querySelectorAll('button'))
      .find((b) => b.textContent?.includes('Save')) as HTMLButtonElement;
    act(() => {
      saveButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onSave).toHaveBeenCalledWith('new note contents');
    unmount(container, root);
  });

  it('clicking Cancel calls onStopEditing', () => {
    const onStopEditing = vi.fn();
    const { container, root } = renderInto(
      <StreamNoteEditor {...baseProps({ note: 'old note', isEditing: true, onStopEditing })} />,
    );

    const cancelButton = Array.from(container.querySelectorAll('button'))
      .find((b) => b.textContent?.includes('Cancel')) as HTMLButtonElement;
    act(() => {
      cancelButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onStopEditing).toHaveBeenCalledTimes(1);
    unmount(container, root);
  });

  it('discards an unsaved edit on Cancel: re-entering edit mode shows the original note again', () => {
    const { container, root } = renderInto(
      <StreamNoteEditor {...baseProps({ note: 'original', isEditing: true })} />,
    );

    let textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    act(() => {
      fireChange(textarea, 'an unsaved draft');
    });
    expect(textarea.value).toBe('an unsaved draft');

    // Simulate the parent responding to onStopEditing by leaving edit mode,
    // then re-entering it — the draft must reflect the real `note` prop
    // again, not the abandoned typed text.
    act(() => {
      root.render(<StreamNoteEditor {...baseProps({ note: 'original', isEditing: false })} />);
    });
    act(() => {
      root.render(<StreamNoteEditor {...baseProps({ note: 'original', isEditing: true })} />);
    });

    textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    expect(textarea.value).toBe('original');
    unmount(container, root);
  });

  it('shows a Clear button while editing an existing note, and calls onClear when clicked', () => {
    const onClear = vi.fn();
    const { container, root } = renderInto(
      <StreamNoteEditor {...baseProps({ note: 'existing note', isEditing: true, onClear })} />,
    );

    const clearButton = Array.from(container.querySelectorAll('button'))
      .find((b) => b.textContent?.includes('Clear')) as HTMLButtonElement;
    expect(clearButton).toBeDefined();

    act(() => {
      clearButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onClear).toHaveBeenCalledTimes(1);
    unmount(container, root);
  });

  it('does not show a Clear button while editing when there is no existing note', () => {
    const { container, root } = renderInto(
      <StreamNoteEditor {...baseProps({ note: null, isEditing: true })} />,
    );

    const clearButton = Array.from(container.querySelectorAll('button'))
      .find((b) => b.textContent?.includes('Clear'));
    expect(clearButton).toBeUndefined();
    unmount(container, root);
  });
});
