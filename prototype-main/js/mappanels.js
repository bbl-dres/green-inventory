// ═══════════════════════════════════════════════════════════════════════════
// MAP PANELS — the legend list and the feature card, shared by the main map
// (map.js) and the Situationsplan of the Standort detail page (standort.js).
// Builders that return HTML, plus one small controller for the card.  Each
// page keeps its own state and decides what a change means (map filters,
// URL, table, …); nothing here knows about a map.
// Depends on: config.js (LEGEND_GROUPS, legendKeyFor, legendGroupOfProfile,
//               profileDomain, profilStyle, fmtNum),
//             util.js (escapeHtml, icon, swatches, isUnset, fmtAreaM2,
//               fmtDate, fmtThousand)
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// LEGEND
// ═══════════════════════════════════════════════════════════════════════════
// Resolve LEGEND_GROUPS (config.js) against a set of features: profile rows
// get their label from the codelists and their style from care_profiles.json;
// rows without a single feature are left out.  The order is the curated one
// from config.js (the printed plan's), not a count ranking.
//   → [{ id, label, items: [{ key, entity_type, code, domain, label,
//                              style | swatch, info, group }] }]
function buildLegendGroups(features, codelists) {
  codelists = codelists || {};
  const counts = {};
  for (const f of features) {
    const key = legendKeyFor(f.properties.entity_type, f.properties.fk_profil);
    if (key) counts[key] = (counts[key] || 0) + 1;
  }
  const groups = [];
  for (const grp of LEGEND_GROUPS) {
    const items = [];
    for (const part of grp.parts) {
      if (part.profileCodes) {
        const domain = profileDomain(part.entity_type);
        const labels = codelists[domain] || {};
        for (const code of part.profileCodes) {
          const key = part.entity_type + ':' + code;
          if (!counts[key]) continue;
          items.push({
            key, entity_type: part.entity_type, code, domain,
            label: labels[code] || labels[String(code)] || ('Profil ' + code),
            style: profilStyle(part.entity_type, code),
          });
        }
      } else if (counts[part.entity_type]) {
        items.push({
          key: part.entity_type, entity_type: part.entity_type, code: null, domain: null,
          label: part.label, swatch: part.swatch, info: part.info || null,
        });
      }
    }
    if (items.length) groups.push({ id: grp.id, label: grp.label, items });
  }
  for (const g of groups) for (const it of g.items) it.group = g;
  return groups;
}

// row key → legend row
function legendItemsByKey(groups) {
  const out = {};
  for (const g of groups) for (const it of g.items) out[it.key] = it;
  return out;
}

// Profile codes switched off, per code list (idPPy = areas, idPP = points).
function legendHiddenCodes(hidden, byKey) {
  const out = { idPPy: [], idPP: [] };
  for (const key of hidden) {
    const it = byKey[key];
    if (it && it.code != null) out[it.domain].push(it.code);
  }
  return out;
}

// A group's eye is derived from its rows: all on · some on · all off.
function legendGroupState(g, hidden) {
  const off = g.items.filter(it => hidden.has(it.key)).length;
  return off === 0 ? 'on' : off === g.items.length ? 'off' : 'mixed';
}

function legendItemSwatch(it, mini) {
  return it.style ? swatchHtml(it.style, mini) : staticSwatchHtml(it.swatch, mini);
}
// Up to three mini swatches that look different from one another.
function legendMinis(g) {
  const seen = new Set();
  const out = [];
  for (const it of g.items) {
    const html = legendItemSwatch(it, true);
    if (!html || seen.has(html)) continue;
    seen.add(html);
    out.push(html);
    if (out.length === 3) break;
  }
  return out.join('');
}

