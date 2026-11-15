# Original BGM for the PROCESSHOT promo, synthesised from scratch (no samples, no third-party music).
# 100 BPM (beat 0.6 s) so the gallery's 0.6 s hard cuts land on beats. D major: Dmaj9 / Bm9 / Gmaj9 / A13sus.
# Usage: python music.py reel|story times.json out.wav
import json, sys
import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve

SR = 48000
mode, times_path, out_path = sys.argv[1], sys.argv[2], sys.argv[3]
TM = json.load(open(times_path))[mode]
DUR = TM['dur']
N = int(DUR * SR)
rng = np.random.default_rng(7)

dry = np.zeros((2, N + SR * 4))   # instruments without reverb
send = np.zeros_like(dry)         # reverb send bus
mf = lambda m: 440.0 * 2 ** ((m - 69) / 12)

def put(sig, t, pan=0.0, rev=0.0, bus=None):
    i = int(round(t * SR))
    if i >= dry.shape[1]: return
    sig = sig[: dry.shape[1] - i]
    l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    for k, g in ((0, l), (1, r)):
        dry[k, i:i + len(sig)] += sig * g
        if rev: send[k, i:i + len(sig)] += sig * g * rev

def tt(dur): return np.arange(int(dur * SR)) / SR

def piano(m, t, amp=0.25, decay=1.6, pan=0.0, rev=0.5):
    x = tt(decay * 3.2); f = mf(m); s = np.zeros_like(x)
    for h, a in enumerate([1, .45, .25, .14, .08, .05], 1):
        fh = f * h * np.sqrt(1 + 0.0004 * h * h)
        s += a * np.sin(2 * np.pi * fh * x + rng.uniform(0, 6.28)) * np.exp(-x / decay * (1 + .7 * (h - 1)))
    s *= np.minimum(1, x / 0.004)
    put(s * amp, t, pan, rev)

def pluck(m, t, amp=0.12, decay=0.22, pan=0.0, rev=0.35):
    x = tt(decay * 5); f = mf(m); s = np.zeros_like(x)
    for h in (1, 3, 5, 7):
        s += np.sin(2 * np.pi * f * h * x) / h ** 2 * np.exp(-x / decay * (1 + .5 * (h - 1)))
    s *= np.minimum(1, x / 0.003)
    put(s * amp, t, pan, rev)

def pad(ms, t0, t1, amp=0.05, att=0.7, rel=1.6, rev=0.45):
    x = tt(t1 - t0 + rel)
    env = np.where(x < att, np.sin(np.minimum(x / att, 1) * np.pi / 2) ** 2, 1.0)
    env = env * np.where(x > t1 - t0, np.exp(-(x - (t1 - t0)) / (rel / 4)), 1.0)
    env *= 1 + 0.06 * np.sin(2 * np.pi * 0.23 * x)
    for m in ms:
        for cents, pan in ((-7, -0.6), (0, 0.0), (7, 0.6)):
            f = mf(m) * 2 ** (cents / 1200); s = np.zeros_like(x)
            for h in range(1, 9):
                s += np.sin(2 * np.pi * f * h * x + rng.uniform(0, 6.28)) / h * np.exp(-0.35 * h)
            put(s * env * amp / 3, t0, pan, rev)

def bass(m, t0, t1, amp=0.16):
    x = tt(t1 - t0 + 0.4)
    env = np.minimum(1, x / 0.05) * np.where(x > t1 - t0, np.exp(-(x - (t1 - t0)) / 0.12), 1.0)
    f = mf(m); s = np.sin(2 * np.pi * f * x) + 0.18 * np.sin(4 * np.pi * f * x)
    put(s * env * amp, t0)

def kick(t, amp=0.5):
    x = tt(0.6); f = 44 + 90 * np.exp(-x / 0.035)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-x / 0.26)
    s[:96] += rng.normal(0, 0.25, 96) * np.linspace(1, 0, 96)
    put(s * amp, t, 0, 0.05)

