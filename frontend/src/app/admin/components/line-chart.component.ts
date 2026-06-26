import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BaseChartDirective } from 'ng2-charts';
import { Chart, ChartConfiguration, ChartData, Plugin } from 'chart.js';

// Year-separator plugin: draws a vertical dashed line + year label at year transitions
const yearSepPlugin: Plugin = {
  id: 'yearSep',
  afterDraw(chart: Chart) {
    if ((chart.config as any).type !== 'line' && (chart.config as any).type !== 'bar') return;
    const ctx = chart.ctx;
    const xAxis = chart.scales['x'];
    const yAxis = chart.scales['y'];
    const lbls = chart.data.labels as string[] ?? [];
    if (!ctx || !lbls.length || !xAxis || !yAxis) return;

    const style = getComputedStyle(document.documentElement);
    const mutedColor = style.getPropertyValue('--color-muted').trim() || '#94a3b8';

    // Extract year from daily ("2026-06-26") or monthly ("Jan 2026") label
    const extractYear = (l: string): string => {
      const m = l.match(/(\d{4})$/);
      return m ? m[1] : l.substring(0, 4);
    };

    let prevYear = '';
    for (let i = 0; i < lbls.length; i++) {
      const y = extractYear(lbls[i]);
      if (prevYear && y !== prevYear) {
        const xPos = (xAxis.getPixelForValue(i) + xAxis.getPixelForValue(i - 1)) / 2;
        ctx.save();
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = mutedColor + '44';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(xPos, yAxis.top);
        ctx.lineTo(xPos, yAxis.bottom);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = mutedColor;
        ctx.font = '600 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(y, xPos, yAxis.top - 6);
        ctx.restore();
      }
      prevYear = y;
    }
  },
};

// Gradient fill plugin: applies gradient from line color down to transparent for line charts
const gradientFillPlugin: Plugin = {
  id: 'gradientFill',
  beforeDatasetsDraw(chart: Chart) {
    if ((chart.config as any).type !== 'line') return;
    const ctx = chart.ctx;
    const yAxis = chart.scales['y'];
    if (!yAxis) return;
    chart.data.datasets.forEach((ds) => {
      const color = (ds.borderColor as string) || '#2563eb';
      const grad = ctx.createLinearGradient(0, yAxis.top, 0, yAxis.bottom);
      grad.addColorStop(0, color + '44');
      grad.addColorStop(1, color + '00');
      (ds as any).backgroundColor = grad;
    });
  },
};

@Component({
  selector: 'app-line-chart',
  standalone: true,
  imports: [CommonModule, BaseChartDirective],
  template: `
    @if (error) {
      <div class="chart-state error">Failed to load chart. <button (click)="retry.emit()">Retry</button></div>
    } @else if (!labels.length) {
      <div class="chart-state empty">No data for this period.</div>
    } @else {
      <canvas baseChart
        [type]="chartType"
        [data]="chartData"
        [options]="chartOptions"
         [height]="500"
      ></canvas>
    }
  `,
  styles: [`
    :host { display: block; }
    .chart-state { padding: 1rem; text-align: center; font-size: 0.85rem; color: var(--color-muted); }
    .chart-state.error { color: #dc2626; }
    .chart-state.error button { margin-left: 0.5rem; cursor: pointer; }
  `]
})
export class LineChartComponent implements OnChanges {
  @Input() labels: string[] = [];
  @Input() datasets: { label: string; data: number[]; color: string; dashed?: boolean; hidden?: boolean }[] = [];
  @Input() loading = false;
  @Input() error = false;
  @Input() chartType: 'line' | 'bar' = 'line';
  @Output() retry = new EventEmitter<void>();
  @ViewChild(BaseChartDirective) chartDir?: BaseChartDirective;

  private getCssVar(name: string): string {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#94a3b8';
  }

  chartData: ChartData<'line'> = { labels: [], datasets: [] };
  chartOptions: ChartConfiguration['options'] = {};

  ngOnInit(): void {
    this.buildOptions();
    const existing = Chart.registry.plugins.get('yearSep');
    if (!existing) Chart.register(yearSepPlugin, gradientFillPlugin);
  }
  ngOnChanges(changes: SimpleChanges): void {
    this.buildOptions();
    if (changes['datasets'] || changes['labels'] || changes['chartType']) {
      const isBar = this.chartType === 'bar';
      this.chartData = {
        labels: this.labels,
        datasets: this.datasets.map(d => ({
          label: d.label,
          data: d.data,
          borderColor: d.color,
          backgroundColor: isBar ? d.color + 'CC' : d.color + '33',
          borderWidth: isBar ? 1 : 1,
          borderRadius: isBar ? 3 : 0,
          pointRadius: isBar ? 0 : 0,
          pointHoverRadius: 4,
          pointHoverBackgroundColor: d.color,
          borderDash: isBar ? [] : (d.dashed ? [6, 3] : []),
          tension: isBar ? 0 : 0.1,
          fill: isBar ? false : true,
          barPercentage: isBar ? 0.9 : undefined,
          categoryPercentage: isBar ? 1.0 : undefined,
        })),
      };
      // Apply visibility after ng2-charts renders (hidden config is init-only in Chart.js)
      setTimeout(() => {
        const chart = this.chartDir?.chart;
        if (!chart || !chart.data.datasets?.length) return;
        this.datasets.forEach((ds, i) => {
          const vis = !(ds.hidden ?? false);
          chart.setDatasetVisibility(i, vis);
        });
        chart.update('none');
      }, 50);
    }
  }

  private buildOptions(): void {
    const textColor = this.getCssVar('--color-text');
    const mutedColor = this.getCssVar('--color-muted');
    const surfaceColor = this.getCssVar('--color-surface');
    const borderColor = this.getCssVar('--color-border');
    const isBar = this.chartType === 'bar';

    this.chartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 300 },
      plugins: {
        legend: { display: false },
        datalabels: { display: false },
        tooltip: {
          mode: 'index', intersect: false,
          backgroundColor: surfaceColor,
          titleColor: textColor,
          bodyColor: textColor,
          borderColor: borderColor,
          borderWidth: 1, cornerRadius: 8, padding: 10,
        },
      },
      scales: {
        x: { display: true, ticks: { font: { size: 10 }, color: mutedColor, callback: (v: any, i: number) => {
          const label = this.chartData.labels?.[i] as string ?? '';
          // Monthly labels: "Jan 2026", "Feb 2026" - show just month abbreviation
          const monthMatch = label.match(/^([A-Z][a-z]{2}) \d{4}$/);
          if (monthMatch) return monthMatch[1]; // "Jan"
          if (this.labels.length > 31) {
            const startLabel = this.labels[0];
            if (!startLabel) return '';
            const d0 = new Date(startLabel + 'T00:00:00+08:00');
            const d1 = new Date(label + 'T00:00:00+08:00');
            const diff = Math.round((d1.getTime() - d0.getTime()) / 86_400_000);
            const wk = Math.floor(diff / 7) + 1;
            return diff % 7 === 0 ? `Week ${wk}` : '';
          }
          return label.replace(/^\d{4}-(\d{2})-(\d{2})$/, (_, m, d) => {
            const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
            return `${months[+m-1]} ${+d}`;
          });
        }, autoSkip: false, maxRotation: 0 }, grid: { color: 'transparent' } },
        y: { display: true, ticks: { font: { size: 10 }, color: mutedColor, callback: (v: any) => v >= 1000 ? (v/1000).toFixed(0) + 'k' : v }, grid: { color: mutedColor + '22' }, border: { display: false } },
      },
      interaction: { intersect: false, mode: 'index' },
    };
  }
}