// The legend list.
// Group row:   eye (all on · some on · all off) · up to three mini swatches ·
//              label · chevron.  One group is open at a time.
// Profile row: eye · swatch · label (one line) · ⓘ.  No counts anywhere.
//   state  { hidden: Set of row keys, open: group id | null, infoKey }
//   opts   { info: rows get the ⓘ button,
//            outTag: rows carry the «ausserhalb» tag (shown by the class `out`) }
// Buttons carry data-act (group-eye · group-open · item-eye · item-info) with
// data-gid / data-key, and data-focus so a re-render can restore the focus.
function legendListHtml(groups, state, opts = {}) {
  let html = '';
  for (const g of groups) {
    const st = legendGroupState(g, state.hidden);
    const open = state.open === g.id;
    const gid = escapeHtml(g.id);
    const label = escapeHtml(g.label);
    const eyeLabel = (st === 'off' ? 'Alle einblenden: ' : 'Alle ausblenden: ') + label +
      (st === 'mixed' ? ' (teilweise sichtbar)' : '');
    let items = '';
    if (open) {
      for (const it of g.items) {
        const off = state.hidden.has(it.key);
        const key = escapeHtml(it.key);
        const name = escapeHtml(it.label);
        items += `
          <div class="lg-item${off ? ' off' : ''}${state.infoKey === it.key ? ' info-active' : ''}" data-key="${key}">
            <button type="button" class="lg-eye sm" data-act="item-eye" data-key="${key}" data-focus="ie:${key}"
              aria-pressed="${!off}" aria-label="${off ? 'Einblenden' : 'Ausblenden'}: ${name}">${icon(off ? 'eyeOff' : 'eye', 14)}</button>
            <span class="lg-item-main">${legendItemSwatch(it, false)}<span class="lg-item-label" title="${name}">${name}</span>${opts.outTag ? '<span class="lg-out-tag" title="nicht im Kartenausschnitt">ausserhalb</span>' : ''}</span>
            ${opts.info ? `<button type="button" class="lg-info" data-act="item-info" data-key="${key}" data-focus="ii:${key}"
              aria-haspopup="dialog" aria-label="Info zu ${name}">${icon('info', 16)}</button>` : ''}
          </div>`;
      }
    }
    html += `
      <div class="lg-group${open ? ' open' : ''}${st === 'off' ? ' off' : ''}" data-gid="${gid}">
        <div class="lg-row">
          <button type="button" class="lg-eye${st === 'mixed' ? ' mixed' : ''}" data-act="group-eye" data-gid="${gid}" data-focus="ge:${gid}"
            aria-pressed="${st === 'on' ? 'true' : st === 'off' ? 'false' : 'mixed'}" aria-label="${eyeLabel}">${icon(st === 'off' ? 'eyeOff' : 'eye', 16)}</button>
          <button type="button" class="lg-open" data-act="group-open" data-gid="${gid}" data-focus="go:${gid}"
            aria-expanded="${open}"${open ? ` aria-controls="lg-items-${gid}"` : ''}>
            <span class="lg-minis">${legendMinis(g)}</span>
            <span class="lg-group-label">${label}</span>
            <span class="lg-chev">${icon('chevRight', 14)}</span>
          </button>
        </div>
        ${open ? `<div class="lg-items" id="lg-items-${gid}">${items}</div>` : ''}
      </div>`;
  }
  return html;
}

// Group eye: anything visible → hide the whole group; all hidden → show all.
function toggleLegendGroupKeys(g, hidden) {
  const hide = legendGroupState(g, hidden) !== 'off';
  for (const it of g.items) {
    if (hide) hidden.add(it.key); else hidden.delete(it.key);
  }
}

// Header sub-line («2 Profile ausgeblendet · Alle einblenden») and the pill
// (#legend-sub, #legend-sub-text, #legend-pill-note, #legend-pill-minis).
function updateLegendSummary(groups, hidden, byKey) {
  const n = hidden.size;
  const onlyProfiles = [...hidden].every(k => byKey[k] && byKey[k].code != null);
  const noun = onlyProfiles ? (n === 1 ? 'Profil' : 'Profile') : (n === 1 ? 'Ebene' : 'Ebenen');
  const sub = document.getElementById('legend-sub');
  if (sub) {
    sub.hidden = n === 0;
    document.getElementById('legend-sub-text').textContent = n + ' ' + noun + ' ausgeblendet';
  }
  const pillNote = document.getElementById('legend-pill-note');
  if (pillNote) pillNote.textContent = n > 0 ? '· ' + n + ' ausgeblendet' : '';
  // The pill previews the first three groups' colours.
  const minis = document.getElementById('legend-pill-minis');
  if (minis && !minis.dataset.done && groups.length) {
    const picks = ['baum', 'wiesen', 'rabatten'].map(id => groups.find(g => g.id === id)).filter(Boolean);
    const shown = picks.length === 3 ? picks : groups.slice(0, 3);
    minis.innerHTML = shown.map(g => legendItemSwatch(g.items[0], true)).join('');
    minis.dataset.done = '1';
  }
}

