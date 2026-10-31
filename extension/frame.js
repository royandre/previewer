// Phone frame geometry and artwork, built from a device entry in devices.json.
//
// The frame is described once as a list of simple shapes. The overlay renders
// those shapes as inline SVG, and the screenshot code draws the same shapes on a
// canvas, so the saved PNG matches what is on screen with clean transparent edges.
//
// Classic script (not a module): it is injected into pages with
// chrome.scripting.executeScript and loaded with node:vm in the unit tests.
(function (root) {
  'use strict';

  // How far the side buttons stick out of the phone body, in CSS px.
  const BUTTON_DEPTH = 3;

  function geometry(device) {
    const { bezel } = device.frame;
    const bodyWidth = device.viewport.width + bezel.left + bezel.right;
    const bodyHeight = device.viewport.height + bezel.top + bezel.bottom;
    return {
      width: bodyWidth + BUTTON_DEPTH * 2,
      height: bodyHeight,
      bodyWidth,
      bodyHeight,
      screen: {
        x: BUTTON_DEPTH + bezel.left,
        y: bezel.top,
        width: device.viewport.width,
        height: device.viewport.height,
      },
    };
  }

  function rect(x, y, width, height, radius, fill, extra) {
    return { type: 'rect', x, y, width, height, radius: Math.max(0, radius), fill, ...extra };
  }

  function frameShapes(device) {
    const f = device.frame;
    const g = geometry(device);
    const shapes = [];

    for (const b of f.buttons) {
      const x = b.side === 'left' ? 0 : g.width - BUTTON_DEPTH - 2;
      shapes.push(rect(x, b.top, BUTTON_DEPTH + 2, b.length, 1.5, f.edge));
    }

    const x = BUTTON_DEPTH;
    const r = f.bodyRadius;
    shapes.push(rect(x, 0, g.bodyWidth, g.bodyHeight, r, f.edge));
    shapes.push(rect(x + 1.5, 1.5, g.bodyWidth - 3, g.bodyHeight - 3, r - 1.5, f.color));
    shapes.push(rect(x + f.rim, f.rim, g.bodyWidth - f.rim * 2, g.bodyHeight - f.rim * 2, r - f.rim, f.front));
    shapes.push(rect(g.screen.x, g.screen.y, g.screen.width, g.screen.height, f.screenRadius, '#000'));

    const cx = x + g.bodyWidth / 2;
    if (f.earpiece) {
      const cy = f.bezel.top / 2;
      const e = f.earpiece;
      shapes.push(rect(cx - e.width / 2, cy - e.height / 2, e.width, e.height, e.height / 2, e.color));
      shapes.push({ type: 'circle', cx: cx - e.width / 2 - 26, cy, r: 5, fill: '#2b2f3a' });
    }
    // Tablets have the front camera on one edge, centred in the bezel.
    const camera = {
      top: [cx, f.bezel.top / 2],
      right: [x + g.bodyWidth - f.bezel.right / 2, g.bodyHeight / 2],
    }[f.camera?.edge];
    if (camera) shapes.push({ type: 'circle', cx: camera[0], cy: camera[1], r: 3.5, fill: '#2b2f3a' });
    if (f.homeButton) {
      shapes.push({
        type: 'circle',
        cx,
        cy: g.bodyHeight - f.bezel.bottom / 2,
        r: f.homeButton.radius,
        fill: f.front,
        stroke: f.homeButton.ring,
        strokeWidth: 2,
      });
    }
    return shapes;
  }

  function toSvg(shapes, width, height) {
    const parts = shapes.map((s) => {
      const stroke = s.stroke ? ` stroke="${s.stroke}" stroke-width="${s.strokeWidth}"` : '';
      if (s.type === 'circle') return `<circle cx="${s.cx}" cy="${s.cy}" r="${s.r}" fill="${s.fill}"${stroke}/>`;
      return `<rect x="${s.x}" y="${s.y}" width="${s.width}" height="${s.height}" rx="${s.radius}" fill="${s.fill}"${stroke}/>`;
    });
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" aria-hidden="true">${parts.join('')}</svg>`;
  }

  function drawShapes(ctx, shapes, scale) {
    for (const s of shapes) {
      ctx.beginPath();
      if (s.type === 'circle') ctx.arc(s.cx * scale, s.cy * scale, s.r * scale, 0, Math.PI * 2);
      else ctx.roundRect(s.x * scale, s.y * scale, s.width * scale, s.height * scale, s.radius * scale);
      ctx.fillStyle = s.fill;
      ctx.fill();
      if (s.stroke) {
        ctx.strokeStyle = s.stroke;
        ctx.lineWidth = s.strokeWidth * scale;
        ctx.stroke();
      }
    }
  }

  root.PreviewerFrame = { BUTTON_DEPTH, geometry, frameShapes, toSvg, drawShapes };
})(globalThis);
