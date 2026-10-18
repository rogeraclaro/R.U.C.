'use strict';
/**
 * Per-player controls on one machine ([C64][manual] each human has his own stick and button). Seat 0-3 = P1-P4 = `player.keys`.
 * Keys are matched by KeyboardEvent.code (the physical key), so they work with any keyboard language and with Shift or Caps Lock.
 * P1 also keeps the mouse / touch UI and Space; the gamepads (GamepadInput) claim a seat with their first button press.
 */
const CONTROL_LAYOUTS = deepFreeze([
  { label: 'Fletxes + Enter', button: 'Enter', up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'], press: ['Enter', 'Space'] },
  { label: 'W A S D + Q', button: 'Q', up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'], press: ['KeyQ'] },
  { label: 'I J K L + U', button: 'U', up: ['KeyI'], down: ['KeyK'], left: ['KeyJ'], right: ['KeyL'], press: ['KeyU'] },
  { label: 'Teclat numèric 8 4 5 6 + 0', button: '0 (teclat numèric)', up: ['Numpad8'], down: ['Numpad5', 'Numpad2'], left: ['Numpad4'], right: ['Numpad6'], press: ['Numpad0'] }
]);

const PlayerControls = {
  /** The seat and action ('up' | 'down' | 'left' | 'right' | 'button') of a physical key, or null. */
  match(code) {
    for (let seat = 0; seat < CONTROL_LAYOUTS.length; seat++) {
      const L = CONTROL_LAYOUTS[seat];
      if (L.press.includes(code)) return { seat, action: 'button' };
      const dir = ['up', 'down', 'left', 'right'].find((d) => L[d].includes(code));
      if (dir) return { seat, action: dir };
    }
    return null;
  },
  /** Held direction of a seat from the held keys (codes); opposite keys cancel. y: -1 = up, as walkDirs. */
  dirs(held, seat, extra = null) {
    const L = CONTROL_LAYOUTS[seat]; const e = extra || { x: 0, y: 0 };
    if (!L) return { x: Math.sign(e.x || 0), y: Math.sign(e.y || 0) };
    const has = (list) => list.some((c) => held.has(c));
    const x = (has(L.right) ? 1 : 0) - (has(L.left) ? 1 : 0) + (e.x || 0);
    const y = (has(L.down) ? 1 : 0) - (has(L.up) ? 1 : 0) + (e.y || 0);
    return { x: Math.sign(x), y: Math.sign(y) };
  },
  label(seat) { return CONTROL_LAYOUTS[seat] ? CONTROL_LAYOUTS[seat].label : ''; },
  button(seat) { return CONTROL_LAYOUTS[seat] ? CONTROL_LAYOUTS[seat].button : ''; }
};

/**
 * Gamepad API (standard mapping): d-pad (buttons 12-15) or the left stick, and the A button (0). The first press of an unassigned
 * pad claims the next human seat without a pad (that press does nothing else). Polled once per frame; `pads` can be injected (tests).
 */
const GamepadInput = {
  deadzone: 0.5,
  read(pad) {
    const b = (k) => !!(pad.buttons[k] && pad.buttons[k].pressed);
    const ax = pad.axes || [];
    const x = (b(15) ? 1 : 0) - (b(14) ? 1 : 0) + (ax[0] > this.deadzone ? 1 : ax[0] < -this.deadzone ? -1 : 0);
    const y = (b(13) ? 1 : 0) - (b(12) ? 1 : 0) + (ax[1] > this.deadzone ? 1 : ax[1] < -this.deadzone ? -1 : 0);
    return { x: Math.sign(x), y: Math.sign(y), button: b(0) };
  },
  poll(game, pads = null) {
    let list = pads;
    if (!list) { try { list = navigator.getGamepads ? Array.from(navigator.getGamepads()) : []; } catch (e) { list = []; } }
    game.padSeats = game.padSeats || {}; game.padPrev = game.padPrev || {}; game.padHeld = {};
    list.forEach((pad) => {
      if (!pad || pad.connected === false) return;
      const now = this.read(pad); const prev = game.padPrev[pad.index] || { x: 0, y: 0, button: false };
      game.padPrev[pad.index] = now;
      let seat = game.padSeats[pad.index];
      if (seat === undefined) {
        if (!now.button || prev.button) return;
        if (game.isDemo && game.isDemo()) { game.goTitle(); return; }
        const taken = Object.values(game.padSeats);
        seat = [0, 1, 2, 3].slice(0, game.seatCount()).find((k) => !taken.includes(k));
        if (seat !== undefined) game.padSeats[pad.index] = seat;
        return;
      }
      game.padHeld[seat] = { x: now.x, y: now.y };
      const pid = game.pidOfSeat(seat); if (!pid) return;
      if (now.button && !prev.button) game.playerButton(pid);
      if (now.y && now.y !== prev.y) game.playerDir(pid, now.y < 0 ? 'up' : 'down');
      if (now.x && now.x !== prev.x) game.playerDir(pid, now.x < 0 ? 'left' : 'right');
    });
  }
};