// The legend as a plain key — every row visible, grouped under captions, no
// controls (print, and where there is no room for the floating card).
function legendKeyHtml(groups, hidden) {
  return groups.map(g => `
    <div class="pk-group">
      <div class="pk-cap">${escapeHtml(g.label)}</div>
      ${g.items.map(it => `<div class="pk-item${hidden && hidden.has(it.key) ? ' off' : ''}">${legendItemSwatch(it, false)}<span>${escapeHtml(it.label)}</span></div>`).join('')}
    </div>`).join('');
}

// ═══════════════════════════════════════════════════════════════════════════
// FEATURE CARD
// ───────────────────────────────────────────────────────────────────────────
// The selected feature is described in a card docked in the map's top-right
// corner: a few facts in a fixed order, everything else behind «Weitere
// Attribute», and one or two actions.  When a click hits several features the
// card pages through them.
// ═══════════════════════════════════════════════════════════════════════════

// Type line + title of a feature.  No subtitle: what used to be one is a fact.
function cardHeading(p) {
  const group = legendGroupOfProfile(p.entity_type, p.fk_profil);
  switch (p.entity_type) {
    case 'site':
    case 'site_location':
      return { type: 'Standort', title: p.name || p.site_name || '–' };
    case 'parcel': {
      const muni = p.municipality_name || (p.municipality_bfs != null ? 'BFS ' + p.municipality_bfs : null);
      return { type: 'Grundstück', title: [muni, p.parcel_number].filter(Boolean).join(' ') || p.egrid || '–' };
    }
    case 'tree':
      return { type: 'Baum', title: p.baumart || p.profil_label || 'Baum' };
    case 'area':
      return { type: 'Fläche', title: (group && group.singular) || p.profil_label || 'Ohne Profil' };
    default:
      return { type: (group && group.singular) || 'Punktelement', title: p.profil_label || 'Ohne Profil' };
  }
}

// Zero and "nicht erfasst" are placeholders in the survey data, not values.
function _cardBlank(v) {
  return isUnset(v) || v === 0 || String(v).trim() === '0';
}

// The facts of a card, in ONE fixed order for every type:
//   Standort · Grundstück ERP · Grundstück AV · Adresse · Profil ·
//   Pflegeklasse · Verantwortlich · Los · Fläche (always last)
// A missing value drops its row; the order of the others never changes.
// Only the feature's own attributes — no counts or sums over children.
function cardFacts(p) {
  const et = p.entity_type;
  const isSite = et === 'site' || et === 'site_location';
  const isParcel = et === 'parcel';
  const isElement = !isSite && !isParcel;
  const rows = [];
  const add = (label, value) => { if (!_cardBlank(value)) rows.push([label, value]); };

  if (isParcel) add('Standort', p.site_names ? p.site_names.split(' · ') : p.site_name);
  else if (isElement) add('Standort', p.site_name);
  // ERP manages parcels, not Standorte: the keys appear on parcels and on
  // the elements that stand on them.  «Grundstück AV» is the EGRID.
  if (!isSite) { add('Grundstück ERP', p.erp_id); add('Grundstück AV', p.egrid); }
  if (isSite) add('Adresse', p.adresse);
  if (isElement) {
    add('Profil', p.profil_label);
    add('Pflegeklasse', p.pflegeklasse);          // effective: the element's, else its Standort's
  }
  if (!isParcel) add('Verantwortlich', p.pflegeverantwortung);
  if (isSite) add('Los', p.lose);
  if (isSite || isParcel) add('Fläche', fmtAreaM2(p.area_m2, 0));
  else if (et === 'area') add('Fläche', fmtAreaM2(p.area_m2, 1));
  return rows;
}

