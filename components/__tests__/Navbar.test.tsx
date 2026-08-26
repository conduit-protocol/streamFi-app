import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { Navbar } from '../Navbar';

/**
 * Test coverage for Navbar.tsx (issue #326).
 *
 * Tests the real logic worth regression-testing:
 * - Closing the mobile menu on route change
 * - Closing on Escape key press
 * - iOS-Safari-specific backdrop-click-to-close workaround (issue #143)
 */

// Mock Next.js navigation hooks
vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/streams'),
  useRouter: vi.fn(() => ({ push: vi.fn() })),
}));

// Mock Next.js Link component
vi.mock('next/link', () => ({
  default: ({ href, children, onClick, className }: any) =>
    React.createElement(
      'a',
      { href, onClick, className, 'data-testid': `link-${href}` },
      children,
    ),
}));

// Mock child components
vi.mock('@/components/ConnectButton', () => ({
  ConnectButton: () => React.createElement('div', { 'data-testid': 'connect-button' }, 'Connect'),
}));

vi.mock('@/components/ThemeToggle', () => ({
  ThemeToggle: () => React.createElement('div', { 'data-testid': 'theme-toggle' }, 'Theme'),
}));

vi.mock('@/components/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: any) => children,
}));

describe('Navbar', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.clearAllMocks();
  });

  it('renders the navbar with logo and navigation links', () => {
    act(() => {
      root.render(React.createElement(Navbar));
    });

    expect(container.textContent).toContain('conduit');
    expect(container.textContent).toContain('Streams');
    expect(container.textContent).toContain('History');
    expect(container.textContent).toContain('Create');
    expect(container.textContent).toContain('Dashboard');
    expect(container.textContent).toContain('Profile');
  });

  it('opens and closes the mobile menu when hamburger button is clicked', () => {
    act(() => {
      root.render(React.createElement(Navbar));
    });

    // Initially closed - mobile nav should not be visible
    let mobileNav = container.querySelector('#mobile-nav');
    expect(mobileNav).toBeNull();

    // Click hamburger to open
    const hamburger = container.querySelector('button[aria-label="Open menu"]');
    expect(hamburger).toBeTruthy();
    act(() => {
      hamburger!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // Mobile nav should now be visible
    mobileNav = container.querySelector('#mobile-nav');
    expect(mobileNav).toBeTruthy();

    // Click hamburger again to close
    const closeButton = container.querySelector('button[aria-label="Close menu"]');
    expect(closeButton).toBeTruthy();
    act(() => {
      closeButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // Mobile nav should be hidden again
    mobileNav = container.querySelector('#mobile-nav');
    expect(mobileNav).toBeNull();
  });

  it('closes the mobile menu on route change', async () => {
    const { usePathname } = await import('next/navigation');
    const mockUsePathname = usePathname as ReturnType<typeof vi.fn>;

    // Start with /streams route
    mockUsePathname.mockReturnValue('/streams');

    act(() => {
      root.render(React.createElement(Navbar));
    });

    // Open the mobile menu
    const hamburger = container.querySelector('button[aria-label="Open menu"]');
    act(() => {
      hamburger!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.querySelector('#mobile-nav')).toBeTruthy();

    // Simulate route change to /create
    mockUsePathname.mockReturnValue('/create');

    // Re-render with new route
    act(() => {
      root.render(React.createElement(Navbar));
    });

    // Mobile menu should be closed after route change
    expect(container.querySelector('#mobile-nav')).toBeNull();
  });

  it('closes the mobile menu when Escape key is pressed', () => {
    act(() => {
      root.render(React.createElement(Navbar));
    });

    // Open the mobile menu
    const hamburger = container.querySelector('button[aria-label="Open menu"]');
    act(() => {
      hamburger!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.querySelector('#mobile-nav')).toBeTruthy();

    // Press Escape key
    act(() => {
      const escapeEvent = new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
      });
      document.dispatchEvent(escapeEvent);
    });

    // Mobile menu should be closed
    expect(container.querySelector('#mobile-nav')).toBeNull();
  });

  it('does not add keydown listener when menu is closed', () => {
    const addEventListenerSpy = vi.spyOn(document, 'addEventListener');

    act(() => {
      root.render(React.createElement(Navbar));
    });

    // Should not have added keydown listener since menu is closed
    expect(addEventListenerSpy).not.toHaveBeenCalledWith('keydown', expect.any(Function));

    addEventListenerSpy.mockRestore();
  });

  it('removes keydown listener when menu is closed', () => {
    const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener');

    act(() => {
      root.render(React.createElement(Navbar));
    });

    // Open the menu
    const hamburger = container.querySelector('button[aria-label="Open menu"]');
    act(() => {
      hamburger!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // Close the menu
    const closeButton = container.querySelector('button[aria-label="Close menu"]');
    act(() => {
      closeButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // Should have removed the keydown listener
    expect(removeEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function));

    removeEventListenerSpy.mockRestore();
  });

  it('closes mobile menu when backdrop is clicked (iOS Safari fix #143)', () => {
    act(() => {
      root.render(React.createElement(Navbar));
    });

    // Open the mobile menu
    const hamburger = container.querySelector('button[aria-label="Open menu"]');
    act(() => {
      hamburger!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.querySelector('#mobile-nav')).toBeTruthy();

    // Click the backdrop (the fixed inset overlay)
    const backdrop = container.querySelector('button.fixed.inset-0');
    expect(backdrop).toBeTruthy();
    expect(backdrop?.getAttribute('aria-label')).toBe('Close menu');

    act(() => {
      backdrop!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // Mobile menu should be closed
    expect(container.querySelector('#mobile-nav')).toBeNull();
  });

  it('closes mobile menu when a mobile nav link is clicked', () => {
    act(() => {
      root.render(React.createElement(Navbar));
    });

    // Open the mobile menu
    const hamburger = container.querySelector('button[aria-label="Open menu"]');
    act(() => {
      hamburger!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.querySelector('#mobile-nav')).toBeTruthy();

    // Click a link in the mobile menu
    const mobileNav = container.querySelector('#mobile-nav');
    const link = mobileNav?.querySelector('a[data-testid="link-/create"]');
    expect(link).toBeTruthy();

    act(() => {
      link!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // Mobile menu should be closed
    expect(container.querySelector('#mobile-nav')).toBeNull();
  });

  it('sets aria-expanded attribute correctly', () => {
    act(() => {
      root.render(React.createElement(Navbar));
    });

    const hamburger = container.querySelector('button[aria-expanded]');
    expect(hamburger?.getAttribute('aria-expanded')).toBe('false');

    // Open menu
    act(() => {
      hamburger!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const hamburgerOpen = container.querySelector('button[aria-expanded]');
    expect(hamburgerOpen?.getAttribute('aria-expanded')).toBe('true');
  });

  it('renders ConnectButton and ThemeToggle inside ErrorBoundary', () => {
    act(() => {
      root.render(React.createElement(Navbar));
    });

    expect(container.querySelector('[data-testid="connect-button"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="theme-toggle"]')).toBeTruthy();
  });
});
