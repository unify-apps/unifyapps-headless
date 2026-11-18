/* The video's preview page: plays the story with its audio. Space to pause, arrows to jump a scene, the bar to seek. */
UA.player = (F) => {
  const W = 1920, H = 1080;
  const ui = document.createElement('div');
  ui.id = 'ui';
  ui.innerHTML = '<button type="button">Play</button><input type="range" min="0" step="10" value="0" aria-label="Seek"><span></span>';
  document.body.appendChild(ui);
  const frame = document.getElementById('frame');
  const fit = () => { frame.style.transform = `scale(${Math.min(innerWidth / W, (innerHeight - 56) / H)})`; };
  addEventListener('resize', fit); fit();
  const audio = F.audio ? new Audio(F.audio) : null;
  const btn = ui.querySelector('button'), scrub = ui.querySelector('input'), time = ui.querySelector('span');
  scrub.max = String(F.duration);
  let playing = false, t0 = 0, base = 0;
  const now = () => (audio ? audio.currentTime * 1000 : base + (performance.now() - t0));
  const mmss = (ms) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
  UA.progress = (t) => { scrub.value = String(t); time.textContent = `${mmss(t)} / ${mmss(F.duration)}`; };
  const go = (t) => { t = UA.clamp(t, 0, F.duration); if (audio) audio.currentTime = t / 1000; base = t; t0 = performance.now(); UA.seek(t); };
  const loop = () => { if (!playing) return; const t = now(); if (t >= F.duration) { playing = false; btn.textContent = 'Play'; return; } UA.seek(t); requestAnimationFrame(loop); };
  // the page opens on the settled title card as its poster; Play starts from the top
  let poster = true;
  const toggle = () => {
    playing = !playing; btn.textContent = playing ? 'Pause' : 'Play';
    if (playing) { if (poster || UA.t >= F.duration - 50) go(0); poster = false; base = UA.t; t0 = performance.now(); audio?.play(); loop(); } else audio?.pause();
  };
  btn.onclick = toggle;
  scrub.oninput = () => { poster = false; go(+scrub.value); };
  addEventListener('keydown', (e) => {
    if (e.code === 'Space') { e.preventDefault(); toggle(); }
    const i = UA.list.findIndex((s) => UA.t < s.end);
    if (e.key === 'ArrowRight') go(UA.list[Math.min(UA.list.length - 1, i + 1)].start);
    if (e.key === 'ArrowLeft') go(UA.list[Math.max(0, i - (UA.t - UA.list[i].start > 1500 ? 0 : 1))].start);
    if (e.key.startsWith('Arrow')) poster = false;
  });
  UA.seek(Math.max(0, Math.min(3600, UA.list[0].end - 700)));
  UA.progress(0);
};
