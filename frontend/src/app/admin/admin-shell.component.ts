import { Component, signal, inject, OnInit, computed } from "@angular/core";
import { ShellComponent, NavItem } from "../shared/shell.component";
import { routeFor } from "../core/route-for";
import { Router, NavigationEnd } from "@angular/router";
import { filter } from "rxjs/operators";

@Component({
  selector: "app-admin-shell",
  imports: [ShellComponent],
  template: `<app-shell portalTitle="Admin" [navItems]="nav" [narrow]="narrow()" />`,
})
export class AdminShellComponent implements OnInit {
  protected readonly routeFor = routeFor;
  private readonly router = inject(Router);
  private readonly urlSig = signal('');

  /** Only the dashboard keeps full width; all other admin pages are narrow (720px max). */
  readonly narrow = computed(() => this.urlSig() !== routeFor('admin'));

  ngOnInit(): void {
    this.urlSig.set(this.router.url.split('?')[0]);
    this.router.events
      .pipe(filter(e => e instanceof NavigationEnd))
      .subscribe(() => this.urlSig.set(this.router.url.split('?')[0]));
  }

  nav: NavItem[] = [
    { label: "Dashboard", path: routeFor('admin'), icon: "bar-chart", exact: true },
    { label: "Accounts", path: routeFor('admin.users'), icon: "user" },
    { label: "Review Queues", path: routeFor('admin.queues'), icon: "inbox" },
    {
      label: "AI Chat Settings",
      path: routeFor('admin.aiChatSettings'),
      icon: "message-square",
    },
    {
      label: "Financial Settings",
      path: routeFor('admin.moneySettings'),
      icon: "dollar-sign",
    },
    {
      label: "Category Settings",
      path: routeFor('admin.categorySettings'),
      icon: "tag",
    },
    { label: "UI/UX Settings", path: routeFor('admin.uiuxSettings'), icon: "palette" },
    { label: "API Keys", path: routeFor('admin.apiKeys'), icon: "key" },
  ];
}
