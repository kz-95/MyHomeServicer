import { Component, Input, OnInit, OnChanges, SimpleChanges, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration, ChartData } from 'chart.js';

@Component({
  selector: 'app-bar-chart',
  standalone: true,
  imports: [CommonModule, BaseChartDirective],
  template: `
    @if (error) {
      <div class="chart-state error">Failed to load chart.</div>
    } @else if (!labels.length) {
      <div class="chart-state empty">No data.</div>
    } @else {
      <canvas baseChart
        [type]="'bar'"
        [data]="chartData"
        [options]="chartOptions"
        [height]="280"
      ></canvas>
    }
  `,
  styles: [`.chart-state { padding: 1rem; text-align: center; font-size: 0.85rem; color: var(--color-muted); }`]
})
export class BarChartComponent implements OnInit, OnChanges {
  @Input() labels: string[] = [];
  @Input() values: number[] = [];
  @Input() color = '#f59e0b';
  @Input() label = '';
  @Output() barClick = new EventEmitter<number>();
  error = false;

  private getCssVar(name: string): string {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#94a3b8';
  }

  chartData: ChartData<'bar'> = { labels: [], datasets: [] };
  chartOptions!: ChartConfiguration['options'];

  ngOnInit(): void { this.buildOptions(); }

  ngOnChanges(changes: SimpleChanges): void {
    this.buildOptions();
    if (changes['values'] || changes['labels']) {
      this.chartData = {
        labels: this.labels,
        datasets: [{ data: this.values, backgroundColor: this.color + 'CC', borderColor: this.color, borderWidth: 1, borderRadius: 4, barPercentage: 0.7 }],
      };
    }
  }

  private buildOptions(): void {
    const textColor = this.getCssVar('--color-text');
    const mutedColor = this.getCssVar('--color-muted');
    const surfaceColor = this.getCssVar('--color-surface');
    const borderColor = this.getCssVar('--color-border');
    const self = this;
    this.chartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      animation: { duration: 400, easing: 'easeOutQuart' },
      plugins: {
        legend: { display: false },
        datalabels: { display: false },
        tooltip: { backgroundColor: surfaceColor, titleColor: textColor, bodyColor: textColor, borderColor: borderColor, borderWidth: 1 },
      },
      scales: {
        x: { display: true, ticks: { font: { size: 10 }, color: mutedColor }, grid: { color: mutedColor + '22' }, border: { display: false } },
        y: { display: true, ticks: { font: { size: 11 }, color: textColor }, grid: { display: false }, border: { display: false } },
      },
      onClick: (e, elements) => {
        if (elements?.length) self.barClick.emit(elements[0].index);
      },
    };
  }
}
