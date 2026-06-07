import { Component } from "@angular/core";

@Component({
  selector: "app-list-toolbar",
  standalone: true,
  template: `
    <div class="toolbar">
      <ng-content select="[toolbar-search]"></ng-content>
      <ng-content select="[toolbar-filters]"></ng-content>
      <ng-content select="[toolbar-sort]"></ng-content>
    </div>
  `,
  styles: [`
    .toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
      align-items: center;
      padding-bottom: 1rem;
      border-bottom: 1px solid var(--color-border);
      margin-bottom: 1rem;
    }
  `],
})
export class ListToolbarComponent {}