// Everything else that is filled in — technical ids, measures, coordinates,
// remarks, source — behind the «Weitere Attribute» disclosure.
function cardMoreFacts(p) {
  const et = p.entity_type;
  const isSite = et === 'site' || et === 'site_location';
  const isParcel = et === 'parcel';
  const isElement = !isSite && !isParcel;
  const rows = [];
  const add = (label, value) => { if (!_cardBlank(value)) rows.push([label, value]); };
  const metres = (v, d) => (v == null || v === '') ? null : fmtNum(v, d) + ' m';

  // Identifiers are always labelled neutrally «ID».
  if (isSite) add('ID', p.objektnummer);
  else if (et === 'tree') add('ID', p.baumnummer != null ? p.baumnummer : p.fid);
  else if (isElement) add('ID', p.fid);

  if (isSite) {
    add('Pflegeklasse (Vorgabe)', p.pflegeklasse);
    add('Eigentümer', p.eigentuemer);
    add('Kontrolle', p.kontrolle);
    add('Reinigung', p.reinigung);
    add('Parzelle (erfasst)', p.parzelle);
    add('Baujahr', p.erstellungsjahr);
    add('Erfasst', fmtDate(p.erfassungsdatum));
    add('Umfang', metres(p.shape_length_m, 1));
  }
  if (isParcel) {
    add('Parzelle', p.parcel_number);
    add('Gemeinde', p.municipality_name);
    add('Kanton', p.canton);
    add('Nummerierungsbereich', p.numbering_area);
    add('ERP-Bezeichnung', p.erp_name);
    add('ERP weitere Objekte', p.erp_alternatives);
    add('Hist. Garten (ERP)', p.erp_historic_garden);
    add('Eigentümer', p.eigentuemer);
    add('Umfang', metres(p.shape_length_m, 1));
  }
  if (isElement) {
    add('Standort-ID', p.site_objektnummer);
    add('Los', p.site_lose);
    if (et !== 'tree') add('Baumart', p.baumart);
    add('Aufwandsfaktor', p.aufwandsfaktor);
    add('Winterdienst', p.winterdienst);
    add('Bewässerung', p.bewaesserung_label);
    add('Lauben', p.lauben);
    add('Ausmass', p.ausmass);
    add('Durchmesser', metres(p.crown_diameter_m, 1));   // circular areas only
    add('Max. Höhe', metres(p.max_hoehe_m, 1));
    add('Umfang', metres(p.geom_length_m, 1));
  }
  // LV95 pair ("<Ost>, <Nord>"): Standorte carry their representative point,
  // trees and points their own coordinate.
  const E = p.lv95_east != null ? p.lv95_east : p.lv95_east_centroid;
  const N = p.lv95_north != null ? p.lv95_north : p.lv95_north_centroid;
  if (E != null && N != null) add('LV95', fmtThousand(E) + ', ' + fmtThousand(N));
  add('Bemerkung', p.bemerkung);
  add('Letzte Änderung', fmtDate(p.letzte_aenderung));
  add('Quelle', p.source);
  return rows;
}

function _dlRows(rows) {
  return rows.map(([k, v]) =>
    `<dt>${escapeHtml(k)}</dt><dd>${Array.isArray(v) ? v.map(escapeHtml).join('<br>') : escapeHtml(v)}</dd>`
  ).join('');
}

