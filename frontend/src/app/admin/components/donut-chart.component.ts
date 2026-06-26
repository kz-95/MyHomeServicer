import { Component, Input, OnInit, OnChanges, SimpleChanges, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BaseChartDirective } from 'ng2-charts';
import { Chart, ChartConfiguration } from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';

Chart.register(ChartDataLabels);

// Center "All" label plugin — reads per-chart state for hover/click effects
const centerLabelPlugin = {
  id: 'centerLabel',
  afterDraw(chart: any) {
    // Only draw "All" on doughnut charts
    if ((chart.config as any)?.type !== 'doughnut') return;
    if (!chart.chartArea) return;
    const ctx = chart.ctx;
    const { top, bottom, left, right } = chart.chartArea;
    const cx = (left + right) / 2;
    const cy = (top + bottom) / 2;
    const muted = getComputedStyle(document.documentElement).getPropertyValue('--color-muted').trim() || '#94a3b8';
    const primary = '#f59e0b';
    const hover = chart._centerHover || false;
    const active = chart._centerActive || false;
    ctx.save();
    ctx.font = `600 ${active ? '13px' : hover ? '12px' : '11px'} sans-serif`;
    ctx.fillStyle = active ? primary : hover ? primary : muted;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('All', cx, cy);
    ctx.restore();
  },
};
Chart.register(centerLabelPlugin);

@Component({
  selector: 'app-donut-chart',
  standalone: true,
  imports: [CommonModule, BaseChartDirective],
  template: `
    @if (error) {
      <div class="chart-state error">Failed to load chart.</div>
    } @else if (!labels.length) {
      <div class="chart-state empty">No data.</div>
    } @else {
      <canvas baseChart
        [type]="'doughnut'"
        [data]="chartData"
        [options]="chartOptions"
         [height]="280"
        [width]="280"
      ></canvas>
    }
  `,
  styles: [`.chart-state { padding: 1rem; text-align: center; font-size: 0.85rem; color: var(--color-muted); }`]
})
export class DonutChartComponent implements OnInit, OnChanges {
  @Input() labels: string[] = [];
  @Input() values: number[] = [];
  @Input() colors: string[] = [];
  @Output() sliceClick = new EventEmitter<number>();
  @Output() centerClick = new EventEmitter<void>();
  error = false;

  private getCssVar(name: string): string {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#94a3b8';
  }

  chartData: any = { labels: [], datasets: [] };
  chartOptions!: ChartConfiguration<'doughnut'>['options'];

  ngOnInit(): void { this.buildOptions(); }

  ngOnChanges(changes: SimpleChanges): void {
    this.buildOptions();
    if (changes['values'] || changes['labels']) {
      const surface = this.getCssVar('--color-surface');
      this.chartData = {
        labels: this.labels,
        datasets: [{ data: this.values, backgroundColor: this.colors, borderColor: surface, borderWidth: 2, hoverBorderWidth: 3 }],
      };
    }
  }

  private buildOptions(): void {
    const textColor = this.getCssVar('--color-text');
    const surfaceColor = this.getCssVar('--color-surface');
    const borderColor = this.getCssVar('--color-border');
    const self = this;
    this.chartOptions = {
      responsive: true,
      maintainAspectRatio: true,
      animation: { duration: 500 },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: surfaceColor, titleColor: textColor, bodyColor: textColor, borderColor: borderColor, borderWidth: 1,
          callbacks: {
            label: (ctx: any) => {
              const total = (ctx.dataset.data as number[]).reduce((a: number, b: number) => a + b, 0);
              const pct = total ? ((ctx.raw / total) * 100).toFixed(1) : '0';
              return `${ctx.label}: RM ${Number(ctx.raw).toFixed(2)} (${pct}%)`;
            },
          },
        },
        datalabels: {
          color: '#fff',
          font: { size: 10, weight: 'bold' as any },
          formatter: (value: number, ctx: any) => {
            const total = (ctx.dataset.data as number[]).reduce((a: number, b: number) => a + b, 0);
            const pct = total ? ((value / total) * 100).toFixed(1) : '0';
            const label = ctx.chart?.data?.labels?.[ctx.dataIndex] as string || '';
            return pct + '%';
          },
          display: (ctx: any) => {
            const total = (ctx.dataset.data as number[]).reduce((a: number, b: number) => a + b, 0);
            return total > 0 && ctx.dataset.data[ctx.dataIndex] / total > 0.05;
          },
        },
      },
      cutout: '27%',
      onHover: (e: any, elements: any[], chart: any) => {
        chart._centerHover = !elements?.length;
        chart.draw();
      },
      onClick: (e: any, elements: any[], chart: any) => {
        if (elements?.length) { self.sliceClick.emit(elements[0].index); return; }
        // Center click — flash highlight
        chart._centerActive = true;
        chart.draw();
        setTimeout(() => { chart._centerActive = false; chart.draw(); }, 150);
        self.centerClick.emit();
      },
    };
  }
}
