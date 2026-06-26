import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration, ChartData } from 'chart.js';

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
        [height]="chartType === 'bar' ? 200 : 140"
      ></canvas>
    }
  `,
  styles: [`
    .chart-state { padding: 1rem; text-align: center; font-size: 0.85rem; color: var(--color-muted); }
    .chart-state.error { color: #dc2626; }
    .chart-state.error button { margin-left: 0.5rem; cursor: pointer; }
  `]
})
export class LineChartComponent implements OnChanges {
  @Input() labels: string[] = [];
  @Input() datasets: { label: string; data: number[]; color: string; dashed?: boolean; hidden?: boolean }[] = [];
  @Input() loading = false;
  @Input() chartType: 'line' | 'bar' = 'line';
  @Output() retry = new EventEmitter<void>();

  chartData: ChartData<'line'> = { labels: [], datasets: [] };
  chartOptions: ChartConfiguration['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 300 },
    plugins: {
      legend: { display: false },
      tooltip: {
        mode: 'index', intersect: false,
        backgroundColor: 'var(--color-surface)',
        titleColor: 'var(--color-text)',
        bodyColor: 'var(--color-text)',
        borderColor: 'var(--color-border)',
        borderWidth: 1,
        cornerRadius: 8,
        padding: 10,
      },
    },
    scales: {
      x: { display: true, ticks: { maxTicksLimit: 10, font: { size: 10 }, color: 'var(--color-muted)' }, grid: { color: 'transparent' } },
      y: { display: true, ticks: { font: { size: 10 }, color: 'var(--color-muted)', callback: (v: any) => v >= 1000 ? (v/1000).toFixed(0) + 'k' : v }, grid: { color: 'rgba(148,163,184,0.1)' }, border: { display: false } },
    },
    interaction: { intersect: false, mode: 'index' },
  };

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['datasets'] || changes['labels'] || changes['chartType']) {
      const isBar = this.chartType === 'bar';
      this.chartData = {
        labels: this.labels,
        datasets: this.datasets.map(d => ({
          label: d.label,
          data: d.data,
          borderColor: d.color,
          backgroundColor: isBar ? d.color + 'CC' : d.color + '33',
          borderWidth: isBar ? 1 : 1.5,
          borderRadius: isBar ? 3 : 0,
          pointRadius: isBar ? 0 : 0,
          pointHoverRadius: 4,
          pointHoverBackgroundColor: d.color,
          borderDash: isBar ? [] : (d.dashed ? [6, 3] : []),
          hidden: d.hidden ?? false,
          tension: isBar ? 0 : 0.1,
          fill: false,
        })),
      };
    }
  }
}
