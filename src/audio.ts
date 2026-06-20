type WebkitAudioWindow = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext;
};

type BgmNode = {
  osc: OscillatorNode;
  lfo: OscillatorNode;
  gain: GainNode;
  lfoGain: GainNode;
};

class AudioSystem {
  private ctx: AudioContext | null = null;
  public sfxEnabled: boolean = true;
  public bgmEnabled: boolean = false;
  public bgmVolume: number = 0.5;
  public sfxVolume: number = 1.0;
  private bgmNodes: BgmNode[] = [];

  public init() {
    if (!this.ctx) {
      const AudioCtor = window.AudioContext || (window as WebkitAudioWindow).webkitAudioContext;
      if (!AudioCtor) return;
      this.ctx = new AudioCtor();
    }
  }

  public toggleSFX(state: boolean) {
    this.sfxEnabled = state;
  }

  public toggleBGM(state: boolean) {
    this.bgmEnabled = state;
    if (state) {
      this.startBGM();
    } else {
      this.stopBGM();
    }
  }

  public setBGMVolume(vol: number) {
    this.bgmVolume = vol;
    this.bgmNodes.forEach(n => {
      // Base gain was 0.04
      n.gain.gain.value = 0.04 * vol;
      // Modulation depth was 0.03
      n.lfoGain.gain.value = 0.03 * vol;
    });
  }

  public setSFXVolume(vol: number) {
    this.sfxVolume = vol;
  }

  private startBGM() {
    if (!this.ctx) this.init();
    if (this.bgmNodes.length > 0) return;

    // Dark ambient generative chord (C minor feel)
    const frequencies = [130.81, 155.56, 196.00]; // C3, Eb3, G3
    frequencies.forEach((freq, i) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      const lfo = this.ctx!.createOscillator();
      const lfoGain = this.ctx!.createGain();

      osc.type = 'triangle';
      osc.frequency.value = freq / 2; // Drop an octave

      lfo.type = 'sine';
      lfo.frequency.value = 0.05 + (i * 0.02); // Slow breathing modulation
      
      lfoGain.gain.value = 0.03 * this.bgmVolume; // Modulation depth

      lfo.connect(lfoGain);
      lfoGain.connect(gain.gain);

      // Base volume
      gain.gain.value = 0.04 * this.bgmVolume; 

      osc.connect(gain);
      gain.connect(this.ctx!.destination);

      osc.start();
      lfo.start();
      this.bgmNodes.push({ osc, lfo, gain, lfoGain });
    });
  }

  private stopBGM() {
    this.bgmNodes.forEach(n => {
      n.osc.stop();
      n.lfo.stop();
      n.osc.disconnect();
      n.lfo.disconnect();
    });
    this.bgmNodes = [];
  }

  private playWoodKnock(frequency: number, duration: number, noiseAmount: number, volume: number = 1.0) {
    if (!this.sfxEnabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    
    // 1. Tonal resonance (the body of the wood)
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(frequency, t);
    osc.frequency.exponentialRampToValueAtTime(frequency * 0.8, t + duration); 
    
    const actualVolume = volume * this.sfxVolume;
    
    oscGain.gain.setValueAtTime(0, t);
    oscGain.gain.linearRampToValueAtTime(1 * actualVolume, t + 0.005);
    oscGain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    
    osc.connect(oscGain);
    oscGain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + duration);

    // 2. The impact transient (the "clack" sound)
    if (noiseAmount > 0) {
      const bufferSize = this.ctx.sampleRate * duration;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1; // White noise
      }
      const noiseSource = this.ctx.createBufferSource();
      noiseSource.buffer = buffer;
      
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(frequency * 2, t);
      filter.Q.setValueAtTime(1.0, t);
      
      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(0, t);
      noiseGain.gain.linearRampToValueAtTime(noiseAmount * actualVolume, t + 0.002);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, t + (duration * 0.3));
      
      noiseSource.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(this.ctx.destination);
      
      noiseSource.start(t);
      noiseSource.stop(t + duration);
    }
  }

  public playMoveSound() {
    // Light, crisp tap for a pawn move
    this.playWoodKnock(500, 0.08, 0.5, 0.6);
  }

  public playWallSound() {
    // Deep, resonant, louder thud for a large wooden plank
    this.playWoodKnock(200, 0.15, 0.8, 1.0);
  }

  public playTickSound() {
    if (!this.sfxEnabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'square';
    osc.frequency.setValueAtTime(800, t);
    osc.frequency.exponentialRampToValueAtTime(400, t + 0.05);
    
    const actualVolume = 0.3 * this.sfxVolume;

    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(actualVolume, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.05);
  }
}

export const audio = new AudioSystem();
