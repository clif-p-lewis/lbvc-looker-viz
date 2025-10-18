// Complete self-contained network visualization for Looker Studio
// Includes embedded dscc and d3 libraries

(function() {
  'use strict';

  // ===== EMBEDDED DSCC LIBRARY =====
  // Minimal dscc implementation for Looker Studio
  const dscc = window.dscc || (window.dscc = {});
  
  dscc.subscribeToData = function(callback, options) {
    window.addEventListener('message', function(event) {
      if (event.data && event.data.type === 'vizData') {
        const data = event.data.data;
        if (options && options.transform === 'tableTransform') {
          callback(transformToTable(data));
        } else {
          callback(data);
        }
      }
    });
    
    // Signal ready
    window.parent.postMessage({type: 'vizReady'}, '*');
  };

  dscc.tableTransform = 'tableTransform';
  
  dscc.getWidth = function() {
    return window.innerWidth || document.documentElement.clientWidth || 600;
  };
  
  dscc.getHeight = function() {
    return window.innerHeight || document.documentElement.clientHeight || 400;
  };

  function transformToTable(data) {
    if (!data || !data.tables || !data.tables.DEFAULT) return data;
    
    const table = data.tables.DEFAULT;
    const fields = data.fields || {};
    
    return {
      tables: { DEFAULT: table },
      fields: fields,
      style: data.style || {},
      theme: data.theme || {}
    };
  }

  // ===== EMBEDDED D3 v7 (MINIMAL FORCE LAYOUT) =====
  // Only the essential d3 functions needed for force-directed graphs
  const d3 = window.d3 || {};
  
  // Basic selection
  d3.select = function(selector) {
    const el = typeof selector === 'string' ? document.querySelector(selector) : selector;
    return {
      append: function(tag) {
        const child = document.createElementNS('http://www.w3.org/2000/svg', tag);
        el.appendChild(child);
        return d3.select(child);
      },
      attr: function(name, value) {
        if (arguments.length === 1) return el.getAttribute(name);
        el.setAttribute(name, typeof value === 'function' ? value() : value);
        return this;
      },
      selectAll: function(selector) {
        const nodes = Array.from(el.querySelectorAll(selector));
        return {
          data: function(data) {
            const update = nodes.map((n, i) => ({node: n, data: data[i]}));
            return {
              join: function(tag) {
                const enter = data.slice(nodes.length).map(d => {
                  const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
                  el.appendChild(n);
                  return {node: n, data: d};
                });
                const all = update.concat(enter);
                return {
                  attr: function(name, fn) {
                    all.forEach(({node, data}) => {
                      node.setAttribute(name, fn(data));
                    });
                    return this;
                  },
                  call: function(fn) {
                    fn(this);
                    return this;
                  },
                  each: function(fn) {
                    all.forEach(({node, data}) => fn.call(node, data));
                    return this;
                  }
                };
              }
            };
          }
        };
      },
      call: function(fn) {
        fn(this);
        return this;
      }
    };
  };

  // Scales
  d3.scaleLinear = function() {
    let domain = [0, 1];
    let range = [0, 1];
    
    const scale = function(x) {
      const t = (x - domain[0]) / (domain[1] - domain[0]);
      return range[0] + t * (range[1] - range[0]);
    };
    
    scale.domain = function(d) {
      if (!arguments.length) return domain;
      domain = d;
      return scale;
    };
    
    scale.range = function(r) {
      if (!arguments.length) return range;
      range = r;
      return scale;
    };
    
    return scale;
  };

  d3.scaleSequential = function(interpolator) {
    let domain = [0, 1];
    
    const scale = function(x) {
      const t = (x - domain[0]) / (domain[1] - domain[0]);
      return interpolator(Math.max(0, Math.min(1, t)));
    };
    
    scale.domain = function(d) {
      if (!arguments.length) return domain;
      domain = d;
      return scale;
    };
    
    return scale;
  };

  // Color interpolators
  d3.interpolateBlues = function(t) {
    const colors = ['#f7fbff', '#deebf7', '#c6dbef', '#9ecae1', '#6baed6', '#4292c6', '#2171b5', '#08519c', '#08306b'];
    const i = Math.floor(t * (colors.length - 1));
    return colors[Math.min(i, colors.length - 1)];
  };

  d3.interpolateGreys = function(t) {
    const v = Math.floor(t * 255);
    return `rgb(${v},${v},${v})`;
  };

  d3.extent = function(arr) {
    if (!arr || !arr.length) return [0, 1];
    let min = arr[0], max = arr[0];
    arr.forEach(v => {
      if (v < min) min = v;
      if (v > max) max = v;
    });
    return [min, max];
  };

  // Force simulation
  d3.forceSimulation = function(nodes) {
    const simulation = {
      nodes: nodes || [],
      forces: {},
      alpha: 1,
      alphaTarget: 0,
      alphaDecay: 0.0228,
      velocityDecay: 0.4,
      listeners: {},
      
      force: function(name, force) {
        if (arguments.length < 2) return simulation.forces[name];
        simulation.forces[name] = force;
        if (force) force.initialize && force.initialize(simulation.nodes);
        return simulation;
      },
      
      alphaTarget: function(target) {
        if (!arguments.length) return simulation.alphaTarget;
        simulation.alphaTarget = target;
        return simulation;
      },
      
      restart: function() {
        simulation.alpha = 1;
        simulation.timer = setInterval(simulation.tick, 16);
        return simulation;
      },
      
      stop: function() {
        clearInterval(simulation.timer);
        return simulation;
      },
      
      on: function(name, callback) {
        simulation.listeners[name] = simulation.listeners[name] || [];
        if (callback) simulation.listeners[name].push(callback);
        return simulation;
      },
      
      tick: function() {
        simulation.alpha += (simulation.alphaTarget - simulation.alpha) * simulation.alphaDecay;
        
        Object.values(simulation.forces).forEach(force => {
          force && force(simulation.alpha);
        });
        
        simulation.nodes.forEach(node => {
          node.vx *= simulation.velocityDecay;
          node.vy *= simulation.velocityDecay;
          node.x += node.vx;
          node.y += node.vy;
        });
        
        if (simulation.listeners.tick) {
          simulation.listeners.tick.forEach(fn => fn());
        }
        
        if (simulation.alpha < 0.001) {
          simulation.stop();
        }
      }
    };
    
    simulation.nodes.forEach(node => {
      node.x = node.x || Math.random() * 600;
      node.y = node.y || Math.random() * 400;
      node.vx = node.vx || 0;
      node.vy = node.vy || 0;
    });
    
    simulation.restart();
    return simulation;
  };

  d3.forceLink = function(links) {
    let nodes = [];
    let distance = 30;
    let strength = 1;
    let id = d => d.id;
    
    function force(alpha) {
      links.forEach(link => {
        const source = link.source;
        const target = link.target;
        let dx = target.x - source.x;
        let dy = target.y - source.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const ratio = ((dist - distance) / dist) * alpha * strength;
        dx *= ratio;
        dy *= ratio;
        target.vx -= dx;
        target.vy -= dy;
        source.vx += dx;
        source.vy += dy;
      });
    }
    
    force.initialize = function(n) {
      nodes = n;
      const nodeById = new Map(nodes.map(d => [id(d), d]));
      links.forEach(link => {
        if (typeof link.source !== 'object') link.source = nodeById.get(link.source);
        if (typeof link.target !== 'object') link.target = nodeById.get(link.target);
      });
    };
    
    force.distance = function(d) {
      if (!arguments.length) return distance;
      distance = d;
      return force;
    };
    
    force.id = function(fn) {
      if (!arguments.length) return id;
      id = fn;
      return force;
    };
    
    return force;
  };

  d3.forceManyBody = function() {
    let strength = -30;
    let nodes = [];
    
    function force(alpha) {
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[j].x - nodes[i].x;
          const dy = nodes[j].y - nodes[i].y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = strength * alpha / (dist * dist);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          nodes[i].vx -= fx;
          nodes[i].vy -= fy;
          nodes[j].vx += fx;
          nodes[j].vy += fy;
        }
      }
    }
    
    force.initialize = function(n) {
      nodes = n;
    };
    
    force.strength = function(s) {
      if (!arguments.length) return strength;
      strength = s;
      return force;
    };
    
    return force;
  };

  d3.forceCenter = function(x, y) {
    let nodes = [];
    
    function force() {
      let sx = 0, sy = 0;
      nodes.forEach(node => {
        sx += node.x;
        sy += node.y;
      });
      sx = sx / nodes.length - x;
      sy = sy / nodes.length - y;
      nodes.forEach(node => {
        node.x -= sx;
        node.y -= sy;
      });
    }
    
    force.initialize = function(n) {
      nodes = n;
    };
    
    return force;
  };

  d3.drag = function() {
    let dragStart, dragMove, dragEnd;
    
    const drag = function(selection) {
      selection.each(function() {
        const el = this;
        let startX, startY, nodeData;
        
        el.addEventListener('mousedown', function(e) {
          e.preventDefault();
          startX = e.clientX;
          startY = e.clientY;
          nodeData = el.__data__;
          if (dragStart) dragStart.call(el, e, nodeData);
          
          document.addEventListener('mousemove', onMove);
          document.addEventListener('mouseup', onEnd);
        });
        
        function onMove(e) {
          if (dragMove && nodeData) {
            dragMove.call(el, {
              x: e.clientX,
              y: e.clientY,
              dx: e.clientX - startX,
              dy: e.clientY - startY
            }, nodeData);
          }
        }
        
        function onEnd(e) {
          if (dragEnd && nodeData) dragEnd.call(el, e, nodeData);
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onEnd);
        }
      });
    };
    
    drag.on = function(name, fn) {
      if (name === 'start') dragStart = fn;
      if (name === 'drag') dragMove = fn;
      if (name === 'end') dragEnd = fn;
      return drag;
    };
    
    return drag;
  };

  d3.zoom = function() {
    let zoomFn;
    
    const zoom = function(selection) {
      const el = selection.node ? selection.node() : selection;
      let scale = 1, translateX = 0, translateY = 0;
      
      el.addEventListener('wheel', function(e) {
        e.preventDefault();
        const delta = e.deltaY;
        const scaleFactor = delta > 0 ? 0.9 : 1.1;
        scale *= scaleFactor;
        
        if (zoomFn) {
          zoomFn.call(el, {
            transform: `translate(${translateX},${translateY}) scale(${scale})`
          });
        }
      });
    };
    
    zoom.on = function(name, fn) {
      if (name === 'zoom') zoomFn = fn;
      return zoom;
    };
    
    return zoom;
  };

  // ===== VISUALIZATION CODE =====
  const rootId = 'force-network-root';
  let root = document.getElementById(rootId);
  if (!root) {
    root = document.createElement('div');
    root.id = rootId;
    root.style.width = '100%';
    root.style.height = '100%';
    root.style.overflow = 'hidden';
    root.style.fontFamily = 'Arial, sans-serif';
    document.body.appendChild(root);
  }

  function getNum(v) {
    return (v == null || v === '' || isNaN(+v)) ? null : +v;
  }

  function getStyleColor(styleObj, fallback) {
    if (!styleObj) return fallback;
    const color = styleObj.value?.color || styleObj.defaultValue?.color;
    return color || fallback;
  }

  function draw(data) {
    const width = dscc.getWidth();
    const height = dscc.getHeight();
    
    root.innerHTML = '';
    
    // Read style settings
    const style = data.style || {};
    const defaultNodeColor = getStyleColor(style.defaultNodeFill, '#4e79a7');
    const defaultLinkColor = getStyleColor(style.defaultLinkColor, '#999999');
    const defaultLinkWidth = style.defaultLinkWidth?.value ?? 1;
    const chargeStrength = style.chargeStrength?.value ?? -50;
    const linkDistance = style.linkDistance?.value ?? 50;
    const nodeMinSize = style.nodeMinSize?.value ?? 4;
    const nodeMaxSize = style.nodeMaxSize?.value ?? 24;
    const showLabels = style.showLabels?.value ?? true;
    
    // Get table data
    const table = data.tables?.DEFAULT || { rows: [], fields: [] };
    const rows = table.rows || [];
    const fields = table.fields || [];
    
    // Build field index
    const fieldIndexById = {};
    fields.forEach((f, i) => {
      fieldIndexById[f.id] = i;
    });
    
    // Helper to get value by config ID
    function getVal(row, configId) {
      const fieldArr = data.fields?.[configId] || [];
      if (!fieldArr.length) return null;
      const fieldId = fieldArr[0].id;
      const idx = fieldIndexById[fieldId];
      if (idx == null) return null;
      return row.values[idx];
    }
    
    // Build graph data
    const nodeMap = new Map();
    const links = [];
    
    rows.forEach(row => {
      const source = getVal(row, 'src');
      const target = getVal(row, 'dst');
      if (!source || !target) return;
      
      const nodeSize = getNum(getVal(row, 'nodeSize'));
      const nodeColor = getNum(getVal(row, 'nodeColor'));
      const edgeWeight = getNum(getVal(row, 'edgeWeight'));
      const edgeColor = getNum(getVal(row, 'edgeColor'));
      
      if (!nodeMap.has(source)) {
        nodeMap.set(source, { 
          id: source, 
          size: nodeSize, 
          colorMetric: nodeColor 
        });
      }
      if (!nodeMap.has(target)) {
        nodeMap.set(target, { 
          id: target, 
          size: nodeSize, 
          colorMetric: nodeColor 
        });
      }
      
      links.push({
        source: source,
        target: target,
        weight: edgeWeight,
        colorMetric: edgeColor
      });
    });
    
    const nodes = Array.from(nodeMap.values());
    
    if (nodes.length === 0) {
      root.innerHTML = '<div style="padding:20px;color:#666;">No data to display. Please map Source and Target fields.</div>';
      return;
    }
    
    // Build scales
    const sizeVals = nodes.map(d => d.size).filter(v => v != null);
    const sizeScale = sizeVals.length > 0
      ? d3.scaleLinear().domain(d3.extent(sizeVals)).range([nodeMinSize, nodeMaxSize])
      : () => nodeMinSize;
    
    const colorVals = nodes.map(d => d.colorMetric).filter(v => v != null);
    const colorScale = colorVals.length > 0
      ? d3.scaleSequential(d3.interpolateBlues).domain(d3.extent(colorVals))
      : () => defaultNodeColor;
    
    const weightVals = links.map(l => l.weight).filter(v => v != null);
    const weightScale = weightVals.length > 0
      ? d3.scaleLinear().domain(d3.extent(weightVals)).range([0.5, Math.max(2, defaultLinkWidth)])
      : () => defaultLinkWidth;
    
    const edgeColorVals = links.map(l => l.colorMetric).filter(v => v != null);
    const edgeColorScale = edgeColorVals.length > 0
      ? d3.scaleSequential(d3.interpolateGreys).domain(d3.extent(edgeColorVals))
      : () => defaultLinkColor;
    
    // Create SVG
    const svg = d3.select(root).append('svg').attr('width', width).attr('height', height);
    const g = svg.append('g');
    
    // Add zoom
    svg.call(d3.zoom().on('zoom', function(event) {
      g.attr('transform', event.transform);
    }));
    
    // Draw links
    const linkElements = [];
    links.forEach(link => {
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('stroke', edgeColorVals.length > 0 
        ? edgeColorScale(link.colorMetric ?? 0) 
        : defaultLinkColor);
      line.setAttribute('stroke-width', weightScale(link.weight ?? 0));
      line.setAttribute('stroke-linecap', 'round');
      g.node().appendChild(line);
      linkElements.push({ element: line, data: link });
    });
    
    // Draw nodes
    const nodeElements = [];
    nodes.forEach(node => {
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('r', sizeScale(node.size ?? 0));
      circle.setAttribute('fill', colorVals.length > 0 
        ? colorScale(node.colorMetric ?? 0) 
        : defaultNodeColor);
      circle.setAttribute('cursor', 'pointer');
      circle.__data__ = node;
      g.node().appendChild(circle);
      nodeElements.push({ element: circle, data: node });
      
      // Simple drag
      let dragging = false;
      circle.addEventListener('mousedown', function(e) {
        dragging = true;
        node.fx = node.x;
        node.fy = node.y;
        simulation.alphaTarget(0.3).restart();
      });
    });
    
    document.addEventListener('mousemove', function(e) {
      if (dragging) {
        const rect = svg.node().getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        nodeElements.forEach(({ element, data }) => {
          if (element.__data__ === data && data.fx != null) {
            data.fx = x;
            data.fy = y;
          }
        });
      }
    });
    
    document.addEventListener('mouseup', function() {
      if (dragging) {
        dragging = false;
        nodeElements.forEach(({ data }) => {
          data.fx = null;
          data.fy = null;
        });
        simulation.alphaTarget(0);
      }
    });
    
    // Draw labels
    const labelElements = [];
    if (showLabels) {
      nodes.forEach(node => {
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.textContent = node.id;
        text.setAttribute('font-size', '10');
        text.setAttribute('dy', '0.31em');
        text.setAttribute('pointer-events', 'none');
        g.node().appendChild(text);
        labelElements.push({ element: text, data: node });
      });
    }
    
    // Create simulation
    const simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id(d => d.id).distance(linkDistance))
      .force('charge', d3.forceManyBody().strength(chargeStrength))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .on('tick', function() {
        linkElements.forEach(({ element, data }) => {
          element.setAttribute('x1', data.source.x);
          element.setAttribute('y1', data.source.y);
          element.setAttribute('x2', data.target.x);
          element.setAttribute('y2', data.target.y);
        });
        
        nodeElements.forEach(({ element, data }) => {
          element.setAttribute('cx', data.x);
          element.setAttribute('cy', data.y);
        });
        
        labelElements.forEach(({ element, data }) => {
          element.setAttribute('x', data.x + 8);
          element.setAttribute('y', data.y);
        });
      });
  }

  // Subscribe to data
  if (dscc.subscribeToData) {
    dscc.subscribeToData(draw, { transform: dscc.tableTransform });
  }
})();