HP = butter(4, 7000, 'hp', fs=SR, output='sos')
def tick(t, amp=0.05, pan=0.25):
    x = tt(0.08); s = sosfilt(HP, rng.normal(0, 1, len(x))) * np.exp(-x / 0.018)
    put(s * amp, t, pan, 0.1)

BP = butter(2, [2200, 5200], 'bp', fs=SR, output='sos')
def tap(t, amp=0.09):  # UI tap sound effect
    x = tt(0.06)
    s = sosfilt(BP, rng.normal(0, 1, len(x))) * np.exp(-x / 0.006) + 0.5 * np.sin(2 * np.pi * 1650 * x) * np.exp(-x / 0.012)
    put(s * amp, t, 0, 0.15)

def shimmer(ms, t, amp=0.035, dur=3.0):
    x = tt(dur); env = np.minimum(1, x / 0.25) * np.exp(-x / (dur / 3))
    for i, m in enumerate(ms):
        s = np.sin(2 * np.pi * mf(m + 24) * x) * (1 + 0.15 * np.sin(2 * np.pi * 5.5 * x + i))
        put(s * env * amp, t, (-0.5, 0.5)[i % 2], 0.9)

HP2 = butter(2, 900, 'hp', fs=SR, output='sos')
def riser(t0, t1, amp=0.06):
    x = tt(t1 - t0); env = (x / (t1 - t0)) ** 2.2
    s = sosfilt(HP2, rng.normal(0, 1, len(x))) * env
    s[-480:] *= np.linspace(1, 0, 480)
    put(s * amp, t0, 0, 0.6)

# chord voicings (MIDI): pad tones, bass, arp tones
CH = {
    'D':  ([50, 57, 61, 64, 66], 38, [62, 66, 69, 73, 76]),
    'Bm': ([47, 54, 57, 61, 62], 35, [59, 62, 66, 69, 73]),
    'G':  ([43, 50, 54, 57, 59], 31, [55, 59, 62, 66, 69]),
    'A':  ([45, 52, 59, 62, 66], 33, [57, 62, 64, 69, 71]),
}
B = 0.6; BAR = 4 * B
ARP = [0, 2, 1, 3, 2, 4, 3, 1]

def bar(ch, t0, t1, arp=True, arp_amp=0.1, pad_amp=0.05, bass_on=True):
    p, b, a = CH[ch]
    pad(p, t0, t1, pad_amp)
    if bass_on: bass(b, t0, t1 - 0.05)
    if arp:
        n = int(round((t1 - t0) / (B / 2)))
        for k in range(n):
            pluck(a[ARP[k % 8]] + 12, t0 + k * B / 2, arp_amp * (1.0 if k % 2 == 0 else 0.7), pan=(-0.3, 0.3)[k % 2])

def drums(t0, t1, kick_on=True):
    k = 0; t = t0
    while t < t1 - 1e-6:
        if kick_on and k % 2 == 0: kick(t, 0.42)
        tick(t + B / 2, 0.045)
        t += B; k += 1

def intro(swap):
    piano(76, 0.15, 0.16, 2.0, pan=0.2); piano(73, 0.75, 0.13, 2.0, pan=-0.2)
    pad([57, 64], 0.0, swap, 0.025, att=0.4, rel=0.3)
    # the reveal: photo becomes the finished image
    kick(swap, 0.5); bass(31, swap, swap + 2.4, 0.18)
    for i, m in enumerate([67, 71, 74, 78]): piano(m, swap + i * 0.012, 0.13, 2.4)
    shimmer([67, 71, 74], swap, 0.03)

