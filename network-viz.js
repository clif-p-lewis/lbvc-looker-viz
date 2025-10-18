/* network-viz.js — self-contained loader + viz code
   - Loads dscc from Google’s official minified bundle
   - Loads d3 v7
   - Renders a force-directed graph with data-driven node/link styling
*/

/* === Loaders (no edits needed) === */
function loadScriptOnce(src, globalCheck, cb) {
  if (globalCheck()) return cb && cb();
  var s = document.createElement('script');
  s.src = src;
  s.async = true;
  s.onload = function () { cb && cb(); };
  s.onerror = function (e) { console.error('Failed loading', src, e); };
  document.head.appendChild(s);
}

function ensureDSCC(cb) {
  loadScriptOnce(
    // Official dscc minified bundle from Google’s developer tooling
    // (linked from the Looker Studio dscc library “Download” section)
    'https://raw.githubusercontent.com/googledatastudio/tooling/master/packages/ds-component/_bundles/dscc.min.js',
    function () { return !!(window.dscc && dscc.subscribeToData); },
    cb
  );
}

function ensureD3(cb) {
  loadScriptOnce(
    'https://unpkg.com/d3@7.9.0/dist/d3.min.js',
    function () { return !!window.d3; },
    cb
  );
}

/* === Render target === */
const ROOT_ID = 'force-net-root';
let root = document.getElementById(ROOT_ID);
if (!root) {
  root = document.createElement('div');
  root.id = ROOT_ID;
  root.style.width = '100%';
  root.style.height = '100%';
  root.style.overflow = 'hidden';
  document.body.appendChild(root);
}

/* === Utils === */
const toNum = v => (v == null || v === '' || isNaN(+v) ? null : +v);

function getStyleColor(styleEntry, fallback) {
  const c = styleEntry && (styleEntry.value?.color || styleEntry.defaultValue?.color);
  return c || fallback;
}

/* === Main draw === */
function draw(payload) {
  const width = (window.dscc && dscc.getWidth) ? dscc.getWidth() : root.clientWidth;
  const height = (window.dscc && dscc.getHeight) ? dscc.getHeight() : root.clientHeight;

  root.innerHTML = '';
  const svg = d3.select(root).append('svg').attr('width', width).attr('height', height);
  const g = svg.append('g');

  // Zoom & pan
  svg.call(d3.zoom().on('zoom', (event) => {
    g.attr('transform', event.transform);
  }));

  const style = payload.style || {};

  const defaultNodeColor = getStyleColor(style.defaultNodeFill, '#4e79a7');
  const defaultLinkColor = getStyleColor(style.defaultLinkColor, '#999');
  const defaultLinkWidth = style.defaultLinkWidth?.value ?? 1;
  const chargeStrength = style.chargeStrength?.value ?? -50;
  const linkDistance = style.linkDistance?.value ?? 50;
  const nodeMinSize = style.nodeMinSize?.value ?? 4;
  const nodeMaxSize = style.nodeMaxSize?.value ?? 24;
  const showLabels = style.showLabels?.value ?? true;

  // Table format (dscc.tableTransform)
  const table = (payload.tables && (payload.tables.DEFAULT || payload.tables.default)) || { rows: [], fields: [] };
  const rows = table.rows || [];
  const fields = table.fields || [];

  const fieldIndexById = {};
  fields.forEach((f, i) => { fieldIndexById[f.id] = i; });

  // Helper to read a value by config id
  function val(row, configId) {
    const arr = payload.fields?.[configId] || [];
    if (!arr.length) return null;
    const fieldId = arr[0].id;
    const idx = fieldIndexById[fieldId];
    if (idx == null) return null;
    return row.values[idx];
  }

  const nodeMap = new Map();
  const links = [];

  rows.forEach(row => {
    const s = val(row, 'src');
    const t = val(row, 'dst');
    if (s == null || t == null) return;

    const nSize       = toNum(val(row, 'nodeSize'));
    const nColorMet   = toNum(val(row, 'nodeColor'));
    const eWeight     = toNum(val(row, 'edgeWeight'));
    const eColorMet   = toNum(val(row, 'edgeColor'));
    const group       = val(row, 'nodeGroup');

    if (!nodeMap.has(s)) nodeMap.set(s, { id: s, group, size: nSize, colorMetric: nColorMet });
    if (!nodeMap.has(t)) nodeMap.set(t, { id: t, group, size: nSize, colorMetric: nColorMet });

    links.push({ source: s, target: t, weight: eWeight, colorMetric: eColorMet });
  });

  const nodes = Array.from(nodeMap.values());

  // Scales
  const sizeVals = nodes.map(d => d.size).filter(v => v != null);
  const sizeScale = sizeVals.length
    ? d3.scaleLinear().domain(d3.extent(sizeVals)).range([nodeMinSize, nodeMaxSize])
    : () => nodeMinSize;

  const nodeColorVals = nodes.map(d => d.colorMetric).filter(v => v != null);
  const nodeColorScale = nodeColorVals.length
    ? d3.scaleSequential(d3.interpolateBlues).domain(d3.extent(nodeColorVals))
    : () => defaultNodeColor;

  const edgeWVals = links.map(l => l.weight).filter(v => v != null);
  const edgeWidthScale = edgeWVals.length
    ? d3.scaleLinear().domain(d3.extent(edgeWVals)).range([0.5, Math.max(2, defaultLinkWidth)])
    : () => defaultLinkWidth;

  const edgeColorVals = links.map(l => l.colorMetric).filter(v => v != null);
  const edgeColorScale = edgeColorVals.length
    ? d3.scaleSequential(d3.interpolateGreys).domain(d3.extent(edgeColorVals))
    : () => defaultLinkColor;

  // Draw
  const link = g.append('g')
    .attr('stroke-linecap', 'round')
    .selectAll('line')
    .data(links)
    .join('line')
    .attr('stroke', d => edgeColorVals.length ? edgeColorScale(d.colorMetric ?? 0) : defaultLinkColor)
    .attr('stroke-width', d => edgeWidthScale(d.weight ?? 0));

  const node = g.append('g')
    .selectAll('circle')
    .data(nodes)
    .join('circle')
    .attr('r', d => sizeScale(d.size ?? 0))
    .attr('fill', d => nodeColorVals.length ? nodeColorScale(d.colorMetric ?? 0) : defaultNodeColor)
    .call(d3.drag()
      .on('start', (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x; d.fy = d.y;
      })
      .on('drag', (event, d) => {
        d.fx = event.x; d.fy = event.y;
      })
      .on('end', (event, d) => {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null; d.fy = null;
      })
    );

  const labels = showLabels ? g.append('g')
    .selectAll('text')
    .data(nodes)
    .join('text')
    .text(d => d.id)
    .attr('font-size', 10)
    .attr('dy', '0.31em') : null;

  const simulation = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(links).id(d => d.id).distance(linkDistance))
    .force('charge', d3.forceManyBody().strength(chargeStrength))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .on('tick', () => {
      link
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y);
      node
        .attr('cx', d => d.x)
        .attr('cy', d => d.y);
      if (labels) {
        labels
          .attr('x', d => d.x + 8)
          .attr('y', d => d.y);
      }
    });
}

/* === Wire it up === */
function start() {
  ensureDSCC(function () {
    ensureD3(function () {
      if (window.dscc && dscc.subscribeToData) {
        dscc.subscribeToData(draw, { transform: dscc.tableTransform });
      } else {
        console.error('dscc not available.');
      }
    });
  });
}
start();
