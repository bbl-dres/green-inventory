// Device matrix.  CSS viewport = physical resolution ÷ OS scaling, minus
// browser chrome (Chrome on Windows ≈ 87 px tabs + toolbar, Windows 11
// taskbar 48 px; Safari iOS bars; Chrome Android top bar + system bars).
module.exports = [
  // Desktop / laptop (mouse, hover)
  { id: 'd-4k100',   group: 'desktop', label: '4K 32" @100%',                  w: 3840, h: 2025, dpr: 1 },
  { id: 'd-4k150',   group: 'desktop', label: '4K 27" @150% (=1440p CSS)',     w: 2560, h: 1305, dpr: 1.5 },
  { id: 'd-fhd100',  group: 'desktop', label: 'FHD 24" @100%',                 w: 1920, h: 945,  dpr: 1 },
  { id: 'd-mba',     group: 'desktop', label: 'MacBook Air 13" (Safari viewport)', w: 1470, h: 832,  dpr: 2 },
  { id: 'd-fhd125',  group: 'desktop', label: 'FHD laptop @125%',              w: 1536, h: 729,  dpr: 1.25 },
  { id: 'd-hd100',   group: 'desktop', label: 'HD laptop 1366×768 @100%',      w: 1366, h: 633,  dpr: 1 },
  { id: 'd-fhd150',  group: 'desktop', label: 'FHD laptop @150%',              w: 1280, h: 585,  dpr: 1.5 },
  { id: 'd-zoom200', group: 'desktop', label: 'FHD @100% + browser zoom 200%', w: 960,  h: 472,  dpr: 2 },
  // Tablets (touch)
  { id: 't-ipad-l',  group: 'tablet',  label: 'iPad Air landscape',            w: 1180, h: 746,  dpr: 2, touch: true },
  { id: 't-ipad-p',  group: 'tablet',  label: 'iPad Air portrait',             w: 820,  h: 1106, dpr: 2, touch: true },
  { id: 't-mini-p',  group: 'tablet',  label: 'iPad mini portrait',            w: 768,  h: 954,  dpr: 2, touch: true },
  // Phones (touch)
  { id: 'p-promax',  group: 'phone',   label: 'iPhone 15 Pro Max',             w: 430,  h: 740,  dpr: 3, touch: true },
  { id: 'p-pixel',   group: 'phone',   label: 'Pixel 7 (Chrome viewport)',      w: 412,  h: 811,  dpr: 2.625, touch: true },
  { id: 'p-iphone',  group: 'phone',   label: 'iPhone 14 (Safari viewport)',    w: 390,  h: 664,  dpr: 3, touch: true },
  { id: 'p-se',      group: 'phone',   label: 'iPhone SE',                     w: 375,  h: 553,  dpr: 2, touch: true },
  { id: 'p-android', group: 'phone',   label: 'Small Android 360',             w: 360,  h: 640,  dpr: 3, touch: true },
  { id: 'p-320',     group: 'phone',   label: '320 px floor (WCAG reflow)',    w: 320,  h: 460,  dpr: 2, touch: true },
  { id: 'p-land',    group: 'phone',   label: 'iPhone 14 landscape',           w: 844,  h: 340,  dpr: 3, touch: true },
];
