import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges } from '@angular/core';
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

  private getCssVar(name: string): string {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#94a3b8';
  }

  chartData: ChartData<'line'> = { labels: [], datasets: [] };
  chartOptions: ChartConfiguration['options'] = {};

  ngOnInit(): void { this.buildOptions(); }
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
          hidden: d.hidden ?? false,
          tension: isBar ? 0 : 0.1,
          fill: false,
          barPercentage: isBar ? 0.4 : undefined,
          categoryPercentage: isBar ? 0.6 : undefined,
        })),
      };
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
        x: { display: true, ticks: { maxTicksLimit: 10, font: { size: 10 }, color: mutedColor }, grid: { color: 'transparent' } },
        y: { display: true, ticks: { font: { size: 10 }, color: mutedColor, callback: (v: any) => v >= 1000 ? (v/1000).toFixed(0) + 'k' : v }, grid: { color: mutedColor + '22' }, border: { display: false } },
      },
      interaction: { intersect: false, mode: 'index' },
    };
  }
}
