import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Product } from '../types/finance';
import { Simulator, Utils } from '../utils/financeCalculations';
import { TrendingUp, SlidersHorizontal, Eye } from 'lucide-react';

interface ForecastChartsProps {
  products: Product[];
}

export const ForecastCharts: React.FC<ForecastChartsProps> = ({ products }) => {
  const [horizonMonths, setHorizonMonths] = useState<number>(12);
  const [noEventsScenario, setNoEventsScenario] = useState<boolean>(false);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // JS-Optimizations: memoize simulation calculations based on products, months and scenario
  const timelineData = useMemo(() => {
    return Simulator.simulateMonths(products, horizonMonths, { noEvents: noEventsScenario });
  }, [products, horizonMonths, noEventsScenario]);

  // Canvas drawing using requestAnimationFrame
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || timelineData.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height;

      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.scale(dpr, dpr);

      // Clear
      ctx.clearRect(0, 0, width, height);

      const paddingLeft = 60;
      const paddingRight = 20;
      const paddingTop = 25;
      const paddingBottom = 30;

      const plotWidth = width - paddingLeft - paddingRight;
      const plotHeight = height - paddingTop - paddingBottom;

      const minVal = 0;
      const maxVal = Math.max(...timelineData.map(d => d.totalAssets), 100000) * 1.1;

      const isDark = document.documentElement.classList.contains('dark');

      // Grid lines
      ctx.strokeStyle = isDark ? 'rgba(51, 65, 85, 0.4)' : 'rgba(226, 232, 240, 0.8)';
      ctx.lineWidth = 1;

      const steps = 4;
      for (let i = 0; i <= steps; i++) {
        const yVal = minVal + (maxVal - minVal) * (i / steps);
        const yPos = paddingTop + plotHeight - (plotHeight * (i / steps));

        ctx.beginPath();
        ctx.moveTo(paddingLeft, yPos);
        ctx.lineTo(width - paddingRight, yPos);
        ctx.stroke();

        // Label
        ctx.fillStyle = isDark ? '#94a3b8' : '#64748b';
        ctx.font = '10px "JetBrains Mono", monospace';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        const formatted = yVal >= 1000000 
          ? `${(yVal / 1000000).toFixed(1)} млн` 
          : `${Math.round(yVal / 1000)}к`;
        ctx.fillText(formatted, paddingLeft - 8, yPos);
      }

      // Compute coordinate points
      const points = timelineData.map((d, idx) => {
        const x = paddingLeft + (plotWidth * idx) / (timelineData.length - 1);
        const y = paddingTop + plotHeight - (plotHeight * (d.netWorth - minVal)) / (maxVal - minVal);
        return { x, y, data: d };
      });

      // Draw Gradient Area under Net Worth
      const gradient = ctx.createLinearGradient(0, paddingTop, 0, paddingTop + plotHeight);
      if (isDark) {
        gradient.addColorStop(0, 'rgba(16, 185, 129, 0.35)');
        gradient.addColorStop(1, 'rgba(16, 185, 129, 0.0)');
      } else {
        gradient.addColorStop(0, 'rgba(16, 185, 129, 0.25)');
        gradient.addColorStop(1, 'rgba(16, 185, 129, 0.0)');
      }

      ctx.beginPath();
      ctx.moveTo(points[0].x, paddingTop + plotHeight);
      points.forEach(p => ctx.lineTo(p.x, p.y));
      ctx.lineTo(points[points.length - 1].x, paddingTop + plotHeight);
      ctx.closePath();
      ctx.fillStyle = gradient;
      ctx.fill();

      // Draw Net Worth Line
      ctx.beginPath();
      points.forEach((p, idx) => {
        if (idx === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.strokeStyle = '#10b981'; // emerald-500
      ctx.lineWidth = 2.5;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();

      // Draw interactive points
      points.forEach((p, idx) => {
        const isHovered = hoverIndex === idx;
        ctx.beginPath();
        ctx.arc(p.x, p.y, isHovered ? 6 : 3, 0, Math.PI * 2);
        ctx.fillStyle = isHovered ? '#059669' : '#10b981';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // X-axis label periodically
        if (idx === 0 || idx === points.length - 1 || idx === Math.floor(points.length / 2)) {
          ctx.fillStyle = isDark ? '#94a3b8' : '#64748b';
          ctx.font = '10px "Plus Jakarta Sans", sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillText(p.data.label, p.x, paddingTop + plotHeight + 8);
        }
      });
    };

    animId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animId);
  }, [timelineData, hoverIndex]);

  // Mouse move handler for chart inspection
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || timelineData.length === 0) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const paddingLeft = 60;
    const paddingRight = 20;
    const plotWidth = rect.width - paddingLeft - paddingRight;

    const relX = Math.max(0, Math.min(plotWidth, x - paddingLeft));
    const step = plotWidth / (timelineData.length - 1);
    const closestIdx = Math.round(relX / step);
    setHoverIndex(closestIdx);
  };

  const handleMouseLeave = () => {
    setHoverIndex(null);
  };

  const activeHoverData = hoverIndex !== null ? timelineData[hoverIndex] : timelineData[timelineData.length - 1];

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 md:p-6 shadow-xs transition-colors">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-emerald-500" />
            Прогноз динамики капитала
          </h2>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Симуляция баланса, капитализации вкладов, купонов и погашений
          </div>
        </div>

        {/* Horizon switcher buttons */}
        <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
          {[
            { label: '1 мес', m: 1 },
            { label: '1 год', m: 12 },
            { label: '2 года', m: 24 },
            { label: '5 лет', m: 60 },
            { label: '10 лет', m: 120 },
          ].map(h => (
            <button
              key={h.m}
              onClick={() => setHorizonMonths(h.m)}
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                horizonMonths === h.m
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              {h.label}
            </button>
          ))}
        </div>
      </div>

      {/* Scenario & Current Value Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 mb-2 border-b border-slate-100 dark:border-slate-800 text-xs">
        <label className="flex items-center gap-2 cursor-pointer text-slate-700 dark:text-slate-300">
          <input
            type="checkbox"
            checked={noEventsScenario}
            onChange={e => setNoEventsScenario(e.target.checked)}
            className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-4 h-4"
          />
          <span>Сценарий «Без учёта событий» (вклады сохраняют доходность)</span>
        </label>

        {activeHoverData && (
          <div className="flex items-center gap-4">
            <span className="text-slate-500 dark:text-slate-400">
              {activeHoverData.label}:
            </span>
            <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
              {Utils.fmtMoney(activeHoverData.netWorth)}
            </span>
          </div>
        )}
      </div>

      {/* Canvas Viewport */}
      <div className="relative w-full h-56 sm:h-64">
        <canvas
          ref={canvasRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          className="w-full h-full cursor-crosshair block"
        />
      </div>

    </div>
  );
};
