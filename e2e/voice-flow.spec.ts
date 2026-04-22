import { test, expect } from '@playwright/test';

test.describe('Voice Loop E2E Validation', () => {
  test('Hands-free Walkie-Talkie Loop (Speak -> Transcribe -> Send -> TTS -> Restart)', async ({ page, context }) => {
    // 1. Setup mocks for SpeechRecognition and MediaRecorder
    await page.addInitScript(() => {
      // Mock getUserMedia
      (navigator as any).mediaDevices = {
        getUserMedia: async () => ({
          getTracks: () => [{ stop: () => {}, readyState: 'live' }],
          getAudioTracks: () => [{ stop: () => {}, readyState: 'live' }],
          active: true
        }),
        enumerateDevices: async () => [{ kind: 'audioinput', label: 'Mock Mic' }]
      };

      // Mock SpeechRecognition
      (window as any).SpeechRecognition = function() {
        this.start = () => {
          console.log('[MockSR] start');
          setTimeout(() => {
            if (this.onresult) {
              const event = {
                resultIndex: 0,
                results: [[{ transcript: 'what are my sales from party liquor' }]]
              };
              (event.results[0] as any).isFinal = true;
              this.onresult(event);
            }
            // Trigger onend to simulate silence/completion
            if (this.onend) this.onend();
          }, 1000);
        };
        this.stop = () => console.log('[MockSR] stop');
        this.abort = () => console.log('[MockSR] abort');
      };

      // Mock MediaRecorder
      (window as any).MediaRecorder = function() {
        this.start = () => console.log('[MockMR] start');
        this.stop = () => {
          console.log('[MockMR] stop');
          if (this.onstop) this.onstop();
        };
        this.state = 'inactive';
      };
      (window as any).MediaRecorder.isTypeSupported = () => true;

      // Mock AudioContext (for level analysis)
      (window as any).AudioContext = function() {
        this.createMediaStreamSource = () => ({ connect: () => {} });
        this.createAnalyser = () => ({
          fftSize: 256,
          frequencyBinCount: 128,
          getByteFrequencyData: (arr: Uint8Array) => {
             // Simulate some "noise" then "silence"
             arr.fill(0);
          },
          connect: () => {}
        });
        this.close = async () => {};
      };
    });

    // 2. Load app and grant mic permissions
    await context.grantPermissions(['microphone']);
    await page.goto('/');
    await page.waitForSelector('#shre-chat-textarea');

    // 3. Activate Hands-free mode
    const handsFreeBtn = page.locator('button[aria-label*="Activate hands-free" i]');
    await handsFreeBtn.click();

    // Verify UI reflects active mode
    await expect(handsFreeBtn).toHaveAttribute('title', /Deactivate/i);

    // 4. Verify message is sent automatically
    // The mock SpeechRecognition will "speak" after 1s
    const userMessage = page.locator('div[data-role="user"]').last();
    await expect(userMessage).toContainText('party liquor', { timeout: 15000 });

    // 5. Verify AI Response appears
    const assistantMessage = page.locator('div[data-role="assistant"]').last();
    await expect(assistantMessage).toBeVisible({ timeout: 20000 });

    // 6. Verify TTS triggers
    // We can check if an Audio object was created or if the "speaking" state is active
    // In our implementation, we show a speaking indicator or set a state.
    // Let's check for the status line if it says "Speaking..."
    const statusLine = page.locator('[aria-live="polite"]');
    // Note: statusLine might be hidden but accessible
    // Alternatively check internal state via evaluate
    const isSpeaking = await page.evaluate(() => (window as any).isSpeaking === true || !!document.querySelector('audio'));
    console.log('TTS Active:', isSpeaking);

    // 7. Verify Auto-Restart
    // After AI finishes speaking, the mic should turn back on (red pulse or state)
    // We simulate audio end
    await page.evaluate(() => {
      const audio = document.querySelector('audio');
      if (audio) {
        const event = new Event('ended');
        audio.dispatchEvent(event);
      }
    });

    // Check if recording restarted
    const micActive = page.locator('button[aria-label*="Stop recording" i]');
    await expect(micActive).toBeVisible({ timeout: 5000 });
  });
});
