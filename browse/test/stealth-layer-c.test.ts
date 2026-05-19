/**
 * stealth.ts Layer C additions (T3 + D6 for GBrowser anti-detection):
 * verifies the build-time scaffolding without requiring a live browser.
 *
 * Live-browser verification of these spoofs in actual page contexts is
 * covered by the gbrowser-side `test/anti-bot.test.sh` (Phase 1 / T7)
 * which loads the probe page through the built GBrowser app post-bundle.
 * These tests only exercise the JS script builder + the static export
 * shapes — fast, hermetic, no chromium launch.
 */
import { describe, test, expect } from 'bun:test';
import {
  buildStealthScript,
  WEBDRIVER_MASK_SCRIPT,
  STEALTH_LAUNCH_ARGS,
  STEALTH_IGNORE_DEFAULT_ARGS,
} from '../src/stealth';

describe('STEALTH_IGNORE_DEFAULT_ARGS — T1', () => {
  test('includes --enable-automation (kills infobar)', () => {
    expect(STEALTH_IGNORE_DEFAULT_ARGS).toContain('--enable-automation');
  });
  test('includes the 4 Patchright-recommended adds', () => {
    expect(STEALTH_IGNORE_DEFAULT_ARGS).toContain('--disable-popup-blocking');
    expect(STEALTH_IGNORE_DEFAULT_ARGS).toContain('--disable-component-update');
    expect(STEALTH_IGNORE_DEFAULT_ARGS).toContain('--disable-default-apps');
  });
  test('preserves the original extension-loading blockers', () => {
    expect(STEALTH_IGNORE_DEFAULT_ARGS).toContain('--disable-extensions');
    expect(STEALTH_IGNORE_DEFAULT_ARGS).toContain('--disable-component-extensions-with-background-pages');
  });
});

describe('buildStealthScript — T3 Layer C', () => {
  const hw = { platform: 'MacARM', hwConcurrency: 16, deviceMemory: 8 };

  test('builds a self-invoking function (atomic injection)', () => {
    const s = buildStealthScript(hw);
    expect(s.trim().startsWith('(() => {')).toBe(true);
    expect(s.trim().endsWith('})();')).toBe(true);
  });

  test('installs the Function.prototype.toString Proxy FIRST', () => {
    const s = buildStealthScript(hw);
    const proxyIdx = s.indexOf('new Proxy(nativeToString');
    const webdriverIdx = s.indexOf("'webdriver'");
    expect(proxyIdx).toBeGreaterThan(0);
    expect(webdriverIdx).toBeGreaterThan(proxyIdx);
  });

  test('navigator.webdriver getter returns false', () => {
    const s = buildStealthScript(hw);
    expect(s).toMatch(/Object\.defineProperty\(navigator, 'webdriver'/);
    expect(s).toMatch(/return false/);
  });

  test('window.chrome.runtime ships full enum shape', () => {
    const s = buildStealthScript(hw);
    expect(s).toContain('OnInstalledReason');
    expect(s).toContain('PlatformArch');
    expect(s).toContain('PlatformOs');
    expect(s).toContain('RequestUpdateCheckStatus');
    // sendMessage / connect must throw native-shaped errors
    expect(s).toContain('runtime.connect');
    expect(s).toContain('runtime.sendMessage');
  });

  test('chrome.csi and chrome.loadTimes provide method bodies', () => {
    const s = buildStealthScript(hw);
    expect(s).toContain('chrome.csi = markNative(function csi()');
    expect(s).toContain('chrome.loadTimes = markNative(function loadTimes()');
    // loadTimes shape must include wasFetchedViaSpdy/connectionInfo —
    // those are what real Chrome's loadTimes() returns on HTTP/2 sites.
    expect(s).toContain('wasFetchedViaSpdy');
    expect(s).toContain('connectionInfo');
  });

  test('Notification.permission aligned to default', () => {
    const s = buildStealthScript(hw);
    expect(s).toMatch(/Notification, 'permission'/);
    expect(s).toMatch(/return 'default'/);
  });

  test('hardware values interpolated from host profile (NOT hardcoded)', () => {
    const s = buildStealthScript({ platform: 'MacARM', hwConcurrency: 12, deviceMemory: 4 });
    expect(s).toContain('return 12');
    expect(s).toContain('return 4');
    expect(s).not.toMatch(/return 8;.*hardwareConcurrency/);
  });

  test('cleans up Selenium 25 globals + Playwright + Phantom + Nightmare', () => {
    const s = buildStealthScript(hw);
    // Spot-check a few from each category
    expect(s).toContain('__webdriver_evaluate');     // Selenium
    expect(s).toContain('domAutomationController');  // Chrome Driver classic
    expect(s).toContain('__pwInitScripts');          // Playwright
    expect(s).toContain('callPhantom');              // PhantomJS
    expect(s).toContain('__nightmare');              // NightmareJS
    expect(s).toContain('_Selenium_IDE_Recorder');   // Selenium IDE
  });

  test('uses markNative wrapper for every patched function', () => {
    const s = buildStealthScript(hw);
    // Every getter (hardwareConcurrency, deviceMemory, webdriver, Notification.permission)
    // should be wrapped through markNative so the toString Proxy covers it.
    const markNativeMatches = s.match(/markNative\(/g) || [];
    // At least 8 markNative wrappings (webdriver, csi, loadTimes, connect, sendMessage,
    // notification permission, hwConcurrency, deviceMemory)
    expect(markNativeMatches.length).toBeGreaterThanOrEqual(7);
  });

  test('script does not include "GStackBrowser" branding string', () => {
    const s = buildStealthScript(hw);
    // D6: dropped from UA, must not leak in via stealth payload either.
    expect(s).not.toContain('GStackBrowser');
  });
});

describe('backwards-compat exports', () => {
  test('WEBDRIVER_MASK_SCRIPT still exported', () => {
    expect(WEBDRIVER_MASK_SCRIPT).toContain("'webdriver'");
    expect(WEBDRIVER_MASK_SCRIPT).toContain('false');
  });
  test('STEALTH_LAUNCH_ARGS still includes blink-features=AutomationControlled', () => {
    expect(STEALTH_LAUNCH_ARGS).toContain('--disable-blink-features=AutomationControlled');
  });
});