// Controller of one card element.
//   opts.el              the card (.fcard)
//   opts.mapEl           gets the class `has-card` while a card is shown
//   opts.feature(idx)    → GeoJSON feature
//   opts.detailLink(p)   → { href, sameTab } | null: the primary action (the
//                          Standort detail page).  Without it the zoom button
//                          carries its label instead of standing alone.
//   opts.onPage(idx, stack)  another feature of the stack was chosen
//   opts.onClose()
//   opts.onZoom(idx)
//   opts.onDetailClick(e)    optional, before the link is followed
// → { show(idx, stack), hide(), refresh(), isOpen(), current() }
function createFeatureCard(opts) {
  const el = opts.el;
  let stack = [];        // feature indices under the last click, in paging order
  let pos = 0;           // position of the shown feature in the stack
  let moreOpen = false;  // «Weitere Attribute» expanded
  let shown = null;      // feature index of the card, null = no card

  function render() {
    const f = shown === null ? null : opts.feature(shown);
    if (opts.mapEl) opts.mapEl.classList.toggle('has-card', !!f);
    if (!f) { el.hidden = true; el.innerHTML = ''; return; }

    const p = f.properties;
    const head = cardHeading(p);
    const facts = cardFacts(p);
    const more = cardMoreFacts(p);
    const n = stack.length;
    const paged = n > 1;
    const titleAt = (i) => cardHeading(opts.feature(stack[i]).properties).title;
    const nextTitle = paged && pos < n - 1 ? titleAt(pos + 1) : null;
    const prevTitle = paged && pos > 0 ? titleAt(pos - 1) : null;
    const closeBtn = `<button type="button" class="icon-ghost fcard-close" data-act="close" aria-label="Schliessen">${icon('close', 16)}</button>`;
    const link = opts.detailLink ? opts.detailLink(p) : null;

    el.innerHTML = `
    <div class="sheet-grabber" aria-hidden="true"></div>
    ${paged ? `<div class="fcard-pager">
      <span class="fcard-pager-text">${n} Objekte an dieser Stelle</span>
      <button type="button" class="icon-ghost fcard-nav" data-act="prev" data-focus="prev"
        aria-label="Vorheriges Objekt${prevTitle ? ': ' + escapeHtml(prevTitle) : ''}"${pos === 0 ? ' disabled' : ''}>${icon('chevLeft', 14, 2.5)}</button>
      <span class="fcard-pager-pos" aria-live="polite">${pos + 1} / ${n}</span>
      <button type="button" class="icon-ghost fcard-nav" data-act="next" data-focus="next"
        aria-label="Nächstes Objekt${nextTitle ? ': ' + escapeHtml(nextTitle) : ''}"${pos === n - 1 ? ' disabled' : ''}>${icon('chevRight', 14, 2.5)}</button>
      ${closeBtn}
    </div>` : ''}
    <div class="fcard-head">
      ${featureSwatchHtml(p)}
      <div class="fcard-titles">
        <div class="fcard-type">${escapeHtml(head.type)}</div>
        <h2 class="fcard-title" id="fcard-title">${escapeHtml(head.title)}</h2>
      </div>
      ${paged ? '' : closeBtn}
    </div>
    <div class="fcard-body">
      <dl class="dl-grid">${_dlRows(facts)}</dl>
      ${more.length ? `
      <button type="button" class="fcard-more-btn" data-act="more" data-focus="more"
        aria-expanded="${moreOpen}" aria-controls="fcard-more">${icon('chevRight', 12, 2.5)}Weitere Attribute</button>
      <dl class="dl-grid fcard-more" id="fcard-more"${moreOpen ? '' : ' hidden'}>${_dlRows(more)}</dl>` : ''}
    </div>
    <div class="fcard-actions">
      ${link ? `<a class="btn btn-primary fcard-detail" href="${escapeHtml(link.href)}"${link.sameTab ? '' : ' target="_blank" rel="noopener"'}
        aria-label="Standort-Details${link.sameTab ? '' : ', öffnet in neuem Tab'}">Standort-Details${icon('external', 14)}</a>
      <button type="button" class="btn btn-icon" data-act="zoom" data-focus="zoom"
        aria-label="Auf Objekt zoomen" title="Auf Objekt zoomen">${icon('zoomIn', 16)}</button>`
      : `<button type="button" class="btn fcard-zoom" data-act="zoom" data-focus="zoom">${icon('zoomIn', 16)}Auf Objekt zoomen</button>`}
    </div>`;
    el.hidden = false;
  }

  // Show another feature of the stack under the last click.
  function page(delta) {
    const next = pos + delta;
    if (next < 0 || next >= stack.length) return;
    opts.onPage(stack[next], stack);
  }

  el.addEventListener('click', (e) => {
    if (e.target.closest('.fcard-detail')) {
      if (opts.onDetailClick) opts.onDetailClick(e);
      return;
    }
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const focusKey = btn.dataset.focus;
    switch (btn.dataset.act) {
      case 'close': opts.onClose(); return;
      case 'prev':  page(-1); break;
      case 'next':  page(1); break;
      case 'zoom':  opts.onZoom(shown); return;
      case 'more':  moreOpen = !moreOpen; render(); break;
    }
    // The card was re-rendered: put the focus back on the control that was
    // used (or its counterpart when it is disabled at the end of the stack).
    let again = focusKey && el.querySelector(`[data-focus="${focusKey}"]`);
    if (again && again.disabled) again = el.querySelector('.fcard-nav:not([disabled])');
    if (again) again.focus();
  });
  // ← / → page through stacked objects while the focus is inside the card.
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { opts.onClose(); return; }
    if (stack.length < 2 || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
    e.preventDefault();
    const key = e.key === 'ArrowLeft' ? 'prev' : 'next';
    page(key === 'prev' ? -1 : 1);
    const btn = el.querySelector(`[data-focus="${key}"]:not([disabled])`) || el.querySelector('.fcard-nav:not([disabled])');
    if (btn) btn.focus();
  });

  return {
    //   stk   feature indices to page through (default: just this feature)
    show(idx, stk) {
      stack = (stk && stk.includes(idx)) ? stk.slice() : [idx];
      pos = stack.indexOf(idx);
      moreOpen = false;
      shown = idx;
      render();
    },
    hide() {
      shown = null; stack = []; pos = 0;
      render();
    },
    // Same card again, e.g. when the link target changes with the layout tier.
    refresh() { if (shown !== null) render(); },
    isOpen: () => shown !== null,
    current: () => shown,
  };
}
