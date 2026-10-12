// Small SVG line/dot charts with a crosshair tooltip (mouse and keyboard). No chart library.
(function () {
  const RT = (window.RT = window.RT || {});
  const NS = "http://www.w3.org/2000/svg";

  function svg(tag, attrs, parent) {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, v);
    if (parent) parent.appendChild(el);
    return el;
  }

  // Every `step`-th index, with a step chosen so at most `want` labels fit.
  function evenTicks(n, want) {
    const step = [1, 2, 3, 5, 7, 10, 14, 15, 20, 30, 60, 90].find((x) => n / x <= want) || Math.ceil(n / want);
    const out = [];
    for (let i = 0; i < n; i += step) out.push(i);
    return out;
  }

  // A top value that splits into four round steps (0, 15, 30, 45, 60).
  function niceMax(v) {
    const step = [5, 10, 15, 20, 25, 30, 40, 50, 75, 100, 150, 200, 250, 500].find((s) => s * 4 >= v);
    return (step || Math.ceil(v / 400) * 100) * 4;
  }

  /**
   * spec: {
   *   height, ariaLabel,
   *   n: number of x positions, xLabel(i), xTicks?(maxLabels) -> number[]
   *   yMin?, yMax?, yFormat?(v)
   *   series: [{ name, color, values: (number|null)[], type: "line"|"dots", area?: bool }]
   *   refs?: [{ y, label }]               horizontal reference lines (e.g. the 100 WPM goal)
   *   markers?: [{ i }]                   typo crosses along the top of the plot
   *   badges?: [{ i, y, text }]           numbered callouts (dips)
   *   markerLegend?: string
   *   tooltip(i) -> { title, rows: [{ name, color, value }], note? }
   * }
   */
  function line(container, spec) {
    container.classList.add("chart");
    container.innerHTML = "";
    const legend = document.createElement("div");
    legend.className = "chart-legend";
    if (spec.series.length >= 2 || spec.markerLegend) {
      for (const s of spec.series) {
        const item = document.createElement("span");
        const key = document.createElement("span");
        key.className = "key" + (s.type === "dots" ? " dotkey" : "");
        key.style.background = s.color;
        item.appendChild(key);
        item.appendChild(document.createTextNode(s.name));
        legend.appendChild(item);
      }
      if (spec.markerLegend) {
        const item = document.createElement("span");
        const key = document.createElement("span");
        key.className = "key xkey";
        item.appendChild(key);
        item.appendChild(document.createTextNode(spec.markerLegend));
        legend.appendChild(item);
      }
      container.appendChild(legend);
    }
    const holder = document.createElement("div");
    holder.style.position = "relative";
    container.appendChild(holder);
    const tip = document.createElement("div");
    tip.className = "tooltip";
    tip.hidden = true;

    let current = null;
    function draw() {
      holder.innerHTML = "";
      holder.appendChild(tip);
      const W = Math.max(280, holder.clientWidth || container.clientWidth || 600);
      const H = spec.height || 220;
      const m = { l: 40, r: 16, t: spec.markers ? 22 : 12, b: 26 };
      const pw = W - m.l - m.r;
      const ph = H - m.t - m.b;
      const all = spec.series.flatMap((s) => s.values.filter((v) => v != null));
      (spec.refs || []).forEach((r) => all.push(r.y));
      const yMin = spec.yMin != null ? spec.yMin : 0;
      const yMax = spec.yMax != null ? spec.yMax : niceMax(Math.max(...all, 1));
      const X = (i) => m.l + (spec.n <= 1 ? pw / 2 : (i / (spec.n - 1)) * pw);
      const Y = (v) => m.t + ph - ((v - yMin) / (yMax - yMin || 1)) * ph;
      const fmt = spec.yFormat || ((v) => String(Math.round(v)));

      const root = svg("svg", {
        viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img", tabindex: "0",
        "aria-label": (spec.ariaLabel || "Chart") + ". Use the left and right arrow keys to read values.",
      }, holder);

      // gridlines and y ticks
      const ticks = 4;
      for (let k = 0; k <= ticks; k++) {
        const v = yMin + ((yMax - yMin) * k) / ticks;
        const y = Y(v);
        svg("line", { x1: m.l, x2: W - m.r, y1: y, y2: y, class: k === 0 ? "baseline" : "gridline" }, root);
        const t = svg("text", { x: m.l - 8, y: y + 4, "text-anchor": "end", class: "tick" }, root);
        t.textContent = fmt(v);
      }
      // x ticks
      const xt = spec.xTicks ? spec.xTicks(Math.max(2, Math.floor(pw / 64))) : evenTicks(spec.n, Math.max(2, Math.floor(pw / 64)));
      for (const i of xt) {
        const t = svg("text", { x: X(i), y: H - 6, "text-anchor": "middle", class: "tick" }, root);
        t.textContent = spec.xLabel(i);
      }
      // reference lines
      for (const r of spec.refs || []) {
        if (r.y > yMax || r.y < yMin) continue;
        svg("line", { x1: m.l, x2: W - m.r, y1: Y(r.y), y2: Y(r.y), class: "ref" }, root);
        const t = svg("text", { x: W - m.r, y: Y(r.y) - 5, "text-anchor": "end", class: "ref-label" }, root);
        t.textContent = r.label;
      }
      // series
      for (const s of spec.series) {
        if (s.type === "dots") {
          s.values.forEach((v, i) => {
            if (v == null) return;
            svg("circle", { cx: X(i), cy: Y(v), r: 4, style: `fill:${s.color}`, class: "dot" }, root);
          });
          continue;
        }
        let d = "";
        let pen = false;
        s.values.forEach((v, i) => {
          if (v == null) { pen = false; return; }
          d += `${pen ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`;
          pen = true;
        });
        if (s.area && d) {
          const first = s.values.findIndex((v) => v != null);
          let lastI = s.values.length - 1;
          while (lastI > 0 && s.values[lastI] == null) lastI--;
          svg("path", { d: `${d}L${X(lastI)},${Y(yMin)}L${X(first)},${Y(yMin)}Z`, style: `fill:${s.color}`, class: "area" }, root);
        }
        svg("path", { d, style: `stroke:${s.color}`, class: "line" }, root);
        if (spec.n === 1 && s.values[0] != null) svg("circle", { cx: X(0), cy: Y(s.values[0]), r: 4, style: `fill:${s.color}`, class: "dot" }, root);
      }
      // typo markers along the top
      for (const mk of spec.markers || []) {
        const x = X(mk.i);
        const y = m.t - 12;
        svg("line", { x1: x - 3.5, y1: y - 3.5, x2: x + 3.5, y2: y + 3.5, class: "marker-x" }, root);
        svg("line", { x1: x - 3.5, y1: y + 3.5, x2: x + 3.5, y2: y - 3.5, class: "marker-x" }, root);
      }
      // numbered dip badges
      for (const b of spec.badges || []) {
        const x = X(b.i);
        const y = Math.min(Y(b.y) + 16, m.t + ph - 9);
        svg("circle", { cx: x, cy: y, r: 8, class: "dip-badge" }, root);
        const t = svg("text", { x, y: y + 3.5, "text-anchor": "middle", class: "dip-num" }, root);
        t.textContent = b.text;
      }

      // hover layer
      const cross = svg("line", { y1: m.t, y2: m.t + ph, class: "crosshair", visibility: "hidden" }, root);
      const hiDots = spec.series.map((s) => svg("circle", { r: 5, style: `fill:${s.color}`, class: "dot", visibility: "hidden" }, root));
      const hit = svg("rect", { x: m.l - 10, y: 0, width: pw + 20, height: H, fill: "transparent" }, root);

      function show(i) {
        current = i;
        const x = X(i);
        cross.setAttribute("x1", x);
        cross.setAttribute("x2", x);
        cross.setAttribute("visibility", "visible");
        spec.series.forEach((s, k) => {
          const v = s.values[i];
          if (v == null) { hiDots[k].setAttribute("visibility", "hidden"); return; }
          hiDots[k].setAttribute("cx", x);
          hiDots[k].setAttribute("cy", Y(v));
          hiDots[k].setAttribute("visibility", "visible");
        });
        const info = spec.tooltip(i);
        tip.innerHTML = "";
        const title = document.createElement("div");
        title.className = "tt-title";
        title.textContent = info.title;
        tip.appendChild(title);
        for (const r of info.rows) {
          const row = document.createElement("div");
          row.className = "tt-row";
          if (r.color) {
            const k = document.createElement("span");
            k.className = "tt-key";
            k.style.background = r.color;
            row.appendChild(k);
          }
          const b = document.createElement("b");
          b.textContent = r.value;
          row.appendChild(b);
          const nm = document.createElement("span");
          nm.className = "muted";
          nm.textContent = r.name;
          row.appendChild(nm);
          tip.appendChild(row);
        }
        if (info.note) {
          const note = document.createElement("div");
          note.className = "tt-note";
          note.textContent = info.note;
          tip.appendChild(note);
        }
        tip.hidden = false;
        const tw = tip.offsetWidth;
        let left = x + 12;
        if (left + tw > W) left = x - tw - 12;
        tip.style.left = Math.max(0, left) + "px";
        tip.style.top = m.t + "px";
      }
      function hide() {
        current = null;
        cross.setAttribute("visibility", "hidden");
        hiDots.forEach((d) => d.setAttribute("visibility", "hidden"));
        tip.hidden = true;
      }
      function indexAt(clientX) {
        const box = root.getBoundingClientRect();
        const px = ((clientX - box.left) / box.width) * W;
        const i = spec.n <= 1 ? 0 : Math.round(((px - m.l) / pw) * (spec.n - 1));
        return Math.max(0, Math.min(spec.n - 1, i));
      }
      hit.addEventListener("pointermove", (e) => show(indexAt(e.clientX)));
      hit.addEventListener("pointerleave", hide);
      root.addEventListener("focus", () => show(current == null ? spec.n - 1 : current));
      root.addEventListener("blur", hide);
      root.addEventListener("keydown", (e) => {
        if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
          e.preventDefault();
          e.stopPropagation();
          const i = (current == null ? spec.n - 1 : current) + (e.key === "ArrowRight" ? 1 : -1);
          show(Math.max(0, Math.min(spec.n - 1, i)));
        } else if (e.key === "Escape") hide();
      });
    }

    draw();
    let last = holder.clientWidth;
    const ro = new ResizeObserver(() => {
      if (Math.abs(holder.clientWidth - last) > 4) {
        last = holder.clientWidth;
        draw();
      }
    });
    ro.observe(holder);
    return { redraw: draw, destroy: () => ro.disconnect() };
  }

  // A plain table version of chart data, tucked into a <details> element.
  function tableView(columns, rows, summary) {
    const det = document.createElement("details");
    det.className = "table-view";
    const sum = document.createElement("summary");
    sum.textContent = summary || "Show as a table";
    det.appendChild(sum);
    const wrap = document.createElement("div");
    wrap.className = "table-scroll";
    const table = document.createElement("table");
    table.className = "data";
    const head = table.createTHead().insertRow();
    columns.forEach((c) => {
      const th = document.createElement("th");
      th.textContent = c.label;
      if (c.num) th.className = "num";
      head.appendChild(th);
    });
    const body = table.createTBody();
    for (const r of rows) {
      const tr = body.insertRow();
      columns.forEach((c, k) => {
        const td = tr.insertCell();
        td.textContent = r[k];
        if (c.num) td.className = "num";
      });
    }
    wrap.appendChild(table);
    det.appendChild(wrap);
    return det;
  }

  RT.charts = { line, tableView, evenTicks };
})();
