// Synthesized Audio Manager using Web Audio API

const AudioContext = window.AudioContext || window.webkitAudioContext;
const ctx = new AudioContext();

const GAIN = 0.1; // Master volume

function playTone(freq, type, duration) {
    if (ctx.state === 'suspended') ctx.resume();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);

    gain.gain.setValueAtTime(GAIN, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + duration);
}

export const sfx = {
    hover: () => {
        // Very short, high pitch tick
        playTone(800, 'sine', 0.05);
    },
    click: () => {
        // Solid thud
        playTone(300, 'triangle', 0.1);
    },
    lineDraw: () => {
        // Sharp swipe
        playTone(600, 'square', 0.1);
    },
    boxComplete: () => {
        // Nice major chord or positive ding
        playTone(523.25, 'sine', 0.3); // C5
        setTimeout(() => playTone(659.25, 'sine', 0.3), 50); // E5
    },
    turnSwitch: () => {
        playTone(400, 'sine', 0.2);
    },
    win: () => {
        // Arpeggio
        [523.25, 659.25, 783.99, 1046.50].forEach((f, i) => {
            setTimeout(() => playTone(f, 'triangle', 0.4), i * 100);
        });
    }
};
