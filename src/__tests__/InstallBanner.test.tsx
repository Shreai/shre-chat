// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import InstallBanner from '../components/InstallBanner';

// Mock the hook so tests control the install state without triggering real
// PWA prompts or touching window.matchMedia under jsdom.
const mockHook = vi.fn();
vi.mock('../hooks/useInstallPrompt', () => ({
  useInstallPrompt: () => mockHook(),
}));

describe('InstallBanner', () => {
  it('renders nothing when install is unavailable', () => {
    mockHook.mockReturnValue({
      canInstall: false,
      showIOSGuide: false,
      install: vi.fn(),
      dismiss: vi.fn(),
    });
    const { container } = render(<InstallBanner />);
    expect(container.firstChild).toBeNull();
  });

  it('renders install CTA on Android/Chrome', () => {
    const install = vi.fn();
    mockHook.mockReturnValue({
      canInstall: true,
      showIOSGuide: false,
      install,
      dismiss: vi.fn(),
    });
    render(<InstallBanner />);
    expect(screen.getByText(/Shre AI/)).toBeInTheDocument();
    const btn = screen.getByRole('button', { name: 'Install' });
    fireEvent.click(btn);
    expect(install).toHaveBeenCalledTimes(1);
  });

  it('shows iOS Add-to-Home-Screen guide when iOS detected', () => {
    mockHook.mockReturnValue({
      canInstall: false,
      showIOSGuide: true,
      install: vi.fn(),
      dismiss: vi.fn(),
    });
    render(<InstallBanner />);
    expect(screen.getByText(/Add to Home Screen/)).toBeInTheDocument();
    // No Install button in the iOS path, only the dismiss 'X'.
    expect(screen.queryByRole('button', { name: 'Install' })).toBeNull();
  });

  it('fires dismiss when × clicked', () => {
    const dismiss = vi.fn();
    mockHook.mockReturnValue({
      canInstall: true,
      showIOSGuide: false,
      install: vi.fn(),
      dismiss,
    });
    render(<InstallBanner />);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(dismiss).toHaveBeenCalledTimes(1);
  });
});