if mode == 'reel':
    sw = TM['heroSwap']; intro(sw)
    pad(CH['G'][0], sw, 4.8, 0.05)
    bar('G', 4.8, 7.2, arp=True, arp_amp=0.07, bass_on=True)
    seq = ['D', 'Bm', 'G', 'A', 'D', 'Bm', 'G']           # 7.2 – 24.0, how-to section
    for i, ch in enumerate(seq):
        t0 = 7.2 + i * BAR; bar(ch, t0, t0 + BAR)
        drums(t0, t0 + BAR, kick_on=i > 0)
    up0, up1 = TM['lift']['up']
    riser(up0 - 0.5, up1, 0.05); shimmer([69, 74, 78], up1, 0.035); piano(81, up1, 0.1, 2.0)
    for t in TM['taps']: tap(t)
    # facts card: drop to calm
    pad(CH['G'][0], 24.0, 27.0, 0.05); bass(31, 24.0, 26.9, 0.12)
    piano(74, 24.0, 0.13, 2.2); piano(78, 25.2, 0.11, 2.2)
    riser(26.0, 27.0, 0.05)
    # gallery: one hit per hard cut
    g0, g1 = TM['gallery']; step = (g1 - g0) / 4
    for i, ch in enumerate(['D', 'Bm', 'G', 'A']):
        t = g0 + i * step; p, b, a = CH[ch]
        kick(t, 0.5); bass(b, t, t + step - 0.03, 0.17); pad(p, t, t + step, 0.05, att=0.05, rel=0.3)
        for j, m in enumerate(a[:4]): piano(m, t + j * 0.01, 0.1, 0.9)
        tick(t + step / 2, 0.05)
    # end card: resolve
    e = TM['end'][0]
    kick(e, 0.45); bass(38, e, DUR - 0.3, 0.17); pad(CH['D'][0], e, DUR - 0.5, 0.055, att=0.08)
    for j, m in enumerate([62, 66, 69, 73, 76]): piano(m, e + j * 0.015, 0.11, 2.6)
    shimmer([69, 73, 76], e, 0.035, 3.5); piano(81, e + 1.2, 0.08, 2.0)
else:
    sw = TM['heroSwap']; intro(sw)
    pad(CH['G'][0], sw, 3.6, 0.05)
    for i, ch in enumerate(['D', 'Bm']):
        t0 = 3.6 + i * BAR; bar(ch, t0, t0 + BAR); drums(t0, t0 + BAR, kick_on=True)
    bar('G', 8.4, 9.0); drums(8.4, 9.0)
    for t in TM['taps']: tap(t)
    o = TM['outro'][0]
    kick(o, 0.45); bass(38, o, DUR - 0.5, 0.15); pad(CH['D'][0], o, DUR - 0.6, 0.055, att=0.1)
    for j, m in enumerate([62, 66, 69, 73, 76]): piano(m, o + j * 0.015, 0.11, 2.6)
    shimmer([69, 73, 76], o, 0.035, 4.0)
    for k, (t, m) in enumerate([(10.8, 81), (11.4, 78), (12.6, 76)]): piano(m, t, 0.09, 2.2, pan=(-0.2, 0.2)[k % 2])
    for k in range(int((DUR - 1.0 - (o + 1.2)) / B)):   # sparse arp under the outro
        pluck(CH['D'][2][ARP[k % 8]] + 12, o + 1.2 + k * B, 0.05)

# reverb: synthetic decaying-noise impulse response, different per channel
ir_t = tt(2.2); LP = butter(2, 6000, 'lp', fs=SR, output='sos')
wet = np.zeros_like(dry)
for k in range(2):
    ir = sosfilt(LP, rng.normal(0, 1, len(ir_t))) * np.exp(-ir_t / 0.55)
    ir /= np.sqrt((ir ** 2).sum())
    wet[k] = fftconvolve(send[k], ir)[: dry.shape[1]]
mix = dry + wet * 0.55
mix = sosfilt(butter(2, 28, 'hp', fs=SR, output='sos'), mix, axis=1)[:, :N]
# fade in 5 ms, fade out to silence at the very end
f = np.ones(N); f[:240] = np.linspace(0, 1, 240)
fo = int(0.9 * SR); f[-fo:] *= np.linspace(1, 0, fo) ** 1.5
mix *= f
mix /= np.abs(mix).max() / 0.7
import wave
pcm = (np.clip(mix.T, -1, 1) * 32767).astype('<i2')
with wave.open(out_path, 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print(mode, 'ok', DUR, 's')
