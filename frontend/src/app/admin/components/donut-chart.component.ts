import { Component, Input, OnInit, OnChanges, SimpleChanges, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration } from 'chart.js';

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
        [height]="180"
        [width]="180"
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
        tooltip: { backgroundColor: surfaceColor, titleColor: textColor, bodyColor: textColor, borderColor: borderColor, borderWidth: 1 },
      },
      cutout: '55%',
      onClick: (e, elements) => {
        if (elements?.length) self.sliceClick.emit(elements[0].index);
      },
    };
  }
}
